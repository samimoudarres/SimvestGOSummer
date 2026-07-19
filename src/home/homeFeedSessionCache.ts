import type { GameFeedPostRow } from '../challenge/useGameFeed'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

const MAX_AGE_MS = 5 * 60_000

type CachedFeed = {
  savedAt: number
  posts: GameFeedPostRow[]
}

function cacheKey(): string {
  return viewerScopedCacheKey('simvest-home-feed-cache-v1', 'feed')
}

export function readCachedHomeFeed(): GameFeedPostRow[] | null {
  try {
    const raw = sessionStorage.getItem(cacheKey())
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedFeed
    if (!parsed?.posts || !Array.isArray(parsed.posts)) return null
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) return null
    return parsed.posts
  } catch {
    return null
  }
}

export function writeCachedHomeFeed(posts: GameFeedPostRow[]): void {
  try {
    const payload: CachedFeed = { savedAt: Date.now(), posts }
    sessionStorage.setItem(cacheKey(), JSON.stringify(payload))
  } catch {
    /* quota */
  }
}

export function clearCachedHomeFeed(): void {
  try {
    /* Clear both namespaced keys and legacy unscoped key. */
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith('simvest-home-feed-cache-v1')) keys.push(k)
    }
    for (const k of keys) sessionStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}
