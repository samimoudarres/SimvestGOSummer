import { emptyPerformDashboard } from '../src/perform/performDummy'
import type { PerformDashboardPayload, PerformStockRow } from '../src/perform/performTypes'
import { massiveGet } from './massiveClient'
import { fetchStockBars1DayOrLastTwoSessions, normalizeTicker, resolveMassiveTicker } from './stockService'
import type { HoldingRecord } from './userGameStateService'
import { getGameLeaderboardStanding } from './gameLeaderboardService'
import { recordGameNetWorthSnapshot } from './gameNetWorthSnapshotService'
import {
  getLegacyHoldingsForGame,
  getLedgerHoldingsForGame,
  getUserLedger,
  saveLegacyHoldingsForGame,
} from './userGameStateService'

type Snapshot = {
  ticker?: {
    day?: { c?: number }
    prevDay?: { c?: number }
    lastTrade?: { p?: number }
    lastQuote?: { p?: number; P?: number }
    min?: { c?: number }
    todaysChange?: number
    todaysChangePerc?: number
  }
}

type TickerRef = { results?: { name?: string } }

function pickPrice(s: Snapshot['ticker']): number | null {
  if (!s) return null
  const p =
    s.lastTrade?.p ??
    s.lastQuote?.p ??
    s.lastQuote?.P ??
    s.min?.c ??
    s.day?.c ??
    s.prevDay?.c
  return typeof p === 'number' && Number.isFinite(p) ? p : null
}

