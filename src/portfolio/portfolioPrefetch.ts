import { simvestFetch } from '../api/simvestFetch'
import type { PortfolioApiRow, PortfolioTotals } from './portfolioTypes'
import { isPortfolioCacheFresh, writeCachedPortfolio } from './portfolioSessionCache'

const inflight = new Set<string>()

/** Warm portfolio session cache before Portfolio tab navigation. */
export function prefetchPortfolio(gameSlug: string): void {
  const slug = gameSlug.trim()
  if (!slug) return
  if (isPortfolioCacheFresh(slug)) return
  if (inflight.has(slug)) return
  inflight.add(slug)
  void simvestFetch(`/api/games/${encodeURIComponent(slug)}/portfolio`)
    .then(async (r) => {
      const body = await r.json().catch(() => null)
      if (r.ok && body && Array.isArray(body.rows) && body.totals && typeof body.totals === 'object') {
        writeCachedPortfolio(slug, body.rows as PortfolioApiRow[], body.totals as PortfolioTotals)
      }
    })
    .catch(() => {})
    .finally(() => inflight.delete(slug))
}
