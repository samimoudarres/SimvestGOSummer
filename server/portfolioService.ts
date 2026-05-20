import { emptyPerformDashboard } from '../src/perform/performDummy'
import type { PerformDashboardPayload, PerformStockRow } from '../src/perform/performTypes'
import { massiveGet } from './massiveClient'
import {
  fetchStockBars1DayOrLastTwoSessions,
  normalizeTicker,
  normalizeCryptoSnapshotShape,
  pickLastCloseFromRecentAggs,
  pickTickerSnapshotPrice,
  resolveMassiveTicker,
  unwrapCryptoSnapshotBody,
} from './stockService'
import {
  isUsEquitySymbol,
  pickStockMarkPrice,
  pickUsEquityFrozenChangePct,
  pickUsEquityFrozenDayChangePerShare,
} from './usEquityMarkPrice'
import { getGameLeaderboardStanding } from './gameLeaderboardService'
import { ensureGameFinalSnapshot } from './gameFinalSnapshotService'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { recordGameNetWorthSnapshot } from './gameNetWorthSnapshotService'
import {
  LEGACY_LOT_TIME,
  getLegacyHoldingsForGame,
  getLedgerHoldingsForGame,
  getUserLedger,
  getUserLots,
  saveLegacyHoldingsForGame,
  type HoldingRecord,
  type PositionLot,
} from './userGameStateService'

type Snapshot = {
  ticker?: {
    day?: { c?: number; o?: number }
    prevDay?: { c?: number }
    lastTrade?: { p?: number }
    lastQuote?: { p?: number; P?: number }
    min?: { c?: number }
    todaysChange?: number
    todaysChangePerc?: number
  }
}

function numFromObj(o: unknown, ...keys: string[]): number | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function derivedChangePctFromSnapshot(
  sym: string,
  s: NonNullable<Snapshot['ticker']> | undefined,
  atMs: number,
): number | null {
  if (!s) return null
  if (isUsEquitySymbol(sym)) {
    const frozen = pickUsEquityFrozenChangePct(s, atMs)
    if (frozen != null) return frozen
  }
  const raw = s as Record<string, unknown>
  const fromSnap =
    typeof s.todaysChangePerc === 'number' && Number.isFinite(s.todaysChangePerc)
      ? s.todaysChangePerc
      : typeof raw.todays_change_perc === 'number'
        ? raw.todays_change_perc
        : typeof raw.todays_change_percent === 'number'
          ? raw.todays_change_percent
          : null
  if (fromSnap != null && Number.isFinite(fromSnap)) return fromSnap
  const last = pickStockMarkPrice(sym, s, atMs)
  const prev = numFromObj(s.prevDay, 'c', 'C', 'close')
  if (last != null && prev != null && prev !== 0) {
    return ((last - prev) / prev) * 100
  }
  const open = numFromObj(s.day, 'o', 'O', 'open')
  if (last != null && open != null && open !== 0) {
    return ((last - open) / open) * 100
  }
  return null
}

/** Compact list/row price — capped so Perform “top gainers” columns do not overflow. */
function fmtPrice(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs > 0 && abs < 0.01) {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
  }
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
  /** Position-level % move that matches `todayDollars` (opening value = marketValue − todayDollars). */
  todayPct: number | null
  /** Formatted `todayPct` for list/overview badges (not ticker session %). */
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

