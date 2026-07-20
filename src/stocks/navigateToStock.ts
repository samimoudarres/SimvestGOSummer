import type { NavigateFunction } from 'react-router-dom'
import type { ChallengeNavTab } from '../challenge/ChallengeBottomNav'
import {
  prefetchStockDetail,
  seedStockDetailFromBrowse,
  type TradeBrowseSeedRow,
} from './stockDetailPrefetch'
import { stockPath } from './stockPaths'

export type StockLocationState = {
  gameSlug?: string
  challengeTitle?: string
  returnPath?: string
  navTab?: ChallengeNavTab
  /** Optional browse handoff for instant detail chrome. */
  seed?: TradeBrowseSeedRow
}

export function navigateToStock(
  navigate: NavigateFunction,
  ticker: string,
  state?: StockLocationState,
) {
  if (state?.seed) {
    seedStockDetailFromBrowse(state.seed)
  }
  prefetchStockDetail(ticker, '1D', { allRanges: true })
  navigate(stockPath(ticker), { state })
}
