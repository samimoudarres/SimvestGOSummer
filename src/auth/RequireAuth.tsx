import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isSimvestLoggedIn } from '../login/loginState'
import { fetchMyAccount } from '../settings/settingsClient'
import { clearAuthSession } from './clearAuthSession'
import { AuthBootScreen } from './AuthBootScreen'
import { readCachedAccount, writeCachedAccount, clearCachedAccount } from './accountSessionCache'
import { getSimvestUserId, setSimvestUserId } from '../user/simvestUserId'
import { registerSimvestPushIfPossible } from '../push/registerSimvestPush'

type Gate = 'loading' | 'authed' | 'guest'

/**
 * Protects app routes: requires `simvest-login-complete-v1` and a real `/api/me/account`.
 * Stale flags (logged-in bit set but no account) are cleared so users see login, not an empty home.
 */
export function RequireAuth() {
  const location = useLocation()
  const [gate, setGate] = useState<Gate>('loading')

  useEffect(() => {
    let cancelled = false

    const finish = (next: Gate) => {
      if (!cancelled) setGate(next)
    }

    if (!isSimvestLoggedIn()) {
      finish('guest')
      return () => {
        cancelled = true
      }
    }

    const cached = readCachedAccount()
    const storedId = getSimvestUserId()
    if (!storedId && cached?.userId) {
      setSimvestUserId(cached.userId)
    }
    if (storedId || cached?.userId) {
      finish('authed')
      void registerSimvestPushIfPossible()
    }

    void (async () => {
      try {
        const result = await fetchMyAccount()
        if (cancelled) return
        if (result.ok) {
          setSimvestUserId(result.account.userId)
          writeCachedAccount(result.account)
          finish('authed')
          void registerSimvestPushIfPossible()
          return
        }
        if (result.error.status === 401 || result.error.status === 404) {
          clearCachedAccount()
          clearAuthSession()
          finish('guest')
          return
        }
        /* Transient server/network issues — keep session if the user was logged in. */
        finish('authed')
      } catch {
        if (!cancelled) finish('authed')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (gate === 'loading') return <AuthBootScreen />
  if (gate === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
