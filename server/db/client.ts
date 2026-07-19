import pg from 'pg'
import { getDatabaseUrl } from './backend.ts'

const { Pool } = pg

let pool: pg.Pool | null = null
let poolInitFailed = false

export function getPgPool(): pg.Pool | null {
  const connectionString = getDatabaseUrl()
  if (!connectionString) return null
  if (poolInitFailed) return null
  if (pool) return pool

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30_000,
  })
  pool.on('error', (err) => {
    console.error('[simvest] Postgres pool error:', err.message)
  })
  return pool
}

export async function withPgClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const p = getPgPool()
  if (!p) throw new Error('Postgres pool is not configured')
  const client = await p.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export async function pingDatabase(): Promise<boolean> {
  const p = getPgPool()
  if (!p) return false
  try {
    await p.query('select 1 as ok')
    return true
  } catch {
    return false
  }
}
