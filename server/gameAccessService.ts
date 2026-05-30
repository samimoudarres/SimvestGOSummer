import { ensureGameJoinedAt, getGameJoinedAtIso } from './gameMembershipService'
import { findPendingRequest, viewerIdsMatch } from './gameJoinRequestsService'
import { getRuntimeRules } from './gameRuntimeRulesService'

export type GameAccessResult =
  | { ok: true; joinedAtIso: string | null; isHost: boolean; isPrivate: boolean }
  | { ok: false; status: 401 | 403; error: string }

/**
 * Central access gate for game screens/APIs.
 *
 * Public games can auto-join viewers so legacy "open the game and participate" behavior
 * remains intact. Private games only admit the host or users with an approved membership;
 * pending requests stay pending until the host explicitly approves them.
 */
export async function ensureGameAccess(input: {
  gameSlug: string
  userId: string | null
  autoJoinPublic?: boolean
  autoJoinHost?: boolean
}): Promise<GameAccessResult> {
  const rules = await getRuntimeRules(input.gameSlug)
  const isPrivate = rules?.visibility === 'private'

  if (!isPrivate) {
    let joinedAtIso: string | null = null
    if (input.userId && input.autoJoinPublic) {
      const prior = await getGameJoinedAtIso(input.userId, input.gameSlug)
      joinedAtIso = await ensureGameJoinedAt(input.userId, input.gameSlug)
      if (!prior && joinedAtIso) {
        const { resolveHostUserId, notifyHostMemberJoined } = await import('./notificationEvents')
        const { getSetupProfileForUserGame } = await import('./userSetupProfileService')
        const hostId = await resolveHostUserId(input.gameSlug)
        if (hostId && !viewerIdsMatch(hostId, input.userId)) {
          const setup = await getSetupProfileForUserGame(input.userId, input.gameSlug)
          const name = setup ? `${setup.firstName} ${setup.lastName}`.trim() : ''
          queueMicrotask(() => {
            void notifyHostMemberJoined({
              gameSlug: input.gameSlug,
              hostUserId: hostId,
              memberDisplayName: name || 'A player',
            }).catch(() => {})
          })
        }
      }
    }
    return { ok: true, joinedAtIso, isHost: false, isPrivate: false }
  }

  if (!input.userId) {
    return {
      ok: false,
      status: 401,
      error: 'Sign in to use Trade and other game features in this private challenge.',
    }
  }

  const isHost = Boolean(rules?.hostUserId && viewerIdsMatch(rules.hostUserId, input.userId))
  if (isHost) {
    const joinedAtIso = input.autoJoinHost ? await ensureGameJoinedAt(input.userId, input.gameSlug) : null
    return { ok: true, joinedAtIso, isHost: true, isPrivate: true }
  }

  const joinedAtIso = await getGameJoinedAtIso(input.userId, input.gameSlug)
  if (joinedAtIso) {
    return { ok: true, joinedAtIso, isHost: false, isPrivate: true }
  }

  const pending = await findPendingRequest(input.gameSlug, input.userId)
  if (pending) {
    return {
      ok: false,
      status: 403,
      error: 'Your request to join this private game is still waiting for host approval.',
    }
  }

  return {
    ok: false,
    status: 403,
    error: 'This private game requires host approval before you can enter.',
  }
}
