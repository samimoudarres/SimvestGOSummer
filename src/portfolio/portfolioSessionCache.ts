import type { PortfolioApiRow, PortfolioTotals } from './portfolioTypes'
import { readSessionJson, readSessionJsonStale, writeSessionJson } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

const MAX_AGE_MS = 2 * 60_000

type CachedPortfolio = { rows: PortfolioApiRow[]; totals: PortfolioTotals }

/** Bump when sparkline shape / row payload semantics change so stale diagonals aren’t painted. */
function key(slug: string): string {
  return viewerScopedCacheKey('simvest-portfolio-v2-intraday-sparks', slug.trim().toLowerCase())
}

export function readCachedPortfolio(slug: string): CachedPortfolio | null {
  const data = readSessionJsonStale<CachedPortfolio>(key(slug))
  if (!data || !Array.isArray(data.rows) || !data.totals) return null
  return data
}

export function isPortfolioCacheFresh(slug: string): boolean {
  const data = readSessionJson<CachedPortfolio>(key(slug), MAX_AGE_MS)
  return !!(data && Array.isArray(data.rows) && data.totals)
}

export function writeCachedPortfolio(slug: string, rows: PortfolioApiRow[], totals: PortfolioTotals): void {
  writeSessionJson(key(slug), { rows, totals })
}
