import type { PerformStockRow } from '../perform/performTypes'
import type { PortfolioApiRow, PortfolioTotals } from '../portfolio/portfolioTypes'

export type PlayerGameProfilePayload = {
  gameSlug: string
  profile: {
    userId: string
    displayName: string
    username: string | null
    avatarUrl: string
    joinedAtIso: string
    memberDays: number
    joinedGameAtIso: string | null
    daysInThisGame: number | null
  }
  stats: {
    netWorth: string
    netWorthSub: string
    totalReturn: string
    totalReturnSub: string
    todayReturn: string
    todayReturnSub: string
  }
  rank: {
    rankOrdinal: string
    outOfLabel: string
    streakLabel: string | null
    fillPct: number
  }
  topGainers: PerformStockRow[]
  topLosers: PerformStockRow[]
  holdings: PortfolioApiRow[]
  totals: PortfolioTotals
}
