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

function isBrowseSeedDetail(p: StockDetailPayload | undefined): boolean {
  return !!p?.seed
}

function isBrowseSeedBars(p: StockBarsPayload | undefined): boolean {
  return !!p?.seed
}

function parsePriceLabel(price: string): number | null {
  const n = Number(String(price).replace(/[^0-9.eE+-]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseChangeLabel(label: string): number | null {
  const raw = String(label ?? '').trim()
  if (!raw || raw === '—') return null
  const n = Number(raw.replace(/[%+,]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Paint chart immediately from trade-list spark while real 1D bars load. */
export function seedStockBarsFromSparkline(ticker: string, sparkline: number[]): void {
  const t = ticker.trim().toUpperCase()
  if (!t || sparkline.length < 2) return
  const key = simvestJsonCacheKey(stockBarsUrl(t, '1D'))
  const hit = readSimvestJsonCache<StockBarsPayload>(key)
  if (hit?.bars?.length && !isBrowseSeedBars(hit)) return
  const now = Date.now()
  const step = 5 * 60_000
  const bars = sparkline.map((c, i) => ({
    t: now - (sparkline.length - 1 - i) * step,
    o: c,
    h: c,
    l: c,
    c,
    v: 0,
  }))
  writeSimvestJsonCache(key, { ticker: t, range: '1D', bars, seed: true }, STOCK_BARS_CACHE_MS)
}

export type TradeBrowseSeedRow = {
  symbol: string
  companyName: string
  price: string
  changeLabel: string
  logoUrl: string
  sparkline?: number[]
}

/**
 * Handoff from Trade browse so detail chrome (ticker / price / %) paints before the heavy
 * financials round-trip. Prefetch still replaces this with a full payload.
 */
export function seedStockDetailFromBrowse(row: TradeBrowseSeedRow): void {
  const t = row.symbol.trim().toUpperCase()
  if (!t) return
  const detailKey = simvestJsonCacheKey(stockDetailUrl(t))
  const existing = readSimvestJsonCache<StockDetailPayload>(detailKey)
  if (existing && !isBrowseSeedDetail(existing)) return

  const lastPrice = parsePriceLabel(row.price)
  const changeTodayPct = parseChangeLabel(row.changeLabel)
  const seed: StockDetailPayload = {
    ticker: t,
    name: row.companyName?.trim() || t,
    description: '',
    iconUrl: row.logoUrl || `/api/stocks/${encodeURIComponent(t)}/branding-icon`,
    lastPrice,
    lastPriceLabel: row.price || '—',
    changeToday: null,
    changeTodayPct,
    changeTodayLabel: row.changeLabel || '—',
    about: { ceo: '—', founded: '—', employees: '—', headquarters: '—' },
    keyStatsPage1: [],
    keyStatsPage2: [],
    financialsAnnual: [],
    financialsQuarterly: [],
    financialsEpsAnnual: [],
    financialsEpsQuarterly: [],
    updatedAt: new Date().toISOString(),
    seed: true,
  }
  writeSimvestJsonCache(detailKey, seed, STOCK_DETAIL_CACHE_MS)

  if (row.sparkline && row.sparkline.length >= 2) {
    seedStockBarsFromSparkline(t, row.sparkline)
  }
}

function prefetchOneBarsRange(ticker: string, range: ChartRange): void {
  const key = simvestJsonCacheKey(stockBarsUrl(ticker, range))
  const hit = readSimvestJsonCache<StockBarsPayload>(key)
  if (hit?.bars?.length && !isBrowseSeedBars(hit)) return
  void dedupeSimvestJsonFetch(key, async () => {
    const r = await simvestFetch(stockBarsUrl(ticker, range), { cache: 'no-store' })
    const body = await r.json().catch(() => null)
    if (r.ok && body && Array.isArray(body.bars)) {
      writeSimvestJsonCache(key, body as StockBarsPayload, STOCK_BARS_CACHE_MS)
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
  const hit = readSimvestJsonCache<StockDetailPayload>(detailKey)
  if (!hit || isBrowseSeedDetail(hit)) {
    void dedupeSimvestJsonFetch(detailKey, async () => {
      const r = await simvestFetch(stockDetailUrl(t), { cache: 'no-store' })
      const body = await r.json().catch(() => null)
      if (r.ok && body && typeof body.ticker === 'string') {
        writeSimvestJsonCache(detailKey, body as StockDetailPayload, STOCK_DETAIL_CACHE_MS)
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
