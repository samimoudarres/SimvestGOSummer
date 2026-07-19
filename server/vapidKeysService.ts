import { dataFilePath } from './dataDir.ts'
import { readDataJsonObject, writeDataJsonObject, withDataJsonDocumentLock } from './db/persistedJson.ts'

const KEYS_PATH = dataFilePath('vapid-keys.json')

export type VapidKeyPair = {
  publicKey: string
  privateKey: string
  subject: string
}

let cached: VapidKeyPair | null = null

/** CJS package — use `.default` when loaded via dynamic `import()`. */
async function webPushModule(): Promise<typeof import('web-push').default> {
  const mod = await import('web-push')
  return mod.default
}

/**
 * Load VAPID keys from env, else persisted `data/vapid-keys.json`, else generate once.
 * Enables Web Push for local dev without manual `.env` setup.
 */
export async function initVapidKeys(): Promise<void> {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim()
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@simvest.local'
  if (envPub && envPriv) {
    cached = { publicKey: envPub, privateKey: envPriv, subject }
    return
  }

  const raw = await readDataJsonObject<{ publicKey?: string; privateKey?: string }>(KEYS_PATH)
  if (raw) {
    const publicKey = typeof raw.publicKey === 'string' ? raw.publicKey.trim() : ''
    const privateKey = typeof raw.privateKey === 'string' ? raw.privateKey.trim() : ''
    if (publicKey && privateKey) {
      cached = { publicKey, privateKey, subject }
      return
    }
  }

  await withDataJsonDocumentLock(KEYS_PATH, async () => {
    const again = await readDataJsonObject<{ publicKey?: string; privateKey?: string }>(KEYS_PATH)
    if (again) {
      const publicKey = typeof again.publicKey === 'string' ? again.publicKey.trim() : ''
      const privateKey = typeof again.privateKey === 'string' ? again.privateKey.trim() : ''
      if (publicKey && privateKey) {
        cached = { publicKey, privateKey, subject }
        return
      }
    }
    const webpush = await webPushModule()
    const keys = webpush.generateVAPIDKeys()
    await writeDataJsonObject(KEYS_PATH, { publicKey: keys.publicKey, privateKey: keys.privateKey })
    cached = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject }
    console.log(
      '[simvest] Web Push: generated VAPID keys (saved to server/data/vapid-keys.json). Restart not required.',
    )
  })
}

export function getVapidPublicKey(): string | null {
  return cached?.publicKey ?? null
}

export function getVapidKeyPair(): VapidKeyPair | null {
  return cached
}
