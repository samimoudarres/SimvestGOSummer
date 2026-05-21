import fs from 'node:fs/promises'
import { dataFilePath, ensureParentDirForFile } from './dataDir.ts'
import { normalizeUserId } from './followsService'
import { invalidateJsonFileCache } from './jsonFileCache'

const SUBS_PATH = dataFilePath('user-web-push-subscriptions.json')

export type StoredPushSubscription = {
  endpoint: string
  keys?: { p256dh?: string; auth?: string }
}

type SubsFile = { byUserId: Record<string, StoredPushSubscription[]> }

let mutex = Promise.resolve()

function runMutation<T>(fn: () => Promise<T>): Promise<T> {
  const p = mutex.then(fn)
  mutex = p.then(
    () => undefined,
    () => undefined,
  )
  return p
}

async function readFile(): Promise<SubsFile> {
  try {
    const raw = JSON.parse(await fs.readFile(SUBS_PATH, 'utf8')) as SubsFile
    if (raw && typeof raw.byUserId === 'object' && !Array.isArray(raw.byUserId)) return raw
  } catch {
    /* missing */
  }
  return { byUserId: {} }
}

async function writeFile(data: SubsFile): Promise<void> {
  await ensureParentDirForFile(SUBS_PATH)
  await fs.writeFile(SUBS_PATH, JSON.stringify(data, null, 2), 'utf8')
  invalidateJsonFileCache(SUBS_PATH)
}

function canonViewer(raw: string): string | null {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (t.length < 8) return null
  return normalizeUserId(t) ?? t
}

function sameEndpoint(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

export async function savePushSubscriptionForViewer(
  viewerId: string,
  sub: StoredPushSubscription,
): Promise<void> {
  const v = canonViewer(viewerId)
  const ep = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : ''
  if (!v || !ep) return
  await runMutation(async () => {
    const file = await readFile()
    const list = file.byUserId[v] ?? []
    const next = list.filter((s) => !sameEndpoint(s.endpoint, ep))
    next.push({
      endpoint: ep,
      keys: {
        p256dh: typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh : undefined,
        auth: typeof sub.keys?.auth === 'string' ? sub.keys.auth : undefined,
      },
    })
    file.byUserId[v] = next
    await writeFile(file)
  })
}

export async function removePushSubscriptionEndpoint(viewerId: string, endpoint: string): Promise<void> {
  const v = canonViewer(viewerId)
  if (!v) return
  await runMutation(async () => {
    const file = await readFile()
    const list = file.byUserId[v] ?? []
    const next = list.filter((s) => !sameEndpoint(s.endpoint, endpoint))
    if (next.length) file.byUserId[v] = next
    else delete file.byUserId[v]
    await writeFile(file)
  })
}

export async function listSubscriptionsForUser(viewerId: string): Promise<StoredPushSubscription[]> {
  const v = canonViewer(viewerId)
  if (!v) return []
  const file = await readFile()
  return [...(file.byUserId[v] ?? [])]
}

export async function clearAllPushSubscriptionsForUser(viewerId: string): Promise<void> {
  const v = canonViewer(viewerId)
  if (!v) return
  await runMutation(async () => {
    const file = await readFile()
    if (!(v in file.byUserId)) return
    delete file.byUserId[v]
    await writeFile(file)
  })
}
