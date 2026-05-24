import type { GameFeedPostRow } from '../challenge/useGameFeed'

const CACHE_KEY = 'simvest-home-feed-cache-v1'
const MAX_AGE_MS = 5 * 60_000

type CachedFeed = {
  savedAt: number
  posts: GameFeedPostRow[]
}

export function readCachedHomeFeed(): GameFeedPostRow[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
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
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* quota */
  }
}

export function clearCachedHomeFeed(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}
