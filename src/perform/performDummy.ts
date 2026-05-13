import type { PerformDashboardPayload } from './performTypes'

/** Fallback when there is no viewer id or the perform API fails — no fabricated positions. */
export function emptyPerformDashboard(gameSlug: string): PerformDashboardPayload {
  const baseline = 100_000
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
      streakLabel: '—',
    },
    topGainers: [],
    topLosers: [],
    compare: {
      yAxisLabels: ['$100k', '$95k', '$90k', '$85k', '$80k'],
      series: [
        {
          id: 'you',
          kind: 'you',
          legendLabel: 'You',
          color: '#0a95db',
          values: Array(8).fill(baseline),
        },
      ],
    },
  }
}
