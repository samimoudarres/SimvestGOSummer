import {
  clearAllMembershipsForGame,
  getGameJoinedAtIso,
  removeGameMembership,
} from './gameMembershipService'
import {
  clearAllUserLedgersForGame,
  clearLegacyHoldingsForGameSlot,
  clearUserLedgerForGame,
} from './userGameStateService'
import { clearUserSnapshotsForGame, clearAllSnapshotsForGame } from './gameNetWorthSnapshotService'
import { clearSetupProfileForUserGame, loadAllSetupProfilesByKey, clearAllSetupProfilesForGame } from './userSetupProfileService'
import { deleteFeedPostsByUserInGame, deleteAllFeedPostsForGame } from './gameFeedService'
import { clearJoinRequestsForUserGame, clearAllJoinRequestsForGame } from './gameJoinRequestsService'
import { ensureUserProfilesBatch } from './userProfileService'
import {
  computeGameEndIso,
  forceGameEndIsoInStore,
  getRuntimeRules,
  upsertRuntimeRules,
  type DurationPreset,
} from './gameRuntimeRulesService'
import { resolveProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'
import { listParticipantIdsForGame } from './gameParticipantIds'

/** Player row shown to the host in the kick list (active members + tradeable participants). */
export type GamePlayerRow = {
  userId: string
  displayName: string
  avatarUrl: string
  isHost: boolean
  joinedAtIso: string | null
}

/**
 * Returns every user that currently participates in the game (official members + host),
 * with the host tagged so the UI can hide self-kick rows.
 */
export async function listActiveGamePlayers(gameSlug: string): Promise<GamePlayerRow[]> {
  const slug = String(gameSlug ?? '').trim()
  if (!slug) return []
  const rules = await getRuntimeRules(slug)
  const hostUserId = rules?.hostUserId ?? null

  const ids = await listParticipantIdsForGame(slug)
  const sliced = ids.filter((u) => u.length >= 8)
  const profileMap = await ensureUserProfilesBatch(sliced)
  const setups = await loadAllSetupProfilesByKey()

  const rows: GamePlayerRow[] = []
  for (const userId of sliced) {
    const setup = setups.get(`${userId}:::${slug}`)
    const prof = profileMap.get(userId)
    const displayName = setup
      ? `${setup.firstName} ${setup.lastName}`.trim()
      : (prof?.displayName ?? 'Player')
    const avatarUrl = resolveProfileAvatarUrl(setup?.avatarUrl ?? prof?.avatarUrl ?? '')
    const joinedAtIso = await getGameJoinedAtIso(userId, slug)
    rows.push({
      userId,
      displayName,
      avatarUrl,
      isHost: hostUserId === userId,
      joinedAtIso,
    })
  }
  rows.sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })
  return rows
}

/**
 * Wipe all per-game stores for a slug. Used when the shared `new` template is first
 * published so a fresh challenge does not inherit prior players, ledgers, feed rows,
 * or demo holdings from earlier runs on the same slug.
 */
export async function resetGameScopedStoresForRepublish(gameSlug: string): Promise<{
  membershipsCleared: number
  ledgersCleared: number
  feedPostsRemoved: number
  snapshotsCleared: boolean
  joinRequestsRemoved: number
  setupProfilesRemoved: number
}> {
  const slug = String(gameSlug ?? '').trim()
  if (!slug) {
    return {
      membershipsCleared: 0,
      ledgersCleared: 0,
      feedPostsRemoved: 0,
      snapshotsCleared: false,
      joinRequestsRemoved: 0,
      setupProfilesRemoved: 0,
    }
  }
  const [membershipsCleared, ledgersCleared, feedPostsRemoved, joinRequestsRemoved, setupProfilesRemoved] =
    await Promise.all([
      clearAllMembershipsForGame(slug),
      clearAllUserLedgersForGame(slug),
      deleteAllFeedPostsForGame(slug),
      clearAllJoinRequestsForGame(slug),
      clearAllSetupProfilesForGame(slug),
    ])
  await clearLegacyHoldingsForGameSlot(slug)
  const snapshotsCleared = await clearAllSnapshotsForGame(slug)
  return {
    membershipsCleared,
    ledgersCleared,
    feedPostsRemoved,
    snapshotsCleared,
    joinRequestsRemoved,
    setupProfilesRemoved,
  }
}

export type RemoveUserSummary = {
  membershipRemoved: boolean
  ledgerCleared: boolean
  snapshotsCleared: boolean
  setupCleared: boolean
  feedPostsRemoved: number
  joinRequestsRemoved: number
}

