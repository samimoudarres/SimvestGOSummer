import type { ChartRange } from '../stocks/stockDetailTypes'

/** Types shared by the Perform UI, dummy fixtures, and `GET /api/games/:slug/perform`. */

export type PerformStockRow = {
  symbol: string
  companyName: string
  /** Right-aligned last price, e.g. "$435.05" */
  price: string
  /** Badge label including sign, e.g. "+21.32%" */
  changeLabel: string
  positive: boolean
  /** Optional: true when Figma uses a striped / image badge instead of flat fill */
  changeVariant?: 'solid' | 'striped'
  logoUrl: string
  /** Normalized 0–1 samples for mini sparkline (left → right) */
  sparkline: number[]
}

/** Series id in charts: `you`, `user:<id>`, or `stock:<ticker>`. */
export type PerformCompareSeriesId = string

export type PerformCompareSeriesKind = 'you' | 'player' | 'stock'

export type PerformCompareSeries = {
  id: PerformCompareSeriesId
  kind?: PerformCompareSeriesKind
  legendLabel: string
  /** Stroke / legend accent */
  color: string
  /** Chart Y values (dashboard stub = dollars; compare API = indexed to 100 at range start). */
  values: number[]
  /** Legend row: optional small icon (e.g. Game Average clock) */
  legendIcon?: 'clock' | 'none'
  ticker?: string
  userId?: string
  avatarUrl?: string | null
}

/** `GET /api/games/:slug/perform/compare` — interactive compare chart. */
export type PerformCompareChartPayload = {
  gameSlug: string
  range: ChartRange
  baselineExplanation: string
  yAxisLabels: string[]
  series: PerformCompareSeries[]
  /** UTC ms per sample — same length as each series `values`. */
  sampledAtMs: number[]
  domainStartMs: number
  domainEndMs: number
  gameTimelineStartIso?: string | null
  gameTimelineEndIso?: string | null
  warnings?: string[]
}

export type PerformCompareCandidatePlayer = {
  userId: string
  displayName: string
  avatarUrl: string
}

export type PerformCompareCandidatesPayload = {
  viewerId: string | null
  players: PerformCompareCandidatePlayer[]
}

export type PerformDashboardPayload = {
  gameSlug: string
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
  }
  topGainers: PerformStockRow[]
  topLosers: PerformStockRow[]
  compare: {
    yAxisLabels: string[]
    series: PerformCompareSeries[]
  }
  /** Present when the game’s scheduled end has passed — congrats + final rank copy. */
  gameFinishedBanner?: {
    headline: string
    subline: string
    rankOrdinal: string
    outOfLabel: string
    endedAtLabel: string
  }
}
