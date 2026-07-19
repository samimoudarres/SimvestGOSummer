import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { isSimvestLoggedIn } from '../login/loginState'
import { fetchMyAccount } from '../settings/settingsClient'
import { clearAuthSession } from './clearAuthSession'
import { AuthBootScreen } from './AuthBootScreen'
import { initialGuestOnlyGate, type AuthGate } from './initialAuthGate'
import { getSessionToken } from './sessionToken'
import { getSimvestUserId, setSimvestUserId } from '../user/simvestUserId'

/** Login / signup carousel — skip when a valid session already exists. */
export function GuestOnly() {
  const [gate, setGate] = useState<AuthGate>(initialGuestOnlyGate)

  useEffect(() => {
    let cancelled = false

    if (!isSimvestLoggedIn() || !getSessionToken()) {
      setGate('guest')
      return () => {
        cancelled = true
      }
    }

    if (gate === 'authed') {
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const result = await fetchMyAccount()
        if (cancelled) return
        if (result.ok) {
          const uid = result.account.userId?.trim() ?? ''
          if (uid.length >= 8 && getSessionToken()) {
            setSimvestUserId(uid)
            setGate('authed')
          } else {
            clearAuthSession()
            setGate('guest')
          }
          return
        }
        if (result.error.status === 401 || result.error.status === 404) {
          clearAuthSession()
        }
        setGate('guest')
      } catch {
        if (cancelled) return
        const uid = getSimvestUserId()
        if (isSimvestLoggedIn() && getSessionToken() && uid.length >= 8) setGate('authed')
        else setGate('guest')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (gate === 'loading') return <AuthBootScreen />
  if (gate === 'authed') return <Navigate to="/" replace />
  return <Outlet />
}