/** Perform “top movers” — include crypto when snapshot day-% is missing but position P&L exists. */
export function slicePerformTopMovers(
  rows: PortfolioApiRow[],
  limit = 8,
): { gainers: PortfolioApiRow[]; losers: PortfolioApiRow[] } {
  const eligible = rows.filter((r) => {
    if ((r.marketValue ?? 0) < 1e-6) return false
    if (typeof r.changePct === 'number' && Number.isFinite(r.changePct)) return true
    if (typeof r.totalReturnPct === 'number' && Number.isFinite(r.totalReturnPct)) return true
    if (typeof r.todayDollars === 'number' && Number.isFinite(r.todayDollars)) return true
    return false
  })
  if (!eligible.length) return { gainers: [], losers: [] }
  const key = (r: PortfolioApiRow) =>
    typeof r.changePct === 'number' && Number.isFinite(r.changePct)
      ? r.changePct
      : typeof r.totalReturnPct === 'number' && Number.isFinite(r.totalReturnPct)
        ? r.totalReturnPct
        : 0
  const gainers = [...eligible].sort((a, b) => key(b) - key(a)).slice(0, limit)
  const losers = [...eligible].sort((a, b) => key(a) - key(b)).slice(0, limit)
  return { gainers, losers }
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

type BatchSnapshotResponse = { tickers?: unknown[] }
type BatchRefRow = { ticker?: string; name?: string }
type BatchRefResponse = { results?: BatchRefRow[] }

function chunkSyms<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function flattenSnapshotRowForPortfolio(row: unknown): { sym: string | null; ticker: Snapshot['ticker'] | undefined } {
  if (!row || typeof row !== 'object') return { sym: null, ticker: undefined }
  const o = row as Record<string, unknown>
  const inner = o.ticker
  if (inner && typeof inner === 'object') {
    const n = inner as Record<string, unknown>
    const sym =
      typeof n.ticker === 'string'
        ? n.ticker
        : typeof o.ticker === 'string'
          ? o.ticker
          : null
    return { sym, ticker: { ...(o as object), ...(n as object) } as Snapshot['ticker'] }
  }
  const sym = typeof o.ticker === 'string' ? o.ticker : null
  return { sym, ticker: o as Snapshot['ticker'] }
}

/**
 * One paged batch fetch for snapshots + names — avoids the previous O(N) per-holding fan-out
 * that dominated portfolio load time. Bars (sparklines) are still per-symbol because Massive
 * has no batched aggregates endpoint, but they run in parallel and benefit from the existing
 * Massive response cache.
 */
async function loadPortfolioMassiveData(symbols: string[]): Promise<{
  snapshots: Map<string, NonNullable<Snapshot['ticker']>>
  names: Map<string, string>
  sparks: Map<string, number[]>
}> {
  const stockSyms = symbols.filter((s) => !s.startsWith('X:'))
  const cryptoSyms = symbols.filter((s) => s.startsWith('X:'))
  const snapshots = new Map<string, NonNullable<Snapshot['ticker']>>()
  const names = new Map<string, string>()
  const sparks = new Map<string, number[]>()

  const snapStock = (async () => {
    for (const chunk of chunkSyms(stockSyms, 25)) {
      if (!chunk.length) continue
      try {
        const q = chunk.map((c) => encodeURIComponent(c)).join(',')
        const data = await massiveGet<BatchSnapshotResponse>(
          `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${q}`,
        )
        for (const raw of data?.tickers ?? []) {
          const { sym, ticker } = flattenSnapshotRowForPortfolio(raw)
          if (sym && chunk.includes(sym.toUpperCase()) && ticker) {
            const norm = normalizeCryptoSnapshotShape(ticker as never) ?? ticker
            snapshots.set(sym.toUpperCase(), norm)
          }
        }
      } catch {
        /* fallback below */
      }
    }
  })()
  const snapCrypto = (async () => {
    for (const chunk of chunkSyms(cryptoSyms, 12)) {
      if (!chunk.length) continue
      try {
        const q = chunk.map((c) => encodeURIComponent(c)).join(',')
        const data = await massiveGet<BatchSnapshotResponse>(
          `/v2/snapshot/locale/global/markets/crypto/tickers?tickers=${q}`,
        )
        const wantSet = new Set(chunk)
        const unprefixedToFull = new Map(chunk.map((s) => [s.replace(/^X:/, ''), s]))
        for (const raw of data?.tickers ?? []) {
          const { sym, ticker } = flattenSnapshotRowForPortfolio(raw)
          if (!sym || !ticker) continue
          const upper = sym.toUpperCase()
          const matched = wantSet.has(upper) ? upper : unprefixedToFull.get(upper.replace(/^X:/, '')) ?? null
          if (matched) {
            const norm = normalizeCryptoSnapshotShape(ticker as never) ?? ticker
            snapshots.set(matched, norm)
          }
        }
      } catch {
        /* fallback below */
      }
    }
  })()
  const refNames = (async () => {
    if (stockSyms.length === 0) return
    for (const chunk of chunkSyms(stockSyms, 50)) {
      try {
        const data = await massiveGet<BatchRefResponse>('/v3/reference/tickers', {
          'ticker.any_of': chunk.join(','),
          active: 'true',
          limit: String(Math.max(chunk.length, 50)),
        })
        for (const r of data?.results ?? []) {
          const t = (r.ticker ?? '').toUpperCase()
          if (t && chunk.includes(t)) names.set(t, truncateName(r.name ?? t))
        }
      } catch {
        /* fallback below */
      }
    }
  })()
  const sparksTask = (async () => {
    const entries = await Promise.all(symbols.map(async (sym) => [sym, await spark1D(sym)] as const))
    for (const [sym, sp] of entries) sparks.set(sym, sp)
  })()

  await Promise.all([snapStock, snapCrypto, refNames, sparksTask])

  // Per-ticker fallback for anything the batch endpoints did not return — guarantees no
  // holding renders without data even if Massive returned a partial set.
  const missingSnap = symbols.filter((s) => !snapshots.has(s))
  if (missingSnap.length > 0) {
    await Promise.all(
      missingSnap.map(async (sym) => {
        const snapPath = sym.startsWith('X:')
          ? `/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(sym)}`
          : `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(sym)}`
        try {
          const raw = await massiveGet<unknown>(snapPath)
          if (sym.startsWith('X:')) {
            const inner = unwrapCryptoSnapshotBody(raw)
            const { ticker: flatT } = flattenSnapshotRowForPortfolio(raw)
            const merged = inner ? ({ ...(flatT ?? {}), ...inner } as NonNullable<Snapshot['ticker']>) : flatT
            const norm = normalizeCryptoSnapshotShape(merged) ?? merged
            if (norm) {
              snapshots.set(sym, norm)
              return
            }
          }
          const snap = raw as Snapshot
          if (snap?.ticker) {
            const norm = normalizeCryptoSnapshotShape(snap.ticker as never) ?? snap.ticker
            snapshots.set(sym, norm)
          }
        } catch {
          /* leave unset */
        }
      }),
    )
  }
  const missingName = stockSyms.filter((s) => !names.has(s))
  if (missingName.length > 0) {
    type SingleRef = { results?: { name?: string } }
    await Promise.all(
      missingName.map(async (sym) => {
        try {
          const d = await massiveGet<SingleRef>(`/v3/reference/tickers/${encodeURIComponent(sym)}`)
          names.set(sym, truncateName(d?.results?.name ?? sym))
        } catch {
          names.set(sym, sym)
        }
      }),
    )
  }

  return { snapshots, names, sparks }
}

/** Mini-spark for crypto when aggregate bars are sparse — same idea as trade browse. */
function sparkFromCryptoSnapshot(s: NonNullable<Snapshot['ticker']> | undefined, lastPx: number | null): number[] {
  const prev = numFromObj(s?.prevDay, 'c', 'C', 'close')
  const n = 24
  if (lastPx != null && prev != null && prev > 0) {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 1 : i / (n - 1)
      out.push(prev + (lastPx - prev) * t)
    }
    return out
  }
  if (lastPx != null) return Array(n).fill(lastPx)
  return []
}

