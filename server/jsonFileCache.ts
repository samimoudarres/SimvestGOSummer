import fs from 'node:fs/promises'

/**
 * Tiny mtime-aware cache for JSON files we read on every request (user profiles, setup
 * profiles, poll votes). Returns the parsed value and only re-reads from disk when the
 * file actually changed (mtimeMs) — so concurrent requests in the same poll window do
 * not stack up megabyte-sized JSON.parse calls. All writes happen through the existing
 * service write functions, which bump mtime and naturally invalidate the cache here.
 */

type Loader<T> = (raw: string | null) => T

type Entry<T> = {
  mtimeMs: number
  value: T
}

const entries = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export async function readJsonWithMtimeCache<T>(
  path: string,
  parse: Loader<T>,
): Promise<T> {
  let mtimeMs = 0
  try {
    const stat = await fs.stat(path)
    mtimeMs = stat.mtimeMs
  } catch {
    mtimeMs = 0
  }

  const cached = entries.get(path) as Entry<T> | undefined
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.value
  }

  const existing = inflight.get(path) as Promise<T> | undefined
  if (existing) return existing

  const work = (async (): Promise<T> => {
    let raw: string | null = null
    try {
      raw = await fs.readFile(path, 'utf8')
    } catch {
      raw = null
    }
    const value = parse(raw)
    entries.set(path, { mtimeMs, value })
    return value
  })()

  inflight.set(path, work)
  try {
    return await work
  } finally {
    inflight.delete(path)
  }
}

/** Clear after a successful write so the next read picks up new mtime. */
export function invalidateJsonFileCache(path: string): void {
  entries.delete(path)
}
