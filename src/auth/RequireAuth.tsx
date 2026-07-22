import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isSimvestLoggedIn } from '../login/loginState'
import { fetchMyAccount } from '../settings/settingsClient'
import { clearAuthSession } from './clearAuthSession'
import { AuthBootScreen } from './AuthBootScreen'
import { readCachedAccount, writeCachedAccount, clearCachedAccount } from './accountSessionCache'
import { getSimvestUserId, setSimvestUserId } from '../user/simvestUserId'
import { registerSimvestPushIfPossible } from '../push/registerSimvestPush'
import { initialRequireAuthGate, type AuthGate } from './initialAuthGate'
import { getSessionToken } from './sessionToken'
import { fetchMyJoinedGames } from '../api/myGamesApi'
import { writeCachedMyGames } from '../home/myGamesSessionCache'

function deferPushRegistration(): void {
  const run = () => void registerSimvestPushIfPossible()
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 })
  else window.setTimeout(run, 1500)
}

/** Warm joined-games cache so home paints instantly after deep links / long in-game sessions. */
function deferWarmMyGames(): void {
  const run = () => {
    void fetchMyJoinedGames()
      .then((list) => writeCachedMyGames(list))
      .catch(() => {
        /* keep last-known */
      })
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 3500 })
  else window.setTimeout(run, 1200)
}

/**
 * Protects app routes: requires login flag + session token + a real userId
 * (from cache or `/api/me/account`). Never marks authed without both token and userId.
 */
export function RequireAuth() {
  const location = useLocation()
  const [gate, setGate] = useState<AuthGate>(initialRequireAuthGate)

  useEffect(() => {
    let cancelled = false

    const finish = (next: AuthGate) => {
      if (!cancelled) setGate(next)
    }

    const token = getSessionToken()
    if (!isSimvestLoggedIn() || !token) {
      if (isSimvestLoggedIn() && !token) clearAuthSession()
      finish('guest')
      return () => {
        cancelled = true
      }
    }

    const cached = readCachedAccount()
    const storedId = getSimvestUserId()
    const knownUserId =
      (storedId && storedId.length >= 8 ? storedId : null) ||
      (cached?.userId && cached.userId.length >= 8 ? cached.userId : null)

    if (knownUserId) {
      if (!storedId) setSimvestUserId(knownUserId)
      finish('authed')
      deferPushRegistration()
      deferWarmMyGames()
    }

    void (async () => {
      try {
        const result = await fetchMyAccount()
        if (cancelled) return
        if (result.ok) {
          const uid = result.account.userId?.trim() ?? ''
          if (uid.length < 8 || !getSessionToken()) {
            clearCachedAccount()
            clearAuthSession()
            finish('guest')
            return
          }
          setSimvestUserId(uid)
          writeCachedAccount(result.account)
          finish('authed')
          deferPushRegistration()
          deferWarmMyGames()
          return
        }
        if (result.error.status === 401 || result.error.status === 404) {
          clearCachedAccount()
          clearAuthSession()
          finish('guest')
          return
        }
        /* Transient server/network — keep session only if we already have token + userId. */
        if (knownUserId && getSessionToken()) finish('authed')
        else {
          clearAuthSession()
          finish('guest')
        }
      } catch {
        if (cancelled) return
        if (knownUserId && getSessionToken()) finish('authed')
        else {
          clearAuthSession()
          finish('guest')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (gate === 'loading') return <AuthBootScreen />
  if (gate === 'guest') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }
  return <Outlet />
}
