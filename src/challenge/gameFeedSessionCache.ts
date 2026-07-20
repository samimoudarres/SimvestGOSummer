import type { GameFeedPostRow } from './useGameFeed'
import { readSessionJson, readSessionJsonStale, writeSessionJson } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

const MAX_AGE_MS = 5 * 60_000

function key(slug: string): string {
  return viewerScopedCacheKey('simvest-game-feed-v1', slug.trim().toLowerCase())
}

export function readCachedGameFeed(slug: string): GameFeedPostRow[] | null {
  const data = readSessionJsonStale<GameFeedPostRow[]>(key(slug))
  return data && Array.isArray(data) ? data : null
}

export function isGameFeedCacheFresh(slug: string): boolean {
  const data = readSessionJson<GameFeedPostRow[]>(key(slug), MAX_AGE_MS)
  return !!(data && Array.isArray(data))
}

export function writeCachedGameFeed(slug: string, posts: GameFeedPostRow[]): void {
  writeSessionJson(key(slug), posts)
}
