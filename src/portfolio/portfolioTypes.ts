export type PortfolioApiRow = {
  ticker: string
  name: string
  shares: number
  avgCost: number
  lastPrice: number | null
  dayChangeDollars: number | null
  priceDisplay: string
  changePct: number | null
  changeLabel: string
  positive: boolean
  logoUrl: string
  sparkline: number[]
  totalReturnPct: number | null
  totalReturnDollars: number | null
  todayDollars: number | null
  pctOfAccount: number | null
  marketValue: number | null
}

export type PortfolioTotals = {
  marketValue: number
  cash: number
  totalAccountValue: number
  totalReturnDollars: number
  totalReturnPct: number
  todayDollars: number
  todayPct: number
  pendingActivityDollars: number
  asOfIso: string
}

export type PortfolioSortMode = 'total_pct' | 'total_dollar' | 'today_dollar' | 'pct_account'

export const PORTFOLIO_SORT_OPTIONS: { id: PortfolioSortMode; label: string }[] = [
  { id: 'total_pct', label: 'Total % Return' },
  { id: 'total_dollar', label: 'Total $ Return' },
  { id: 'today_dollar', label: "Today's $ Return" },
  { id: 'pct_account', label: '% of Account' },
]

export function sortPortfolioRows(rows: PortfolioApiRow[], mode: PortfolioSortMode): PortfolioApiRow[] {
  const out = [...rows]
  const val = (r: PortfolioApiRow) => {
    switch (mode) {
      case 'total_pct':
        return r.totalReturnPct ?? Number.NEGATIVE_INFINITY
      case 'total_dollar':
        return r.totalReturnDollars ?? Number.NEGATIVE_INFINITY
      case 'today_dollar':
        return r.todayDollars ?? Number.NEGATIVE_INFINITY
      case 'pct_account':
        return r.pctOfAccount ?? Number.NEGATIVE_INFINITY
      default:
        return Number.NEGATIVE_INFINITY
    }
  }
  out.sort((a, b) => val(b) - val(a))
  return out
}
