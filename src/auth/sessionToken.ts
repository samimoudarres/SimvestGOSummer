/**
 * Opaque server session token (`Authorization: Bearer …`).
 * Key name is stable across web + Capacitor WebView localStorage.
 */
export const SIMVEST_SESSION_TOKEN_KEY = 'simvest:session-token'

let memoryToken: string | null = null

export function getSessionToken(): string {
  try {
    const t = localStorage.getItem(SIMVEST_SESSION_TOKEN_KEY)?.trim() ?? ''
    if (t) return t
  } catch {
    /* localStorage blocked */
  }
  return memoryToken?.trim() ?? ''
}

export function setSessionToken(token: string): boolean {
  const t = typeof token === 'string' ? token.trim() : ''
  if (t.length < 16) return false
  try {
    localStorage.setItem(SIMVEST_SESSION_TOKEN_KEY, t)
  } catch {
    /* persist in memory for this tab */
  }
  memoryToken = t
  return true
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(SIMVEST_SESSION_TOKEN_KEY)
  } catch {
    /* ignore */
  }
  memoryToken = null
}
