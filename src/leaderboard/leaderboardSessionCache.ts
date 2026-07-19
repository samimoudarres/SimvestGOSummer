import type { LeaderboardPayload, LeaderboardSortKey } from './leaderboardTypes'
import { readSessionJson, writeSessionJson } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

const MAX_AGE_MS = 3 * 60_000

function cacheKey(slug: string, sort: LeaderboardSortKey): string {
  return viewerScopedCacheKey('simvest-lb-v1', `${slug.trim().toLowerCase()}:${sort}`)
}

export function readCachedLeaderboard(slug: string, sort: LeaderboardSortKey): LeaderboardPayload | null {
  const data = readSessionJson<LeaderboardPayload>(cacheKey(slug, sort), MAX_AGE_MS)
  return data && Array.isArray(data.rows) ? data : null
}

export function writeCachedLeaderboard(slug: string, sort: LeaderboardSortKey, payload: LeaderboardPayload): void {
  writeSessionJson(cacheKey(slug, sort), payload)
}
