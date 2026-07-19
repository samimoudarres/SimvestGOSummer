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
const DEFAULT_HOME_LIMIT = 50
const MAX_HOME_LIMIT = 100

export async function fetchHydratedHomeActivityForUser(
  viewerUserId: string,
  opts?: { limit?: number; beforeIso?: string },
): Promise<{ posts: HydratedFeedApiPost[]; nextBeforeIso: string | null }> {
  const slugs = await listParticipationSlugsForUser(viewerUserId)
  const limitRaw = opts?.limit
  const limit =
    typeof limitRaw === 'number' && Number.isFinite(limitRaw)
      ? Math.min(MAX_HOME_LIMIT, Math.max(1, Math.floor(limitRaw)))
      : DEFAULT_HOME_LIMIT
  const beforeIso = typeof opts?.beforeIso === 'string' ? opts.beforeIso.trim() : ''

  /* Per-slug page sized to the home page so we do not pull full game histories. */
  const perSlug = await Promise.all(
    slugs.map((slug) =>
      listPostsForGame(slug, {
        limit,
        beforeIso: beforeIso || undefined,
      }),
    ),
  )
  const merged: GameFeedPost[] = perSlug.flatMap((r) => r.posts)
  merged.sort((a, b) => (a.timestampIso < b.timestampIso ? 1 : -1))

  const page = merged.slice(0, limit)
  const nextBeforeIso =
    page.length === limit && page.length > 0 ? page[page.length - 1]!.timestampIso : null

  const posts = await hydrateGameFeedPosts(page, {
    viewerUserId,
    skipLiveQuotes: true,
  })
  return { posts, nextBeforeIso }
}
