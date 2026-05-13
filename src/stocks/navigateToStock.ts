import type { NavigateFunction } from 'react-router-dom'
import type { ChallengeNavTab } from '../challenge/ChallengeBottomNav'
import { stockPath } from './stockPaths'

export type StockLocationState = {
  gameSlug?: string
  challengeTitle?: string
  returnPath?: string
  navTab?: ChallengeNavTab
}

export function navigateToStock(
  navigate: NavigateFunction,
  ticker: string,
  state?: StockLocationState,
) {
  navigate(stockPath(ticker), { state })
}
