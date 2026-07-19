/**
 * In-memory JSON cache for hot GET endpoints (trade browse/search, stock detail).
 * Shows stale data instantly; dedupes concurrent fetches for the same URL.
 */

type Entry = { exp: number; data: unknown }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

export function simvestJsonCacheKey(url: string): string {
  return url
}

export function readSimvestJsonCache<T>(key: string): T | undefined {
  const hit = store.get(key)
  if (!hit) return undefined
  if (hit.exp <= Date.now()) {
    store.delete(key)
    return undefined
  }
  return hit.data as T
}

/** Return cached JSON even if TTL expired — for instant paint while a refresh runs. */
export function readSimvestJsonCacheStale<T>(key: string): T | undefined {
  const hit = store.get(key)
  if (!hit) return undefined
  return hit.data as T
}

export function writeSimvestJsonCache(key: string, data: unknown, ttlMs: number): void {
  if (ttlMs <= 0) return
  store.set(key, { exp: Date.now() + ttlMs, data })
}

export function clearSimvestJsonCachePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

/** Drop the entire in-memory JSON cache (logout / account switch). */
export function clearAllSimvestJsonCache(): void {
  store.clear()
  inflight.clear()
}

/** One in-flight request per cache key; late subscribers await the same promise. */
export function dedupeSimvestJsonFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  const work = fetcher().finally(() => inflight.delete(key))
  inflight.set(key, work)
  return work
}
