import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROFILE_PATH = path.join(__dirname, 'data', 'user-profiles.json')

/** Works offline — same default as composer in the challenge shell. */
const DEFAULT_AVATAR = '/figma-assets/challenge/composer-avatar.png'
/** Matches join-profile setup payloads (base64 uploads can be large). */
const MAX_AVATAR_URL_LEN = 2_000_000

export type UserPublicProfile = {
  userId: string
  displayName: string
  avatarUrl: string
  joinedAtIso: string
}

type ProfileFile = { profiles: Record<string, UserPublicProfile> }

async function readFile(): Promise<ProfileFile> {
  try {
    const raw = JSON.parse(await fs.readFile(PROFILE_PATH, 'utf8')) as ProfileFile
    if (raw && raw.profiles && typeof raw.profiles === 'object') return raw
  } catch {
    /* missing */
  }
  return { profiles: {} }
}

async function writeFile(data: ProfileFile): Promise<void> {
  await fs.mkdir(path.dirname(PROFILE_PATH), { recursive: true })
  await fs.writeFile(PROFILE_PATH, JSON.stringify(data, null, 2), 'utf8')
}

const ADJECTIVES = ['Swift', 'Bold', 'Keen', 'Bright', 'Calm', 'Wise', 'True', 'Quick'] as const
const NOUNS = ['Trader', 'Investor', 'Pioneer', 'Strategist', 'Builder', 'Hawk', 'Owl'] as const

function hashUint(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

function syntheticDisplayName(seed: string): string {
  const h = hashUint(seed)
  const a = ADJECTIVES[h % ADJECTIVES.length]!
  const n = NOUNS[(h >>> 8) % NOUNS.length]!
  const num = 100 + (h % 900)
  return `${a} ${n} ${num}`
}

export function deriveLegacyUserId(authorLabel: string): string {
  const cleaned = authorLabel
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 80)
  const pad = cleaned.length >= 6 ? cleaned : `${cleaned}-simvest-user`
  return `legacy-${pad}`.replace(/-{2,}/g, '-')
}

export async function getUserPublicProfile(userId: string): Promise<UserPublicProfile | null> {
  const { profiles } = await readFile()
  const p = profiles[userId]
  return p ?? null
}

const MS_DAY = 86400000

/** Save display + avatar hints from trades; preserves joinedAtIso once established. */
export async function upsertProfileFromTradeContext(
  userId: string,
  opts: {
    displayName?: string
    avatarUrl?: string
    /** Simulated signup date — only applies when profile is created the first time. */
    joinedSeedDaysAgo?: number
  },
): Promise<UserPublicProfile> {
  const file = await readFile()
  const prev = file.profiles[userId]
  let joinedAtIso = prev?.joinedAtIso ?? null
  if (!joinedAtIso) {
    const seeded =
      typeof opts.joinedSeedDaysAgo === 'number' &&
      Number.isFinite(opts.joinedSeedDaysAgo) &&
      opts.joinedSeedDaysAgo > 0
    const daysBack = seeded ? Math.min(730, Math.max(1, Math.floor(opts.joinedSeedDaysAgo!))) : 0
    joinedAtIso = new Date(Date.now() - MS_DAY * daysBack).toISOString()
  }

  const displayName =
    typeof opts.displayName === 'string' && opts.displayName.trim().length >= 2
      ? opts.displayName.trim().slice(0, 80)
      : prev?.displayName ?? syntheticDisplayName(userId)

  let avatarUrl = prev?.avatarUrl ?? DEFAULT_AVATAR
  if (typeof opts.avatarUrl === 'string' && opts.avatarUrl.trim().length >= 3) {
    const u = opts.avatarUrl.trim().slice(0, MAX_AVATAR_URL_LEN)
    if (
      u.startsWith('/') ||
      u.startsWith('http://') ||
      u.startsWith('https://') ||
      u.startsWith('data:image/')
    ) {
      avatarUrl = u
    }
  }

  const next: UserPublicProfile = { userId, displayName, avatarUrl, joinedAtIso }
  file.profiles[userId] = next
  await writeFile(file)
  return next
}

/** Ensure persisted row for deterministic “days member” UX. */
export async function ensureUserProfileRecord(userId: string): Promise<UserPublicProfile> {
  const file = await readFile()
  let cur = file.profiles[userId]
  if (cur) return cur

  cur = {
    userId,
    displayName: syntheticDisplayName(userId),
    avatarUrl: DEFAULT_AVATAR,
    joinedAtIso: new Date().toISOString(),
  }
  file.profiles[userId] = cur
  await writeFile(file)
  return cur
}

/** One read/write pass — used by leaderboard to hydrate many players. */
export async function ensureUserProfilesBatch(userIds: string[]): Promise<Map<string, UserPublicProfile>> {
  const file = await readFile()
  let dirty = false
  const out = new Map<string, UserPublicProfile>()
  for (const userId of userIds) {
    if (!userId || userId.length < 8) continue
    let cur = file.profiles[userId]
    if (!cur) {
      cur = {
        userId,
        displayName: syntheticDisplayName(userId),
        avatarUrl: DEFAULT_AVATAR,
        joinedAtIso: new Date().toISOString(),
      }
      file.profiles[userId] = cur
      dirty = true
    }
    out.set(userId, cur)
  }
  if (dirty) await writeFile(file)
  return out
}
