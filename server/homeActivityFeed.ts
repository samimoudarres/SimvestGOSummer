import { hydrateGameFeedPosts, type HydratedFeedApiPost } from './gameFeedHydration'
import type { GameFeedPost } from './gameFeedService'
import { listGameSlugsWhereUserHasFeedPosts, listPostsForGame } from './gameFeedService'
import { listGameSlugsJoinedByUser } from './gameMembershipService'
import { canonicalGameSlugKey } from './gameSlugNormalize'
import { listGameSlugsWithUserLedger } from './userGameStateService'

/**
 * Aggregate feed posts from every game this user participates in:
 * joins from membership file + any game slug that has ledger rows for them.
 */
export async function fetchHydratedHomeActivityForUser(viewerUserId: string): Promise<HydratedFeedApiPost[]> {
  const joined = await listGameSlugsJoinedByUser(viewerUserId)
  const ledger = await listGameSlugsWithUserLedger(viewerUserId)
  const slugSet = new Set<string>()
  for (const s of joined) {
    const t = canonicalGameSlugKey(s)
    if (t) slugSet.add(t)
  }
  for (const s of ledger) {
    const t = canonicalGameSlugKey(s)
    if (t) slugSet.add(t)
  }
  for (const s of await listGameSlugsWhereUserHasFeedPosts(viewerUserId)) {
    const t = canonicalGameSlugKey(s)
    if (t) slugSet.add(t)
  }

  const slugs = [...slugSet].sort((a, b) => a.localeCompare(b))

  const merged: GameFeedPost[] = []
  for (const slug of slugs) {
    merged.push(...(await listPostsForGame(slug)))
  }

  merged.sort((a, b) => (a.timestampIso < b.timestampIso ? 1 : -1))

  return hydrateGameFeedPosts(merged, { viewerUserId })
}
