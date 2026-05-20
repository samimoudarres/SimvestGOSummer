/**
 * Self-signup account store for Simvest.
 *
 * Persists to `server/data/user-accounts.json`. Each account row is keyed by
 * `userId` (UUID, generated server-side at signup time) and indexed by both
 * the lowercased email and the digits-only phone so login lookup is an O(1)
 * map hit regardless of how the user formatted their identifier.
 *
 * This file is the source of truth for "real" account credentials. The
 * existing per-game `user-setup-profiles.json` continues to act as a fallback
 * credential store for users who joined a game before signup existed —
 * `authService.ts` checks both stores in that order.
 *
 * Concurrency: file writes are serialized through `writeQueue` so two parallel
 * signup requests can't read-modify-write past each other and lose an account.
 * In a multi-process deployment we'd lift this to a real DB, but for a single
 * Node server this is enough.
 */

import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { dataFilePath } from './dataDir.ts'
import { invalidateJsonFileCache, readJsonWithMtimeCache } from './jsonFileCache'

const ACCOUNTS_PATH = dataFilePath('user-accounts.json')

export type AccountContactKind = 'email' | 'phone'

export type UserAccountRecord = {
  userId: string
  firstName: string
  lastName: string
  contactKind: AccountContactKind
  /** Original-form contact the user typed in (preserved for display / "we sent a code to ..." UX). */
  contact: string
  /**
   * Normalized lookup form: lowercased email for `email`, digits-only for `phone`.
   * Index map keys derive from this so callers can match regardless of formatting.
   */
  contactLower: string
  passwordHash: string
  displayName: string
  avatarUrl: string
  createdAtIso: string
  updatedAtIso: string
}

type AccountsFile = { accounts: Record<string, UserAccountRecord> }

/* Brand-new accounts get an Instagram-style blank silhouette instead of the
 * legacy demo headshot. Users can replace this from Settings → Edit profile
 * or the per-game join setup screen. */
const DEFAULT_AVATAR = '/figma-assets/blank-avatar.svg'

/* ------------------------------------------------------------------------- */
/* Validation                                                                */
/* ------------------------------------------------------------------------- */

const NAME_MIN = 1
const NAME_MAX = 60
const PASSWORD_MIN = 5
const PASSWORD_MAX = 128
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/* Must contain at least one letter AND at least one digit. Length ≥ 5 is
 * checked separately to allow returning a more specific message. */
const PASSWORD_LETTER_RE = /[A-Za-z]/
const PASSWORD_DIGIT_RE = /\d/

export type SignupValidationError = {
  field: 'firstName' | 'lastName' | 'contact' | 'password' | 'contactKind'
  message: string
}

export type SignupCompleteInput = {
  firstName: string
  lastName: string
  contactKind: AccountContactKind
  /** Raw user-typed contact value — normalized inside the service. */
  contact: string
  password: string
}

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 120)
}

/** Digits-only phone normalization, capped at 18 digits (E.164 max is 15). */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, 18)
}

function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw)
  /* 7 digits handles US local without area code; tighter validation belongs in
   * a future SMS-verify step. */
  return digits.length >= 7 && digits.length <= 18
}

function isValidEmail(raw: string): boolean {
  const trimmed = raw.trim()
  return EMAIL_RE.test(trimmed) && trimmed.length <= 120
}

function isValidPassword(raw: string): boolean {
  if (typeof raw !== 'string') return false
  if (raw.length < PASSWORD_MIN || raw.length > PASSWORD_MAX) return false
  return PASSWORD_LETTER_RE.test(raw) && PASSWORD_DIGIT_RE.test(raw)
}

export function validateFullNameInput(firstName: string, lastName: string): SignupValidationError[] {
  const errs: SignupValidationError[] = []
  if (normalizeName(firstName).length < NAME_MIN) {
    errs.push({ field: 'firstName', message: 'First name is required' })
  }
  if (normalizeName(lastName).length < NAME_MIN) {
    errs.push({ field: 'lastName', message: 'Last name is required' })
  }
  return errs
}

