/**
 * Tiny in-memory TTL cache for expensive GET payloads (feed / leaderboard).
 * Best-effort per process — not shared across multi-instance deploys (OK for
 * cache; auth rate limits use durable `auth-rate-limits.json` instead).
 */
type Entry = { exp: number; value: unknown }

const store = new Map<string, Entry>()
/** Hard cap so unique keys cannot grow without bound (Render OOM amplifier). */
const MAX_TTL_CACHE_ENTRIES = 400

function sweepExpired(now = Date.now()): void {
  for (const [k, v] of store) {
    if (v.exp <= now) store.delete(k)
  }
}

function evictOldestIfNeeded(): void {
  if (store.size <= MAX_TTL_CACHE_ENTRIES) return
  const overflow = store.size - MAX_TTL_CACHE_ENTRIES
  let i = 0
  for (const k of store.keys()) {
    store.delete(k)
    i += 1
    if (i >= overflow) break
  }
}

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
  const now = Date.now()
  if (store.size > MAX_TTL_CACHE_ENTRIES * 0.9) sweepExpired(now)
  store.set(key, { exp: now + ttlMs, value })
  evictOldestIfNeeded()
}

export function deleteTtlCache(key: string): void {
  store.delete(key)
}

export function clearTtlCachePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
