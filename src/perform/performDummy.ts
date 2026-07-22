import type { PerformDashboardPayload } from './performTypes'

/** Fallback labels when perform API fails after load — no fabricated chart series. */
export function emptyPerformDashboard(gameSlug: string): PerformDashboardPayload {
  return {
    gameSlug,
    stats: {
      netWorth: '—',
      netWorthSub: 'Your trades will appear here',
      totalReturn: '—',
      totalReturnSub: '—',
      todayReturn: '—',
      todayReturnSub: '—',
    },
    rank: {
      rankOrdinal: '—',
      outOfLabel: 'Trade to appear on the board',
      streakLabel: null,
    },
    topGainers: [],
    topLosers: [],
    compare: {
      yAxisLabels: [],
      series: [],
    },
  }
}
