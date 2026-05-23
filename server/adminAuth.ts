import { timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

const HEADER = 'x-simvest-admin-secret'

/** Shared secret from env; unset in production disables admin routes. */
export function getAdminSecret(): string | null {
  const raw = process.env.SIMVEST_ADMIN_SECRET?.trim()
  return raw && raw.length >= 8 ? raw : null
}

export function isAdminConfigured(): boolean {
  return getAdminSecret() !== null
}

function secretsMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function readAdminSecretFromRequest(req: Request): string | null {
  const raw = req.headers[HEADER]
  const s = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() : ''
  return s && s.length > 0 ? s : null
}

export function verifyAdminSecret(provided: string | null | undefined): boolean {
  const expected = getAdminSecret()
  if (!expected || !provided) return false
  return secretsMatch(expected, provided.trim())
}

/** Reject when admin is not configured or the secret header is wrong. */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminConfigured()) {
    res.status(503).json({
      error: 'Admin dashboard is not configured on this server (set SIMVEST_ADMIN_SECRET).',
    })
    return
  }
  const provided = readAdminSecretFromRequest(req)
  if (!verifyAdminSecret(provided)) {
    res.status(401).json({ error: 'Invalid admin secret' })
    return
  }
  next()
}
