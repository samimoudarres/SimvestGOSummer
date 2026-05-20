import fs from 'node:fs/promises'
import { dataFilePath } from './dataDir.ts'

const STREAK_PATH = dataFilePath('perform-rank-streaks.json')

type Entry = { lastRank: number; streakDays: number; lastCheckedDay: string }
type StreakFile = { version: 1; entries: Record<string, Entry> }

let mutex = Promise.resolve()

function runMutation<T>(fn: () => Promise<T>): Promise<T> {
  const p = mutex.then(fn)
  mutex = p.then(
    () => undefined,
    () => undefined,
  )
  return p
}

async function readFile(): Promise<StreakFile> {
  try {
    const raw = JSON.parse(await fs.readFile(STREAK_PATH, 'utf8')) as StreakFile
    if (raw && raw.entries && typeof raw.entries === 'object') return { version: 1, entries: raw.entries }
  } catch {
    /* missing */
  }
  return { version: 1, entries: {} }
}

async function writeFile(data: StreakFile): Promise<void> {
  await fs.mkdir(path.dirname(STREAK_PATH), { recursive: true })
  await fs.writeFile(STREAK_PATH, JSON.stringify(data, null, 2), 'utf8')
}

function streakKey(gameSlug: string, userId: string): string {
  return `${String(gameSlug ?? '').trim()}:::${String(userId ?? '').trim()}`
}

/** Re-key perform rank streak rows when a game leaves the shared `new` slot. */
export async function renameGameSlugInRankStreaks(fromSlug: string, toSlug: string): Promise<number> {
  const from = String(fromSlug ?? '').trim()
  const to = String(toSlug ?? '').trim()
  if (!from || !to || from === to) return 0
  return runMutation(async () => {
    const file = await readFile()
    const next: Record<string, Entry> = { ...file.entries }
    let moved = 0
    const prefix = `${from}:::`
    for (const k of Object.keys(next)) {
      if (!k.startsWith(prefix)) continue
      const uid = k.slice(prefix.length)
      const dest = streakKey(to, uid)
      if (!next[dest]) next[dest] = next[k]!
      delete next[k]
      moved += 1
    }
    if (moved > 0) await writeFile({ version: 1, entries: next })
    return moved
  })
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/** Whole calendar days from `prevDay` (YYYY-MM-DD) to `nextDay` (UTC). */
function calendarDaysBetween(prevDay: string, nextDay: string): number {
  const a = Date.parse(`${prevDay}T00:00:00.000Z`)
  const b = Date.parse(`${nextDay}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999
  return Math.round((b - a) / 86_400_000)
}

function ordinalDay(n: number): string {
  const v = Math.max(1, Math.floor(n))
  const tens = v % 100
  if (tens >= 11 && tens <= 13) return `${v}th`
  switch (v % 10) {
    case 1:
      return `${v}st`
    case 2:
      return `${v}nd`
    case 3:
      return `${v}rd`
    default:
      return `${v}th`
  }
}

/**
 * Persists consecutive **UTC calendar days** the player held the same net-worth
 * rank in this game (checked when Perform / profile loads). Returns a label
 * only from the **2nd** consecutive day onward; otherwise `null` (UI hides streak).
 */
export async function resolveRankStreakLabel(
  gameSlug: string,
  userId: string,
  currentRank: number,
): Promise<string | null> {
  const slug = String(gameSlug ?? '').trim()
  const uid = String(userId ?? '').trim()
  if (!slug || uid.length < 8 || !Number.isFinite(currentRank) || currentRank < 1) return null

  return runMutation(async () => {
    const k = streakKey(slug, uid)
    const today = utcDayKey()
    const file = await readFile()
    const cur = file.entries[k]

    if (!cur) {
      file.entries[k] = { lastRank: currentRank, streakDays: 1, lastCheckedDay: today }
      await writeFile(file)
      return null
    }

    if (cur.lastRank !== currentRank) {
      file.entries[k] = { lastRank: currentRank, streakDays: 1, lastCheckedDay: today }
      await writeFile(file)
      return null
    }

    if (cur.lastCheckedDay === today) {
      return cur.streakDays >= 2 ? `${ordinalDay(cur.streakDays)} day with this rank` : null
    }

    const gap = calendarDaysBetween(cur.lastCheckedDay, today)
    if (gap === 1) {
      const nextDays = cur.streakDays + 1
      file.entries[k] = { lastRank: currentRank, streakDays: nextDays, lastCheckedDay: today }
      await writeFile(file)
      return nextDays >= 2 ? `${ordinalDay(nextDays)} day with this rank` : null
    }

    file.entries[k] = { lastRank: currentRank, streakDays: 1, lastCheckedDay: today }
    await writeFile(file)
    return null
  })
}
