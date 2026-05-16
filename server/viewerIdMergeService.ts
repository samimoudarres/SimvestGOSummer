import { mergeFollowsViewerId, normalizeUserId } from './followsService'
import { mergeFeedPostsViewerId } from './gameFeedService'
import { mergeMembershipViewerIds } from './gameMembershipService'
import { mergePortfolioViewerIds } from './userGameStateService'
import { mergePublicProfileViewerIds } from './userProfileService'
import { mergeSetupViewerIds } from './userSetupProfileService'
import { getAccountByUserId } from './userAccountService'

/**
 * After login or signup, re-key JSON rows from the pre-auth browser id
 * (`X-Simvest-User-Id` / localStorage) onto the canonical account `userId`.
 *
 * Skips when `previousViewerId` is missing, invalid, equals `accountUserId`, or
 * already belongs to another registered account (prevents cross-account moves).
 */
export async function mergeAnonymousViewerIntoAccount(
  previousViewerIdRaw: unknown,
  accountUserId: string,
): Promise<void> {
  const to = normalizeUserId(typeof accountUserId === 'string' ? accountUserId : '')
  const from = normalizeUserId(
    typeof previousViewerIdRaw === 'string' ? previousViewerIdRaw : '',
  )
  if (!from || !to || from === to) return

  const existing = await getAccountByUserId(from)
  if (existing) return

  await mergeMembershipViewerIds(from, to)
  await mergeSetupViewerIds(from, to)
  await mergePortfolioViewerIds(from, to)
  await mergeFeedPostsViewerId(from, to)
  await mergePublicProfileViewerIds(from, to)
  await mergeFollowsViewerId(from, to)
}