function lotCanonicalTicker(lot: PositionLot): string | null {
  return resolveMassiveTicker(lot.ticker) ?? normalizeTicker(lot.ticker)
}

function isLegacyPositionLot(lot: PositionLot): boolean {
  const iso = String(lot.boughtAtIso ?? '').trim()
  if (!iso) return true
  if (iso === LEGACY_LOT_TIME) return true
  const y = new Date(iso).getUTCFullYear()
  return !Number.isFinite(y) || y < 1972
}

/** Equities use US session calendar date; crypto uses UTC. */
function sameTradingCalendarDate(lotIso: string, sym: string, nowMs: number): boolean {
  const tz = sym.toUpperCase().startsWith('X:') ? 'UTC' : 'America/New_York'
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(new Date(lotIso)) === fmt.format(new Date(nowMs))
}

/**
 * When FIFO lots exist, today's $ on a line matches how the user actually built the position:
 * fills from **today** use entry → mark (aligned with total return for a same-day-only buy);
 * older / synthetic lots use the regular session move vs prior close (`perShareDay`).
 */
function todayDollarsFromLotsIfApplicable(args: {
  sym: string
  holdingShares: number
  lots: PositionLot[]
  perShareDay: number | null
  valuationPrice: number
  nowMs: number
}): number | null {
  const relevant = args.lots.filter((l) => lotCanonicalTicker(l) === args.sym)
  if (!relevant.length) return null

  let lotShares = 0
  for (const l of relevant) {
    const sh = Number.isFinite(l.shares) ? l.shares : 0
    if (sh > 0) lotShares += sh
  }
  if (Math.abs(lotShares - args.holdingShares) > 0.02) return null

  let sum = 0
  for (const lot of relevant) {
    const sh = Number.isFinite(lot.shares) ? lot.shares : 0
    if (sh <= 0) continue

    if (isLegacyPositionLot(lot)) {
      if (args.perShareDay == null || !Number.isFinite(args.perShareDay)) return null
      sum += args.perShareDay * sh
    } else if (sameTradingCalendarDate(String(lot.boughtAtIso), args.sym, args.nowMs)) {
      const ep = Number.isFinite(lot.entryPrice) ? lot.entryPrice : 0
      if (ep <= 0) return null
      sum += (args.valuationPrice - ep) * sh
    } else {
      if (args.perShareDay == null || !Number.isFinite(args.perShareDay)) return null
      sum += args.perShareDay * sh
    }
  }
  return sum
}