export function validateSignupCompleteInput(input: SignupCompleteInput): SignupValidationError[] {
  const errs: SignupValidationError[] = [...validateFullNameInput(input.firstName, input.lastName)]

  if (input.contactKind !== 'email' && input.contactKind !== 'phone') {
    errs.push({ field: 'contactKind', message: 'Pick email or phone' })
  } else {
    const ok = input.contactKind === 'email' ? isValidEmail(input.contact) : isValidPhone(input.contact)
    if (!ok) {
      errs.push({
        field: 'contact',
        message:
          input.contactKind === 'email'
            ? 'Enter a valid email address'
            : 'Enter a valid phone number (at least 7 digits)',
      })
    }
  }

  if (!isValidPassword(input.password)) {
    errs.push({
      field: 'password',
      message: 'Password must be at least 5 characters and include letters and a number',
    })
  }
  return errs
}

/* ------------------------------------------------------------------------- */
/* I/O                                                                       */
/* ------------------------------------------------------------------------- */

function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

async function readFile(): Promise<AccountsFile> {
  return readJsonWithMtimeCache<AccountsFile>(ACCOUNTS_PATH, (raw) => {
    if (!raw) return { accounts: {} }
    try {
      const parsed = JSON.parse(raw) as AccountsFile
      if (parsed && parsed.accounts && typeof parsed.accounts === 'object') return parsed
    } catch {
      /* corrupt — fall through */
    }
    return { accounts: {} }
  })
}

async function writeFile(data: AccountsFile): Promise<void> {
  await fs.mkdir(path.dirname(ACCOUNTS_PATH), { recursive: true })
  await fs.writeFile(ACCOUNTS_PATH, JSON.stringify(data, null, 2), 'utf8')
  invalidateJsonFileCache(ACCOUNTS_PATH)
}

/** Single-process write lock so parallel signups don't race on the same file. */
let writeQueue: Promise<void> = Promise.resolve()
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn)
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/* ------------------------------------------------------------------------- */
/* Lookup                                                                    */
/* ------------------------------------------------------------------------- */

/** Build a contact-key → record map. Cheap enough to rebuild per call (account count is small). */
async function loadAccountsByContactKey(): Promise<{
  byEmail: Map<string, UserAccountRecord>
  byPhone: Map<string, UserAccountRecord>
  byUserId: Map<string, UserAccountRecord>
}> {
  const file = await readFile()
  const byEmail = new Map<string, UserAccountRecord>()
  const byPhone = new Map<string, UserAccountRecord>()
  const byUserId = new Map<string, UserAccountRecord>()
  for (const row of Object.values(file.accounts)) {
    byUserId.set(row.userId, row)
    if (row.contactKind === 'email' && row.contactLower) byEmail.set(row.contactLower, row)
    if (row.contactKind === 'phone' && row.contactLower) byPhone.set(row.contactLower, row)
  }
  return { byEmail, byPhone, byUserId }
}

export async function findAccountByEmail(emailRaw: string): Promise<UserAccountRecord | null> {
  const key = normalizeEmail(emailRaw)
  if (!key) return null
  const { byEmail } = await loadAccountsByContactKey()
  return byEmail.get(key) ?? null
}

export async function findAccountByPhone(phoneRaw: string): Promise<UserAccountRecord | null> {
  const key = normalizePhone(phoneRaw)
  if (!key) return null
  const { byPhone } = await loadAccountsByContactKey()
  return byPhone.get(key) ?? null
}

export async function getAccountByUserId(userId: string): Promise<UserAccountRecord | null> {
  if (!userId) return null
  const { byUserId } = await loadAccountsByContactKey()
  return byUserId.get(userId) ?? null
}

/* ------------------------------------------------------------------------- */
/* Mutation                                                                  */
/* ------------------------------------------------------------------------- */

export type CreateAccountResult =
  | { ok: true; account: UserAccountRecord }
  | { ok: false; errors: SignupValidationError[] }

