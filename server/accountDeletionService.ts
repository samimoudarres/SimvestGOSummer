/**
 * Account deletion — Apple App Store Guideline 5.1.1(v) requires in-app account
 * deletion when the app supports account creation.
 */
import { clearAllNotifyPreferencesForViewer } from './activityAuthorNotifyService'
import { listGameSlugsWhereUserHasFeedPosts } from './gameFeedService'
import { removeUserFromGame } from './gameLifecycleService'
import { listGameSlugsJoinedByUser } from './gameMembershipService'
import { clearAllPushSubscriptionsForUser } from './pushSubscriptionService'
import {
  deleteUserAccountRecord,
  getAccountByUserId,
  verifyAccountPassword,
  type AccountFieldError,
} from './userAccountService'
import { deleteUserPublicProfile } from './userProfileService'
import { clearAllFollowsForUser } from './followsService'

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; status: number; errors: AccountFieldError[]; message?: string }

export async function deleteSimvestAccount(
  userId: string,
  currentPassword: string,
): Promise<DeleteAccountResult> {
  const account = await getAccountByUserId(userId)
  if (!account) {
    return {
      ok: false,
      status: 404,
      errors: [{ field: 'currentPassword', message: 'No Simvest account for this session.' }],
    }
  }

  if (!verifyAccountPassword(currentPassword, account.passwordHash)) {
    return {
      ok: false,
      status: 401,
      errors: [{ field: 'currentPassword', message: 'Incorrect password.' }],
    }
  }

  const slugs = new Set<string>([
    ...(await listGameSlugsJoinedByUser(userId)),
    ...(await listGameSlugsWhereUserHasFeedPosts(userId)),
  ])

  for (const slug of slugs) {
    await removeUserFromGame(userId, slug)
  }

  await Promise.all([
    deleteUserPublicProfile(userId),
    deleteUserAccountRecord(userId),
    clearAllPushSubscriptionsForUser(userId),
    clearAllNotifyPreferencesForViewer(userId),
    clearAllFollowsForUser(userId),
  ])

  return { ok: true }
}
