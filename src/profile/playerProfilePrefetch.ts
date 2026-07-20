import { simvestFetch } from '../api/simvestFetch'
import type { PlayerGameProfilePayload } from './playerProfileTypes'
import {
  isPlayerProfileCacheFresh,
  writeCachedPlayerProfile,
} from './playerProfileSessionCache'

const inflight = new Set<string>()

function cacheKey(slug: string, userId: string): string {
  return `${slug.trim().toLowerCase()}|${userId.trim().toLowerCase()}`
}

/** Warm player profile session cache before navigation (roster / leaderboard pointerdown). */
export function prefetchPlayerGameProfile(gameSlug: string, userId: string): void {
  const slug = gameSlug.trim()
  const uid = userId.trim()
  if (!slug || uid.length < 8) return
  if (isPlayerProfileCacheFresh(slug, uid)) return
  const k = cacheKey(slug, uid)
  if (inflight.has(k)) return
  inflight.add(k)
  void simvestFetch(`/api/games/${encodeURIComponent(slug)}/users/${encodeURIComponent(uid)}/profile`)
    .then(async (r) => {
      const body = await r.json().catch(() => null)
      if (r.ok && body && typeof body === 'object' && 'profile' in body) {
        writeCachedPlayerProfile(slug, uid, body as PlayerGameProfilePayload)
      }
    })
    .catch(() => {})
    .finally(() => inflight.delete(k))
}

/** Lazy-load the profile screen chunk so first open does not wait on JS. */
export function warmPlayerProfileChunk(): void {
  void import('./UserProfileScreen')
}
