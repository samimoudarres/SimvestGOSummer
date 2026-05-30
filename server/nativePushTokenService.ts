import fs from 'node:fs/promises'
import { dataFilePath, ensureParentDirForFile } from './dataDir.ts'
import { normalizeUserId } from './followsService'

const TOKENS_PATH = dataFilePath('user-native-push-tokens.json')

export type NativePushPlatform = 'ios' | 'android'

export type StoredNativePushToken = {
  token: string
  platform: NativePushPlatform
  updatedAtIso: string
}

type TokensFile = { byUserId: Record<string, StoredNativePushToken[]> }

let mutex = Promise.resolve()

function runMutation<T>(fn: () => Promise<T>): Promise<T> {
  const p = mutex.then(fn)
  mutex = p.then(
    () => undefined,
    () => undefined,
  )
  return p
}

function canonViewer(raw: string): string | null {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (t.length < 8) return null
  return normalizeUserId(t) ?? t
}

async function readFile(): Promise<TokensFile> {
  try {
    const raw = JSON.parse(await fs.readFile(TOKENS_PATH, 'utf8')) as TokensFile
    if (raw && typeof raw.byUserId === 'object' && !Array.isArray(raw.byUserId)) return raw
  } catch {
    /* missing */
  }
  return { byUserId: {} }
}

async function writeFile(data: TokensFile): Promise<void> {
  await ensureParentDirForFile(TOKENS_PATH)
  await fs.writeFile(TOKENS_PATH, JSON.stringify(data, null, 2), 'utf8')
}

export async function saveNativePushTokenForViewer(
  viewerId: string,
  input: { token: string; platform: NativePushPlatform },
): Promise<void> {
  const v = canonViewer(viewerId)
  const token = typeof input.token === 'string' ? input.token.trim() : ''
  if (!v || token.length < 16) return
  const platform = input.platform === 'ios' ? 'ios' : 'android'
  await runMutation(async () => {
    const file = await readFile()
    const list = file.byUserId[v] ?? []
    const next = list.filter((row) => row.token !== token)
    next.push({ token, platform, updatedAtIso: new Date().toISOString() })
    file.byUserId[v] = next
    await writeFile(file)
  })
}

export async function removeNativePushToken(viewerId: string, token: string): Promise<void> {
  const v = canonViewer(viewerId)
  const t = token.trim()
  if (!v || !t) return
  await runMutation(async () => {
    const file = await readFile()
    const list = file.byUserId[v] ?? []
    const next = list.filter((row) => row.token !== t)
    if (next.length) file.byUserId[v] = next
    else delete file.byUserId[v]
    await writeFile(file)
  })
}

export async function listNativePushTokensForUser(viewerId: string): Promise<StoredNativePushToken[]> {
  const v = canonViewer(viewerId)
  if (!v) return []
  const file = await readFile()
  return [...(file.byUserId[v] ?? [])]
}

/** Drop a stale FCM/APNs token wherever it appears (invalidated by the OS). */
export async function removeNativePushTokenGlobally(token: string): Promise<void> {
  const t = token.trim()
  if (!t) return
  await runMutation(async () => {
    const file = await readFile()
    let changed = false
    for (const [uid, list] of Object.entries(file.byUserId)) {
      const next = list.filter((row) => row.token !== t)
      if (next.length !== list.length) {
        changed = true
        if (next.length) file.byUserId[uid] = next
        else delete file.byUserId[uid]
      }
    }
    if (changed) await writeFile(file)
  })
}

export async function clearAllNativePushTokensForUser(viewerId: string): Promise<void> {
  const v = canonViewer(viewerId)
  if (!v) return
  await runMutation(async () => {
    const file = await readFile()
    if (!(v in file.byUserId)) return
    delete file.byUserId[v]
    await writeFile(file)
  })
}
