import type { MyGameSummary } from '../api/myGamesApi'
import { readSessionJson, writeSessionJson } from '../lib/sessionJsonCache'

const KEY = 'simvest-my-games-cache-v1'
const MAX_AGE_MS = 5 * 60_000

export function readCachedMyGames(): MyGameSummary[] | null {
  const data = readSessionJson<MyGameSummary[]>(KEY, MAX_AGE_MS)
  return data && Array.isArray(data) ? data : null
}

export function writeCachedMyGames(games: MyGameSummary[]): void {
  writeSessionJson(KEY, games)
}

export function clearCachedMyGames(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
