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
 * Passwords: bcrypt preferred; legacy unsalted SHA-256 hex still verifies, then
 * is rehashed to bcrypt on successful login (transparent migration).
 */

import { loadAllSetupProfilesByKey, type UserSetupProfileRecord } from './userSetupProfileService'
import { getUserPublicProfile, ensureUserProfileRecord, upsertProfileFromTradeContext } from './userProfileService'
import {
  findAccountByEmail,
  findAccountByPhone,
  normalizePhone,
  rehashAccountPasswordIfNeeded,
  type UserAccountRecord,
} from './userAccountService'
import { passwordNeedsRehash, verifyPassword } from './passwordHash.ts'
import { withDataJsonDocumentLock, readDataJsonObject, writeDataJsonObject } from './db/persistedJson.ts'
import { dataFilePath } from './dataDir.ts'

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

function looksLikeEmail(raw: string): boolean {
  return raw.includes('@')
}

/** "Phone-y" identifier: at least 7 digits and the non-digit content is just formatting. */
function looksLikePhone(raw: string): boolean {
  const digits = normalizePhone(raw)
  if (digits.length < 7) return false
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
    username: account.contact,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    matchedBy,
  }
}

async function tryAccountStore(identifier: string, password: string): Promise<LoginResult | null> {
  const candidates: Array<{ acct: UserAccountRecord; matchedBy: LoginIdentifierKind }> = []
  if (looksLikeEmail(identifier)) {
    const a = await findAccountByEmail(identifier)
    if (a) candidates.push({ acct: a, matchedBy: 'email' })
  } else if (looksLikePhone(identifier)) {
    const a = await findAccountByPhone(identifier)
    if (a) candidates.push({ acct: a, matchedBy: 'phone' })
  } else {
    return null
  }
  if (candidates.length === 0) return null

  let sawCandidate = false
  for (const { acct, matchedBy } of candidates) {
    sawCandidate = true
    if (await verifyPassword(password, acct.passwordHash ?? '')) {
      await rehashAccountPasswordIfNeeded(acct.userId, password)
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

const SETUP_PROFILE_PATH = dataFilePath('user-setup-profiles.json')

async function rehashSetupPasswordIfNeeded(
  row: UserSetupProfileRecord,
  password: string,
): Promise<void> {
  if (!passwordNeedsRehash(row.passwordHash ?? '')) return
  const { hashPassword } = await import('./passwordHash.ts')
  const nextHash = await hashPassword(password)
  await withDataJsonDocumentLock(SETUP_PROFILE_PATH, async () => {
    const raw = await readDataJsonObject<{ profiles?: Record<string, UserSetupProfileRecord> }>(
      SETUP_PROFILE_PATH,
    )
    const profiles = { ...(raw?.profiles ?? {}) }
    let changed = false
    for (const [k, p] of Object.entries(profiles)) {
      if (p.userId === row.userId && passwordNeedsRehash(p.passwordHash ?? '')) {
        profiles[k] = { ...p, passwordHash: nextHash, updatedAtIso: new Date().toISOString() }
        changed = true
      }
    }
    if (changed) await writeDataJsonObject(SETUP_PROFILE_PATH, { profiles })
  })
}

async function trySetupStore(identifier: string, password: string): Promise<LoginResult | null> {
  const lookups: Array<'email' | 'username'> = looksLikeEmail(identifier) ? ['email'] : ['username']
  let sawCandidate = false

  for (const kind of lookups) {
    const rows = await findSetupCandidatesByIdentifier(identifier, kind)
    if (rows.length === 0) continue
    sawCandidate = true
    for (const row of rows) {
      if (await verifyPassword(password, row.passwordHash ?? '')) {
        await rehashSetupPasswordIfNeeded(row, password)
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

  const accountResult = await tryAccountStore(identifier, password.trim())
  if (accountResult?.ok) return accountResult

  const setupResult = await trySetupStore(identifier, password.trim())
  if (setupResult?.ok) return setupResult

  if (accountResult?.ok === false || setupResult?.ok === false) {
    return { ok: false, reason: 'wrong-password' }
  }
  return { ok: false, reason: 'unknown-account' }
}