/**
 * Create a brand-new account. Returns validation errors instead of throwing
 * so callers can render them inline. Enforces uniqueness on
 * `(contactKind, contactLower)`.
 */
export async function createUserAccount(input: SignupCompleteInput): Promise<CreateAccountResult> {
  const errors = validateSignupCompleteInput(input)
  if (errors.length > 0) return { ok: false, errors }

  return withWriteLock(async () => {
    const firstName = normalizeName(input.firstName)
    const lastName = normalizeName(input.lastName)
    const contactLower =
      input.contactKind === 'email' ? normalizeEmail(input.contact) : normalizePhone(input.contact)
    const contact = input.contact.trim()

    const file = await readFile()
    /* Uniqueness check: same contactKind + normalized contact can't repeat.
     * (We intentionally allow the same number/email under both kinds — unusual
     * but not security-sensitive.) */
    for (const row of Object.values(file.accounts)) {
      if (row.contactKind === input.contactKind && row.contactLower === contactLower) {
        return {
          ok: false as const,
          errors: [
            {
              field: 'contact' as const,
              message:
                input.contactKind === 'email'
                  ? 'An account with this email already exists. Try logging in.'
                  : 'An account with this phone number already exists. Try logging in.',
            },
          ],
        }
      }
    }

    const nowIso = new Date().toISOString()
    const userId = randomUUID()
    const displayName = `${firstName} ${lastName}`.trim()
    const record: UserAccountRecord = {
      userId,
      firstName,
      lastName,
      contactKind: input.contactKind,
      contact,
      contactLower,
      passwordHash: sha256Hex(input.password),
      displayName,
      avatarUrl: DEFAULT_AVATAR,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    }

    const next: AccountsFile = { accounts: { ...file.accounts, [userId]: record } }
    await writeFile(next)
    return { ok: true as const, account: record }
  })
}

/* ------------------------------------------------------------------------- */
/* Account updates (settings screen)                                         */
/* ------------------------------------------------------------------------- */

export type AccountValidationError = {
  field: 'firstName' | 'lastName' | 'displayName' | 'avatarUrl' | 'contact' | 'contactKind' | 'currentPassword' | 'newPassword'
  message: string
}

export type UpdateAccountResult =
  | { ok: true; account: UserAccountRecord }
  | { ok: false; errors: AccountValidationError[]; status?: number }

const DISPLAY_NAME_MIN = 2
const DISPLAY_NAME_MAX = 60
const AVATAR_MAX_LEN = 9_500_000

function isValidAvatar(raw: string): boolean {
  if (typeof raw !== 'string') return false
  if (raw.length < 3 || raw.length > AVATAR_MAX_LEN) return false
  return (
    raw.startsWith('/') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:image/')
  )
}

export function verifyAccountPassword(rawAttempt: string, expectedHash: string): boolean {
  return verifyPassword(rawAttempt, expectedHash)
}

function verifyPassword(rawAttempt: string, expectedHash: string): boolean {
  if (typeof rawAttempt !== 'string' || rawAttempt.length === 0) return false
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) return false
  const attemptHash = sha256Hex(rawAttempt)
  const a = Buffer.from(attemptHash, 'hex')
  const b = Buffer.from(expectedHash, 'hex')
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Update mutable profile fields (names, display name, avatar) for an existing
 * account. Caller is expected to mirror `displayName` / `avatarUrl` to the
 * public profile store separately — this function only touches the account
 * row.
 */
