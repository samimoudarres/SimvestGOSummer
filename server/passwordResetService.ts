/**
 * Password reset challenges (forgot-password).
 * Stores hashed one-time codes; never persists plaintext codes.
 */
import { createHash, randomInt, randomUUID } from 'node:crypto'
import { dataFilePath } from './dataDir.ts'
import { writeDataJsonObject, withDataJsonDocumentLock } from './db/persistedJson.ts'
import { readJsonWithMtimeCache, invalidateJsonFileCache } from './jsonFileCache'
import { hashPassword } from './passwordHash.ts'
import {
  findAccountByEmail,
  findAccountByPhone,
  normalizeEmail,
  normalizePhone,
  isValidPasswordPublic,
  setAccountPasswordDirect,
} from './userAccountService.ts'

const RESET_PATH = dataFilePath('password-reset-challenges.json')
const CODE_TTL_MS = 15 * 60_000
const MAX_ATTEMPTS = 5

type ChallengeRow = {
  challengeId: string
  userId: string
  codeHash: string
  expiresAtMs: number
  attempts: number
  createdAtIso: string
}

type ChallengeFile = { challenges: Record<string, ChallengeRow> }

function hashCode(code: string): string {
  return createHash('sha256').update(code.trim(), 'utf8').digest('hex')
}

async function readFile(): Promise<ChallengeFile> {
  const raw = await readJsonWithMtimeCache<ChallengeFile>(RESET_PATH, { challenges: {} })
  return raw && typeof raw === 'object' && raw.challenges ? raw : { challenges: {} }
}

async function writeFile(file: ChallengeFile): Promise<void> {
  await writeDataJsonObject(RESET_PATH, file)
  invalidateJsonFileCache(RESET_PATH)
}

function pruneExpired(file: ChallengeFile, now = Date.now()): ChallengeFile {
  const next: Record<string, ChallengeRow> = {}
  for (const [id, row] of Object.entries(file.challenges)) {
    if (row.expiresAtMs > now) next[id] = row
  }
  return { challenges: next }
}

function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

async function resolveUserIdForIdentifier(identifierRaw: string): Promise<string | null> {
  const id = identifierRaw.trim()
  if (!id) return null
  if (id.includes('@')) {
    const acc = await findAccountByEmail(id)
    return acc?.userId ?? null
  }
  const digits = normalizePhone(id)
  if (digits.length >= 7) {
    const byPhone = await findAccountByPhone(id)
    if (byPhone) return byPhone.userId
  }
  const byEmail = await findAccountByEmail(normalizeEmail(id))
  return byEmail?.userId ?? null
}

export type PasswordResetStartResult = {
  /** Always true for valid requests — does not reveal whether the account exists. */
  ok: true
  challengeId: string
  /** Present so the in-app flow can complete without an email/SMS provider. */
  code: string
  message: string
}

/**
 * Start a reset. Always returns a challengeId + code shape so callers cannot
 * enumerate accounts. Only real challenges verify on confirm.
 */
export async function startPasswordReset(identifierRaw: string): Promise<PasswordResetStartResult> {
  const message =
    'If an account exists for that email or phone, use the 6-digit code to set a new password.'
  const fakeCode = sixDigitCode()
  const fakeId = randomUUID()

  const userId = await resolveUserIdForIdentifier(identifierRaw)
  if (!userId) {
    return { ok: true, challengeId: fakeId, code: fakeCode, message }
  }

  const code = sixDigitCode()
  const challengeId = randomUUID()
  const row: ChallengeRow = {
    challengeId,
    userId,
    codeHash: hashCode(code),
    expiresAtMs: Date.now() + CODE_TTL_MS,
    attempts: 0,
    createdAtIso: new Date().toISOString(),
  }

  await withDataJsonDocumentLock(RESET_PATH, async () => {
    const file = pruneExpired(await readFile())
    /* Drop prior open challenges for this user. */
    const kept: Record<string, ChallengeRow> = {}
    for (const [id, r] of Object.entries(file.challenges)) {
      if (r.userId !== userId) kept[id] = r
    }
    kept[challengeId] = row
    await writeFile({ challenges: kept })
  })

  /* Best-effort email when Resend is configured (does not change response shape). */
  void trySendResetEmail(identifierRaw, code)

  return { ok: true, challengeId, code, message }
}

async function trySendResetEmail(identifierRaw: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim()
  const from = process.env.SIMVEST_PASSWORD_RESET_FROM?.trim()
  if (!key || !from) return
  const id = identifierRaw.trim()
  if (!id.includes('@')) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [normalizeEmail(id)],
        subject: 'Your Simvest password reset code',
        text: `Your Simvest password reset code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
      }),
    })
  } catch {
    /* Delivery is best-effort; in-app code still works. */
  }
}

export type PasswordResetConfirmResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

export async function confirmPasswordReset(input: {
  challengeId: string
  code: string
  newPassword: string
}): Promise<PasswordResetConfirmResult> {
  const challengeId = typeof input.challengeId === 'string' ? input.challengeId.trim() : ''
  const code = typeof input.code === 'string' ? input.code.trim() : ''
  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : ''

  if (!challengeId || !/^\d{6}$/.test(code)) {
    return { ok: false, error: 'Enter the 6-digit code from the previous step.', status: 400 }
  }
  if (!isValidPasswordPublic(newPassword)) {
    return {
      ok: false,
      error: 'Password must be at least 5 characters and include letters and a number.',
      status: 400,
    }
  }

  const verified = await withDataJsonDocumentLock(RESET_PATH, async () => {
    const file = pruneExpired(await readFile())
    const row = file.challenges[challengeId]
    if (!row || row.expiresAtMs <= Date.now()) {
      return { ok: false as const, error: 'That reset code has expired. Request a new one.', status: 400 }
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      delete file.challenges[challengeId]
      await writeFile(file)
      return { ok: false as const, error: 'Too many attempts. Request a new code.', status: 429 }
    }
    if (hashCode(code) !== row.codeHash) {
      row.attempts += 1
      file.challenges[challengeId] = row
      await writeFile(file)
      return { ok: false as const, error: 'That code is incorrect.', status: 401 }
    }
    return { ok: true as const, userId: row.userId, challengeId }
  })

  if (!verified.ok) {
    return { ok: false, error: verified.error, status: verified.status }
  }

  const set = await setAccountPasswordDirect(verified.userId, newPassword)
  if (!set.ok) {
    return { ok: false, error: set.error, status: set.status }
  }

  await withDataJsonDocumentLock(RESET_PATH, async () => {
    const file = pruneExpired(await readFile())
    delete file.challenges[verified.challengeId]
    await writeFile(file)
  })

  try {
    const { invalidateAllSessionsForUser } = await import('./sessionService.ts')
    await invalidateAllSessionsForUser(verified.userId)
  } catch {
    /* non-fatal */
  }

  return { ok: true }
}
