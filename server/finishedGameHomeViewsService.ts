import fs from 'node:fs/promises'
import path from 'node:path'
import { dataFilePath } from './dataDir.ts'
import { runSerializedByKey } from './fsMutationQueue'

const VIEWS_PATH = dataFilePath('user-finished-game-home-views.json')
const LOCK_KEY = VIEWS_PATH

/** After this many home opens following game end, hide from "Your games" (still in API if queried directly). */
export const FINISHED_GAME_HOME_SHOW_LIMIT = 5

type ViewsFile = { views: Record<string, number> }

function key(userId: string, gameSlug: string): string {
  return `${userId}:::${gameSlug}`
}

async function readFile(): Promise<ViewsFile> {
  try {
    const raw = JSON.parse(await fs.readFile(VIEWS_PATH, 'utf8')) as ViewsFile
    if (raw?.views && typeof raw.views === 'object') return raw
  } catch {
    /* missing */
  }
  return { views: {} }
}

async function writeFile(data: ViewsFile): Promise<void> {
  await fs.mkdir(path.dirname(VIEWS_PATH), { recursive: true })
  await fs.writeFile(VIEWS_PATH, JSON.stringify(data, null, 2), 'utf8')
}

export function finishedGameEnded(endsAtIso: string | null | undefined, nowMs = Date.now()): boolean {
  if (!endsAtIso || endsAtIso.length < 10) return false
  const endMs = new Date(endsAtIso).getTime()
  return Number.isFinite(endMs) && nowMs > endMs
}

export async function getFinishedGameHomeViewCount(userId: string, gameSlug: string): Promise<number> {
  if (!userId || userId.length < 8 || !gameSlug) return 0
  return runSerializedByKey(LOCK_KEY, async () => {
    const file = await readFile()
    const n = file.views[key(userId, gameSlug)]
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  })
}

/**
 * Record one home-screen load after the game ended (client sends once per cold open).
 * Returns the new count for this user+game.
 */
export async function bumpFinishedGameHomeView(userId: string, gameSlug: string): Promise<number> {
  if (!userId || userId.length < 8 || !gameSlug) return 0
  return runSerializedByKey(LOCK_KEY, async () => {
    const file = await readFile()
    const k = key(userId, gameSlug)
    const prev = file.views[k] ?? 0
    const next = (typeof prev === 'number' && Number.isFinite(prev) ? Math.floor(prev) : 0) + 1
    file.views[k] = next
    await writeFile(file)
    return next
  })
}

export function shouldShowFinishedGameOnHome(viewCount: number): boolean {
  return viewCount <= FINISHED_GAME_HOME_SHOW_LIMIT
}