export async function updateAccountProfile(
  userId: string,
  input: {
    firstName?: string
    lastName?: string
    displayName?: string
    avatarUrl?: string
  },
): Promise<UpdateAccountResult> {
  const errors: AccountValidationError[] = []

  if (input.firstName !== undefined) {
    if (normalizeName(input.firstName).length < NAME_MIN) {
      errors.push({ field: 'firstName', message: 'First name is required' })
    }
  }
  if (input.lastName !== undefined) {
    if (normalizeName(input.lastName).length < NAME_MIN) {
      errors.push({ field: 'lastName', message: 'Last name is required' })
    }
  }
  if (input.displayName !== undefined) {
    const trimmed = (input.displayName ?? '').trim()
    if (trimmed.length < DISPLAY_NAME_MIN || trimmed.length > DISPLAY_NAME_MAX) {
      errors.push({
        field: 'displayName',
        message: `Display name must be between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters`,
      })
    }
  }
  if (input.avatarUrl !== undefined && input.avatarUrl !== '' && !isValidAvatar(input.avatarUrl)) {
    errors.push({ field: 'avatarUrl', message: 'Profile photo is not a valid image' })
  }

  if (errors.length > 0) return { ok: false, errors, status: 400 }

  return withWriteLock(async () => {
    const file = await readFile()
    const cur = file.accounts[userId]
    if (!cur) return { ok: false as const, errors: [{ field: 'displayName' as const, message: 'Account not found' }], status: 404 }

    const firstName = input.firstName !== undefined ? normalizeName(input.firstName) : cur.firstName
    const lastName = input.lastName !== undefined ? normalizeName(input.lastName) : cur.lastName
    let displayName = cur.displayName
    if (input.displayName !== undefined) {
      displayName = input.displayName.trim().slice(0, DISPLAY_NAME_MAX)
    } else if (input.firstName !== undefined || input.lastName !== undefined) {
      /* Keep displayName in sync with names unless the caller is overriding it. */
      const auto = `${firstName} ${lastName}`.trim()
      if (cur.displayName === `${cur.firstName} ${cur.lastName}`.trim() && auto.length >= DISPLAY_NAME_MIN) {
        displayName = auto
      }
    }
    const avatarUrl =
      input.avatarUrl !== undefined && input.avatarUrl !== ''
        ? input.avatarUrl.slice(0, AVATAR_MAX_LEN)
        : cur.avatarUrl

    const next: UserAccountRecord = {
      ...cur,
      firstName,
      lastName,
      displayName,
      avatarUrl,
      updatedAtIso: new Date().toISOString(),
    }
    const nextFile: AccountsFile = { accounts: { ...file.accounts, [userId]: next } }
    await writeFile(nextFile)
    return { ok: true as const, account: next }
  })
}

/**
 * Change the contact (email or phone) used for login. Requires the current
 * password — same security gate as Google/Twitter use when a user changes the
 * verified email/phone. Enforces uniqueness on `(contactKind, contactLower)`.
 */
export async function updateAccountContact(
  userId: string,
  input: {
    contactKind: AccountContactKind
    contact: string
    currentPassword: string
  },
): Promise<UpdateAccountResult> {
  const errors: AccountValidationError[] = []
  if (input.contactKind !== 'email' && input.contactKind !== 'phone') {
    errors.push({ field: 'contactKind', message: 'Pick email or phone' })
  } else {
    const ok =
      input.contactKind === 'email' ? isValidEmail(input.contact) : isValidPhone(input.contact)
    if (!ok) {
      errors.push({
        field: 'contact',
        message:
          input.contactKind === 'email'
            ? 'Enter a valid email address'
            : 'Enter a valid phone number (at least 7 digits)',
      })
    }
  }
  if (typeof input.currentPassword !== 'string' || input.currentPassword.length === 0) {
    errors.push({ field: 'currentPassword', message: 'Enter your current password' })
  }
  if (errors.length > 0) return { ok: false, errors, status: 400 }

  return withWriteLock(async () => {
    const file = await readFile()
    const cur = file.accounts[userId]
    if (!cur) {
      return { ok: false as const, errors: [{ field: 'contact' as const, message: 'Account not found' }], status: 404 }
    }
    if (!verifyPassword(input.currentPassword, cur.passwordHash)) {
      return {
        ok: false as const,
        errors: [{ field: 'currentPassword' as const, message: 'Current password is incorrect' }],
        status: 401,
      }
    }

    const contactLower =
      input.contactKind === 'email' ? normalizeEmail(input.contact) : normalizePhone(input.contact)
    const contact = input.contact.trim()

    /* Uniqueness: don't collide with another account on the same kind. */
    for (const row of Object.values(file.accounts)) {
      if (row.userId === userId) continue
      if (row.contactKind === input.contactKind && row.contactLower === contactLower) {
        return {
          ok: false as const,
          errors: [
            {
              field: 'contact' as const,
              message:
                input.contactKind === 'email'
                  ? 'Another account already uses this email.'
                  : 'Another account already uses this phone number.',
            },
          ],
          status: 409,
        }
      }
    }

    const next: UserAccountRecord = {
      ...cur,
      contactKind: input.contactKind,
      contact,
      contactLower,
      updatedAtIso: new Date().toISOString(),
    }
    const nextFile: AccountsFile = { accounts: { ...file.accounts, [userId]: next } }
    await writeFile(nextFile)
    return { ok: true as const, account: next }
  })
}

