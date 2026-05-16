/**
 * Tiny localStorage-backed flag that tells `HomeRoute` whether to render the
 * onboarding carousel (`LoginScreen`) or the real `SimvestHome`.
 *
 * Set to `true` after a successful `POST /api/auth/login` call; cleared on
 * sign-out (not implemented yet). Kept dead simple — a session token /
 * server-issued cookie can replace this later without touching callers.
 */

const LOGIN_STATE_KEY = 'simvest-login-complete-v1'

export function isSimvestLoggedIn(): boolean {
  try {
    return localStorage.getItem(LOGIN_STATE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setSimvestLoggedIn(value: boolean): void {
  try {
    if (value) localStorage.setItem(LOGIN_STATE_KEY, 'true')
    else localStorage.removeItem(LOGIN_STATE_KEY)
  } catch {
    /* localStorage blocked — auth still works, but the gate won't survive a reload. */
  }
}
