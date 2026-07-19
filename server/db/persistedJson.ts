/**
 * Unified JSON document persistence.
 * - Postgres via DATABASE_URL when available
 * - Else Supabase service-role REST (json_documents table)
 * - Else filesystem under getDataDir()
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureParentDirForFile } from '../dataDir.ts'
import { runSerializedByKey } from '../fsMutationQueue.ts'
import { getDatabaseUrl, hasSupabaseServiceRole, isSupabaseBackend } from './backend.ts'
import { getPgPool, withPgClient } from './client.ts'
import { getSupabaseAdmin } from './supabaseAdmin.ts'

/** Stable 64-bit advisory lock id from document name (multi-instance RMW). */
function advisoryLockKeySql(): string {
  return `('x' || substr(md5($1), 1, 16))::bit(64)::bigint`
}

export function storeNameFromPath(filePath: string): string {
  return path.basename(filePath)
}

async function invalidateCache(filePath: string): Promise<void> {
  const { invalidateJsonFileCache } = await import('../jsonFileCache.ts')
  invalidateJsonFileCache(filePath)
}

async function readViaPg(name: string): Promise<string | null> {
  const pool = getPgPool()
  if (!pool) return null
  const res = await pool.query<{ payload: unknown }>(
    'select payload from json_documents where name = $1',
    [name],
  )
  if (!res.rows[0]) return null
  return JSON.stringify(res.rows[0].payload)
}

async function writeViaPg(name: string, payload: unknown): Promise<boolean> {
  const pool = getPgPool()
  if (!pool) return false
  await pool.query(
    `insert into json_documents (name, payload, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (name) do update
       set payload = excluded.payload, updated_at = now()`,
    [name, JSON.stringify(payload)],
  )
  return true
}

async function readViaRest(name: string): Promise<string | null> {
  const client = getSupabaseAdmin()
  if (!client) return null
  const { data, error } = await client.from('json_documents').select('payload').eq('name', name).maybeSingle()
  if (error) throw new Error(`Supabase read ${name}: ${error.message}`)
  if (!data) return null
  return JSON.stringify(data.payload)
}

async function writeViaRest(name: string, payload: unknown): Promise<boolean> {
  const client = getSupabaseAdmin()
  if (!client) return false
  const { error } = await client.from('json_documents').upsert(
    { name, payload, updated_at: new Date().toISOString() },
    { onConflict: 'name' },
  )
  if (error) throw new Error(`Supabase write ${name}: ${error.message}`)
  return true
}

/** Read raw JSON text for a store file path, or null if missing. */
export async function readDataJsonText(filePath: string): Promise<string | null> {
  const name = storeNameFromPath(filePath)
  if (isSupabaseBackend()) {
    if (getDatabaseUrl() && getPgPool()) {
      try {
        const viaPg = await readViaPg(name)
        if (viaPg != null || getPgPool()) return viaPg
      } catch (err) {
        if (!hasSupabaseServiceRole()) throw err
        console.warn('[simvest] Postgres read failed, trying service-role REST:', (err as Error).message)
      }
    }
    if (hasSupabaseServiceRole()) {
      return readViaRest(name)
    }
  }
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

/** Write pretty-printed JSON object (or raw text) for a store file path. */
export async function writeDataJsonText(filePath: string, text: string): Promise<void> {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { _raw: text }
  }
  const name = storeNameFromPath(filePath)

  if (isSupabaseBackend()) {
    if (getDatabaseUrl() && getPgPool()) {
      try {
        if (await writeViaPg(name, payload)) {
          await invalidateCache(filePath)
          return
        }
      } catch (err) {
        if (!hasSupabaseServiceRole()) throw err
        console.warn('[simvest] Postgres write failed, trying service-role REST:', (err as Error).message)
      }
    }
    if (hasSupabaseServiceRole()) {
      await writeViaRest(name, payload)
      await invalidateCache(filePath)
      return
    }
  }

  await ensureParentDirForFile(filePath)
  await fs.writeFile(filePath, text, 'utf8')
  await invalidateCache(filePath)
}

