import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { dataFilePath } from './dataDir.ts'
import { invalidateJsonFileCache, readJsonWithMtimeCache } from './jsonFileCache'
import { runSerializedByKey } from './fsMutationQueue'

const SETUP_PROFILE_PATH = dataFilePath('user-setup-profiles.json')
const SETUP_PROFILE_LOCK_KEY = SETUP_PROFILE_PATH

/** Character length of full data URLs stored in JSON (~33% overhead vs binary JPEG). */
export const MAX_AVATAR_DATA_URL_CHARS = 9_000_000
/** Stored when the player opts into the shared silhouette for this game. */
export const GAME_SETUP_DEFAULT_AVATAR_URL = '/figma-assets/blank-avatar.svg'
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/
const PHONE_RE = /^[0-9+()\-.\s]{7,25}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SetupProfileFile = {
  profiles: Record<string, UserSetupProfileRecord>
}

export type UserSetupProfileRecord = {
  userId: string
  gameSlug: string
  firstName: string
  lastName: string
  username: string
  phone: string | null
  email: string | null
  passwordHash: string
  avatarUrl: string
  updatedAtIso: string
}

export type SaveSetupProfileInput = {
  userId: string
  gameSlug: string
  firstName: string
  lastName: string
  username: string
  phone: string | null
  email: string | null
  /**
   * Plaintext password the caller wants hashed before persistence. Optional
   * now that the canonical credential store is `user-accounts.json` — most
   * join setups are made by users who are already authenticated to a
   * Simvest account, so they don't need to set a per-game password.
   */
  password: string
  /**
   * Pre-hashed password (SHA-256 hex). Used when the caller wants to
   * preserve an existing hash (e.g. an update that didn't re-collect a
   * password) without redundantly rehashing. Ignored if `password` is set.
   */
  passwordHash?: string
  avatarUrl: string
}

export type SetupProfileValidationError = {
  field:
    | 'firstName'
    | 'lastName'
    | 'username'
    | 'phone'
    | 'email'
    | 'password'
    | 'contact'
    | 'avatarUrl'
    | 'gameSlug'
  message: string
}

function key(userId: string, gameSlug: string): string {
  return `${userId}:::${gameSlug}`
}

let cachedSetupMap: { source: SetupProfileFile; map: Map<string, UserSetupProfileRecord> } | null = null

async function loadSetupProfileFile(): Promise<SetupProfileFile> {
  return readJsonWithMtimeCache<SetupProfileFile>(SETUP_PROFILE_PATH, (raw) => {
    if (!raw) return { profiles: {} }
    try {
      const parsed = JSON.parse(raw) as SetupProfileFile
      if (parsed && parsed.profiles && typeof parsed.profiles === 'object') return parsed
    } catch {
      /* corrupt — fall through */
    }
    return { profiles: {} }
  })
}

async function persistSetupProfileFile(data: SetupProfileFile): Promise<void> {
  await fs.mkdir(path.dirname(SETUP_PROFILE_PATH), { recursive: true })
  await fs.writeFile(SETUP_PROFILE_PATH, JSON.stringify(data, null, 2), 'utf8')
  invalidateJsonFileCache(SETUP_PROFILE_PATH)
  cachedSetupMap = null
}

function normalizeName(v: string): string {
  return v.replace(/\s+/g, ' ').trim().slice(0, 60)
}

function normalizePhone(v: string): string {
  return v.trim().slice(0, 25)
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase().slice(0, 120)
}

function normalizeUsername(v: string): string {
  return v.trim().slice(0, 32)
}

function passwordSha256Hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * Validation rules for a join-setup write.
 *
 * Since the canonical credential store is now `user-accounts.json`, the
 * join-setup form only collects what's game-specific: **username** and
 * **profile photo**. Everything else (firstName, lastName, email/phone,
 * password) is auto-derived by the request handler from the caller's
 * account record before validation runs, so by the time we get here those
 * fields should already be filled in.
 *
 * That said: we still validate the *shape* of these derived fields when
 * present (to catch corrupt rows), and we *no longer reject* a request
 * just because password/email/phone is missing — a signed-in user does
 * not need a per-game password, and an account can use email OR phone
 * exclusively.
 */