/** % move implied by `todayDollars` vs opening position value (or cost basis when opening ≈ 0). */
function positionTodayPct(
  todayDollars: number | null,
  marketValue: number | null,
  costBasis: number,
): number | null {
  if (todayDollars == null || !Number.isFinite(todayDollars)) return null
  if (marketValue == null || !Number.isFinite(marketValue)) return null
  const opening = marketValue - todayDollars
  if (opening > 1e-3) return (todayDollars / opening) * 100
  if (costBasis > 1e-3) return (todayDollars / costBasis) * 100
  return null
}

/** Enriched rows for holdings list / profile (Massive-backed prices and sparklines). */
export async function buildPortfolioRows(
  holdings: HoldingRecord[],
  opts?: { frozenTickerPx?: Map<string, number> | null; lots?: PositionLot[] | null },
): Promise<PortfolioApiRow[]> {
  if (!holdings.length) {
    return []
  }

  const resolved = holdings.map((h) => ({ holding: h, sym: resolveMassiveTicker(h.ticker) }))
  const knownSymbols = [...new Set(resolved.map((r) => r.sym).filter((s): s is string => !!s))]
  const { snapshots, names, sparks } = await loadPortfolioMassiveData(knownSymbols)

  const cryptoMissingPrice = knownSymbols.filter(
    (s) => s.startsWith('X:') && pickTickerSnapshotPrice(snapshots.get(s)) == null,
  )
  if (cryptoMissingPrice.length) {
    const fills = await Promise.all(
      cryptoMissingPrice.map(async (s) => [s, await pickLastCloseFromRecentAggs(s)] as const),
    )
    for (const [s, px] of fills) {
      if (px == null) continue
      const cur = snapshots.get(s)
      const merged = cur
        ? ({
            ...cur,
            lastTrade: {
              ...(typeof cur.lastTrade === 'object' && cur.lastTrade ? cur.lastTrade : {}),
              p: px,
            },
          } as NonNullable<Snapshot['ticker']>)
        : ({ lastTrade: { p: px } } as NonNullable<Snapshot['ticker']>)
      snapshots.set(s, normalizeCryptoSnapshotShape(merged) ?? merged)
    }
  }

  const rows: PortfolioApiRow[] = []
  const nowMs = Date.now()
  for (const { holding: h, sym } of resolved) {
    if (!sym) continue
    const snap = snapshots.get(sym) ?? undefined
    const frozenPx = opts?.frozenTickerPx?.get(sym)
    const useFrozen = frozenPx != null && Number.isFinite(frozenPx) && frozenPx > 0

    let lastPrice = pickStockMarkPrice(sym, snap, nowMs)
    const prevClose = numFromObj(snap?.prevDay, 'c', 'C', 'close')
    let chp = derivedChangePctFromSnapshot(sym, snap, nowMs)
    if (sym.startsWith('X:') && lastPrice != null) {
      if (prevClose != null && prevClose !== 0) {
        chp = ((lastPrice - prevClose) / prevClose) * 100
      } else {
        const open = numFromObj(snap?.day, 'o', 'O', 'open')
        if (open != null && open !== 0) chp = ((lastPrice - open) / open) * 100
      }
    }
    const shares = Number.isFinite(h.shares) ? h.shares : 0
    const avgCost = Number.isFinite(h.avgCost) && h.avgCost > 0 ? h.avgCost : 0
    const costBasis = shares * avgCost
    let valuationPrice = lastPrice ?? avgCost
    let marketValue = shares * valuationPrice
    let totalReturnDollars =
      Number.isFinite(marketValue) && Number.isFinite(costBasis) ? marketValue - costBasis : null
    let totalReturnPct =
      totalReturnDollars != null && costBasis > 0 ? (totalReturnDollars / costBasis) * 100 : null
    const rawSnap = snap as Record<string, unknown> | undefined
    const dayMoveFromSnap =
      sym.startsWith('X:')
        ? null
        : snap?.todaysChange != null && Number.isFinite(snap.todaysChange)
          ? snap.todaysChange
          : typeof rawSnap?.todays_change === 'number' && Number.isFinite(rawSnap.todays_change)
            ? rawSnap.todays_change
            : null
    const frozenPerShare = isUsEquitySymbol(sym) ? pickUsEquityFrozenDayChangePerShare(snap, nowMs) : null
    let perShareDay =
      frozenPerShare != null
        ? frozenPerShare
        : dayMoveFromSnap != null && Number.isFinite(dayMoveFromSnap)
          ? dayMoveFromSnap
          : lastPrice != null && prevClose != null
            ? lastPrice - prevClose
            : null
    let todayDollars =
      perShareDay != null && Number.isFinite(perShareDay) ? perShareDay * shares : null
    let spark = sparks.get(sym) ?? []
    if (sym.startsWith('X:') && spark.length < 2) {
      const alt = sparkFromCryptoSnapshot(snap, lastPrice)
      if (alt.length >= 2) spark = alt
    }

    if (useFrozen) {
      lastPrice = frozenPx!
      chp = null
      perShareDay = null
      todayDollars = 0
      valuationPrice = lastPrice
      marketValue = shares * valuationPrice
      totalReturnDollars =
        Number.isFinite(marketValue) && Number.isFinite(costBasis) ? marketValue - costBasis : null
      totalReturnPct =
        totalReturnDollars != null && costBasis > 0 ? (totalReturnDollars / costBasis) * 100 : null
      spark = [lastPrice, lastPrice]
    }

    if (!useFrozen) {
      const lots = opts?.lots
      if (lots?.length) {
        const fromLots = todayDollarsFromLotsIfApplicable({
          sym,
          holdingShares: shares,
          lots,
          perShareDay,
          valuationPrice,
          nowMs,
        })
        if (fromLots != null && Number.isFinite(fromLots)) {
          todayDollars = fromLots
        }
      }
    }

    const todayPct = positionTodayPct(todayDollars, marketValue, costBasis)
    const changeLabel =
      todayPct != null && Number.isFinite(todayPct) ? fmtPctSigned(todayPct) : '—'
    const positive =
      todayPct != null && Number.isFinite(todayPct)
        ? todayPct >= 0
        : todayDollars != null && Number.isFinite(todayDollars)
          ? todayDollars >= 0
          : true

    rows.push({
      ticker: sym,
      name: names.get(sym) ?? sym,
      shares,
      avgCost,
      lastPrice,
      dayChangeDollars: perShareDay,
      priceDisplay: fmtPrice(lastPrice),
      changePct: chp,
      todayPct,
      changeLabel,
      positive,
      logoUrl: `/api/stocks/${encodeURIComponent(sym)}/branding-icon`,
      sparkline: spark.length >= 2 ? spark : [lastPrice ?? avgCost, lastPrice ?? avgCost],
      totalReturnPct,
      totalReturnDollars,
      todayDollars,
      pctOfAccount: null,
      marketValue,
    })
  }

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
  let holdings: HoldingRecord[] = []
  let lots: PositionLot[] = []
  if (userId && userId.length >= 8) {
    const [h, ls] = await Promise.all([
      getLedgerHoldingsForGame(userId, gameSlug),
      getUserLots(userId, gameSlug).catch(() => [] as PositionLot[]),
    ])
    holdings = h
    lots = ls
  }
  const endSnap = await ensureGameFinalSnapshot(gameSlug)
  const frozenTickerPx = endSnap ? new Map(Object.entries(endSnap.tickerLastPx)) : undefined
  const rows = await buildPortfolioRows(holdings, { frozenTickerPx, lots: lots.length ? lots : null })
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

  const endSnap = await ensureGameFinalSnapshot(slug)
  const frozenTickerPx = endSnap ? new Map(Object.entries(endSnap.tickerLastPx)) : undefined

  let ledgerCash: number
  try {
    const ledger = await getUserLedger(userId, slug)
    ledgerCash = Number.isFinite(ledger.cash) ? ledger.cash : 0
  } catch {
    ledgerCash = 0
  }

  let holdings: HoldingRecord[]
  let lots: PositionLot[] = []
  try {
    const [h, ls] = await Promise.all([
      getLedgerHoldingsForGame(userId, slug),
      getUserLots(userId, slug).catch(() => [] as PositionLot[]),
    ])
    holdings = h
    lots = ls
  } catch {
    holdings = []
    lots = []
  }

  if (!holdings.length) {
    const net =
      endSnap?.players[userId]?.netWorth != null &&
      Number.isFinite(endSnap.players[userId]!.netWorth)
        ? Math.max(0, endSnap.players[userId]!.netWorth)
        : Math.max(0, ledgerCash)
    const out = {
      cash: ledgerCash,
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
    rows = await buildPortfolioRows(holdings, { frozenTickerPx, lots: lots.length ? lots : null })
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
      const sym = resolveMassiveTicker(h.ticker)
      const px =
        sym && frozenTickerPx?.has(sym)
          ? frozenTickerPx.get(sym)!
          : ac
      const mv = sh * (Number.isFinite(px) && px > 0 ? px : ac)
      equityMv += mv
      costBasis += sh * ac
    }
    todayDollars = 0
  }

  const netWorth = ledgerCash + equityMv
  const totalReturnDollars = equityMv - costBasis
  const totalReturnPct = costBasis > 1e-6 ? (totalReturnDollars / costBasis) * 100 : 0

  let todayPct = 0
  if (endSnap) {
    todayDollars = 0
    todayPct = 0
  } else {
    const openingEquityProxy = equityMv - todayDollars
    todayPct = openingEquityProxy > 1e-6 ? (todayDollars / openingEquityProxy) * 100 : 0
  }

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

  const endSnap = await ensureGameFinalSnapshot(slug)
  const frozenTickerPx = endSnap ? new Map(Object.entries(endSnap.tickerLastPx)) : undefined
  const [holdings, lots] = await Promise.all([
    getLedgerHoldingsForGame(userId, slug),
    getUserLots(userId, slug).catch(() => [] as PositionLot[]),
  ])
  const rows = holdings.length
    ? await buildPortfolioRows(holdings, { frozenTickerPx, lots: lots.length ? lots : null })
    : []

  const rules = await getRuntimeRules(slug)
  const gameFinished =
    !!rules?.endsAtIso &&
    Number.isFinite(new Date(rules.endsAtIso).getTime()) &&
    Date.now() > new Date(rules.endsAtIso).getTime()
  const gameFinishedBanner = gameFinished
    ? {
        headline: 'Challenge complete!',
        subline:
          'Final standings use the same closing marks for every player — your portfolio and leaderboard stay fixed after the end time.',
        rankOrdinal: standing.rankOrdinal,
        outOfLabel: standing.outOfLabel,
        endedAtLabel: new Date(rules.endsAtIso!).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      }
    : undefined

  const { gainers: gRows, losers: lRows } = slicePerformTopMovers(rows, 8)
  const topGainers = gRows.map(portfolioApiRowToPerformRow)
  const topLosers = lRows.map(portfolioApiRowToPerformRow)

  const netWorth = agg.netWorth

  return {
    gameSlug: slug,
    stats: {
      netWorth: fmtUsdSigned(netWorth),
      netWorthSub: `${fmtUsdSigned(agg.equityMarketValue)} in holdings · ${fmtUsdSigned(agg.cash)} cash`,
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
    gameFinishedBanner,
  }
}