export async function writeDataJsonObject(filePath: string, data: unknown): Promise<void> {
  await writeDataJsonText(filePath, JSON.stringify(data, null, 2))
}

export async function readDataJsonObject<T>(filePath: string): Promise<T | null> {
  const raw = await readDataJsonText(filePath)
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Cross-instance critical section for a JSON document.
 * When Postgres (`DATABASE_URL`) is configured: transaction + advisory lock.
 * Otherwise: in-process `fsMutationQueue` (safe for single-dev filesystem).
 *
 * Callers that read/write via `readDataJsonObject` / `writeDataJsonObject` inside
 * `fn` are serialized across app instances by the advisory lock (separate pool
 * connections still see committed data only — which is what we want for RMW).
 */
export function withDataJsonDocumentLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const name = storeNameFromPath(filePath)
  const key = `json-store:${name}`
  return runSerializedByKey(key, async () => {
    if (getDatabaseUrl() && getPgPool()) {
      try {
        return await withPgClient(async (client) => {
          await client.query('BEGIN')
          try {
            await client.query(`SELECT pg_advisory_xact_lock(${advisoryLockKeySql()})`, [name])
            const result = await fn()
            await client.query('COMMIT')
            return result
          } catch (err) {
            try {
              await client.query('ROLLBACK')
            } catch {
              /* ignore */
            }
            throw err
          }
        })
      } catch (err) {
        if (!hasSupabaseServiceRole()) throw err
        console.warn(
          '[simvest] Postgres document lock failed, falling back to process mutex:',
          (err as Error).message,
        )
      }
    }
    return fn()
  })
}

/**
 * Serialized read-modify-write for a JSON store (DB or file).
 * Uses Postgres `SELECT … FOR UPDATE` + advisory lock when DATABASE_URL is set
 * so multi-instance deploys cannot lose updates on the same document.
 */
export function mutateDataJsonStore<T>(
  filePath: string,
  fallback: T,
  mutator: (current: T) => T | Promise<T>,
): Promise<T> {
  const name = storeNameFromPath(filePath)
  const key = `json-store:${name}`
  return runSerializedByKey(key, async () => {
    if (getDatabaseUrl() && getPgPool()) {
      try {
        return await withPgClient(async (client) => {
          await client.query('BEGIN')
          try {
            await client.query(`SELECT pg_advisory_xact_lock(${advisoryLockKeySql()})`, [name])
            const res = await client.query<{ payload: unknown }>(
              'select payload from json_documents where name = $1 for update',
              [name],
            )
            const current = (res.rows[0]?.payload as T | undefined) ?? fallback
            const next = await mutator(current)
            await client.query(
              `insert into json_documents (name, payload, updated_at)
               values ($1, $2::jsonb, now())
               on conflict (name) do update
                 set payload = excluded.payload, updated_at = now()`,
              [name, JSON.stringify(next)],
            )
            await client.query('COMMIT')
            await invalidateCache(filePath)
            return next
          } catch (err) {
            try {
              await client.query('ROLLBACK')
            } catch {
              /* ignore */
            }
            throw err
          }
        })
      } catch (err) {
        if (!hasSupabaseServiceRole()) throw err
        console.warn(
          '[simvest] Postgres mutate failed, falling back to REST/file:',
          (err as Error).message,
        )
      }
    }

    const existing = await readDataJsonObject<T>(filePath)
    const current = existing ?? fallback
    const next = await mutator(current)
    await writeDataJsonObject(filePath, next)
    return next
  })
}

export async function listJsonDocumentNames(): Promise<string[]> {
  if (getDatabaseUrl() && getPgPool()) {
    const res = await getPgPool()!.query<{ name: string }>('select name from json_documents order by name')
    return res.rows.map((r) => r.name)
  }
  const client = getSupabaseAdmin()
  if (client) {
    const { data, error } = await client.from('json_documents').select('name').order('name')
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => String(r.name))
  }
  return []
}
