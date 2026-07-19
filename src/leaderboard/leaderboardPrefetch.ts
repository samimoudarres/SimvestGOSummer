import { simvestFetch } from '../api/simvestFetch'
import { LEADERBOARD_SORT_OPTIONS, type LeaderboardPayload, type LeaderboardSortKey } from './leaderboardTypes'
import { readCachedLeaderboard, writeCachedLeaderboard } from './leaderboardSessionCache'

const inflight = new Set<string>()

async function warmOne(slug: string, sort: LeaderboardSortKey): Promise<void> {
  const key = `${slug}:${sort}`
  if (readCachedLeaderboard(slug, sort)) return
  if (inflight.has(key)) return
  inflight.add(key)
  try {
    const res = await simvestFetch(
      `/api/games/${encodeURIComponent(slug)}/leaderboard?sort=${encodeURIComponent(sort)}`,
    )
    if (!res.ok) return
    const json = (await res.json()) as LeaderboardPayload
    if (json && Array.isArray(json.rows)) writeCachedLeaderboard(slug, sort, json)
  } catch {
    /* ignore — live screen will fetch */
  } finally {
    inflight.delete(key)
  }
}

/** Warm every sort so switching Overall / Today / 7D / Month never flashes Loading.
 * Stagger enough that the first request can populate the shared server metrics cache
 * before the others arrive (avoids four parallel Massive rebuilds on a cold game).
 */
export function prefetchLeaderboardAllSorts(slug: string): void {
  const s = slug.trim()
  if (!s) return
  LEADERBOARD_SORT_OPTIONS.forEach((opt, i) => {
    window.setTimeout(() => void warmOne(s, opt.key), i * 350)
  })
}
