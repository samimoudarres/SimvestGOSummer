import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeUserId } from './followsService'
import { invalidateJsonFileCache } from './jsonFileCache'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NOTIFY_PATH = path.join(__dirname, 'data', 'activity-author-notify-preferences.json')

/** viewerUserId → author userIds (normalized) they want alerts for when those authors post. */
type NotifyFile = { watchers: Record<string, string[]> }

let mutex = Promise.resolve()

function runMutation<T>(fn: () => Promise<T>): Promise<T> {
  const p = mutex.then(fn)
  mutex = p.then(
    () => undefined,
    () => undefined,
  )
  return p
}

async function readFile(): Promise<NotifyFile> {
  try {
    const raw = JSON.parse(await fs.readFile(NOTIFY_PATH, 'utf8')) as NotifyFile
    if (raw && typeof raw.watchers === 'object' && !Array.isArray(raw.watchers)) return raw
  } catch {
    /* missing */
  }
  return { watchers: {} }
}

async function writeFile(data: NotifyFile): Promise<void> {
  await fs.mkdir(path.dirname(NOTIFY_PATH), { recursive: true })
  await fs.writeFile(NOTIFY_PATH, JSON.stringify(data, null, 2), 'utf8')
  invalidateJsonFileCache(NOTIFY_PATH)
}

function canonUser(raw: string): string | null {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (t.length < 8) return null
  return normalizeUserId(t) ?? t
}

export async function addAuthorNotifyPreference(viewerId: string, authorId: string): Promise<void> {
  const v = canonUser(viewerId)
  const a = canonUser(authorId)
  if (!v || !a || v === a) return
  await runMutation(async () => {
    const file = await readFile()
    const prev = file.watchers[v] ?? []
    if (prev.includes(a)) return
    file.watchers[v] = [...prev, a].sort((x, y) => x.localeCompare(y))
    await writeFile(file)
  })
}

export async function removeAuthorNotifyPreference(viewerId: string, authorId: string): Promise<void> {
  const v = canonUser(viewerId)
  const a = canonUser(authorId)
  if (!v || !a) return
  await runMutation(async () => {
    const file = await readFile()
    const prev = file.watchers[v] ?? []
    const next = prev.filter((x) => x !== a)
    if (next.length) file.watchers[v] = next
    else delete file.watchers[v]
    await writeFile(file)
  })
}

export async function listWatchedAuthorIdsForViewer(viewerId: string): Promise<string[]> {
  const v = canonUser(viewerId)
  if (!v) return []
  const file = await readFile()
  return [...(file.watchers[v] ?? [])]
}

/** Distinct viewer ids who want push/in-app when `authorId` publishes any feed row. */
export async function listViewerIdsWatchingAuthor(authorId: string): Promise<string[]> {
  const a = canonUser(authorId)
  if (!a) return []
  const file = await readFile()
  const out: string[] = []
  for (const [viewer, authors] of Object.entries(file.watchers)) {
    if (authors.includes(a) && viewer.length >= 8) out.push(viewer)
  }
  return out
}
