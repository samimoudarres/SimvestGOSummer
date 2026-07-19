import type { MyGameSummary } from '../api/myGamesApi'
import { readSessionJson, writeSessionJson, clearSessionJsonPrefix } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'

const MAX_AGE_MS = 5 * 60_000

function key(): string {
  return viewerScopedCacheKey('simvest-my-games-cache-v1', 'list')
}

export function readCachedMyGames(): MyGameSummary[] | null {
  const data = readSessionJson<MyGameSummary[]>(key(), MAX_AGE_MS)
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
