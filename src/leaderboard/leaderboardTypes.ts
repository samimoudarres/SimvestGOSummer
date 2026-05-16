export type LeaderboardSortKey = 'overall_return' | 'today' | 'past_7d' | 'past_month'

export type LeaderboardRow = {
  rank: number
  userId: string
  displayName: string
  handle: string
  avatarUrl: string
  netWorth: number
  netWorthLabel: string
  sortMetricPct: number | null
  sortMetricLabel: string
  positive: boolean
  overallReturnPct: number
  todayReturnPct: number
  past7dReturnPct: number | null
  pastMonthReturnPct: number | null
}

export type LeaderboardPayload = {
  gameSlug: string
  sort: LeaderboardSortKey
  sortLabel: string
  totalPlayers: number
  rows: LeaderboardRow[]
  gameFinished?: boolean
}

export const LEADERBOARD_SORT_OPTIONS: { key: LeaderboardSortKey; label: string }[] = [
  { key: 'overall_return', label: 'Overall Return' },
  { key: 'today', label: "Today's Return" },
  { key: 'past_7d', label: 'Past 7 Days' },
  { key: 'past_month', label: 'Past Month' },
]