export function validateSetupProfileInput(
  input: Omit<SaveSetupProfileInput, 'passwordHash'>,
): SetupProfileValidationError[] {
  const errs: SetupProfileValidationError[] = []

  if (!input.gameSlug || input.gameSlug.length < 1) {
    errs.push({ field: 'gameSlug', message: 'Missing game slug' })
  }

  const firstName = normalizeName(input.firstName)
  if (firstName.length < 2) {
    errs.push({ field: 'firstName', message: 'First name is required' })
  }

  const lastName = normalizeName(input.lastName)
  if (lastName.length < 2) {
    errs.push({ field: 'lastName', message: 'Last name is required' })
  }

  const username = normalizeUsername(input.username)
  if (!USERNAME_RE.test(username)) {
    errs.push({
      field: 'username',
      message: 'Username must be 3-32 chars and use letters, numbers, _, ., or -',
    })
  }

  /* Phone / email / password are all OPTIONAL now. Validate format only when
   * a value is present. Specifically: no longer requires "phone OR email" —
   * a signed-in user already has a contact attached to their account. */
  const phone = input.phone ? normalizePhone(input.phone) : ''
  const email = input.email ? normalizeEmail(input.email) : ''
  if (phone && !PHONE_RE.test(phone)) {
    errs.push({ field: 'phone', message: 'Phone number format is invalid' })
  }
  if (email && !EMAIL_RE.test(email)) {
    errs.push({ field: 'email', message: 'Email format is invalid' })
  }

  const pwd = (input.password ?? '').trim()
  if (pwd.length > 0 && pwd.length < 6) {
    /* If a password was supplied at all, it still has to be ≥6 chars — but
     * "no password supplied" is fine and means we won't write a passwordHash. */
    errs.push({ field: 'password', message: 'Password must be at least 6 characters' })
  }

  const avatar = input.avatarUrl.trim()
  const avatarValid =
    avatar.startsWith('/') ||
    avatar.startsWith('http://') ||
    avatar.startsWith('https://') ||
    avatar.startsWith('data:image/')
  if (!avatarValid) {
    errs.push({
      field: 'avatarUrl',
      message: 'Upload a profile photo or choose “Use default profile picture”.',
    })
  } else if (avatar.startsWith('data:image/') && avatar.length > MAX_AVATAR_DATA_URL_CHARS) {
    errs.push({ field: 'avatarUrl', message: 'Profile photo is too large' })
  }

  return errs
}

export async function saveSetupProfile(input: SaveSetupProfileInput): Promise<UserSetupProfileRecord> {
  return runSerializedByKey(SETUP_PROFILE_LOCK_KEY, async () => {
    const cached = await loadSetupProfileFile()
    // Cached map is shared; clone before mutation so concurrent reads do not see partial writes.
    const file: SetupProfileFile = { profiles: { ...cached.profiles } }
    const nowIso = new Date().toISOString()
    const firstName = normalizeName(input.firstName)
    const lastName = normalizeName(input.lastName)
    const username = normalizeUsername(input.username)
    const phone = input.phone ? normalizePhone(input.phone) : null
    const email = input.email ? normalizeEmail(input.email) : null
    const avatarUrl = input.avatarUrl.trim()

    /* Password hash resolution:
     *   1. If caller supplied a plaintext password, hash it (the historic behavior).
     *   2. Else if caller supplied a pre-computed `passwordHash`, use it as-is
     *      (lets the handler preserve an existing hash when a user updates their
     *      photo or username without re-entering a password).
     *   3. Else fall back to the previously-stored hash for this `(userId, slug)`
     *      so a partial update doesn't silently clear it. If no prior row, store
     *      an empty string — legacy login through `authService.trySetupStore`
     *      will simply skip this row (constant-time compare against `''` won't
     *      match any incoming hash) and account-based login still works. */
    const trimmedPassword = (input.password ?? '').trim()
    let passwordHash = ''
    if (trimmedPassword.length > 0) {
      passwordHash = passwordSha256Hex(trimmedPassword)
    } else if (typeof input.passwordHash === 'string' && input.passwordHash.length > 0) {
      passwordHash = input.passwordHash
    } else {
      const prev = cached.profiles[key(input.userId, input.gameSlug)]
      passwordHash = prev?.passwordHash ?? ''
    }

    const next: UserSetupProfileRecord = {
      userId: input.userId,
      gameSlug: input.gameSlug,
      firstName,
      lastName,
      username,
      phone,
      email,
      passwordHash,
      avatarUrl,
      updatedAtIso: nowIso,
    }
    file.profiles[key(input.userId, input.gameSlug)] = next
    await persistSetupProfileFile(file)
    return next
  })
}

/** Primary in-game label: per-game @username from join setup, else setup full name. */
export function gameProfileDisplayLabel(setup: UserSetupProfileRecord | undefined): string | null {
  if (!setup) return null
  const username = setup.username?.trim()
  if (username) return username
  const full = `${setup.firstName} ${setup.lastName}`.trim()
  return full || null
}

