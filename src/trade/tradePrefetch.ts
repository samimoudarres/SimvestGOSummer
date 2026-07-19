import { simvestFetch } from '../api/simvestFetch'
import {
  readSimvestJsonCache,
  readSimvestJsonCacheStale,
  simvestJsonCacheKey,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import type { TradeBrowsePayload } from './tradeTypes'

/** Align with server browse fresh TTL — keep lists painted across tab switches. */
export const TRADE_BROWSE_CACHE_MS = 45_000
const inflight = new Set<string>()

function browsePopularUrl(gameSlug: string): string {
  return `/api/games/${encodeURIComponent(gameSlug)}/trade/browse?category=popular`
}

/** Warm the default Trade tab list before navigation (chrome prefetch + game shell). */
export function prefetchTradeBrowsePopular(gameSlug: string): void {
  const slug = gameSlug.trim()
  if (!slug) return
  const url = browsePopularUrl(slug)
  const key = simvestJsonCacheKey(url)
  if (readSimvestJsonCache<TradeBrowsePayload>(key)) return
  if (inflight.has(key)) return
  inflight.add(key)
  void simvestFetch(url, { cache: 'no-store' })
    .then(async (r) => {
      const body = await r.json().catch(() => null)
      if (r.ok && body && Array.isArray(body.rows)) {
        writeSimvestJsonCache(key, body, TRADE_BROWSE_CACHE_MS)
      }
    })
    .catch(() => {})
    .finally(() => inflight.delete(key))
}

/** True when we already have a (possibly stale) popular list for instant Trade paint. */
export function peekTradeBrowsePopularCached(gameSlug: string): TradeBrowsePayload | undefined {
  const slug = gameSlug.trim()
  if (!slug) return undefined
  return readSimvestJsonCacheStale<TradeBrowsePayload>(simvestJsonCacheKey(browsePopularUrl(slug)))
}
