import { setSimvestLoggedIn } from '../login/loginState'
import { clearStoredUserId } from '../user/simvestUserId'
import { clearCachedAccount } from './accountSessionCache'
import { clearCachedHomeFeed } from '../home/homeFeedSessionCache'

/** Sign out or invalid session — drop login gate and device viewer id. */
export function clearAuthSession(): void {
  setSimvestLoggedIn(false)
  clearStoredUserId()
  clearCachedAccount()
  clearCachedHomeFeed()
}
