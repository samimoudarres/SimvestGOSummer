import type { MyGameSummary } from '../api/myGamesApi'
import { readSessionJsonStale, writeSessionJson, clearSessionJsonPrefix } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

function key(): string {
  return viewerScopedCacheKey('simvest-my-games-cache-v1', 'list')
}

/** Last-known joined games — ignore TTL so home never flashes empty while refreshing. */
export function readCachedMyGames(): MyGameSummary[] | null {
  const data = readSessionJsonStale<MyGameSummary[]>(key())
  return data && Array.isArray(data) ? data : null
}

export function writeCachedMyGames(games: MyGameSummary[]): void {
  writeSessionJson(key(), games)
}

export function clearCachedMyGames(): void {
  clearSessionJsonPrefix('simvest-my-games-cache-v1')
  try {
    sessionStorage.removeItem('simvest-my-games-cache-v1')
  } catch {
    /* ignore */
  }
}