function fmtPrice(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPctSigned(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function truncateName(name: string, max = 22): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1).trim()}…`
}

function downsampleCloses(closes: number[], maxPoints: number): number[] {
  if (!closes.length) return []
  if (closes.length <= maxPoints) return closes
  const out: number[] = []
  const last = closes.length - 1
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * last)
    out.push(closes[idx]!)
  }
  return out
}

export async function getHoldingsForGame(gameSlug: string): Promise<HoldingRecord[]> {
  return getLegacyHoldingsForGame(gameSlug)
}

export async function saveHoldingsForGame(gameSlug: string, rows: HoldingRecord[]): Promise<void> {
  await saveLegacyHoldingsForGame(gameSlug, rows)
}

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

async function failNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

async function spark1D(sym: string): Promise<number[]> {
  const bars = await failNull(fetchStockBars1DayOrLastTwoSessions(sym))
  const closes = (bars ?? []).map((b) => b.c).filter((c) => typeof c === 'number' && Number.isFinite(c))
  return downsampleCloses(closes, 24)
}

/** Enriched rows for holdings list / profile (Massive-backed prices and sparklines). */
export async function buildPortfolioRows(holdings: HoldingRecord[]): Promise<PortfolioApiRow[]> {
  if (!holdings.length) {
    return []
  }

  const enrichOne = async (h: HoldingRecord): Promise<PortfolioApiRow | null> => {
      const sym = resolveMassiveTicker(h.ticker)
      if (!sym) return null
      const snapPath = sym.startsWith('X:')
        ? `/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(sym)}`
        : `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(sym)}`
      const [ref, snap, spark] = await Promise.all([
        failNull(massiveGet<TickerRef>(`/v3/reference/tickers/${encodeURIComponent(sym)}`)),
        failNull(massiveGet<Snapshot>(snapPath)),
        spark1D(sym),
      ])
      const name = truncateName(ref?.results?.name ?? sym)
      const lastPrice = pickPrice(snap?.ticker)
      const chp = snap?.ticker?.todaysChangePerc ?? null
      const positive = (chp ?? 0) >= 0
      const changeLabel = chp != null && Number.isFinite(chp) ? fmtPctSigned(chp) : '—'
      const shares = h.shares
      const avgCost = h.avgCost
      const costBasis = shares * avgCost
      const marketValue = lastPrice != null ? shares * lastPrice : null
      const totalReturnDollars =
        marketValue != null && Number.isFinite(costBasis) ? marketValue - costBasis : null
      const totalReturnPct =
        totalReturnDollars != null && costBasis > 0 ? (totalReturnDollars / costBasis) * 100 : null
      const perShareDay =
        snap?.ticker?.todaysChange != null && Number.isFinite(snap.ticker.todaysChange)
          ? snap.ticker.todaysChange
          : lastPrice != null && snap?.ticker?.prevDay?.c != null
            ? lastPrice - snap.ticker.prevDay.c
            : null
      const todayDollars =
        perShareDay != null && Number.isFinite(perShareDay) ? perShareDay * shares : null

      return {
        ticker: sym,
        name,
        shares,
        avgCost,
        lastPrice,
        dayChangeDollars: perShareDay,
        priceDisplay: fmtPrice(lastPrice),
        changePct: chp,
        changeLabel,
        positive,
        logoUrl: `/api/stocks/${encodeURIComponent(sym)}/branding-icon`,
        sparkline: spark.length >= 2 ? spark : [lastPrice ?? avgCost, lastPrice ?? avgCost],
        totalReturnPct,
        totalReturnDollars,
        todayDollars,
        pctOfAccount: null,
        marketValue,
      }
  }

  const enriched: (PortfolioApiRow | null)[] = []
  const HOLDINGS_PARALLEL = 5
  for (let i = 0; i < holdings.length; i += HOLDINGS_PARALLEL) {
    const slice = holdings.slice(i, i + HOLDINGS_PARALLEL)
    const part = await Promise.all(slice.map((h) => enrichOne(h)))
    enriched.push(...part)
  }

  const rows = enriched.filter((x): x is PortfolioApiRow => x != null)
  const totalMv = rows.reduce((s, r) => s + (r.marketValue ?? 0), 0)
  for (const r of rows) {
    if (totalMv > 0 && r.marketValue != null) {
      r.pctOfAccount = (r.marketValue / totalMv) * 100
    }
  }

  return rows
}

/** Account-level totals for a user’s game portfolio (same math as the Portfolio tab). */
export async function buildPortfolioTotals(
  gameSlug: string,
  userId: string | null | undefined,
  rows: PortfolioApiRow[],
): Promise<PortfolioTotals> {
  const marketValue = rows.reduce((s, r) => s + (r.marketValue ?? 0), 0)
  const todayDollars = rows.reduce((s, r) => s + (r.todayDollars ?? 0), 0)
  const costBasis = rows.reduce((s, r) => s + r.shares * r.avgCost, 0)
  const cash =
    userId && userId.length >= 8 ? (await getUserLedger(userId, gameSlug)).cash : 0
  const totalAccountValue = cash + marketValue
  const totalReturnDollars = marketValue - costBasis
  const totalReturnPct = costBasis > 1e-6 ? (totalReturnDollars / costBasis) * 100 : 0
  const openingEquityProxy = marketValue - todayDollars
  const todayPct = openingEquityProxy > 1e-6 ? (todayDollars / openingEquityProxy) * 100 : 0

  return {
    marketValue,
    cash,
    totalAccountValue,
    totalReturnDollars,
    totalReturnPct,
    todayDollars,
    todayPct,
    pendingActivityDollars: 0,
    asOfIso: new Date().toISOString(),
  }
}

export async function fetchPortfolioPayload(
  gameSlug: string,
  userId?: string | null,
): Promise<{ rows: PortfolioApiRow[]; totals: PortfolioTotals }> {
  const holdings =
    userId && userId.length >= 8 ? await getLedgerHoldingsForGame(userId, gameSlug) : []
  const rows = await buildPortfolioRows(holdings)
  const totals = await buildPortfolioTotals(gameSlug, userId, rows)
  return { rows, totals }
}

function fmtUsdSigned(n: number): string {
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n)
  return `${sign}$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number, digits = 2): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${Math.abs(n).toFixed(digits)}%`
}

function portfolioApiRowToPerformRow(row: PortfolioApiRow): PerformStockRow {
  const spark =
    Array.isArray(row.sparkline) && row.sparkline.length >= 2
      ? row.sparkline
      : [row.lastPrice ?? row.avgCost, row.lastPrice ?? row.avgCost]
  return {
    symbol: row.ticker,
    companyName: row.name,
    price: row.priceDisplay,
    changeLabel: row.changeLabel,
    positive: row.positive,
    logoUrl: row.logoUrl,
    sparkline: spark,
  }
}

function fmtUsdAxisLabel(n: number): string {
  const v = Math.abs(n)
  if (v >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (v >= 10_000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function compareYouOnlyChart(netWorth: number): PerformDashboardPayload['compare'] {
  const n = Math.max(0, netWorth)
  const pad = Math.max(n * 0.12, 2500)
  const hi = n + pad
  const lo = Math.max(0, n - pad)
  const q1 = hi - (hi - lo) * 0.25
  const mid = (hi + lo) / 2
  const q3 = lo + (hi - lo) * 0.25
  const yAxisLabels = [
    fmtUsdAxisLabel(hi),
    fmtUsdAxisLabel(q1),
    fmtUsdAxisLabel(mid),
    fmtUsdAxisLabel(q3),
    fmtUsdAxisLabel(lo),
  ]
  const values = Array.from({ length: 8 }, () => n)
  return {
    yAxisLabels,
    series: [
      {
        id: 'you',
        kind: 'you',
        legendLabel: 'You',
        color: '#0a95db',
        values,
      },
    ],
  }
}

/** Live aggregate PERFORM stats — cash + ledger positions (matches Portfolio tab for this user/game). */
export type PlayerPerformAggregate = {
  cash: number
  equityMarketValue: number
  costBasis: number
  netWorth: number
  totalReturnDollars: number
  totalReturnPct: number
  todayDollars: number
  todayPct: number
}

export async function getPlayerPerformAggregate(
  gameSlug: string,
  userId: string,
): Promise<PlayerPerformAggregate | null> {
  if (!userId || userId.length < 8) return null
  const slug = String(gameSlug ?? '').trim()

  let ledgerCash: number
  try {
    const ledger = await getUserLedger(userId, slug)
    ledgerCash = Number.isFinite(ledger.cash) ? ledger.cash : 0
  } catch {
    ledgerCash = 0
  }

  let holdings: HoldingRecord[]
  try {
    holdings = await getLedgerHoldingsForGame(userId, slug)
  } catch {
    holdings = []
  }

  if (!holdings.length) {
    const net = Math.max(0, ledgerCash)
    const out = {
      cash: net,
      equityMarketValue: 0,
      costBasis: 0,
      netWorth: net,
      totalReturnDollars: 0,
      totalReturnPct: 0,
      todayDollars: 0,
      todayPct: 0,
    }
    await recordGameNetWorthSnapshot(slug, userId, out.netWorth).catch(() => {})
    return out
  }

  let rows: Awaited<ReturnType<typeof buildPortfolioRows>>
  try {
    rows = await buildPortfolioRows(holdings)
  } catch {
    rows = []
  }

  let equityMv = 0
  let costBasis = 0
  let todayDollars = 0

  for (const r of rows) {
    equityMv += r.marketValue ?? 0
    costBasis += r.shares * r.avgCost
    todayDollars += r.todayDollars ?? 0
  }

  if (!rows.length && holdings.length > 0) {
    for (const h of holdings) {
      const sh = Number.isFinite(h.shares) ? h.shares : 0
      const ac = Number.isFinite(h.avgCost) && h.avgCost > 0 ? h.avgCost : 0
      const mv = sh * ac
      equityMv += mv
      costBasis += sh * ac
    }
  }

  const netWorth = ledgerCash + equityMv
  const totalReturnDollars = equityMv - costBasis
  const totalReturnPct = costBasis > 1e-6 ? (totalReturnDollars / costBasis) * 100 : 0

  const openingEquityProxy = equityMv - todayDollars
  const todayPct =
    openingEquityProxy > 1e-6 ? (todayDollars / openingEquityProxy) * 100 : 0

  const out = {
    cash: ledgerCash,
    equityMarketValue: equityMv,
    costBasis,
    netWorth,
    totalReturnDollars,
    totalReturnPct,
    todayDollars,
    todayPct,
  }
  await recordGameNetWorthSnapshot(slug, userId, netWorth).catch(() => {})
  return out
}

export async function getPerformDashboard(
  gameSlug: string,
  userId?: string | null,
): Promise<PerformDashboardPayload> {
  const slug = String(gameSlug ?? '').trim()

  if (!userId || userId.length < 8) {
    return emptyPerformDashboard(slug)
  }

  const agg = await getPlayerPerformAggregate(slug, userId)
  if (!agg) {
    return emptyPerformDashboard(slug)
  }

  const standing = await getGameLeaderboardStanding(slug, userId, {
    subjectNetWorthHint: agg.netWorth,
  })

  const holdings = await getLedgerHoldingsForGame(userId, slug)
  const rows = holdings.length ? await buildPortfolioRows(holdings) : []

  let topGainers: PerformStockRow[] = []
  let topLosers: PerformStockRow[] = []
  if (rows.length > 0) {
    const withChange = rows.filter((r) => typeof r.changePct === 'number' && Number.isFinite(r.changePct))
    const byDayMove = [...withChange].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    topGainers = byDayMove.slice(0, 8).map(portfolioApiRowToPerformRow)
    topLosers = [...withChange]
      .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
      .slice(0, 8)
      .map(portfolioApiRowToPerformRow)
  }

  const netWorth = agg.netWorth

  return {
    gameSlug: slug,
    stats: {
      netWorth: fmtUsdSigned(netWorth),
      netWorthSub: `${fmtUsdSigned(agg.costBasis)} in stocks · ${fmtUsdSigned(agg.cash)} cash`,
      totalReturn: fmtPct(agg.totalReturnPct),
      totalReturnSub: `${agg.totalReturnDollars >= 0 ? 'Up' : 'Down'} ${fmtUsdSigned(Math.abs(agg.totalReturnDollars))}`,
      todayReturn: fmtPct(agg.todayPct),
      todayReturnSub: `${agg.todayDollars >= 0 ? 'Up' : 'Down'} ${fmtUsdSigned(Math.abs(agg.todayDollars))}`,
    },
    rank: {
      rankOrdinal: standing.rankOrdinal,
      outOfLabel: standing.outOfLabel,
      streakLabel: standing.streakLabel,
    },
    topGainers,
    topLosers,
    compare: compareYouOnlyChart(netWorth),
  }
}
