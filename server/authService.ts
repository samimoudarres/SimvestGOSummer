/**
 * Login resolution for the Simvest client.
 *
 * Two credential stores feed this resolver, in order:
 *   1. `user-accounts.json` — self-signup accounts (email / phone + password,
 *      created via `POST /api/auth/signup/complete`).
 *   2. `user-setup-profiles.json` — legacy per-game join setup rows
 *      (username / email + password). Kept as a fallback so users who joined
 *      a game before signup existed can still log in with their game username.
 *
 * Identifier shape decides which lookup paths run:
 *   - Contains `@`        → email lookup only (accounts → setup rows)
 *   - Mostly digits (≥7)  → phone lookup (accounts) AND username lookup
 *                            (setup rows, in case a numeric username collides)
 *   - Otherwise           → username lookup (setup rows) AND email lookup
 *                            (accounts, in case the email also happens to be
 *                            in this shape — defensive)
 *
 * Password is SHA-256(hex) on both paths, and comparison runs constant-time.
 * On unknown identifier OR wrong password the API returns one generic 401,
 * so the same code path is reached in either failure mode.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { loadAllSetupProfilesByKey, type UserSetupProfileRecord } from './userSetupProfileService'
import { getUserPublicProfile, ensureUserProfileRecord, upsertProfileFromTradeContext } from './userProfileService'
import {
  findAccountByEmail,
  findAccountByPhone,
  normalizePhone,
  type UserAccountRecord,
} from './userAccountService'

export type LoginIdentifierKind = 'username' | 'email' | 'phone'

export type LoginSuccess = {
  userId: string
  username: string
  displayName: string
  avatarUrl: string
  matchedBy: LoginIdentifierKind
}

export type LoginFailureReason =
  | 'missing-identifier'
  | 'missing-password'
  | 'unknown-account'
  | 'wrong-password'

export type LoginResult =
  | { ok: true; user: LoginSuccess }
  | { ok: false; reason: LoginFailureReason }

function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

function hexEqualsConstantTime(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

function looksLikeEmail(raw: string): boolean {
  return raw.includes('@')
}

/** "Phone-y" identifier: at least 7 digits and the non-digit content is just formatting. */
function looksLikePhone(raw: string): boolean {
  const digits = normalizePhone(raw)
  if (digits.length < 7) return false
  /* Allowed non-digit chars in user-typed phone numbers; anything else
   * (letters, `@`, etc.) means it's not a phone. */
  return /^[0-9+()\-.\s]+$/.test(raw.trim())
}

function newestSetupRowPerUser(rows: UserSetupProfileRecord[]): UserSetupProfileRecord[] {
  const byUser = new Map<string, UserSetupProfileRecord>()
  for (const r of rows) {
    const prev = byUser.get(r.userId)
    if (!prev || (r.updatedAtIso ?? '') > (prev.updatedAtIso ?? '')) {
      byUser.set(r.userId, r)
    }
  }
  return Array.from(byUser.values())
}

async function findSetupCandidatesByIdentifier(
  identifier: string,
  kind: 'email' | 'username',
): Promise<UserSetupProfileRecord[]> {
  const map = await loadAllSetupProfilesByKey()
  const target = identifier.toLowerCase()
  const matches: UserSetupProfileRecord[] = []
  for (const row of map.values()) {
    if (kind === 'email') {
      if (row.email && row.email.trim().toLowerCase() === target) matches.push(row)
    } else {
      if (row.username && row.username.trim().toLowerCase() === target) matches.push(row)
    }
  }
  return newestSetupRowPerUser(matches)
}

function toSuccessFromAccount(
  account: UserAccountRecord,
  matchedBy: LoginIdentifierKind,
): LoginSuccess {
  return {
    userId: account.userId,
    /* Accounts don't carry a username — surface the contact value so the
     * client has something to display while the profile hydrates. */
    username: account.contact,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    matchedBy,
  }
}

