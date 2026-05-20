import { listGameSlugsWhereUserHasFeedPosts } from './gameFeedService'
import { viewerIdsMatch } from './gameJoinRequestsService'
import { ensureGameJoinedAt, listGameSlugsJoinedByUser } from './gameMembershipService'
import { canonicalGameSlugKey } from './gameSlugNormalize'
import { listAllRuntimeRules } from './gameRuntimeRulesService'
import { listGameSlugsWithUserLedger } from './userGameStateService'

/**
 * Canonical game slugs where this viewer has persisted participation:
 * explicit join, portfolio/trade ledger, or at least one feed post as that user.
 *
 * Used by the home activity merger and `/api/me/games` so surfaces stay aligned
 * when membership rows lag or were trimmed incorrectly.
 */
async function listHostedPublishedSlugs(viewerUserId: string): Promise<string[]> {
  const all = await listAllRuntimeRules()
  const out: string[] = []
  for (const { slug, rules } of all) {
    if (!rules.setupComplete) continue
    if (!viewerIdsMatch(rules.hostUserId, viewerUserId)) continue
    const k = canonicalGameSlugKey(slug)
    if (k) {
      out.push(slug)
      await ensureGameJoinedAt(viewerUserId, slug).catch(() => {})
    }
  }
  return out
}

export async function listParticipationSlugsForUser(viewerUserId: string): Promise<string[]> {
  const [joined, ledger, feed, hosted] = await Promise.all([
    listGameSlugsJoinedByUser(viewerUserId),
    listGameSlugsWithUserLedger(viewerUserId),
    listGameSlugsWhereUserHasFeedPosts(viewerUserId),
    listHostedPublishedSlugs(viewerUserId),
  ])
  const slugSet = new Set<string>()
  for (const s of [...joined, ...ledger, ...feed, ...hosted]) {
    const t = canonicalGameSlugKey(s)
    if (t) slugSet.add(s)
  }
  return [...slugSet].sort((a, b) => a.localeCompare(b))
}
