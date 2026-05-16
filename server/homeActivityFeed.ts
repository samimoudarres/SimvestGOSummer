import { hydrateGameFeedPosts, type HydratedFeedApiPost } from './gameFeedHydration'
import type { GameFeedPost } from './gameFeedService'
import { listPostsForGame } from './gameFeedService'
import { listParticipationSlugsForUser } from './userParticipationSlugs'

/**
 * Aggregate feed posts from every game this user participates in.
 *
 * Suggestions are NOT participation. Slugs come from `listParticipationSlugsForUser`
 * (joined games, ledger games, and games where this user has a persisted feed row)
 * so home activity matches `/api/me/games` and survives membership-only glitches.
 */
export async function fetchHydratedHomeActivityForUser(viewerUserId: string): Promise<HydratedFeedApiPost[]> {
  const slugs = await listParticipationSlugsForUser(viewerUserId)

  const merged: GameFeedPost[] = []
  for (const slug of slugs) {
    merged.push(...(await listPostsForGame(slug)))
  }

  merged.sort((a, b) => (a.timestampIso < b.timestampIso ? 1 : -1))

  return hydrateGameFeedPosts(merged, { viewerUserId })
}
