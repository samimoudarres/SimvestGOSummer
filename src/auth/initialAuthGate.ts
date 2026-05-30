import { isSimvestLoggedIn } from '../login/loginState'
import { getSimvestUserId } from '../user/simvestUserId'
import { readCachedAccount } from './accountSessionCache'

export type AuthGate = 'loading' | 'authed' | 'guest'

/** Skip the boot splash when we already know the session locally. */
export function initialRequireAuthGate(): AuthGate {
  if (!isSimvestLoggedIn()) return 'guest'
  if (getSimvestUserId() || readCachedAccount()?.userId) return 'authed'
  return 'loading'
}

export function initialGuestOnlyGate(): AuthGate {
  if (!isSimvestLoggedIn()) return 'guest'
  if (readCachedAccount()?.userId) return 'authed'
  return 'loading'
}