/**
 * Replace the account password. Verifies the current password first, then
 * applies the same strength rule as signup (>=5 chars, must include a letter
 * AND a digit) to the new value.
 */
export async function updateAccountPassword(
  userId: string,
  input: {
    currentPassword: string
    newPassword: string
  },
): Promise<UpdateAccountResult> {
  const errors: AccountValidationError[] = []
  if (typeof input.currentPassword !== 'string' || input.currentPassword.length === 0) {
    errors.push({ field: 'currentPassword', message: 'Enter your current password' })
  }
  if (!isValidPassword(input.newPassword)) {
    errors.push({
      field: 'newPassword',
      message: 'Password must be at least 5 characters and include letters and a number',
    })
  }
  if (errors.length > 0) return { ok: false, errors, status: 400 }

  return withWriteLock(async () => {
    const file = await readFile()
    const cur = file.accounts[userId]
    if (!cur) {
      return { ok: false as const, errors: [{ field: 'newPassword' as const, message: 'Account not found' }], status: 404 }
    }
    if (!verifyPassword(input.currentPassword, cur.passwordHash)) {
      return {
        ok: false as const,
        errors: [{ field: 'currentPassword' as const, message: 'Current password is incorrect' }],
        status: 401,
      }
    }
    if (verifyPassword(input.newPassword, cur.passwordHash)) {
      return {
        ok: false as const,
        errors: [{ field: 'newPassword' as const, message: 'New password must be different from your current password' }],
        status: 400,
      }
    }

    const next: UserAccountRecord = {
      ...cur,
      passwordHash: sha256Hex(input.newPassword),
      updatedAtIso: new Date().toISOString(),
    }
    const nextFile: AccountsFile = { accounts: { ...file.accounts, [userId]: next } }
    await writeFile(nextFile)
    return { ok: true as const, account: next }
  })
}

/** Public shape returned by `/api/me/account` — never includes the password hash. */
export type AccountPublicView = {
  userId: string
  firstName: string
  lastName: string
  displayName: string
  avatarUrl: string
  contactKind: AccountContactKind
  contact: string
  createdAtIso: string
  updatedAtIso: string
}

export function toAccountPublicView(record: UserAccountRecord): AccountPublicView {
  return {
    userId: record.userId,
    firstName: record.firstName,
    lastName: record.lastName,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    contactKind: record.contactKind,
    contact: record.contact,
    createdAtIso: record.createdAtIso,
    updatedAtIso: record.updatedAtIso,
  }
}

/** Permanently remove the account row (after game data cleanup). */
export async function deleteUserAccountRecord(userId: string): Promise<boolean> {
  if (!userId || userId.length < 8) return false
  return withWriteLock(async () => {
    const file = await readFile()
    if (!(userId in file.accounts)) return false
    const next: AccountsFile = { accounts: { ...file.accounts } }
    delete next.accounts[userId]
    await writeFile(next)
    return true
  })
}
