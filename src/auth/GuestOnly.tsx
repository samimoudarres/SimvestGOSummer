import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { isSimvestLoggedIn } from '../login/loginState'
import { fetchMyAccount } from '../settings/settingsClient'
import { clearAuthSession } from './clearAuthSession'
import { AuthBootScreen } from './AuthBootScreen'

type Gate = 'loading' | 'guest' | 'authed'

/** Login / signup carousel — skip when a valid session already exists. */
export function GuestOnly() {
  const [gate, setGate] = useState<Gate>('loading')

  useEffect(() => {
    let cancelled = false

    if (!isSimvestLoggedIn()) {
      setGate('guest')
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const result = await fetchMyAccount()
        if (cancelled) return
        if (result.ok) setGate('authed')
        else {
          if (result.error.status === 401 || result.error.status === 404) {
            clearAuthSession()
          }
          setGate('guest')
        }
      } catch {
        if (!cancelled) setGate(isSimvestLoggedIn() ? 'authed' : 'guest')
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
