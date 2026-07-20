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
/** Bump with server `TRADE_BROWSE_CACHE_VER` so client doesn’t keep flat/0% browse rows after deploy. */
const TRADE_BROWSE_CLIENT_CACHE_VER = 'v5-fast-list-sparks'
const inflight = new Set<string>()

function browsePopularUrl(gameSlug: string): string {
  return `/api/games/${encodeURIComponent(gameSlug)}/trade/browse?category=popular`
}

function browseCacheKey(url: string): string {
  return `${TRADE_BROWSE_CLIENT_CACHE_VER}:${simvestJsonCacheKey(url)}`
}

/** Versioned client cache key for trade browse (shared by hook + prefetch). */
export function tradeBrowseClientCacheKey(url: string): string {
  return browseCacheKey(url)
}

/** Warm the default Trade tab list before navigation (chrome prefetch + game shell). */
export function prefetchTradeBrowsePopular(gameSlug: string): void {
  const slug = gameSlug.trim()
  if (!slug) return
  const url = browsePopularUrl(slug)
  const key = browseCacheKey(url)
  if (readSimvestJsonCache<TradeBrowsePayload>(key)) return
  if (inflight.has(key)) return
  inflight.add(key)
  void simvestFetch(url, { cache: 'no-store' })
    .then(async (r) => {
      const body = await r.json().catch(() => null)
      if (r.ok && body && Array.isArray(body.rows)) {
        writeSimvestJsonCache(key, body, TRADE_BROWSE_CACHE_MS)
        warmBrowseRowDetailCaches(body.rows as TradeBrowsePayload['rows'])
      }
    })
    .catch(() => {})
    .finally(() => inflight.delete(key))
}

/** Prefetch real 1D bars (+ detail seed) for browse rows so stock detail paints a real chart. */
export function warmBrowseRowDetailCaches(
  rows: Array<{
    symbol: string
    companyName: string
    price: string
    changeLabel: string
    logoUrl: string
    sparkline?: number[]
  }>,
): void {
  if (!rows?.length) return
  void import('../stocks/stockDetailPrefetch').then((m) => {
    rows.slice(0, 6).forEach((row, i) => {
      window.setTimeout(() => {
        m.seedStockDetailFromBrowse({
          symbol: row.symbol,
          companyName: row.companyName,
          price: row.price,
          changeLabel: row.changeLabel,
          logoUrl: row.logoUrl,
          sparkline: row.sparkline,
        })
        /* 1D only — full range fan-out was saturating Massive during browse. */
        m.prefetchStockDetail(row.symbol, '1D', { allRanges: false })
      }, i * 100)
    })
  })
}

/** True when we already have a (possibly stale) popular list for instant Trade paint. */
export function peekTradeBrowsePopularCached(gameSlug: string): TradeBrowsePayload | undefined {
  const slug = gameSlug.trim()
  if (!slug) return undefined
  return readSimvestJsonCacheStale<TradeBrowsePayload>(browseCacheKey(browsePopularUrl(slug)))
}
