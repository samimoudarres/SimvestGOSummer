import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEMBERSHIP_PATH = path.join(__dirname, 'data', 'user-game-membership.json')

type MembershipFile = { joins: Record<string, string> }

function key(userId: string, gameSlug: string): string {
  return `${userId}:::${gameSlug}`
}

async function readFile(): Promise<MembershipFile> {
  try {
    const raw = JSON.parse(await fs.readFile(MEMBERSHIP_PATH, 'utf8')) as MembershipFile
    if (raw && raw.joins && typeof raw.joins === 'object') return raw
  } catch {
    /* missing */
  }
  return { joins: {} }
}

async function writeFile(data: MembershipFile): Promise<void> {
  await fs.mkdir(path.dirname(MEMBERSHIP_PATH), { recursive: true })
  await fs.writeFile(MEMBERSHIP_PATH, JSON.stringify(data, null, 2), 'utf8')
}

/** First time the user participates in this game (ISO UTC). */
export async function getGameJoinedAtIso(userId: string, gameSlug: string): Promise<string | null> {
  if (!userId || !gameSlug) return null
  const file = await readFile()
  const iso = file.joins[key(userId, gameSlug)]
  return typeof iso === 'string' && iso.length >= 10 ? iso : null
}

/**
 * Persist join time once — earliest engagement wins (trade, portfolio tab, perform tab).
 * Returns canonical joined-at ISO string.
 */
export async function ensureGameJoinedAt(userId: string, gameSlug: string): Promise<string | null> {
  if (!userId || userId.length < 8 || !gameSlug) return null
  const file = await readFile()
  const k = key(userId, gameSlug)
  let cur = file.joins[k]
  if (!cur) {
    cur = new Date().toISOString()
    file.joins[k] = cur
    await writeFile(file)
  }
  return cur
}

/** Demo / seeded profiles only — deterministic “days in this game”. */
/** All user IDs that have a stored join timestamp for this game. */
/** All distinct game slugs this user has a stored join timestamp for. */
export async function listGameSlugsJoinedByUser(userId: string): Promise<string[]> {
  if (!userId || userId.length < 8) return []
  const prefix = `${userId}:::`
  const file = await readFile()
  const slugs = new Set<string>()
  for (const k of Object.keys(file.joins)) {
    if (k.startsWith(prefix)) {
      const slug = k.slice(prefix.length)
      if (slug.length > 0) slugs.add(slug)
    }
  }
  return [...slugs].sort((a, b) => a.localeCompare(b))
}

export async function listUserIdsJoinedGame(gameSlug: string): Promise<string[]> {
  if (!gameSlug) return []
  const file = await readFile()
  const suffix = `:::${gameSlug}`
  const out: string[] = []
  for (const k of Object.keys(file.joins)) {
    if (k.endsWith(suffix)) {
      const uid = k.slice(0, k.length - suffix.length)
      if (uid.length >= 8) out.push(uid)
    }
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b))
}

export async function seedGameJoinedDaysAgo(
  userId: string,
  gameSlug: string,
  daysAgo: number,
): Promise<string | null> {
  if (!userId || userId.length < 8 || !gameSlug) return null
  const d = Math.min(730, Math.max(1, Math.floor(daysAgo)))
  const file = await readFile()
  const k = key(userId, gameSlug)
  if (file.joins[k]) return file.joins[k]!
  const iso = new Date(Date.now() - d * 86400000).toISOString()
  file.joins[k] = iso
  await writeFile(file)
  return iso
}
