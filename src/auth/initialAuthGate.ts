import { isSimvestLoggedIn } from '../login/loginState'
import { getSimvestUserId } from '../user/simvestUserId'
import { readCachedAccount } from './accountSessionCache'
import { getSessionToken } from './sessionToken'

export type AuthGate = 'loading' | 'authed' | 'guest'

/** Skip the boot splash when we already know the session locally. */
export function initialRequireAuthGate(): AuthGate {
  if (!isSimvestLoggedIn()) return 'guest'
  if (!getSessionToken()) return 'guest'
  const uid = getSimvestUserId() || readCachedAccount()?.userId || ''
  if (uid.length >= 8) return 'authed'
  return 'loading'
}

export function initialGuestOnlyGate(): AuthGate {
  if (!isSimvestLoggedIn() || !getSessionToken()) return 'guest'
  const uid = readCachedAccount()?.userId || getSimvestUserId() || ''
  if (uid.length >= 8) return 'authed'
  return 'loading'
}
