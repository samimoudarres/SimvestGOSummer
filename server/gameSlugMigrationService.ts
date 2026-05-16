/**
 * When the create-game wizard publishes into the shared `new` slot with
 * `forceNewGameInstance`, we must not wipe other players' (or the same host's)
 * prior published challenge — that data also lives under slug `new`.
 *
 * Before `resetGameScopedStoresForRepublish('new')`, move the live published
 * row + all per-game stores to a permanent slug (e.g. `live-162063`).
 */

import { renameGameSlugInFeedPosts } from './gameFeedService'
import { renameGameSlugInJoinRequests } from './gameJoinRequestsService'
import { renameGameSlugInMembership } from './gameMembershipService'
import { renameGameSlugInNetWorthSnapshots } from './gameNetWorthSnapshotService'
import { renameGameSlugInFinalSnapshots } from './gameFinalSnapshotService'
import { renameGameSlugInRankStreaks } from './performRankStreakService'
import { renameGameSlugInFollows } from './followsService'
import { viewerIdsMatch } from './gameJoinRequestsService'
import { resetGameScopedStoresForRepublish } from './gameLifecycleService'
import {
  archiveRuntimeRulesRow,
  getRuntimeRules,
  pickPermanentSlugForArchive,
  seedNewSlotDraftRow,
} from './gameRuntimeRulesService'
import { renameGameSlugInSetupProfiles } from './userSetupProfileService'
import { renameGameSlugInPortfolioState } from './userGameStateService'
import { getUserPublicProfile } from './userProfileService'

const NEW_SLOT_SLUG = 'new'

export async function migrateAllStoresFromSlug(fromSlug: string, toSlug: string): Promise<void> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return
  await renameGameSlugInMembership(fromSlug, toSlug)
  await renameGameSlugInPortfolioState(fromSlug, toSlug)
  await renameGameSlugInSetupProfiles(fromSlug, toSlug)
  await renameGameSlugInFeedPosts(fromSlug, toSlug)
  await renameGameSlugInJoinRequests(fromSlug, toSlug)
  await renameGameSlugInNetWorthSnapshots(fromSlug, toSlug)
  await renameGameSlugInFinalSnapshots(fromSlug, toSlug)
  await renameGameSlugInRankStreaks(fromSlug, toSlug)
  await renameGameSlugInFollows(fromSlug, toSlug)
}

/**
 * Copy the currently published `new` slot to a unique slug and re-key all JSON
 * stores so the next publish starts with an empty `new` template.
 */
export async function archivePublishedNewSlotBeforeRepublish(): Promise<string | null> {
  const prev = await getRuntimeRules(NEW_SLOT_SLUG)
  if (!prev?.setupComplete) return null

  const toSlug = await pickPermanentSlugForArchive(prev)
  await archiveRuntimeRulesRow(NEW_SLOT_SLUG, toSlug)
  await migrateAllStoresFromSlug(NEW_SLOT_SLUG, toSlug)
  return toSlug
}

/**
 * Host is starting another challenge: move the live publish off `new` and seed a
 * blank draft so wizard autosaves cannot overwrite the archived game's title.
 */
export async function prepareNewSlotForHostDraft(
  hostUserId: string,
  hostDisplayName = '',
): Promise<string | null> {
  const prev = await getRuntimeRules(NEW_SLOT_SLUG)
  if (!prev?.setupComplete || !viewerIdsMatch(prev.hostUserId, hostUserId)) return null

  const archivedSlug = await archivePublishedNewSlotBeforeRepublish()
  await resetGameScopedStoresForRepublish(NEW_SLOT_SLUG)

  let label = hostDisplayName.trim()
  if (!label) {
    const profile = await getUserPublicProfile(hostUserId)
    const name = profile?.displayName?.trim() ?? ''
    label = name === 'You' ? '' : name
  }
  await seedNewSlotDraftRow(hostUserId, label)
  return archivedSlug
}

export { NEW_SLOT_SLUG }
