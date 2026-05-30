import type { StoredNativePushToken } from './nativePushTokenService'

type FirebaseAdminApp = import('firebase-admin').app.App

let adminApp: FirebaseAdminApp | null | undefined

async function loadFirebaseAdmin(): Promise<FirebaseAdminApp | null> {
  if (adminApp !== undefined) return adminApp
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim()
  let credJson: Record<string, unknown> | null = null
  if (jsonRaw) {
    try {
      credJson = JSON.parse(jsonRaw) as Record<string, unknown>
    } catch {
      console.warn('[simvest] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — native push disabled')
      adminApp = null
      return null
    }
  } else if (jsonPath) {
    try {
      const fs = await import('node:fs/promises')
      credJson = JSON.parse(await fs.readFile(jsonPath, 'utf8')) as Record<string, unknown>
    } catch (err) {
      console.warn(
        '[simvest] Could not read FIREBASE_SERVICE_ACCOUNT_PATH:',
        err instanceof Error ? err.message : err,
      )
      adminApp = null
      return null
    }
  } else {
    adminApp = null
    return null
  }
  try {
    const admin = await import('firebase-admin')
    if (!admin.apps.length) {
      adminApp = admin.initializeApp({ credential: admin.credential.cert(credJson as import('firebase-admin').ServiceAccount) })
    } else {
      adminApp = admin.app()
    }
    return adminApp
  } catch (err) {
    console.warn('[simvest] firebase-admin init failed:', err instanceof Error ? err.message : err)
    adminApp = null
    return null
  }
}

export function isNativePushConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim(),
  )
}

export type FcmPayload = {
  title: string
  body: string
  url: string
  tag?: string
}

export async function sendFcmToTokens(
  tokens: StoredNativePushToken[],
  payload: FcmPayload,
): Promise<void> {
  if (!tokens.length) return
  const app = await loadFirebaseAdmin()
  if (!app) return
  const admin = await import('firebase-admin')
  const messaging = admin.messaging(app)
  const data: Record<string, string> = {
    url: payload.url,
    ...(payload.tag ? { tag: payload.tag } : {}),
  }
  await Promise.all(
    tokens.map(async (row) => {
      try {
        await messaging.send({
          token: row.token,
          notification: {
            title: payload.title.slice(0, 120),
            body: payload.body.slice(0, 240),
          },
          data,
          android: {
            priority: 'high',
            notification: { channelId: 'simvest_alerts', tag: payload.tag },
          },
          apns: {
            payload: {
              aps: {
                alert: { title: payload.title.slice(0, 120), body: payload.body.slice(0, 240) },
                sound: 'default',
              },
            },
          },
        })
      } catch (e: unknown) {
        const code =
          typeof e === 'object' && e && 'code' in e ? String((e as { code?: string }).code) : ''
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token')
        ) {
          const { removeNativePushTokenGlobally } = await import('./nativePushTokenService')
          await removeNativePushTokenGlobally(row.token).catch(() => {})
        }
      }
    }),
  )
}
