import { listSubscriptionsForUser, removePushSubscriptionEndpoint } from './pushSubscriptionService'
import { listNativePushTokensForUser } from './nativePushTokenService'
import { sendFcmToTokens } from './fcmSendService'
import { getVapidKeyPair } from './vapidKeysService'

export type PushPayload = {
  title: string
  body: string
  /** In-app route, e.g. `/g/my-game` */
  url: string
  /** Optional dedupe tag for native notification tray */
  tag?: string
}

function uniqueUserIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of ids) {
    const t = raw.trim()
    if (t.length < 8 || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

async function sendWebPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const vapid = getVapidKeyPair()
  if (!vapid) return
  const subs = await listSubscriptionsForUser(userId)
  if (!subs.length) return
  let webpush: typeof import('web-push').default
  try {
    const mod = await import('web-push')
    webpush = mod.default
  } catch {
    return
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  })
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub as import('web-push').PushSubscription, body, { TTL: 86_400 })
    } catch (e: unknown) {
      const status =
        typeof e === 'object' && e && 'statusCode' in e ? (e as { statusCode?: number }).statusCode : 0
      if (status === 404 || status === 410) {
        await removePushSubscriptionEndpoint(userId, sub.endpoint)
      }
    }
  }
}

/** Deliver to browser Web Push + native FCM tokens for one user. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const uid = userId.trim()
  if (uid.length < 8) return
  await Promise.all([
    sendWebPushToUser(uid, payload),
    sendFcmToTokens(await listNativePushTokensForUser(uid), payload),
  ])
}

/** Fan out the same alert to many users (deduped). */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const targets = uniqueUserIds(userIds)
  await Promise.all(targets.map((uid) => sendPushToUser(uid, payload)))
}
