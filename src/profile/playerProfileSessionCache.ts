import type { PlayerGameProfilePayload } from './playerProfileTypes'
import { readSessionJson, readSessionJsonStale, writeSessionJson } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

const MAX_AGE_MS = 90_000

function key(slug: string, userId: string): string {
  return viewerScopedCacheKey(
    'simvest-player-profile-v2-intraday-sparks',
    `${slug.trim().toLowerCase()}:${userId.trim().toLowerCase()}`,
  )
}

/** Last-good profile (may be stale) — instant paint when opening a player. */
export function readCachedPlayerProfile(
  slug: string,
  userId: string,
): PlayerGameProfilePayload | null {
  const data = readSessionJsonStale<PlayerGameProfilePayload>(key(slug, userId))
  return data && typeof data.gameSlug === 'string' && data.profile ? data : null
}

export function isPlayerProfileCacheFresh(slug: string, userId: string): boolean {
  const data = readSessionJson<PlayerGameProfilePayload>(key(slug, userId), MAX_AGE_MS)
  return !!(data && typeof data.gameSlug === 'string' && data.profile)
}

export function writeCachedPlayerProfile(
  slug: string,
  userId: string,
  payload: PlayerGameProfilePayload,
): void {
  writeSessionJson(key(slug, userId), payload)
}
