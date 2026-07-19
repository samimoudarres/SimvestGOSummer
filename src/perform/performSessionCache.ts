import type { PerformDashboardPayload } from './performTypes'
import { readSessionJson, writeSessionJson } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

const MAX_AGE_MS = 2 * 60_000

function key(slug: string): string {
  return viewerScopedCacheKey('simvest-perform-v1', slug.trim().toLowerCase())
}

export function readCachedPerform(slug: string): PerformDashboardPayload | null {
  const data = readSessionJson<PerformDashboardPayload>(key(slug), MAX_AGE_MS)
  return data && typeof data.gameSlug === 'string' ? data : null
}

export function writeCachedPerform(slug: string, payload: PerformDashboardPayload): void {
  writeSessionJson(key(slug), payload)
}