/** Avatar for a player inside one game — setup row wins when present. */
export function gameProfileAvatarUrl(
  setup: UserSetupProfileRecord | undefined,
  accountAvatarUrl?: string,
): string {
  if (setup?.avatarUrl?.trim()) return setup.avatarUrl.trim()
  return accountAvatarUrl?.trim() ?? ''
}

export async function getSetupProfileForUserGame(
  userId: string,
  gameSlug: string,
): Promise<UserSetupProfileRecord | null> {
  if (!userId || !gameSlug) return null
  return runSerializedByKey(SETUP_PROFILE_LOCK_KEY, async () => {
    const file = await loadSetupProfileFile()
    return file.profiles[key(userId, gameSlug)] ?? null
  })
}

/**
 * All join-setup rows keyed `${userId}:::${gameSlug}`.
 *
 * Hot path: this is called on every feed/leaderboard/perform hydration. We cache the
 * derived Map keyed off the underlying file object so we do not rebuild a multi-megabyte
 * lookup table per request. The Map is read-only from callers.
 */
export async function loadAllSetupProfilesByKey(): Promise<Map<string, UserSetupProfileRecord>> {
  return runSerializedByKey(SETUP_PROFILE_LOCK_KEY, async () => {
    const file = await loadSetupProfileFile()
    if (cachedSetupMap && cachedSetupMap.source === file) return cachedSetupMap.map
    const map = new Map(Object.entries(file.profiles))
    cachedSetupMap = { source: file, map }
    return map
  })
}

/** Re-key join-setup rows from a browser id to the canonical account id after auth. */
export async function mergeSetupViewerIds(fromUserId: string, toUserId: string): Promise<void> {
  if (!fromUserId || !toUserId || fromUserId.length < 8 || toUserId.length < 8 || fromUserId === toUserId) return
  return runSerializedByKey(SETUP_PROFILE_LOCK_KEY, async () => {
    const cached = await loadSetupProfileFile()
    const prefix = `${fromUserId}:::`
    let changed = false
    const next: SetupProfileFile = { profiles: { ...cached.profiles } }
    for (const k of Object.keys(next.profiles)) {
      if (!k.startsWith(prefix)) continue
      const slug = k.slice(prefix.length)
      if (!slug) continue
      const dest = key(toUserId, slug)
      const row = next.profiles[k]!
      const incoming = { ...row, userId: toUserId }
      const existing = next.profiles[dest]
      next.profiles[dest] =
        !existing || (incoming.updatedAtIso ?? '') >= (existing.updatedAtIso ?? '') ? incoming : existing
      delete next.profiles[k]
      changed = true
    }
    if (changed) await persistSetupProfileFile(next)
  })
}

export async function clearSetupProfileForUserGame(userId: string, gameSlug: string): Promise<boolean> {
  if (!userId || !gameSlug) return false
  return runSerializedByKey(SETUP_PROFILE_LOCK_KEY, async () => {
    const cached = await loadSetupProfileFile()
    const k = key(userId, gameSlug)
    if (!cached.profiles[k]) return false
    const next: SetupProfileFile = { profiles: { ...cached.profiles } }
    delete next.profiles[k]
    await persistSetupProfileFile(next)
    return true
  })
}

/** Re-key `userId:::fromSlug` setup rows to `userId:::toSlug` (per-game identity preserved). */
export async function renameGameSlugInSetupProfiles(fromSlug: string, toSlug: string): Promise<number> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return 0
  return runSerializedByKey(SETUP_PROFILE_LOCK_KEY, async () => {
    const file = await loadSetupProfileFile()
    const fromSuffix = `:::${fromSlug}`
    const next: SetupProfileFile = { profiles: { ...file.profiles } }
    let moved = 0
    for (const k of Object.keys(next.profiles)) {
      if (!k.endsWith(fromSuffix)) continue
      const row = next.profiles[k]!
      delete next.profiles[k]
      const dest = key(row.userId, toSlug)
      next.profiles[dest] = { ...row, gameSlug: toSlug }
      moved += 1
    }
    if (moved > 0) await persistSetupProfileFile(next)
    return moved
  })
}

/** Remove every join-setup row for a game slug (used when republishing the shared `new` slot). */
export async function clearAllSetupProfilesForGame(gameSlug: string): Promise<number> {
  if (!gameSlug) return 0
  return runSerializedByKey(SETUP_PROFILE_LOCK_KEY, async () => {
    const suffix = `:::${gameSlug}`
    const file = await loadSetupProfileFile()
    const next: SetupProfileFile = { profiles: { ...file.profiles } }
    let removed = 0
    for (const k of Object.keys(next.profiles)) {
      if (k.endsWith(suffix)) {
        delete next.profiles[k]
        removed++
      }
    }
    if (removed > 0) await persistSetupProfileFile(next)
    return removed
  })
}

