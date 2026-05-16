import { isSimvestLoggedIn } from '../login/loginState'

/** localStorage key for the viewer id — exported so hooks can listen for cross-tab updates. */
export const SIMVEST_USER_ID_STORAGE_KEY = 'simvest-user-id-v1'

/** Same character set as `normalizeUserId` on the API and `VIEWER_ID_RE` in `simvestFetch`. */
const VALID_USER_ID_RE = /^[a-zA-Z0-9_.-]{8,128}$/

/** If localStorage is blocked, keep one id per tab session so trades & portfolio stay aligned. */
let memoryFallbackId: string | null = null

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

function readStoredUserId(): string | null {
  try {
    const id = localStorage.getItem(SIMVEST_USER_ID_STORAGE_KEY)?.trim() ?? ''
    return VALID_USER_ID_RE.test(id) ? id : null
  } catch {
    return memoryFallbackId && VALID_USER_ID_RE.test(memoryFallbackId) ? memoryFallbackId : null
  }
}

function persistUserId(id: string): void {
  try {
    localStorage.setItem(SIMVEST_USER_ID_STORAGE_KEY, id)
  } catch {
    /* localStorage blocked */
  }
  memoryFallbackId = id
}

/** Remove viewer id on sign-out or invalid session (do not leave a ghost account on device). */
export function clearStoredUserId(): void {
  try {
    localStorage.removeItem(SIMVEST_USER_ID_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  memoryFallbackId = null
}

/**
 * Anonymous device id for login/signup merge only — not used to gate the home screen.
 * Created only when the user starts sign-in or sign-up, not on app cold start.
 */
export function ensurePreLoginViewerId(): string {
  const existing = readStoredUserId()
  if (existing) return existing
  const id = randomId()
  persistUserId(id)
  return id
}

function ensureLoggedInUserId(): string {
  const existing = readStoredUserId()
  if (existing) return existing
  const id = randomId()
  persistUserId(id)
  return id
}

/** Viewer id for API calls after login. Returns empty string when signed out (no auto-create). */
export function getSimvestUserId(): string {
  if (!isSimvestLoggedIn()) {
    return readStoredUserId() ?? ''
  }
  return ensureLoggedInUserId()
}

/**
 * Swap the local device id to a server-issued account id (post-login).
 *
 * Persists into the same `simvest-user-id-v1` slot used by `getSimvestUserId`
 * so the very next `/api/me/*` call scopes to the real account. Rejects ids
 * that don't pass `VIEWER_ID_RE` to keep header/query routing safe.
 *
 * Returns `true` if the new id was accepted, `false` otherwise.
 */
export function setSimvestUserId(nextId: string): boolean {
  const id = typeof nextId === 'string' ? nextId.trim() : ''
  if (!VALID_USER_ID_RE.test(id)) return false
  try {
    localStorage.setItem(SIMVEST_USER_ID_STORAGE_KEY, id)
  } catch {
    /* localStorage blocked — fall through to memory fallback. */
  }
  memoryFallbackId = id
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('simvest:user-id-changed'))
    }
  } catch {
    /* non-browser */
  }
  return true
}
