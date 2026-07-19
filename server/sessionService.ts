/**
 * Opaque server sessions for Simvest API auth.
 *
 * Tokens are random (crypto.randomBytes); only a SHA-256 hash is stored in
 * `auth-sessions.json` (json_documents / filesystem via persistedJson).
 * Survives restarts when DB or SIMVEST_DATA_DIR is configured.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { dataFilePath } from './dataDir.ts'
import { mutateDataJsonStore, readDataJsonObject } from './db/persistedJson.ts'

const SESSIONS_PATH = dataFilePath('auth-sessions.json')

/** 90 days — long-lived app sessions (store builds). */
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000

export type SessionRecord = {
  userId: string
  createdAtIso: string
  expiresAtIso: string
}

type SessionsFile = {
  /** tokenHash → session */
  sessions: Record<string, SessionRecord>
}

function emptySessions(): SessionsFile {
  return { sessions: {} }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function newRawToken(): string {
  return randomBytes(32).toString('base64url')
}

function pruneExpired(file: SessionsFile, now = Date.now()): SessionsFile {
  const next: SessionsFile = { sessions: {} }
  for (const [h, s] of Object.entries(file.sessions ?? {})) {
    const exp = Date.parse(s.expiresAtIso)
    if (!Number.isFinite(exp) || exp <= now) continue
    next.sessions[h] = s
  }
  return next
}

/** Create a session for `userId`; returns the opaque bearer token (once). */
export async function createSession(userId: string): Promise<{ token: string; expiresAtIso: string }> {
  const token = newRawToken()
  const hash = hashToken(token)
  const now = Date.now()
  const expiresAtIso = new Date(now + SESSION_TTL_MS).toISOString()
  const createdAtIso = new Date(now).toISOString()

  await mutateDataJsonStore(SESSIONS_PATH, emptySessions(), (cur) => {
    const pruned = pruneExpired(cur, now)
    pruned.sessions[hash] = { userId, createdAtIso, expiresAtIso }
    return pruned
  })

  return { token, expiresAtIso }
}

/** Resolve bearer token → userId, or null if missing/expired/unknown. */
export async function resolveSessionUserId(tokenRaw: string): Promise<string | null> {
  const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : ''
  if (!token || token.length < 16) return null
  const hash = hashToken(token)
  const file = (await readDataJsonObject<SessionsFile>(SESSIONS_PATH)) ?? emptySessions()
  const row = file.sessions?.[hash]
  if (!row) return null
  const exp = Date.parse(row.expiresAtIso)
  if (!Number.isFinite(exp) || exp <= Date.now()) return null
  const uid = typeof row.userId === 'string' ? row.userId.trim() : ''
  return uid.length >= 8 ? uid : null
}

/** Invalidate one session (logout). Returns true if a row was removed. */
export async function invalidateSession(tokenRaw: string): Promise<boolean> {
  const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : ''
  if (!token) return false
  const hash = hashToken(token)
  let removed = false
  await mutateDataJsonStore(SESSIONS_PATH, emptySessions(), (cur) => {
    const pruned = pruneExpired(cur)
    if (pruned.sessions[hash]) {
      delete pruned.sessions[hash]
      removed = true
    }
    return pruned
  })
  return removed
}

/** Drop every session for a user (password change / account delete). */
export async function invalidateAllSessionsForUser(userId: string): Promise<number> {
  const uid = typeof userId === 'string' ? userId.trim() : ''
  if (!uid) return 0
  let n = 0
  await mutateDataJsonStore(SESSIONS_PATH, emptySessions(), (cur) => {
    const pruned = pruneExpired(cur)
    for (const [h, s] of Object.entries(pruned.sessions)) {
      if (s.userId === uid) {
        delete pruned.sessions[h]
        n += 1
      }
    }
    return pruned
  })
  return n
}

/** Constant-time compare for optional future use (hashed forms). */
export function sessionHashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}
