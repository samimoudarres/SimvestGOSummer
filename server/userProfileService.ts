import fs from 'node:fs/promises'
import { dataFilePath } from './dataDir.ts'
import { isPlaceholderProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'
import { invalidateJsonFileCache, readJsonWithMtimeCache } from './jsonFileCache'
import { runSerializedByKey } from './fsMutationQueue'

const PROFILE_PATH = dataFilePath('user-profiles.json')
const PROFILE_LOCK_KEY = PROFILE_PATH

/** Blank Instagram-style silhouette — used when a user hasn't picked a photo yet.
 * Existing saved avatars (legacy seed rows in user-profiles.json) are not
 * affected; this only seeds NEW profile rows + fills empty fallbacks. */
const DEFAULT_AVATAR = '/figma-assets/blank-avatar.svg'
/** Matches join-profile setup payloads (base64 uploads — large string bodies). */
const MAX_AVATAR_URL_LEN = 9_500_000

export type UserPublicProfile = {
  userId: string
  displayName: string
  avatarUrl: string
  joinedAtIso: string
}

type ProfileFile = { profiles: Record<string, UserPublicProfile> }

async function readFile(): Promise<ProfileFile> {
  return readJsonWithMtimeCache<ProfileFile>(PROFILE_PATH, (raw) => {
    if (!raw) return { profiles: {} }
    try {
      const parsed = JSON.parse(raw) as ProfileFile
      if (parsed && parsed.profiles && typeof parsed.profiles === 'object') return parsed
    } catch {
      /* corrupt — fall through */
    }
    return { profiles: {} }
  })
}

async function writeFile(data: ProfileFile): Promise<void> {
  await fs.mkdir(path.dirname(PROFILE_PATH), { recursive: true })
  await fs.writeFile(PROFILE_PATH, JSON.stringify(data, null, 2), 'utf8')
  invalidateJsonFileCache(PROFILE_PATH)
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
  const cached = await readFile()
  // Cached file is shared across callers — clone before mutating so concurrent reads stay clean.
  const file: ProfileFile = { profiles: { ...cached.profiles } }
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
    typeof opts.displayName === 'string' &&
    opts.displayName.trim().length >= 2 &&
    opts.displayName.trim().toLowerCase() !== 'you'
      ? opts.displayName.trim().slice(0, 80)
      : prev?.displayName ?? syntheticDisplayName(userId)

  let avatarUrl = prev?.avatarUrl ?? DEFAULT_AVATAR
  if (typeof opts.avatarUrl === 'string' && opts.avatarUrl.trim().length >= 3) {
    const u = opts.avatarUrl.trim()
    if (
      u.length <= MAX_AVATAR_URL_LEN &&
      !isPlaceholderProfileAvatarUrl(u) &&
      (u.startsWith('/') ||
        u.startsWith('http://') ||
        u.startsWith('https://') ||
        u.startsWith('data:image/'))
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
  const cached = await readFile()
  const existing = cached.profiles[userId]
  if (existing) return existing

  const cur: UserPublicProfile = {
    userId,
    displayName: syntheticDisplayName(userId),
    avatarUrl: DEFAULT_AVATAR,
    joinedAtIso: new Date().toISOString(),
  }
  const file: ProfileFile = { profiles: { ...cached.profiles, [userId]: cur } }
  await writeFile(file)
  return cur
}

/** One read/write pass — used by leaderboard to hydrate many players. */
export async function ensureUserProfilesBatch(userIds: string[]): Promise<Map<string, UserPublicProfile>> {
  const cached = await readFile()
  const out = new Map<string, UserPublicProfile>()
  const additions: Record<string, UserPublicProfile> = {}
  for (const userId of userIds) {
    if (!userId || userId.length < 8) continue
    const cur = cached.profiles[userId]
    if (cur) {
      out.set(userId, cur)
      continue
    }
    const next: UserPublicProfile = {
      userId,
      displayName: syntheticDisplayName(userId),
      avatarUrl: DEFAULT_AVATAR,
      joinedAtIso: new Date().toISOString(),
    }
    additions[userId] = next
    out.set(userId, next)
  }
  if (Object.keys(additions).length > 0) {
    const file: ProfileFile = { profiles: { ...cached.profiles, ...additions } }
    await writeFile(file)
  }
  return out
}

/** Move `user-profiles.json` row from anonymous viewer id to account id (account row wins on conflict). */
export async function deleteUserPublicProfile(userId: string): Promise<void> {
  if (!userId || userId.length < 8) return
  return runSerializedByKey(PROFILE_LOCK_KEY, async () => {
    const file = await readFile()
    if (!file.profiles[userId]) return
    const next: ProfileFile = { profiles: { ...file.profiles } }
    delete next.profiles[userId]
    await writeFile(next)
  })
}

export async function mergePublicProfileViewerIds(fromUserId: string, toUserId: string): Promise<void> {
  if (!fromUserId || !toUserId || fromUserId.length < 8 || toUserId.length < 8 || fromUserId === toUserId) return
  return runSerializedByKey(PROFILE_LOCK_KEY, async () => {
    const cached = await readFile()
    const fromRow = cached.profiles[fromUserId]
    if (!fromRow) return
    const toRow = cached.profiles[toUserId]
    const file: ProfileFile = { profiles: { ...cached.profiles } }
    if (!toRow) {
      file.profiles[toUserId] = { ...fromRow, userId: toUserId }
    }
    delete file.profiles[fromUserId]
    await writeFile(file)
  })
}
