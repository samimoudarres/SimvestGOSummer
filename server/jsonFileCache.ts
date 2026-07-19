/**
 * Tiny cache for JSON stores we read on every request.
 * Filesystem: mtime-aware. Supabase/Postgres: generation counter (bumped on write/invalidate).
 */

import { isSupabaseBackend } from './db/backend.ts'
import { getPgPool } from './db/client.ts'
import { readDataJsonText } from './db/persistedJson.ts'
import { hasSupabaseServiceRole } from './db/backend.ts'

type Loader<T> = (raw: string | null) => T

type Entry<T> = {
  stamp: number
  value: T
}

const entries = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()
/** Bumped on each write/invalidate so DB-backed reads refresh. */
const generations = new Map<string, number>()

function bumpGeneration(path: string): void {
  generations.set(path, (generations.get(path) ?? 0) + 1)
}

async function currentStamp(path: string): Promise<number> {
  if (isSupabaseBackend() && (getPgPool() || hasSupabaseServiceRole())) {
    return generations.get(path) ?? 0
  }
  try {
    const { default: fs } = await import('node:fs/promises')
    const stat = await fs.stat(path)
    return stat.mtimeMs
  } catch {
    return 0
  }
}

export async function readJsonWithMtimeCache<T>(path: string, parse: Loader<T>): Promise<T> {
  const stamp = await currentStamp(path)

  const cached = entries.get(path) as Entry<T> | undefined
  if (cached && cached.stamp === stamp) {
    return cached.value
  }

  const existing = inflight.get(path) as Promise<T> | undefined
  if (existing) return existing

  const work = (async (): Promise<T> => {
    const raw = await readDataJsonText(path)
    const value = parse(raw)
    const freshStamp = await currentStamp(path)
    entries.set(path, { stamp: freshStamp, value })
    return value
  })()

  inflight.set(path, work)
  try {
    return await work
  } finally {
    inflight.delete(path)
  }
}

/** Clear after a successful write so the next read picks up new data. */
export function invalidateJsonFileCache(path: string): void {
  entries.delete(path)
  bumpGeneration(path)
}
