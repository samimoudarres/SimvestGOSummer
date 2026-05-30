import { simvestFetch } from '../api/simvestFetch'
import { readSimvestJsonCache, simvestJsonCacheKey, writeSimvestJsonCache } from '../api/simvestJsonCache'
import type { TradeBrowsePayload } from './tradeTypes'

export const TRADE_BROWSE_CACHE_MS = 12_000
const inflight = new Set<string>()

/** Warm the default Trade tab list before navigation (chrome prefetch + this). */
export function prefetchTradeBrowsePopular(gameSlug: string): void {
  const slug = gameSlug.trim()
  if (!slug) return
  const url = `/api/games/${encodeURIComponent(slug)}/trade/browse?category=popular`
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