async function tryAccountStore(
  identifier: string,
  incomingHash: string,
): Promise<LoginResult | null> {
  /* Returns `null` to mean "no candidate found here, fall through to next
   * store"; `{ ok: false, reason: 'wrong-password' }` means we matched the
   * identifier but the password was wrong, in which case the caller should
   * still attempt the legacy setup store before giving up (e.g. the user
   * signed up with the same email as their legacy join row, with different
   * passwords). */
  const candidates: Array<{ acct: UserAccountRecord; matchedBy: LoginIdentifierKind }> = []
  if (looksLikeEmail(identifier)) {
    const a = await findAccountByEmail(identifier)
    if (a) candidates.push({ acct: a, matchedBy: 'email' })
  } else if (looksLikePhone(identifier)) {
    const a = await findAccountByPhone(identifier)
    if (a) candidates.push({ acct: a, matchedBy: 'phone' })
  } else {
    /* No useful account lookup for a plain string (accounts have no usernames). */
    return null
  }
  if (candidates.length === 0) return null

  let sawCandidate = false
  for (const { acct, matchedBy } of candidates) {
    sawCandidate = true
    if (hexEqualsConstantTime(incomingHash, acct.passwordHash ?? '')) {
      const existing = await getUserPublicProfile(acct.userId)
      if (!existing) await ensureUserProfileRecord(acct.userId)
      await upsertProfileFromTradeContext(acct.userId, {
        displayName: acct.displayName || undefined,
        avatarUrl: acct.avatarUrl || undefined,
      })
      return { ok: true, user: toSuccessFromAccount(acct, matchedBy) }
    }
  }
  return sawCandidate ? { ok: false, reason: 'wrong-password' } : null
}

async function trySetupStore(
  identifier: string,
  incomingHash: string,
): Promise<LoginResult | null> {
  const lookups: Array<'email' | 'username'> = looksLikeEmail(identifier)
    ? ['email']
    : ['username']
  let sawCandidate = false

  for (const kind of lookups) {
    const rows = await findSetupCandidatesByIdentifier(identifier, kind)
    if (rows.length === 0) continue
    sawCandidate = true
    for (const row of rows) {
      if (hexEqualsConstantTime(incomingHash, row.passwordHash ?? '')) {
        const userId = row.userId
        const existing = await getUserPublicProfile(userId)
        const displayName =
          existing?.displayName?.trim() ||
          `${row.firstName} ${row.lastName}`.trim() ||
          row.username
        const avatarUrl = row.avatarUrl?.trim() || existing?.avatarUrl || ''
        if (!existing) await ensureUserProfileRecord(userId)
        if (displayName || avatarUrl) {
          await upsertProfileFromTradeContext(userId, {
            displayName: displayName || undefined,
            avatarUrl: avatarUrl || undefined,
          })
        }
        return {
          ok: true,
          user: {
            userId,
            username: row.username,
            displayName,
            avatarUrl,
            matchedBy: kind,
          },
        }
      }
    }
  }
  return sawCandidate ? { ok: false, reason: 'wrong-password' } : null
}

export async function verifyLoginCredentials(
  identifierRaw: string,
  passwordRaw: string,
): Promise<LoginResult> {
  const identifier = typeof identifierRaw === 'string' ? identifierRaw.trim() : ''
  const password = typeof passwordRaw === 'string' ? passwordRaw : ''

  if (!identifier) return { ok: false, reason: 'missing-identifier' }
  if (!password) return { ok: false, reason: 'missing-password' }

  const incomingHash = sha256Hex(password.trim())

  /* Accounts first (canonical), then legacy setup rows. If accounts surfaced
   * a "wrong password" we still let the setup store try — they might use the
   * same email across both with different passwords. */
  const accountResult = await tryAccountStore(identifier, incomingHash)
  if (accountResult?.ok) return accountResult

  const setupResult = await trySetupStore(identifier, incomingHash)
  if (setupResult?.ok) return setupResult

  /* If either store had a candidate but the password didn't match anywhere,
   * prefer the more specific reason; otherwise it's an unknown account. */
  if (accountResult?.ok === false || setupResult?.ok === false) {
    return { ok: false, reason: 'wrong-password' }
  }
  return { ok: false, reason: 'unknown-account' }
}
