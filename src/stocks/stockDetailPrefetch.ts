import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCache,
  readSimvestJsonCacheStale,
  simvestJsonCacheKey,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import type { ChartRange, StockBarsPayload, StockDetailPayload } from './stockDetailTypes'

export const STOCK_DETAIL_CACHE_MS = LIVE_MARKETS_POLL_MS * 3
/** Align with server bars TTL (~45s) — avoid re-queuing Massive every 5s. */
export const STOCK_BARS_CACHE_MS = 45_000
export const STOCK_BARS_POLL_MS = 45_000

export const CHART_RANGES: ChartRange[] = ['1D', '5D', '1M', '3M', '1Y', '5Y']

export function stockDetailUrl(ticker: string): string {
  return `/api/stocks/${encodeURIComponent(ticker)}`
}

export function stockBarsUrl(ticker: string, range: ChartRange): string {
  const q = new URLSearchParams({ range })
  return `/api/stocks/${encodeURIComponent(ticker)}/bars?${q}`
}

function prefetchOneBarsRange(ticker: string, range: ChartRange): void {
  const key = simvestJsonCacheKey(stockBarsUrl(ticker, range))
  if (readSimvestJsonCache<StockBarsPayload>(key)?.bars?.length) return
  void dedupeSimvestJsonFetch(key, async () => {
    const r = await simvestFetch(stockBarsUrl(ticker, range), { cache: 'no-store' })
    const body = await r.json().catch(() => null)
    if (r.ok && body && Array.isArray(body.bars)) {
      writeSimvestJsonCache(key, body, STOCK_BARS_CACHE_MS)
    }
    return body
  }).catch(() => {})
}

/** Warm every range so 1D→5D→1M switches paint from cache (no Loading chart…). */
export function prefetchStockBarsAllRanges(ticker: string): void {
  const t = ticker.trim().toUpperCase()
  if (!t) return
  CHART_RANGES.forEach((range, i) => {
    window.setTimeout(() => prefetchOneBarsRange(t, range), i * 60)
  })
}

/** Warm detail (+ all bar ranges) before opening a stock screen. */
export function prefetchStockDetail(ticker: string, range: ChartRange = '1D'): void {
  const t = ticker.trim().toUpperCase()
  if (!t) return
  const detailKey = simvestJsonCacheKey(stockDetailUrl(t))
  if (!readSimvestJsonCache<StockDetailPayload>(detailKey)) {
    void dedupeSimvestJsonFetch(detailKey, async () => {
      const r = await simvestFetch(stockDetailUrl(t), { cache: 'no-store' })
      const body = await r.json().catch(() => null)
      if (r.ok && body && typeof body.ticker === 'string') {
        writeSimvestJsonCache(detailKey, body, STOCK_DETAIL_CACHE_MS)
      }
      return body
    }).catch(() => {})
  }
  prefetchOneBarsRange(t, range)
  prefetchStockBarsAllRanges(t)
}

export function peekCachedStockBars(ticker: string, range: ChartRange): StockBarsPayload['bars'] | undefined {
  const hit = readSimvestJsonCacheStale<StockBarsPayload>(simvestJsonCacheKey(stockBarsUrl(ticker, range)))
  return hit?.bars?.length ? hit.bars : undefined
}
