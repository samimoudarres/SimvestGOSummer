import type { PerformDashboardPayload } from './performTypes'
import { readSessionJson, readSessionJsonStale, writeSessionJson } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

const MAX_AGE_MS = 2 * 60_000

function key(slug: string): string {
  return viewerScopedCacheKey('simvest-perform-v2-intraday-sparks', slug.trim().toLowerCase())
}

/** Last-good (may be stale) — use for instant Perform tab paint. */
export function readCachedPerform(slug: string): PerformDashboardPayload | null {
  const data = readSessionJsonStale<PerformDashboardPayload>(key(slug))
  return data && typeof data.gameSlug === 'string' ? data : null
}

export function isPerformCacheFresh(slug: string): boolean {
  const data = readSessionJson<PerformDashboardPayload>(key(slug), MAX_AGE_MS)
  return !!(data && typeof data.gameSlug === 'string')
}

export function writeCachedPerform(slug: string, payload: PerformDashboardPayload): void {
  writeSessionJson(key(slug), payload)
}
