import type { PortfolioApiRow, PortfolioTotals } from './portfolioTypes'
import { readSessionJson, writeSessionJson } from '../lib/sessionJsonCache'

const MAX_AGE_MS = 2 * 60_000

type CachedPortfolio = { rows: PortfolioApiRow[]; totals: PortfolioTotals }

function key(slug: string): string {
  return `simvest-portfolio-v1:${slug.trim().toLowerCase()}`
}

export function readCachedPortfolio(slug: string): CachedPortfolio | null {
  const data = readSessionJson<CachedPortfolio>(key(slug), MAX_AGE_MS)
  if (!data || !Array.isArray(data.rows) || !data.totals) return null
  return data
}

export function writeCachedPortfolio(slug: string, rows: PortfolioApiRow[], totals: PortfolioTotals): void {
  writeSessionJson(key(slug), { rows, totals })
}
