const STORAGE_KEY = 'simvest-user-id-v1'

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

/** Stable pseudo-user id for follow lists (localStorage). */
export function getSimvestUserId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
    if (!VALID_USER_ID_RE.test(id)) {
      id = randomId()
      localStorage.setItem(STORAGE_KEY, id)
    }
    memoryFallbackId = id
    return id
  } catch {
    if (!memoryFallbackId || !VALID_USER_ID_RE.test(memoryFallbackId)) {
      memoryFallbackId = randomId()
    }
    return memoryFallbackId
  }
}
