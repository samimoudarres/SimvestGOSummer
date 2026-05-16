import type { GameFeedPost } from './gameFeedService'
import { listViewerIdsWatchingAuthor } from './activityAuthorNotifyService'
import { listSubscriptionsForUser, removePushSubscriptionEndpoint } from './pushSubscriptionService'
import { getVapidKeyPair } from './vapidKeysService'

function openUrlForPost(post: GameFeedPost): string {
  const slug = typeof post.gameSlug === 'string' ? post.gameSlug.trim() : ''
  if (slug) return `/g/${encodeURIComponent(slug)}`
  return '/'
}

/**
 * When a feed row is persisted, notify viewers who opted in for this author.
 * Uses the Web Push standard (requires VAPID env + browser subscription).
 * Native closed-app delivery needs a wrapper app (FCM/APNs) wired to the same backend.
 */
export async function onNewFeedPost(post: GameFeedPost): Promise<void> {
  const authorRaw = typeof post.userId === 'string' ? post.userId.trim() : ''
  if (authorRaw.length < 8) return

  const viewers = await listViewerIdsWatchingAuthor(authorRaw)
  if (!viewers.length) return

  const vapid = getVapidKeyPair()
  if (!vapid) return

  let webpush: typeof import('web-push').default
  try {
    const mod = await import('web-push')
    webpush = mod.default
  } catch {
    return
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const title =
    post.postKind === 'trade'
      ? `${post.author} traded`
      : post.postKind === 'poll'
        ? `${post.author} posted a poll`
        : `${post.author} posted`
  const body =
    post.postKind === 'trade'
      ? post.tradeTitle || 'New trade in your game'
      : (post.rationale || post.pollQuestion || 'New activity').trim().slice(0, 120) ||
        'New activity in Simvest'
  const url = openUrlForPost(post)
  const payload = JSON.stringify({ title, body, url })

  for (const viewerId of viewers) {
    const subs = await listSubscriptionsForUser(viewerId)
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub as import('web-push').PushSubscription, payload, {
          TTL: 3600,
        })
      } catch (e: unknown) {
        const status = typeof e === 'object' && e && 'statusCode' in e ? (e as { statusCode?: number }).statusCode : 0
        if (status === 404 || status === 410) {
          await removePushSubscriptionEndpoint(viewerId, sub.endpoint)
        }
      }
    }
  }
}
