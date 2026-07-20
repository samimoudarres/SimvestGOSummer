import { clearCachedAccount } from './accountSessionCache'
import { clearCachedHomeFeed } from '../home/homeFeedSessionCache'
import { clearCachedMyGames } from '../home/myGamesSessionCache'
import { clearAllSimvestJsonCache } from '../api/simvestJsonCache'
import { clearSessionJsonPrefix } from '../lib/sessionJsonCache'
import { clearGameShellCaches } from '../game/gameShellCache'

/**
 * Drop viewer-scoped client caches (sessionStorage + in-memory).
 * Used on logout and when the local userId swaps (account switch).
 */
export function clearViewerScopedCaches(): void {
  clearCachedAccount()
  clearCachedHomeFeed()
  clearCachedMyGames()
  clearSessionJsonPrefix('simvest-portfolio-v1:')
  clearSessionJsonPrefix('simvest-game-feed-v1:')
  clearSessionJsonPrefix('simvest-perform-v1:')
  clearSessionJsonPrefix('simvest-lb-v1:')
  clearSessionJsonPrefix('simvest-members-preview-v1:')
  clearSessionJsonPrefix('simvest-player-profile-v1:')
  clearSessionJsonPrefix('simvest-home-feed-cache-v1')
  clearAllSimvestJsonCache()
  clearGameShellCaches()
}
