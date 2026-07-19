/**
 * Tiny in-memory TTL cache for expensive GET payloads (feed / leaderboard).
 * Best-effort per process — not shared across multi-instance deploys (OK for
 * cache; auth rate limits use durable `auth-rate-limits.json` instead).
 */
type Entry = { exp: number; value: unknown }

const store = new Map<string, Entry>()

export function readTtlCache<T>(key: string): T | undefined {
  const hit = store.get(key)
  if (!hit) return undefined
  if (hit.exp <= Date.now()) {
    store.delete(key)
    return undefined
  }
  return hit.value as T
}

export function writeTtlCache(key: string, value: unknown, ttlMs: number): void {
  if (ttlMs <= 0) return
  store.set(key, { exp: Date.now() + ttlMs, value })
}

export function clearTtlCachePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
