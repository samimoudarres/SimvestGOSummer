import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KEYS_PATH = path.join(__dirname, 'data', 'vapid-keys.json')

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

  try {
    const raw = JSON.parse(await fs.readFile(KEYS_PATH, 'utf8')) as {
      publicKey?: string
      privateKey?: string
    }
    const publicKey = typeof raw.publicKey === 'string' ? raw.publicKey.trim() : ''
    const privateKey = typeof raw.privateKey === 'string' ? raw.privateKey.trim() : ''
    if (publicKey && privateKey) {
      cached = { publicKey, privateKey, subject }
      return
    }
  } catch {
    /* generate below */
  }

  const webpush = await webPushModule()
  const keys = webpush.generateVAPIDKeys()
  await fs.mkdir(path.dirname(KEYS_PATH), { recursive: true })
  await fs.writeFile(
    KEYS_PATH,
    JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey }, null, 2),
    'utf8',
  )
  cached = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject }
  console.log(
    '[simvest] Web Push: generated VAPID keys (saved to server/data/vapid-keys.json). Restart not required.',
  )
}

export function getVapidPublicKey(): string | null {
  return cached?.publicKey ?? null
}

export function getVapidKeyPair(): VapidKeyPair | null {
  return cached
}
