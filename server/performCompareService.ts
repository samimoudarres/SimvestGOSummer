import { normalizeUserId } from './followsService'
import { getGameDefinitionBySlug, resolveTimelineBoundsMs, type GameTimelineDef } from './gameDefinitionsStore'
import { listPostsForGame, type GameFeedPost } from './gameFeedService'
import { listParticipantIdsForGame } from './gameParticipantIds'
import { getGameJoinedAtIso } from './gameMembershipService'
import { getNetWorthHistory, type NwPoint } from './gameNetWorthSnapshotService'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { getPlayerPerformAggregate, type PlayerPerformAggregate } from './portfolioService'
import {
  fetchStockBars,
  fetchStockBars1DayOrLastTwoSessions,
  normalizeTicker,
  resolveMassiveTicker,
  type ChartRange,
  type StockDetailBar,
} from './stockService'
import { ensureUserProfilesBatch } from './userProfileService'
import { loadAllSetupProfilesByKey } from './userSetupProfileService'
import { resolveProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'
import { DEFAULT_STARTING_CASH, getLedgerHoldingsForGame, getUserLedger } from './userGameStateService'

const CHART_RANGES: ChartRange[] = ['1D', '5D', '1M', '3M', '1Y', '5Y']
const MS_DAY = 86_400_000

/** Default starting cash when no snapshot exists yet (matches new ledger / leaderboard fallback). */
const DEFAULT_STARTING_NET_WORTH = DEFAULT_STARTING_CASH

/** Samples along the X axis — all series are aligned to these timestamps. */
const SAMPLE_COUNT = 72

/** You = brand blue. Players = cool tones. Stocks = warm tones — intuitive vs mixing one palette by insertion order. */
const COLOR_YOU = '#0a95db'
const PLAYER_LINE_COLORS = ['#2a9d8f', '#9b59b6', '#457b9d', '#15803d']
const STOCK_LINE_COLORS = ['#e85d04', '#e63946', '#bc6c25', '#ca8a04']

export type PerformCompareSeriesKind = 'you' | 'player' | 'stock'

export type PerformCompareChartSeries = {
  id: string
  kind: PerformCompareSeriesKind
  legendLabel: string
  color: string
  values: number[]
  legendIcon?: 'clock' | 'none'
  ticker?: string
  userId?: string
  avatarUrl?: string | null
}

export type PerformCompareChartPayload = {
  gameSlug: string
  range: ChartRange
  /** Indexed level at the start of the range (always 100 for each series after normalization). */
  baselineExplanation: string
  yAxisLabels: string[]
  series: PerformCompareChartSeries[]
  /** X-axis sample timestamps (UTC ms), same length as each series `values`. */
  sampledAtMs: number[]
  /** Actual window used after calendar range + game timeline clamping. */
  domainStartMs: number
  domainEndMs: number
  /** Game definition timeline (if any) — chart domain is never before `start`. */
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

export function parsePerformChartRange(raw: string | undefined): ChartRange {
  const u = String(raw ?? '1D').toUpperCase()
  return (CHART_RANGES as readonly string[]).includes(u) ? (u as ChartRange) : '1D'
}

function rangeStartMs(range: ChartRange, endMs: number): number {
  const d = new Date(endMs)
  switch (range) {
    case '1D':
      d.setDate(d.getDate() - 1)
      break
    case '5D':
      d.setDate(d.getDate() - 5)
      break
    case '1M':
      d.setMonth(d.getMonth() - 1)
      break
    case '3M':
      d.setMonth(d.getMonth() - 3)
      break
    case '1Y':
      d.setFullYear(d.getFullYear() - 1)
      break
    case '5Y':
      d.setFullYear(d.getFullYear() - 5)
      break
    default:
      d.setFullYear(d.getFullYear() - 1)
  }
  return d.getTime()
}

function sampleTimes(startMs: number, endMs: number, count: number): number[] {
  if (count < 2) return [endMs]
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const t = startMs + ((endMs - startMs) * i) / (count - 1)
    out.push(t)
  }
  return out
}

/** Shared X-axis window for perform compare and net-worth charts (game timeline clamped). */
export type PerformChartWindow = {
  startMs: number
  endEffective: number
  sampleT: number[]
  gameTimelineStartIso?: string | null
  gameTimelineEndIso?: string | null
}

export async function resolvePerformChartWindow(
  gameSlug: string,
  range: ChartRange,
): Promise<PerformChartWindow> {
  const slug = String(gameSlug ?? '').trim()
  const now = Date.now()
  const def = await getGameDefinitionBySlug(slug)
  const rt = await getRuntimeRules(slug)
  const timelineFromDef = def?.timeline
  const timeline: GameTimelineDef | null | undefined =
    timelineFromDef ??
    (rt
      ? {
          mode: 'fixed',
          startIso: rt.startsAtIso,
          endIso: rt.endsAtIso,
        }
      : undefined)
  const bounds = resolveTimelineBoundsMs(timeline ?? null, now)
  const gameStartMs = bounds.startMs
  const gameEndMs = bounds.endMs

  let endEffective = now
  if (gameEndMs != null && endEffective > gameEndMs) {
    endEffective = gameEndMs
  }

  let startMs = rangeStartMs(range, endEffective)
  /**
   * Catalog games (definition timeline): never chart before official open.
   * Runtime / template "new" games: use full market range so MTM curves are not flat lines
   * when the challenge started recently (same behavior users see in long-running contests).
   */
  const clampChartStartToGameOpen =
    Boolean(timelineFromDef) && def != null && def.slug !== 'new' && gameStartMs != null
  if (clampChartStartToGameOpen) {
    startMs = Math.max(startMs, gameStartMs)
  }
  if (startMs >= endEffective) {
    startMs = endEffective - MS_DAY
  }
  if (clampChartStartToGameOpen) {
    startMs = Math.max(startMs, gameStartMs)
  }

  const sampleT = sampleTimes(startMs, endEffective, SAMPLE_COUNT)
  return {
    startMs,
    endEffective,
    sampleT,
    gameTimelineStartIso: bounds.startIso,
    gameTimelineEndIso: bounds.endIso,
  }
}

export type PlayerNetWorthChartBar = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** Dollar net worth over time — cash plus current holdings marked to Massive prices at each sample. */
export type PlayerNetWorthChartPayload = {
  gameSlug: string
  userId: string
  range: ChartRange
  bars: PlayerNetWorthChartBar[]
  liveNetWorth: number
  asOfIso: string
  domainStartMs: number
  domainEndMs: number
  gameTimelineStartIso?: string | null
  gameTimelineEndIso?: string | null
}

type TimelinePoint = { t: number; n: number }

type TradeEvent = {
  t: number
  side: 'buy' | 'sell'
  ticker: string
  shares: number
  fillPrice: number
  orderTotal: number
}

function parseMoneyAmount(raw: string | undefined): number | null {
  const n = Number.parseFloat(String(raw ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseShareAmount(raw: string | undefined): number | null {
  const n = Number.parseFloat(String(raw ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

function tradePostSide(p: GameFeedPost): 'buy' | 'sell' {
  if (p.side === 'sell') return 'sell'
  if (p.side === 'buy') return 'buy'
  return String(p.tradeTitle ?? '').toLowerCase().includes('sell') ? 'sell' : 'buy'
}

async function loadUserTradeEvents(gameSlug: string, userId: string): Promise<TradeEvent[]> {
  const uid = normalizeUserId(userId)
  if (!uid) return []
  let posts: GameFeedPost[] = []
  try {
    posts = await listPostsForGame(gameSlug)
  } catch {
    return []
  }

  const out: TradeEvent[] = []
  for (const p of posts) {
    if ((p.postKind ?? 'trade') !== 'trade') continue
    if (normalizeUserId(p.userId) !== uid) continue
    const t = new Date(p.timestampIso).getTime()
    if (!Number.isFinite(t)) continue
    const ticker = resolveMassiveTicker(p.tickerSymbol)
    if (!ticker) continue
    const shares = parseShareAmount(p.sharesBought)
    if (shares == null) continue
    const orderTotalRaw = parseMoneyAmount(p.orderTotal)
    const fillPriceRaw = typeof p.purchasePrice === 'number' && Number.isFinite(p.purchasePrice) ? p.purchasePrice : null
    const fillPrice = fillPriceRaw ?? (orderTotalRaw != null ? orderTotalRaw / shares : null)
    const orderTotal = orderTotalRaw ?? (fillPrice != null ? fillPrice * shares : null)
    if (fillPrice == null || fillPrice <= 0 || orderTotal == null || orderTotal <= 0) continue
    out.push({ t, side: tradePostSide(p), ticker, shares, fillPrice, orderTotal })
  }
  return out.sort((a, b) => a.t - b.t)
}

/** Sort by time; same-ms events keep the last net worth (latest wins). */
function mergeTimelineSorted(points: TimelinePoint[]): TimelinePoint[] {
  const valid = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.n))
  valid.sort((a, b) => a.t - b.t)
  const out: TimelinePoint[] = []
  for (const p of valid) {
    if (out.length && out[out.length - 1]!.t === p.t) {
      out[out.length - 1]!.n = p.n
    } else {
      out.push({ t: p.t, n: p.n })
    }
  }
  return out
}

/** Last known net worth at or before `t` (step chart). Before first snapshot, starting cash. */
function netWorthStep(sorted: TimelinePoint[], t: number): number {
  if (sorted.length === 0) return DEFAULT_STARTING_NET_WORTH
  if (t < sorted[0]!.t) return DEFAULT_STARTING_NET_WORTH
  let v = sorted[0]!.n
  for (const p of sorted) {
    if (p.t <= t) v = p.n
    else break
  }
  return v
}

async function buildPlayerTimeline(
  gameSlug: string,
  userId: string,
  liveNw: number,
  liveMs: number,
): Promise<TimelinePoint[]> {
  const hist = await getNetWorthHistory(gameSlug, userId)
  const raw: TimelinePoint[] = hist
    .map((p: NwPoint) => ({
      t: new Date(p.recordedAt).getTime(),
      n: p.netWorth,
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.n))

  let sorted = mergeTimelineSorted(raw)

  const joinedIso = await getGameJoinedAtIso(userId, gameSlug)
  if (sorted.length > 0 && joinedIso) {
    const joinMs = new Date(joinedIso).getTime()
    if (Number.isFinite(joinMs) && joinMs < sorted[0]!.t - 60_000) {
      sorted = mergeTimelineSorted([{ t: joinMs, n: DEFAULT_STARTING_NET_WORTH }, ...sorted])
    }
  }

  if (sorted.length === 0) {
    return [
      { t: liveMs - 60_000, n: DEFAULT_STARTING_NET_WORTH },
      { t: liveMs, n: liveNw },
    ]
  }

  /* Live reading must win over the last snapshot written in the same millisecond. */
  const last = sorted[sorted.length - 1]!
  if (last.t === liveMs) {
    last.n = liveNw
  } else {
    sorted.push({ t: liveMs, n: liveNw })
  }

  /* If every stored point is in the future (clock skew), keep a sane anchor. */
  const minT = sorted[0]!.t
  if (minT > liveMs - 1000) {
    sorted = mergeTimelineSorted([
      { t: liveMs - 86_400_000, n: DEFAULT_STARTING_NET_WORTH },
      ...sorted,
    ])
  }

  return mergeTimelineSorted(sorted)
}

/**
 * Windowed Massive requests sometimes return 0–1 bars (calendar collapse, holidays, sparse edge).
 * Without at least two distinct closes, resampling is flat. Fall back to a full-range fetch for
 * the same `range`, then clip to the chart window (and finally keep unclipped if still sparse).
 */
async function ensureMassiveBarsForChartWindow(
  sym: string,
  range: ChartRange,
  chartWindow: { startMs: number; endMs: number },
): Promise<StockDetailBar[]> {
  const win = { windowStartMs: chartWindow.startMs, windowEndMs: chartWindow.endMs }
  let bars = await fetchStockBars(sym, range, win)
  let ordered = [...bars].sort((a, b) => a.t - b.t)
  if (ordered.length >= 2) return ordered

  const lo = chartWindow.startMs - 3 * MS_DAY
  const hi = chartWindow.endMs + MS_DAY
  try {
    const wide =
      range === '1D'
        ? await fetchStockBars1DayOrLastTwoSessions(sym)
        : await fetchStockBars(sym, range)
    ordered = wide.filter((b) => b.t >= lo && b.t <= hi).sort((a, b) => a.t - b.t)
    if (ordered.length >= 2) return ordered
    ordered = [...wide].sort((a, b) => a.t - b.t)
  } catch {
    /* keep first attempt */
  }
  return ordered
}

async function computeMarkToMarketNetWorthSeries(
  gameSlug: string,
  userId: string,
  range: ChartRange,
  sampleT: number[],
  chartWindow: { startMs: number; endMs: number },
): Promise<number[]> {
  const slug = String(gameSlug ?? '').trim()
  const n = sampleT.length
  if (n < 1) return []

  const tradeEventsAll = await loadUserTradeEvents(slug, userId)
  const tradeTickersAll = [...new Set(tradeEventsAll.map((e) => e.ticker))]

  let currentCash = 0
  try {
    const ledger = await getUserLedger(userId, slug)
    currentCash = Number.isFinite(ledger.cash) ? ledger.cash : 0
  } catch {
    currentCash = 0
  }

  let holdings: Awaited<ReturnType<typeof getLedgerHoldingsForGame>> = []
  try {
    holdings = await getLedgerHoldingsForGame(userId, slug)
  } catch {
    holdings = []
  }
  const active = holdings.filter((h) => h.shares > 1e-9 && Number.isFinite(h.shares))

  const tradeTickerSet = new Set(tradeTickersAll)
  /** Feed-derived events can omit symbols (e.g. some crypto posts); replay would drop those positions from MTM. */
  const feedCoversAllLedgerPositions = !active.some((h) => {
    const s = resolveMassiveTicker(h.ticker)
    return s ? !tradeTickerSet.has(s) : false
  })
  const replayFromFeed = tradeEventsAll.length > 0 && feedCoversAllLedgerPositions
  const tradeEvents = replayFromFeed ? tradeEventsAll : []
  const tradeTickers = replayFromFeed ? tradeTickersAll : []

  if (tradeTickers.length === 0 && active.length === 0) {
    return sampleT.map(() => Math.max(0, currentCash))
  }

  type PriceRow = { ticker: string; shares?: number; avgCost: number; prices: number[] }
  const HOLDINGS_PARALLEL = 10

  const loadRow = async (input: { ticker: string; shares?: number; avgCost: number }): Promise<PriceRow> => {
    const shares = input.shares
    const avgCost = input.avgCost > 0 && Number.isFinite(input.avgCost) ? input.avgCost : 0.01
    const sym = resolveMassiveTicker(input.ticker)
    if (!sym) {
      return { ticker: input.ticker, shares, avgCost, prices: sampleT.map(() => avgCost) }
    }
    let bars: StockDetailBar[] = []
    try {
      bars = await ensureMassiveBarsForChartWindow(sym, range, chartWindow)
    } catch {
      bars = []
    }
    if (!bars.length) {
      return { ticker: sym, shares, avgCost, prices: sampleT.map(() => avgCost) }
    }
    const ordered = [...bars].sort((a, b) => a.t - b.t)
    const barT = ordered.map((b) => b.t)
    const barC = ordered.map((b) => b.c)
    const raw = resampleClosesAtTimes(barT, barC, sampleT)
    let lastGood = avgCost
    const prices = raw.map((p) => {
      if (Number.isFinite(p) && p > 0) {
        lastGood = p
        return p
      }
      return lastGood
    })
    return { ticker: sym, shares, avgCost, prices }
  }

  const rows: PriceRow[] = []
  const priceInputs =
    tradeTickers.length > 0
      ? tradeTickers.map((ticker) => {
          const event = tradeEvents.find((e) => e.ticker === ticker)
          return { ticker, avgCost: event?.fillPrice ?? 0.01 }
        })
      : active.map((h) => ({ ticker: h.ticker, shares: h.shares, avgCost: h.avgCost }))

  for (let i = 0; i < priceInputs.length; i += HOLDINGS_PARALLEL) {
    const slice = priceInputs.slice(i, i + HOLDINGS_PARALLEL)
    const part = await Promise.all(slice.map((h) => loadRow(h)))
    rows.push(...part)
  }

  if (tradeEvents.length > 0) {
    const priceByTicker = new Map(rows.map((r) => [r.ticker, r.prices]))
    const lotsByTicker = new Map<string, { shares: number; entryPrice: number }[]>()
    let cash = DEFAULT_STARTING_NET_WORTH
    let cursor = 0
    const out: number[] = []

    for (let i = 0; i < n; i++) {
      const t = sampleT[i]!
      while (cursor < tradeEvents.length && tradeEvents[cursor]!.t <= t) {
        const ev = tradeEvents[cursor]!
        if (ev.side === 'buy') {
          cash -= ev.orderTotal
          const lots = lotsByTicker.get(ev.ticker) ?? []
          lots.push({ shares: ev.shares, entryPrice: ev.fillPrice })
          lotsByTicker.set(ev.ticker, lots)
        } else {
          cash += ev.orderTotal
          let remaining = ev.shares
          const lots = lotsByTicker.get(ev.ticker) ?? []
          const next: { shares: number; entryPrice: number }[] = []
          for (const lot of lots) {
            if (remaining <= 1e-9) {
              next.push(lot)
              continue
            }
            if (lot.shares <= remaining + 1e-9) {
              remaining -= lot.shares
            } else {
              next.push({ ...lot, shares: lot.shares - remaining })
              remaining = 0
            }
          }
          lotsByTicker.set(ev.ticker, next)
        }
        cursor += 1
      }

      let equity = 0
      for (const [ticker, lots] of lotsByTicker.entries()) {
        const prices = priceByTicker.get(ticker)
        const px = prices?.[i]
        for (const lot of lots) {
          equity += lot.shares * (Number.isFinite(px) && px! > 0 ? px! : lot.entryPrice)
        }
      }
      out.push(Math.max(0, cash + equity))
    }
    return out
  }

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    let eq = 0
    for (const r of rows) {
      eq += (r.shares ?? 0) * r.prices[i]!
    }
    out.push(Math.max(0, currentCash + eq))
  }
  return out
}

function resampleClosesAtTimes(
  barT: number[],
  barC: number[],
  sampleT: number[],
): number[] {
  if (!barT.length || !barC.length) return sampleT.map(() => NaN)
  const ts = barT
  const vs = barC
  return sampleT.map((t) => {
    if (t <= ts[0]!) return vs[0]!
    if (t >= ts[ts.length - 1]!) return vs[vs.length - 1]!
    let lo = 0
    let hi = ts.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (ts[mid]! <= t) lo = mid
      else hi = mid
    }
    const t0 = ts[lo]!
    const t1 = ts[lo + 1]!
    const v0 = vs[lo]!
    const v1 = vs[lo + 1]!
    if (Math.abs(t1 - t0) < 1e-9) return v0
    const r = (t - t0) / (t1 - t0)
    return v0 + r * (v1 - v0)
  })
}

export async function buildPlayerNetWorthChart(
  gameSlug: string,
  userId: string,
  range: ChartRange,
): Promise<PlayerNetWorthChartPayload | null> {
  if (!userId || userId.length < 8) return null
  const slug = String(gameSlug ?? '').trim()
  const w = await resolvePerformChartWindow(slug, range)
  const agg = await getPlayerPerformAggregate(slug, userId)
  if (!agg) return null
  const chartWin = { startMs: w.startMs, endMs: w.endEffective }
  let dollars = await computeMarkToMarketNetWorthSeries(slug, userId, range, w.sampleT, chartWin)
  if (!dollars.length || dollars.length !== w.sampleT.length) {
    const timeline = await buildPlayerTimeline(slug, userId, agg.netWorth, w.endEffective)
    dollars = w.sampleT.map((t) => netWorthStep(timeline, t))
  } else {
    dollars = [...dollars]
    dollars[dollars.length - 1] = agg.netWorth
  }
  const bars: PlayerNetWorthChartBar[] = w.sampleT.map((t, i) => {
    const c = dollars[i] ?? agg.netWorth
    return { t, o: c, h: c, l: c, c, v: 0 }
  })
  return {
    gameSlug: slug,
    userId,
    range,
    bars,
    liveNetWorth: agg.netWorth,
    asOfIso: new Date().toISOString(),
    domainStartMs: w.startMs,
    domainEndMs: w.endEffective,
    gameTimelineStartIso: w.gameTimelineStartIso,
    gameTimelineEndIso: w.gameTimelineEndIso,
  }
}

async function indexedPlayerSeries(
  gameSlug: string,
  userId: string,
  range: ChartRange,
  sampleT: number[],
  chartWindow: { startMs: number; endMs: number },
  precomputedAgg: PlayerPerformAggregate | null,
): Promise<number[] | null> {
  if (sampleT.length < 2) return null
  const agg = precomputedAgg ?? (await getPlayerPerformAggregate(gameSlug, userId))
  if (!agg) return null
  let mtm = await computeMarkToMarketNetWorthSeries(gameSlug, userId, range, sampleT, chartWindow)
  if (!mtm.length || mtm.length !== sampleT.length) {
    const endEffective = sampleT[sampleT.length - 1]!
    const timeline = await buildPlayerTimeline(gameSlug, userId, agg.netWorth, endEffective)
    mtm = sampleT.map((t) => netWorthStep(timeline, t))
  } else {
    mtm = [...mtm]
    mtm[mtm.length - 1] = agg.netWorth
  }
  const anchor = mtm[0]!
  const safeAnchor = Math.abs(anchor) > 1e-6 ? anchor : DEFAULT_STARTING_NET_WORTH
  return mtm.map((v) => (100 * v) / safeAnchor)
}

async function indexedStockSeries(
  ticker: string,
  range: ChartRange,
  sampleT: number[],
  chartWindow: { startMs: number; endMs: number },
): Promise<number[] | null> {
  const sym = normalizeTicker(ticker)
  if (!sym) return null
  let bars: StockDetailBar[] = []
  try {
    bars = await ensureMassiveBarsForChartWindow(sym, range, chartWindow)
  } catch {
    bars = []
  }
  if (!bars.length) return null
  const ordered = [...bars].sort((a, b) => a.t - b.t)
  const barT = ordered.map((b) => b.t)
  const barC = ordered.map((b) => b.c).filter((c) => Number.isFinite(c) && c > 0)
  if (barC.length !== ordered.length) return null
  const prices = resampleClosesAtTimes(barT, ordered.map((b) => b.c), sampleT)
  const anchor = prices[0]!
  if (!Number.isFinite(anchor) || anchor < 1e-9) return null
  return prices.map((p) => (Number.isFinite(p) ? (p / anchor) * 100 : 100))
}

export function parseCompareWithParam(raw: string): { userIds: string[]; tickers: string[] } {
  const userIds: string[] = []
  const tickers: string[] = []
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const p of parts) {
    const low = p.toLowerCase()
    if (low.startsWith('user:')) {
      const id = normalizeUserId(p.slice(5))
      if (id) userIds.push(id)
      continue
    }
    if (low.startsWith('stock:')) {
      const t = resolveMassiveTicker(p.slice(6))
      if (t) tickers.push(t)
    }
  }
  return { userIds: [...new Set(userIds)], tickers: [...new Set(tickers)] }
}

function fmtIndexedAxis(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n - Math.round(n)) < 0.05) return `${Math.round(n)}`
  return n.toFixed(1)
}

function buildIndexedYAxisLabels(series: PerformCompareChartSeries[], visibleIds: Set<string>): string[] {
  let min = Infinity
  let max = -Infinity
  for (const s of series) {
    if (!visibleIds.has(s.id)) continue
    for (const v of s.values) {
      if (!Number.isFinite(v)) continue
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return ['105', '102', '100', '98', '95']
    }
  const pad = Math.max((max - min) * 0.08, 0.5)
  const hi = max + pad
  const lo = min - pad
  const q1 = hi - (hi - lo) * 0.25
  const mid = (hi + lo) / 2
  const q3 = lo + (hi - lo) * 0.25
  return [fmtIndexedAxis(hi), fmtIndexedAxis(q1), fmtIndexedAxis(mid), fmtIndexedAxis(q3), fmtIndexedAxis(lo)]
}

async function displayNameForUser(gameSlug: string, userId: string): Promise<string> {
  const setups = await loadAllSetupProfilesByKey()
  const setup = setups.get(`${userId}:::${gameSlug}`)
  if (setup) {
    const n = `${setup.firstName} ${setup.lastName}`.trim()
    if (n) return n
  }
  const map = await ensureUserProfilesBatch([userId])
  return map.get(userId)?.displayName ?? 'Player'
}

async function avatarForUser(gameSlug: string, userId: string): Promise<string> {
  const setups = await loadAllSetupProfilesByKey()
  const setup = setups.get(`${userId}:::${gameSlug}`)
  const map = await ensureUserProfilesBatch([userId])
  const fromSetup = setup?.avatarUrl
  const fromProf = map.get(userId)?.avatarUrl
  const raw =
    (typeof fromSetup === 'string' && fromSetup.length > 0 ? fromSetup : null) ??
    (typeof fromProf === 'string' && fromProf.length > 0 ? fromProf : null) ??
    ''
  return resolveProfileAvatarUrl(raw)
}

const MAX_EXTRA_SERIES = 5

export async function fetchPerformCompareCandidates(
  gameSlug: string,
  viewerId: string | null,
): Promise<PerformCompareCandidatesPayload> {
  const slug = String(gameSlug ?? '').trim()
  const ids = await listParticipantIdsForGame(slug)
  const others = ids.filter((id) => id !== viewerId && id.length >= 8)
  const profiles = await ensureUserProfilesBatch(others)
  const setupsByKey = await loadAllSetupProfilesByKey()

  const players: PerformCompareCandidatePlayer[] = []
  for (const uid of others) {
    const setup = setupsByKey.get(`${uid}:::${slug}`)
    const profile = profiles.get(uid)
    const displayName = setup
      ? `${setup.firstName} ${setup.lastName}`.trim()
      : (profile?.displayName ?? 'Player')
    const avatarUrl = resolveProfileAvatarUrl(
      (setup?.avatarUrl && setup.avatarUrl.length > 0 ? setup.avatarUrl : null) ??
        (profile?.avatarUrl && profile.avatarUrl.length > 0 ? profile.avatarUrl : null) ??
        '',
    )
    players.push({
      userId: uid,
      displayName: displayName || 'Player',
      avatarUrl,
    })
  }
  players.sort((a, b) => a.displayName.localeCompare(b.displayName))
  return { viewerId: viewerId && viewerId.length >= 8 ? viewerId : null, players }
}

export async function buildPerformCompareChart(
  gameSlug: string,
  viewerUserId: string | null | undefined,
  range: ChartRange,
  withParam: string,
): Promise<PerformCompareChartPayload> {
  const slug = String(gameSlug ?? '').trim()
  const now = Date.now()
  const emptyPayload = (extra?: Partial<PerformCompareChartPayload>): PerformCompareChartPayload => ({
    gameSlug: slug,
    range,
    baselineExplanation: '',
    yAxisLabels: ['100'],
    series: [],
    sampledAtMs: [],
    domainStartMs: now,
    domainEndMs: now,
    ...extra,
  })

  if (!viewerUserId || viewerUserId.length < 8) {
    return emptyPayload({
      warnings: ['Sign in to see your performance chart.'],
    })
  }

  const w = await resolvePerformChartWindow(slug, range)
  const { startMs, endEffective, sampleT, gameTimelineStartIso, gameTimelineEndIso } = w

  const { userIds: extraUsers, tickers } = parseCompareWithParam(withParam)

  const participants = new Set(await listParticipantIdsForGame(slug))
  participants.add(viewerUserId)

  const warnings: string[] = []
  const allowedExtras: string[] = []
  let usedSlots = 0
  for (const uid of extraUsers) {
    if (usedSlots >= MAX_EXTRA_SERIES) {
      warnings.push('Maximum number of comparisons reached.')
      break
    }
    if (!participants.has(uid)) {
      warnings.push(`Player not in this game: ${uid.slice(0, 8)}…`)
      continue
    }
    if (uid === viewerUserId) continue
    allowedExtras.push(uid)
    usedSlots += 1
  }

  const allowedTickers: string[] = []
  for (const t of tickers) {
    if (usedSlots >= MAX_EXTRA_SERIES) {
      warnings.push('Some stock comparisons were skipped (limit reached).')
      break
    }
    allowedTickers.push(t)
    usedSlots += 1
  }

  const series: PerformCompareChartSeries[] = []
  let playerColorIdx = 0
  let stockColorIdx = 0

  const chartWin = { startMs, endMs: endEffective }

  const viewerAgg = await getPlayerPerformAggregate(slug, viewerUserId)
  if (!viewerAgg) {
    return emptyPayload({
      warnings: ['Could not load your portfolio for this game.'],
    })
  }

  const youVals = await indexedPlayerSeries(slug, viewerUserId, range, sampleT, chartWin, viewerAgg)
  if (!youVals) {
    return emptyPayload({
      warnings: ['Could not load your performance for this game.'],
    })
  }

  series.push({
    id: 'you',
    kind: 'you',
    legendLabel: 'You',
    color: COLOR_YOU,
    values: youVals,
    userId: viewerUserId,
    avatarUrl: await avatarForUser(slug, viewerUserId),
  })

  for (const uid of allowedExtras) {
    const agg = await getPlayerPerformAggregate(slug, uid)
    if (!agg) {
      warnings.push('Could not load data for a player.')
      continue
    }
    const vals = await indexedPlayerSeries(slug, uid, range, sampleT, chartWin, agg)
    if (!vals) {
      warnings.push('Could not load data for a player.')
      continue
    }
    const label = await displayNameForUser(slug, uid)
    series.push({
      id: `user:${uid}`,
      kind: 'player',
      legendLabel: label,
      color: PLAYER_LINE_COLORS[playerColorIdx++ % PLAYER_LINE_COLORS.length]!,
      values: vals,
      userId: uid,
      avatarUrl: await avatarForUser(slug, uid),
    })
  }

  for (const t of allowedTickers) {
    try {
      const vals = await indexedStockSeries(t, range, sampleT, {
        startMs: w.startMs,
        endMs: w.endEffective,
      })
      if (!vals) {
        warnings.push(`No chart data for ${t}.`)
        continue
      }
      series.push({
        id: `stock:${t}`,
        kind: 'stock',
        legendLabel: t,
        color: STOCK_LINE_COLORS[stockColorIdx++ % STOCK_LINE_COLORS.length]!,
        values: vals,
        ticker: t,
      })
    } catch {
      warnings.push(`Could not load market data for ${t}.`)
    }
  }

  const visibleIds = new Set(series.map((s) => s.id))
  const yAxisLabels = buildIndexedYAxisLabels(series, visibleIds)

  return {
    gameSlug: slug,
    range,
    baselineExplanation:
      'Player lines use your current holdings and cash, valued at each point from Massive price history, indexed to 100 at the left edge (same positions as PERFORM; last point matches live net worth). Stock lines are share price indexed the same way.',
    yAxisLabels,
    series,
    sampledAtMs: sampleT,
    domainStartMs: startMs,
    domainEndMs: endEffective,
    gameTimelineStartIso,
    gameTimelineEndIso,
    warnings: warnings.length ? warnings : undefined,
  }
}
