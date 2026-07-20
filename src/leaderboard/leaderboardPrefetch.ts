import { simvestFetch } from '../api/simvestFetch'
import { LEADERBOARD_SORT_OPTIONS, type LeaderboardPayload, type LeaderboardSortKey } from './leaderboardTypes'
import {
  readCachedLeaderboard,
  writeCachedLeaderboard,
} from './leaderboardSessionCache'

const inflight = new Set<string>()

async function warmOne(slug: string, sort: LeaderboardSortKey): Promise<void> {
  const key = `${slug}:${sort}`
  /* Any last-good is enough for instant paint; live screens refresh silently. */
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

/** Warm a single sort into the session cache (Activity top-gains / nav pointerdown). */
export function prefetchLeaderboardSort(slug: string, sort: LeaderboardSortKey): void {
  const s = slug.trim()
  if (!s) return
  void warmOne(s, sort)
}

/** Warm every sort so switching Overall / Today / 7D / Month never flashes Loading.
 * Stagger enough that the first request can populate the shared server metrics cache
 * before the others arrive (avoids four parallel Massive rebuilds on a cold game).
 * Default sort (overall_return) and today (top gains) run first.
 */
export function prefetchLeaderboardAllSorts(slug: string): void {
  const s = slug.trim()
  if (!s) return
  const order: LeaderboardSortKey[] = [
    'overall_return',
    'today',
    ...LEADERBOARD_SORT_OPTIONS.map((o) => o.key).filter(
      (k) => k !== 'overall_return' && k !== 'today',
    ),
  ]
  order.forEach((sort, i) => {
    window.setTimeout(() => void warmOne(s, sort), i * 280)
  })
}
