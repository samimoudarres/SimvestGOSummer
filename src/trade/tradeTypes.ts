export type TradeCategoryId =
  | 'popular'
  | 'gainers'
  | 'losers'
  | 'active'
  | 'tech'
  | 'finance'
  | 'healthcare'
  | 'energy'
  | 'etf'
  | 'crypto'

/** Keep in sync with `server/tradeService.ts` `TRADE_CATEGORY_OPTIONS` (Figma order). */
export const TRADE_CATEGORY_OPTIONS: { id: TradeCategoryId; label: string }[] = [
  { id: 'popular', label: 'Popular' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'etf', label: 'ETFs' },
  { id: 'tech', label: 'Tech' },
  { id: 'finance', label: 'Finance' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'energy', label: 'Energy' },
  { id: 'gainers', label: 'Top gainers' },
  { id: 'losers', label: 'Top losers' },
  { id: 'active', label: 'Most active' },
]

export type TradeBrowseRow = {
  symbol: string
  companyName: string
  price: string
  changeLabel: string
  positive: boolean
  logoUrl: string
  sparkline: number[]
}

export type TradeBrowsePayload = {
  category: TradeCategoryId
  categories: { id: TradeCategoryId; label: string }[]
  rows: TradeBrowseRow[]
}
