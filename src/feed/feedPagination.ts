import type { GameFeedPostRow } from '../challenge/useGameFeed'

/** Default page size for game + home activity feeds. */
export const FEED_PAGE_SIZE = 50

export function postTimeIso(p: GameFeedPostRow): string {
  return (typeof p.postedAtIso === 'string' && p.postedAtIso.trim()) || ''
}

/** Merge a refreshed first page with previously loaded older pages (by id + time). */
export function mergeFeedPage1(
  page1: GameFeedPostRow[],
  existing: GameFeedPostRow[],
): GameFeedPostRow[] {
  if (page1.length === 0) return existing
  const page1Ids = new Set(page1.map((p) => p.id))
  const oldestPage1 = postTimeIso(page1[page1.length - 1]!)
  const older = existing.filter((p) => {
    if (page1Ids.has(p.id)) return false
    const iso = postTimeIso(p)
    if (!oldestPage1 || !iso) return true
    return iso < oldestPage1
  })
  return [...page1, ...older]
}

/** Append a load-more page, dropping duplicates. */
export function appendFeedPage(
  existing: GameFeedPostRow[],
  page: GameFeedPostRow[],
): GameFeedPostRow[] {
  if (page.length === 0) return existing
  const seen = new Set(existing.map((p) => p.id))
  const extra = page.filter((p) => !seen.has(p.id))
  return extra.length === 0 ? existing : [...existing, ...extra]
}

/** Cursor for the next older page: prefer server nextBeforeIso, else last row time. */
export function resolveNextBefore(
  posts: GameFeedPostRow[],
  serverNext: string | null | undefined,
  hasMoreFlag: boolean,
): string | null {
  if (typeof serverNext === 'string' && serverNext.trim()) return serverNext.trim()
  if (!hasMoreFlag || posts.length === 0) return null
  const last = postTimeIso(posts[posts.length - 1]!)
  return last || null
}
