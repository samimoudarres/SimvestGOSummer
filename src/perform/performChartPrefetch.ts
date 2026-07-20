import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCacheStale,
  simvestJsonCacheKey,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { CHART_RANGES } from '../stocks/stockDetailPrefetch'
import type { ChartRange, PlayerNetWorthChartPayload } from '../stocks/stockDetailTypes'
import type { PerformCompareChartPayload, PerformDashboardPayload } from './performTypes'
import { readCachedPerform, writeCachedPerform } from './performSessionCache'
import { getSimvestUserId } from '../user/simvestUserId'

export const PERFORM_NW_CACHE_MS = 60_000
export const PERFORM_COMPARE_CACHE_MS = 45_000

export function performCompareStorageKey(slug: string): string {
  return `simvest:perform-compare:v1:${slug}`
}

export function performNetWorthChartUrl(
  gameSlug: string,
  userId: string,
  range: ChartRange,
  bust?: number,
): string {
  const q = new URLSearchParams({ range })
  if (bust && bust > 0) q.set('cb', String(bust))
  return `/api/games/${encodeURIComponent(gameSlug)}/users/${encodeURIComponent(userId)}/net-worth-chart?${q}`
}

/** Stable key without bust so polls update the same entry. */
export function performNetWorthChartCacheKey(
  gameSlug: string,
  userId: string,
  range: ChartRange,
): string {
  return simvestJsonCacheKey(performNetWorthChartUrl(gameSlug, userId, range))
}

export function performCompareChartUrl(
  gameSlug: string,
  range: ChartRange,
  withParam = '',
  bust?: number,
): string {
  const q = new URLSearchParams({ range })
  if (withParam) q.set('with', withParam)
  if (bust && bust > 0) q.set('cb', String(bust))
  return `/api/games/${encodeURIComponent(gameSlug)}/perform/compare?${q}`
}

export function performCompareChartCacheKey(
  gameSlug: string,
  range: ChartRange,
  withParam = '',
): string {
  return simvestJsonCacheKey(performCompareChartUrl(gameSlug, range, withParam))
}

export function normalizeNetWorthChartPayload(body: unknown): PlayerNetWorthChartPayload | null {
  if (!body || typeof body !== 'object') return null
  const bars = (body as { bars?: unknown }).bars
  if (!Array.isArray(bars) || bars.length === 0) return null
  const first = bars[0] as { t?: unknown; c?: unknown }
  if (typeof first?.t !== 'number' || typeof first?.c !== 'number') return null
  return body as PlayerNetWorthChartPayload
}

export function normalizeCompareChartPayload(body: unknown): PerformCompareChartPayload | null {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { series?: unknown }).series)) {
    return null
  }
  const p = body as PerformCompareChartPayload
  const now = Date.now()
  return {
    ...p,
    sampledAtMs: Array.isArray(p.sampledAtMs) ? p.sampledAtMs : [],
    domainStartMs: typeof p.domainStartMs === 'number' ? p.domainStartMs : now,
    domainEndMs: typeof p.domainEndMs === 'number' ? p.domainEndMs : now,
  }
}

export function prefetchNetWorthChartRanges(gameSlug: string, userId: string): void {
  const slug = gameSlug.trim()
  const uid = userId.trim()
  if (!slug || uid.length < 8) return
  CHART_RANGES.forEach((range, i) => {
    window.setTimeout(() => {
      const key = performNetWorthChartCacheKey(slug, uid, range)
      if (readSimvestJsonCacheStale<PlayerNetWorthChartPayload>(key)?.bars?.length) return
      void dedupeSimvestJsonFetch(key, async () => {
        const r = await simvestFetch(performNetWorthChartUrl(slug, uid, range))
        const body = await r.json().catch(() => null)
        const p = normalizeNetWorthChartPayload(body)
        if (r.ok && p) writeSimvestJsonCache(key, p, PERFORM_NW_CACHE_MS)
        return body
      }).catch(() => {})
    }, i * 70)
  })
}

export function prefetchPerformCompareRanges(gameSlug: string, withTokens: string[] = []): void {
  const slug = gameSlug.trim()
  if (!slug) return
  const withParam = [...new Set(withTokens)].sort().join(',')
  CHART_RANGES.forEach((range, i) => {
    window.setTimeout(() => {
      const key = performCompareChartCacheKey(slug, range, withParam)
      if (readSimvestJsonCacheStale<PerformCompareChartPayload>(key)?.series?.length) return
      void dedupeSimvestJsonFetch(key, async () => {
        const r = await simvestFetch(performCompareChartUrl(slug, range, withParam))
        const body = await r.json().catch(() => null)
        const p = normalizeCompareChartPayload(body)
        if (r.ok && p) writeSimvestJsonCache(key, p, PERFORM_COMPARE_CACHE_MS)
        return body
      }).catch(() => {})
    }, i * 80)
  })
}

/** Seed perform dashboard session cache (stats/rank/lists) — one GET, no Massive fan-out. */
export function prefetchPerformDashboard(gameSlug: string): void {
  const slug = gameSlug.trim()
  if (!slug) return
  if (readCachedPerform(slug)) return
  void simvestFetch(`/api/games/${encodeURIComponent(slug)}/perform`)
    .then(async (r) => {
      if (!r.ok) return
      const payload = (await r.json().catch(() => null)) as PerformDashboardPayload | null
      if (payload && typeof payload === 'object') {
        writeCachedPerform(slug, { ...payload, gameSlug: slug })
      }
    })
    .catch(() => {})
}

/** Light shell warm: dashboard + optional 1D net-worth only (no full chart fan-out). */
export function prefetchPerformDashboardLight(gameSlug: string): void {
  const slug = gameSlug.trim()
  if (!slug) return
  prefetchPerformDashboard(slug)
  const uid = getSimvestUserId().trim()
  if (uid.length < 8) return
  const range: ChartRange = '1D'
  const key = performNetWorthChartCacheKey(slug, uid, range)
  if (readSimvestJsonCacheStale<PlayerNetWorthChartPayload>(key)?.bars?.length) return
  window.setTimeout(() => {
    void dedupeSimvestJsonFetch(key, async () => {
      const r = await simvestFetch(performNetWorthChartUrl(slug, uid, range))
      const body = await r.json().catch(() => null)
      const p = normalizeNetWorthChartPayload(body)
      if (r.ok && p) writeSimvestJsonCache(key, p, PERFORM_NW_CACHE_MS)
      return body
    }).catch(() => {})
  }, 120)
}

function readCompareTokensFromStorage(slug: string): string[] {
  try {
    const raw = localStorage.getItem(performCompareStorageKey(slug))
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

/** Call before navigating to Perform — warms dashboard + net-worth + compare for the signed-in user. */
export function prefetchPerformCharts(gameSlug: string): void {
  const slug = gameSlug.trim()
  if (!slug) return
  prefetchPerformDashboard(slug)
  const uid = getSimvestUserId().trim()
  if (uid.length >= 8) prefetchNetWorthChartRanges(slug, uid)
  prefetchPerformCompareRanges(slug, readCompareTokensFromStorage(slug))
}
