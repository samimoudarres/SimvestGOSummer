import { setSimvestLoggedIn } from '../login/loginState'
import { clearStoredUserId } from '../user/simvestUserId'
import { clearSessionToken, getSessionToken } from './sessionToken'
import { clearViewerScopedCaches } from './clearViewerScopedCaches'
import { simvestFetch } from '../api/simvestFetch'

/** Sign out or invalid session — drop login gate, token, viewer id, and all game-scoped caches. */
export function clearAuthSession(): void {
  const token = getSessionToken()
  if (token) {
    /* Best-effort server invalidate; do not block UI clear. */
    void simvestFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  }
  clearSessionToken()
  setSimvestLoggedIn(false)
  clearStoredUserId()
  clearViewerScopedCaches()
}
