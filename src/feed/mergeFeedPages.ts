import type { GameFeedPostRow } from '../challenge/useGameFeed'

/** Default page size for game + home activity feeds. */
export const FEED_PAGE_SIZE = 50

function postIso(p: GameFeedPostRow): string {
  return typeof p.postedAtIso === 'string' ? p.postedAtIso : ''
}

/** Merge a refreshed first page into previously loaded posts without dropping older pages. */
export function mergeFeedRefresh(
  page1: GameFeedPostRow[],
  previous: GameFeedPostRow[],
): GameFeedPostRow[] {
  if (previous.length === 0) return page1
  const page1Ids = new Set(page1.map((p) => p.id))
  let oldestPage1 = ''
  for (const p of page1) {
    const iso = postIso(p)
    if (iso && (!oldestPage1 || iso < oldestPage1)) oldestPage1 = iso
  }
  const older = previous.filter((p) => {
    if (page1Ids.has(p.id)) return false
    const iso = postIso(p)
    if (!oldestPage1) return true
    return Boolean(iso) && iso < oldestPage1
  })
  return [...page1, ...older]
}

/** Append an older page, skipping duplicates. */
export function appendFeedPage(
  existing: GameFeedPostRow[],
  page: GameFeedPostRow[],
): GameFeedPostRow[] {
  if (page.length === 0) return existing
  const seen = new Set(existing.map((p) => p.id))
  const add = page.filter((p) => !seen.has(p.id))
  return add.length === 0 ? existing : [...existing, ...add]
}
