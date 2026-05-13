/** Client-side mirror of `GET /api/stocks/:ticker` JSON (keep in sync with server/stockService). */

export type ChartRange = '1D' | '5D' | '1M' | '3M' | '1Y' | '5Y'

export type StockFinancialYear = {
  year: number
  revenue: number
  netIncome: number
}

export type StockFinancialQuarter = {
  year: number
  quarter: number
  revenue: number
  netIncome: number
}

export type StockDetailPayload = {
  ticker: string
  name: string
  description: string
  iconUrl: string
  lastPrice: number | null
  lastPriceLabel: string
  changeToday: number | null
  changeTodayPct: number | null
  changeTodayLabel: string
  about: {
    ceo: string
    founded: string
    employees: string
    headquarters: string
  }
  keyStatsPage1: { label: string; value: string }[]
  keyStatsPage2: { label: string; value: string }[]
  financialsAnnual: StockFinancialYear[]
  financialsQuarterly: StockFinancialQuarter[]
  financialsEpsAnnual: { year: number; eps: number }[]
  financialsEpsQuarterly: { year: number; quarter: number; eps: number }[]
  updatedAt: string
}

export type StockBarsPayload = {
  ticker: string
  range: ChartRange
  bars: { t: number; o: number; h: number; l: number; c: number; v: number }[]
}

/** `GET /api/games/:slug/users/:userId/net-worth-chart` — dollar net worth in this game over time. */
export type PlayerNetWorthChartPayload = {
  gameSlug: string
  userId: string
  range: ChartRange
  bars: { t: number; o: number; h: number; l: number; c: number; v: number }[]
  liveNetWorth: number
  asOfIso: string
  domainStartMs: number
  domainEndMs: number
  gameTimelineStartIso?: string | null
  gameTimelineEndIso?: string | null
}
