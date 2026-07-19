/**
 * Password hashing: bcrypt for new hashes; legacy unsalted SHA-256 hex still
 * verifies, then callers rehash+save on successful login (transparent migration).
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i

export function isBcryptHash(stored: string): boolean {
  return (
    typeof stored === 'string' &&
    (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$'))
  )
}

export function isLegacySha256Hash(stored: string): boolean {
  return typeof stored === 'string' && SHA256_HEX_RE.test(stored)
}

export function passwordNeedsRehash(stored: string): boolean {
  return isLegacySha256Hash(stored)
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain.trim(), BCRYPT_ROUNDS)
}

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

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (typeof plain !== 'string' || plain.length === 0) return false
  if (typeof stored !== 'string' || stored.length === 0) return false
  const p = plain.trim()
  if (isBcryptHash(stored)) {
    return bcrypt.compare(p, stored)
  }
  if (isLegacySha256Hash(stored)) {
    return hexEqualsConstantTime(sha256Hex(p), stored.toLowerCase())
  }
  return false
}