/**
 * Single "remove user from this game" routine — used by both the host kick action and the
 * player leave action. Clears every per-user store so the user no longer appears as a member,
 * does not see the game on their home list / activity feed, and cannot resume their old ledger.
 */
export async function removeUserFromGame(userId: string, gameSlug: string): Promise<RemoveUserSummary> {
  const [membershipRemoved, ledgerCleared, snapshotsCleared, setupCleared, feedPostsRemoved, joinRequestsRemoved] =
    await Promise.all([
      removeGameMembership(userId, gameSlug),
      clearUserLedgerForGame(userId, gameSlug),
      clearUserSnapshotsForGame(gameSlug, userId),
      clearSetupProfileForUserGame(userId, gameSlug),
      deleteFeedPostsByUserInGame(userId, gameSlug),
      clearJoinRequestsForUserGame(userId, gameSlug),
    ])
  return {
    membershipRemoved,
    ledgerCleared,
    snapshotsCleared,
    setupCleared,
    feedPostsRemoved,
    joinRequestsRemoved,
  }
}

export async function endGameNow(
  gameSlug: string,
  hostUserId: string,
): Promise<{ ok: true; endsAtIso: string } | { ok: false; status: 403 | 404; error: string }> {
  const rules = await getRuntimeRules(gameSlug)
  if (!rules) return { ok: false, status: 404, error: 'Game not found.' }
  if (!rules.hostUserId || rules.hostUserId !== hostUserId) {
    return { ok: false, status: 403, error: 'Only the game host can end the game.' }
  }
  const nowIso = new Date().toISOString()
  await upsertRuntimeRules(
    gameSlug,
    {
      gameDisplayName: rules.gameDisplayName,
      durationPreset: 'custom',
      customEndsOn: nowIso.slice(0, 10),
      assetsMode: rules.assetsMode,
      assetsCategory: rules.assetsCategory,
      visibility: rules.visibility,
      themePaletteId: rules.themePaletteId,
      loadScreenEmoji: rules.loadScreenEmoji,
      hostDisplayName: rules.hostDisplayName,
      setupComplete: rules.setupComplete,
    },
    hostUserId,
  )
  // upsertRuntimeRules computes the end from the (start, preset, customEndsOn) tuple. To force
  // an immediate end, write a second time setting endsAtIso explicitly via a direct file edit.
  await forceGameEndIsoInStore(gameSlug, nowIso)
  return { ok: true, endsAtIso: nowIso }
}

export async function changeGameDuration(input: {
  gameSlug: string
  hostUserId: string
  durationPreset: DurationPreset
  customEndsOn: string | null
}): Promise<
  | { ok: true; endsAtIso: string }
  | { ok: false; status: 400 | 403 | 404; error: string }
> {
  const rules = await getRuntimeRules(input.gameSlug)
  if (!rules) return { ok: false, status: 404, error: 'Game not found.' }
  if (!rules.hostUserId || rules.hostUserId !== input.hostUserId) {
    return { ok: false, status: 403, error: 'Only the game host can change the duration.' }
  }

  const nextEnd = computeGameEndIso(rules.startsAtIso, input.durationPreset, input.customEndsOn)
  if (!nextEnd) {
    return { ok: false, status: 400, error: 'Could not compute an end date from the duration you picked.' }
  }
  if (new Date(nextEnd).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: 'New end date must be in the future. Use End game to close it now.' }
  }

  const saved = await upsertRuntimeRules(
    input.gameSlug,
    {
      gameDisplayName: rules.gameDisplayName,
      durationPreset: input.durationPreset,
      customEndsOn: input.durationPreset === 'custom' ? input.customEndsOn : null,
      assetsMode: rules.assetsMode,
      assetsCategory: rules.assetsCategory,
      visibility: rules.visibility,
      themePaletteId: rules.themePaletteId,
      loadScreenEmoji: rules.loadScreenEmoji,
      hostDisplayName: rules.hostDisplayName,
      setupComplete: rules.setupComplete,
    },
    input.hostUserId,
  )
  return { ok: true, endsAtIso: saved.endsAtIso ?? nextEnd }
}

/** Currently unused but kept ready: complete teardown when a host wants to permanently delete a game. */
export async function purgeAllPlayersFromGame(gameSlug: string): Promise<number> {
  return clearAllMembershipsForGame(gameSlug)
}
