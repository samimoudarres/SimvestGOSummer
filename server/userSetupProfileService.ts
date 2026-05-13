import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETUP_PROFILE_PATH = path.join(__dirname, 'data', 'user-setup-profiles.json')

const MAX_AVATAR_DATA_URL_BYTES = 2_000_000
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
  password: string
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

async function readFileSafe(): Promise<SetupProfileFile> {
  try {
    const raw = JSON.parse(await fs.readFile(SETUP_PROFILE_PATH, 'utf8')) as SetupProfileFile
    if (raw && raw.profiles && typeof raw.profiles === 'object') return raw
  } catch {
    /* no file yet */
  }
  return { profiles: {} }
}

async function writeFileSafe(data: SetupProfileFile): Promise<void> {
  await fs.mkdir(path.dirname(SETUP_PROFILE_PATH), { recursive: true })
  await fs.writeFile(SETUP_PROFILE_PATH, JSON.stringify(data, null, 2), 'utf8')
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

  const phone = input.phone ? normalizePhone(input.phone) : ''
  const email = input.email ? normalizeEmail(input.email) : ''
  if (!phone && !email) {
    errs.push({ field: 'contact', message: 'Provide either phone number or email' })
  }
  if (phone && !PHONE_RE.test(phone)) {
    errs.push({ field: 'phone', message: 'Phone number format is invalid' })
  }
  if (email && !EMAIL_RE.test(email)) {
    errs.push({ field: 'email', message: 'Email format is invalid' })
  }

  const pwd = input.password.trim()
  if (pwd.length < 6) {
    errs.push({ field: 'password', message: 'Password must be at least 6 characters' })
  }

  const avatar = input.avatarUrl.trim()
  const avatarValid =
    avatar.startsWith('/') ||
    avatar.startsWith('http://') ||
    avatar.startsWith('https://') ||
    avatar.startsWith('data:image/')
  if (!avatarValid) {
    errs.push({ field: 'avatarUrl', message: 'Profile photo is required' })
  } else if (avatar.startsWith('data:image/') && avatar.length > MAX_AVATAR_DATA_URL_BYTES) {
    errs.push({ field: 'avatarUrl', message: 'Profile photo is too large' })
  }

  return errs
}

export async function saveSetupProfile(input: SaveSetupProfileInput): Promise<UserSetupProfileRecord> {
  const file = await readFileSafe()
  const nowIso = new Date().toISOString()
  const firstName = normalizeName(input.firstName)
  const lastName = normalizeName(input.lastName)
  const username = normalizeUsername(input.username)
  const phone = input.phone ? normalizePhone(input.phone) : null
  const email = input.email ? normalizeEmail(input.email) : null
  const avatarUrl = input.avatarUrl.trim().slice(0, MAX_AVATAR_DATA_URL_BYTES)
  const next: UserSetupProfileRecord = {
    userId: input.userId,
    gameSlug: input.gameSlug,
    firstName,
    lastName,
    username,
    phone,
    email,
    passwordHash: passwordSha256Hex(input.password.trim()),
    avatarUrl,
    updatedAtIso: nowIso,
  }
  file.profiles[key(input.userId, input.gameSlug)] = next
  await writeFileSafe(file)
  return next
}

export async function getSetupProfileForUserGame(
  userId: string,
  gameSlug: string,
): Promise<UserSetupProfileRecord | null> {
  if (!userId || !gameSlug) return null
  const file = await readFileSafe()
  return file.profiles[key(userId, gameSlug)] ?? null
}

/** All join-setup rows keyed `${userId}:::${gameSlug}` — one file read for feed/leaderboard. */
export async function loadAllSetupProfilesByKey(): Promise<Map<string, UserSetupProfileRecord>> {
  const file = await readFileSafe()
  return new Map(Object.entries(file.profiles))
}

