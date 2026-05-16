import { getFollowTickersForGame } from './followsService'
import { massiveGet } from './massiveClient'
import {
  fetchStockBars1DayOrLastTwoSessions,
  normalizeCryptoCompositeTicker,
  normalizeCryptoSnapshotShape,
  normalizeTicker,
  pickLastCloseFromRecentAggs,
  pickTickerSnapshotPrice,
  resolveMassiveTicker,
  unwrapCryptoSnapshotBody,
} from './stockService'

export type TradeCategoryId =
  | 'popular'
  | 'crypto'
  | 'following'
  | 'indexfunds'
  | 'etf'
  | 'gainers'
  | 'losers'
  | 'tech'
  | 'healthcare'
  | 'energy'
  | 'finance'
  | 'industrial'
  | 'consumer'
  | 'infrastructure'
  | 'utilities'
  | 'active'

/**
 * Figma column-major order (Figma node 192:1835) — items wrap top-to-bottom into a 2-row
 * horizontal-scroll strip, so this list is the *visual* order: column 1 top, column 1 bottom,
 * column 2 top, column 2 bottom, … Keep in sync with `src/trade/tradeTypes.ts`.
 *
 * IDs are all lowercase so the `/trade/browse?category=` route's `.toLowerCase()` defensive
 * normalization passes them through unchanged.
 */
export const TRADE_CATEGORY_OPTIONS: { id: TradeCategoryId; label: string }[] = [
  { id: 'popular', label: 'Popular' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'following', label: 'Following' },
  { id: 'indexfunds', label: 'Index Funds' },
  { id: 'etf', label: 'ETFs' },
  { id: 'gainers', label: 'Top Gainers' },
  { id: 'losers', label: 'Top Losers' },
  { id: 'tech', label: 'Technology' },
  { id: 'healthcare', label: 'Health' },
  { id: 'energy', label: 'Energy' },
  { id: 'finance', label: 'Financial' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'consumer', label: 'Consumer' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'active', label: 'Most Active' },
]

const CATEGORY_IDS = new Set<string>(TRADE_CATEGORY_OPTIONS.map((c) => c.id))

export function isTradeCategory(id: string): id is TradeCategoryId {
  return CATEGORY_IDS.has(id)
}

export type TradeBrowseRow = {
  symbol: string
  companyName: string
  price: string
  changeLabel: string
  positive: boolean
  logoUrl: string
  sparkline: number[]
}

type SnapTicker = {
  ticker?: string
  day?: { c?: number; o?: number; v?: number }
  prevDay?: { c?: number }
  lastTrade?: { p?: number }
  lastQuote?: { p?: number; P?: number }
  min?: { c?: number }
  todaysChange?: number
  todaysChangePerc?: number
}

type MoversResponse = { tickers?: SnapTicker[] }
type BatchStocksResponse = { tickers?: unknown[] }

/** Polygon sometimes nests snapshot fields under `ticker`; flatten for price / change / volume. */
function flattenSnapshotRow(row: unknown): SnapTicker | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const tk = o.ticker
  if (tk && typeof tk === 'object') {
    const n = tk as Record<string, unknown>
    const sym = (typeof n.ticker === 'string' ? n.ticker : undefined) ?? (typeof o.ticker === 'string' ? o.ticker : undefined)
    return { ...o, ...n, ticker: sym } as SnapTicker
  }
  return o as SnapTicker
}

/** Massive often returns snake_case on crypto (and sometimes stock) snapshots — align before pricing. */
function applyMassiveSnapshotAliases(row: SnapTicker | null): SnapTicker | null {
  if (!row) return null
  const n = normalizeCryptoSnapshotShape(row as never)
  return (n ? ({ ...row, ...n } as SnapTicker) : row)
}
type RefTickerRow = { ticker?: string; name?: string; market_cap?: number }
type RefTickersResponse = { results?: RefTickerRow[] }

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

function fmtPrice(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Last price for sub-$1 assets (many crypto pairs) so rows are not rounded to $0.00. */
function fmtLastPrice(sym: string, n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  if (sym.startsWith('X:')) {
    if (n > 0 && n < 0.0001) {
      return `$${n.toExponential(2)}`
    }
    if (n > 0 && n < 1) {
      return `$${n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`
    }
  }
  return fmtPrice(n)
}

function fmtPctSigned(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function numFromObj(o: unknown, ...keys: string[]): number | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    if (typeof v === 'string') {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

function pickPrice(s: SnapTicker | undefined): number | null {
  return pickTickerSnapshotPrice(s as never)
}

/** Use snapshot % change when present; else derive like the stock detail screen (stocks + crypto). */
function changePctFromSnap(s: SnapTicker | undefined): number | null {
  if (!s) return null
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
  const last = pickPrice(s)
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

function truncateName(name: string, max = 22): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1).trim()}…`
}

/** Readable label when we skip `/v3/reference/tickers` for crypto (faster browse). */
function cryptoPairDisplayName(sym: string): string {
  if (!sym.startsWith('X:')) return sym
  const pair = sym.slice(2)
  const m = pair.match(/^(.+?)(USD|USDT|EUR|GBP|USDC|DAI)$/)
  if (m) return `${m[1]} / ${m[2]}`
  const m2 = pair.match(/^(.+)(BTC|ETH)$/)
  if (m2) return `${m2[1]} / ${m2[2]}`
  return pair
}

async function failNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

/**
 * Crypto trade rows: spark from snapshot only (no per-row aggregate API — N× aggs causes timeouts / 429s).
 * Renders like a tiny trend from prior close → last, same point count as stocks for MiniSparkLine.
 */
function cryptoSparkFromSnapshot(snap: SnapTicker | undefined): number[] {
  const last = pickPrice(snap)
  const prev = numFromObj(snap?.prevDay, 'c', 'C', 'close')
  const n = 24
  if (last != null && prev != null && Number.isFinite(last) && Number.isFinite(prev) && prev > 0) {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 1 : i / (n - 1)
      out.push(prev + (last - prev) * t)
    }
    return out
  }
  if (last != null && Number.isFinite(last)) {
    return Array(n).fill(last)
  }
  return [1, 1]
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

/**
 * Per-ticker spark cache — keep TTL aligned with client quote polls so browse/search sparklines
 * do not sit on old closes while headline prices refresh.
 */
const STOCK_SPARK_CACHE_MS = 5_000
const stockSparkCache = new Map<string, { exp: number; data: number[] }>()
const stockSparkInflight = new Map<string, Promise<number[]>>()

async function sparkFor(sym: string): Promise<number[]> {
  const now = Date.now()
  const hit = stockSparkCache.get(sym)
  if (hit && hit.exp > now) return hit.data

  const pending = stockSparkInflight.get(sym)
  if (pending) return pending

  const work = (async (): Promise<number[]> => {
    const bars = await failNull(fetchStockBars1DayOrLastTwoSessions(sym))
    const closes = (bars ?? []).map((b) => b.c).filter((c) => typeof c === 'number' && Number.isFinite(c))
    const data = downsampleCloses(closes, 24)
    if (data.length >= 2) {
      stockSparkCache.set(sym, { exp: Date.now() + STOCK_SPARK_CACHE_MS, data })
    }
    return data
  })()

  stockSparkInflight.set(sym, work)
  try {
    return await work
  } finally {
    stockSparkInflight.delete(sym)
  }
}

/** Parallel fetch of just the stock sparks (crypto are derived from snapshots elsewhere). */
async function stockSparkBatch(stockSyms: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  for (const chunk of chunkArray(stockSyms, 10)) {
    const part = await Promise.all(chunk.map(async (s) => [s, await sparkFor(s)] as const))
    for (const [s, sp] of part) {
      map.set(s, sp)
    }
  }
  return map
}

const POPULAR: readonly string[] = [
  'AAPL',
  'MSFT',
  'GOOGL',
  'AMZN',
  'NVDA',
  'META',
  'TSLA',
  'AVGO',
  'AMD',
  'NFLX',
  'JPM',
  'V',
  'XOM',
  'UNH',
  'LLY',
  'WMT',
  'DIS',
  'INTC',
  'PEP',
  'KO',
  'COST',
  'PG',
  'BAC',
  'ORCL',
  'CRM',
]

const TECH: readonly string[] = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AVGO',
  'AMD',
  'INTC',
  'ORCL',
  'CRM',
  'ADBE',
  'NOW',
  'QCOM',
  'MRVL',
  'SNOW',
  'PANW',
  'MU',
]

const FINANCE: readonly string[] = [
  'JPM',
  'BAC',
  'GS',
  'MS',
  'WFC',
  'C',
  'BLK',
  'SCHW',
  'AXP',
  'COF',
  'USB',
  'PNC',
  'TFC',
  'BK',
  'SPGI',
]

const HEALTHCARE: readonly string[] = [
  'UNH',
  'JNJ',
  'LLY',
  'PFE',
  'MRK',
  'ABBV',
  'TMO',
  'ABT',
  'DHR',
  'BMY',
  'AMGN',
  'GILD',
  'CVS',
  'CI',
  'ISRG',
]

const ENERGY: readonly string[] = [
  'XOM',
  'CVX',
  'COP',
  'SLB',
  'EOG',
  'MPC',
  'VLO',
  'OXY',
  'PSX',
  'WMB',
  'KMI',
  'HAL',
  'BKR',
  'DVN',
  'FANG',
]

const INDUSTRIAL: readonly string[] = [
  'GE',
  'CAT',
  'HON',
  'BA',
  'UNP',
  'UPS',
  'LMT',
  'RTX',
  'MMM',
  'DE',
  'EMR',
  'ETN',
  'ITW',
  'NOC',
  'GD',
]

/**
 * Consumer / retail names — replaces the Figma "Real Estate" slot because Massive's
 * branding logos for major REITs are sparse and the user requested a category with a
 * deeper bench of liquid, well-known tickers. All entries have working snapshot data
 * and stable brand iconography.
 */
const CONSUMER: readonly string[] = [
  'AMZN',
  'WMT',
  'COST',
  'HD',
  'NKE',
  'MCD',
  'SBUX',
  'KO',
  'PEP',
  'PG',
  'TGT',
  'LOW',
  'DIS',
  'NFLX',
  'TJX',
]

const INFRASTRUCTURE: readonly string[] = [
  'BIP',
  'BAM',
  'BEP',
  'AWK',
  'KMI',
  'ENB',
  'ET',
  'CCI',
  'AMT',
  'EQIX',
  'AWR',
  'WTRG',
  'NEE',
  'MUSA',
  'PWR',
]

const UTILITIES: readonly string[] = [
  'NEE',
  'DUK',
  'SO',
  'AEP',
  'EXC',
  'D',
  'ED',
  'PCG',
  'XEL',
  'WEC',
  'ETR',
  'SRE',
  'PEG',
  'ES',
  'AEE',
]

/** Curated list of broad-market and sector index ETFs used for the Figma "Index Funds" card. */
const INDEX_FUNDS: readonly string[] = [
  'SPY',
  'VOO',
  'IVV',
  'QQQ',
  'DIA',
  'IWM',
  'VTI',
  'ITOT',
  'SCHB',
  'VEA',
  'IEFA',
  'VWO',
  'IEMG',
  'AGG',
  'BND',
]

function snapshotMapKeyFromRow(row: SnapTicker | null): string | null {
  if (!row?.ticker) return null
  const raw = String(row.ticker).trim()
  const u = raw.toUpperCase()
  if (u.startsWith('X:')) {
    return normalizeTicker(u.replace(/[^A-Z0-9.:]/g, ''))
  }
  /*
   * Crypto snapshot rows often use unprefixed pairs (e.g. BTCUSD). `normalizeTicker('BTCUSD')` is
   * truthy as a pseudo-stock symbol, so we must try composite **first** or keys never match `X:…` requests.
   */
  const asComposite = normalizeCryptoCompositeTicker(raw)
  if (asComposite) return asComposite
  return normalizeTicker(u)
}

async function fetchStockSnapshotsBatch(tickers: string[]): Promise<Map<string, SnapTicker>> {
  const normalized = [...new Set(tickers.map((t) => normalizeTicker(t)).filter((x): x is string => !!x))]
  const stockSyms = normalized.filter((s) => !s.startsWith('X:'))
  const cryptoSyms = normalized.filter((s) => s.startsWith('X:'))
  const map = new Map<string, SnapTicker>()

  const stockChunks = chunkArray(stockSyms, 18)
  const SNAPSHOT_WAVE = 4
  for (let w = 0; w < stockChunks.length; w += SNAPSHOT_WAVE) {
    const wave = stockChunks.slice(w, w + SNAPSHOT_WAVE)
    await Promise.all(
      wave.map(async (chunk) => {
        if (!chunk.length) return
        const q = chunk.map((c) => encodeURIComponent(c)).join(',')
        const data = await failNull(
          massiveGet<BatchStocksResponse>(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${q}`),
        )
        for (const raw of data?.tickers ?? []) {
          const row = applyMassiveSnapshotAliases(flattenSnapshotRow(raw))
          const key = snapshotMapKeyFromRow(row)
          if (key && row) map.set(key, { ...row, ticker: key })
        }
      }),
    )
  }

  for (const chunk of chunkArray(cryptoSyms, 8)) {
    if (!chunk.length) continue
    const q = chunk.map((c) => encodeURIComponent(c)).join(',')
    let data: BatchStocksResponse | null = null
    try {
      data = await massiveGet<BatchStocksResponse>(
        `/v2/snapshot/locale/global/markets/crypto/tickers?tickers=${q}`,
      )
    } catch {
      data = null
    }
    if (data?.tickers?.length) {
      for (const raw of data.tickers) {
        const row = applyMassiveSnapshotAliases(flattenSnapshotRow(raw))
        const key = snapshotMapKeyFromRow(row)
        if (key && row) map.set(key, { ...row, ticker: key })
      }
    }
    const missing = chunk.filter((s) => !map.has(s))
    if (missing.length) {
      await fillMissingCryptoSnapshots(missing, map)
    }
  }

  return map
}

/**
 * Names for a set of symbols.
 *
 * Trade browse fetches 30 rows; before this change we fired 30 sequential `/v3/reference/tickers/{sym}`
 * calls through the paced Massive client — usually the slowest part of the response. The reference
 * list endpoint supports `ticker.any_of=SYM1,SYM2,…` which lets us get up to ~50 names per call.
 * Unknown symbols still fall back to the per-ticker endpoint so we never lose a name we used to render.
 */
async function refNamesFor(symbols: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(symbols)].filter((s) => !s.startsWith('X:'))
  if (uniq.length === 0) return out

  for (const chunk of chunkArray(uniq, 50)) {
    const data = await failNull(
      massiveGet<RefTickersResponse>('/v3/reference/tickers', {
        'ticker.any_of': chunk.join(','),
        active: 'true',
        limit: String(Math.max(chunk.length, 50)),
      }),
    )
    for (const r of data?.results ?? []) {
      const t = (r.ticker ?? '').toUpperCase()
      if (!t || !chunk.includes(t)) continue
      out.set(t, truncateName(r.name ?? t))
    }
  }

  // Fallback only for symbols not returned by the batch (e.g. delisted, OTC quirks).
  const missing = uniq.filter((s) => !out.has(s))
  if (missing.length > 0) {
    type SingleRefResp = { results?: { name?: string } }
    for (const chunk of chunkArray(missing, 10)) {
      const pairs = await Promise.all(
        chunk.map(async (sym) => {
          const d = await failNull(massiveGet<SingleRefResp>(`/v3/reference/tickers/${encodeURIComponent(sym)}`))
          const name = d?.results?.name ?? sym
          return [sym, truncateName(name)] as const
        }),
      )
      for (const [s, n] of pairs) {
        out.set(s, n)
      }
    }
  }
  return out
}

async function movers(direction: 'gainers' | 'losers'): Promise<string[]> {
  const data = await failNull(
    massiveGet<MoversResponse>(`/v2/snapshot/locale/us/markets/stocks/${direction}`, {
      include_otc: 'false',
    }),
  )
  const rows = data?.tickers ?? []
  const out: string[] = []
  for (const raw of rows) {
    const row = flattenSnapshotRow(raw)
    const sym = row?.ticker
    if (sym) out.push(sym)
  }
  if (out.length >= 4) return out
  /* Pre / post market the movers list can be empty — fall back to liquid large caps. */
  return [...POPULAR].slice(0, 18)
}

async function fillMissingCryptoSnapshots(syms: string[], map: Map<string, SnapTicker>): Promise<void> {
  const missing = syms.filter((s) => s.startsWith('X:') && !map.has(s))
  for (const batch of chunkArray(missing, 8)) {
    await Promise.all(
      batch.map(async (sym) => {
        const raw = await failNull(
          massiveGet<unknown>(`/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(sym)}`),
        )
        const inner = unwrapCryptoSnapshotBody(raw)
        const flat = flattenSnapshotRow(raw)
        const merged = inner
          ? ({ ...(flat ?? {}), ...inner, ticker: sym } as SnapTicker)
          : flat
        const row = applyMassiveSnapshotAliases(merged)
        const key = snapshotMapKeyFromRow(row) ?? sym
        if (row && key) map.set(key, { ...row, ticker: key })
      }),
    )
  }
}

const ETF_FALLBACK = [
  'SPY',
  'QQQ',
  'IWM',
  'DIA',
  'VTI',
  'VOO',
  'GLD',
  'SLV',
  'XLF',
  'XLE',
  'IBIT',
  'SCHD',
  'ARKK',
  'SMH',
  'EFA',
  'VEA',
  'AGG',
  'BND',
  'TLT',
  'HYG',
  'XLV',
  'XLY',
  'XLI',
  'XLK',
  'XLU',
  'XLB',
  'XLP',
  'VUG',
]

/** Liquid / recognizable ETFs first; remainder filled by Massive `market_cap` desc. */
const POPULAR_ETF_ORDER: readonly string[] = [
  'SPY',
  'QQQ',
  'VOO',
  'IVV',
  'IWM',
  'DIA',
  'VTI',
  'QQQM',
  'SPLG',
  'ITOT',
  'VEA',
  'IEFA',
  'EFA',
  'AGG',
  'BND',
  'GLD',
  'SLV',
  'IBIT',
  'FBTC',
  'GBTC',
  'BITO',
  'ARKK',
  'XLF',
  'XLK',
  'XLE',
  'XLV',
  'SMH',
  'SOXX',
  'SCHD',
  'VNQ',
  'TLT',
  'IEF',
  'HYG',
  'LQD',
  'XLY',
  'XLI',
  'XLU',
  'XLP',
  'XLRE',
  'XLB',
  'VUG',
  'VTV',
  'RSP',
  'MDY',
  'IJH',
  'IJR',
  'USO',
  'UNG',
  'EEM',
  'IEMG',
]

async function etfTickers(limit = 30): Promise<string[]> {
  let rows = (await failNull(
    massiveGet<RefTickersResponse>('/v3/reference/tickers', {
      type: 'ETF',
      market: 'stocks',
      active: 'true',
      limit: '250',
      sort: 'market_cap',
      order: 'desc',
    }),
  ))?.results

  if (!rows?.length) {
    rows = (
      await failNull(
        massiveGet<RefTickersResponse>('/v3/reference/tickers', {
          type: 'ETF',
          market: 'stocks',
          active: 'true',
          limit: '200',
        }),
      )
    )?.results
  }

  const mcapSorted = [...(rows ?? [])]
    .map((r) => ({ t: (r.ticker ?? '').toUpperCase(), m: r.market_cap ?? 0 }))
    .filter((x) => normalizeTicker(x.t))
    .sort((a, b) => b.m - a.m)
    .map((x) => x.t)

  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of POPULAR_ETF_ORDER) {
    const n = normalizeTicker(raw)
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  for (const t of mcapSorted) {
    const n = normalizeTicker(t)
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  if (out.length < 12) {
    for (const raw of ETF_FALLBACK) {
      const n = normalizeTicker(raw)
      if (n && !seen.has(n)) {
        seen.add(n)
        out.push(n)
      }
    }
  }
  return out.slice(0, limit)
}

const CRYPTO_FALLBACK = ['X:BTCUSD', 'X:ETHUSD', 'X:SOLUSD', 'X:XRPUSD', 'X:DOGEUSD', 'X:LTCUSD', 'X:ADAUSD']

/** Major pairs first (display order); others ranked by Massive liquidity after snapshot pass. */
const CRYPTO_PRIORITY: readonly string[] = [
  'X:BTCUSD',
  'X:ETHUSD',
  'X:SOLUSD',
  'X:XRPUSD',
  'X:ADAUSD',
  'X:DOGEUSD',
  'X:DOTUSD',
  'X:AVAXUSD',
  'X:LINKUSD',
  'X:LTCUSD',
  'X:POLUSD',
  'X:UNIUSD',
  'X:ATOMUSD',
  'X:ETCUSD',
  'X:ALGOUSD',
  'X:NEARUSD',
  'X:FILUSD',
  'X:APTUSD',
  'X:SHIBUSD',
  'X:LDOUSD',
  'X:ARBUSD',
  'X:OPUSD',
  'X:INJUSD',
  'X:SEIUSD',
]

async function cryptoTickers(limit = 24): Promise<string[]> {
  let rows = (
    await failNull(
      massiveGet<RefTickersResponse>('/v3/reference/tickers', {
        market: 'crypto',
        active: 'true',
        limit: '200',
        sort: 'market_cap',
        order: 'desc',
      }),
    )
  )?.results

  if (!rows?.length) {
    rows = (
      await failNull(
        massiveGet<RefTickersResponse>('/v3/reference/tickers', {
          market: 'crypto',
          active: 'true',
          limit: '200',
        }),
      )
    )?.results
  }

  const fromRef = [
    ...new Set(
      (rows ?? [])
        .map((r) => normalizeCryptoCompositeTicker(r.ticker ?? ''))
        .filter((t): t is string => !!t),
    ),
  ]

  /* Order: curated majors first, then Massive ref list (already market-cap sorted), then fallbacks.
   * Do not prefetch snapshots here — buildRowsForSymbols loads one batch + sparks (avoids 2× API load). */
  const merged = [...new Set([...CRYPTO_PRIORITY, ...fromRef, ...CRYPTO_FALLBACK])]
  return merged.slice(0, limit)
}

async function buildRowsForSymbols(
  orderedSymbols: string[],
  maxRows = 28,
): Promise<TradeBrowseRow[]> {
  const syms = orderedSymbols.slice(0, maxRows)
  const stockSyms = syms.filter((s) => !s.startsWith('X:'))

  /* Stock sparks don't depend on snapshots — kick them off in parallel with snapshots+names
   * instead of waiting in series. On a cold load this roughly halves the perceived latency
   * because the slow part (30 bar fetches) overlaps with the rest of the work. */
  const [snapMap, names, stockSparks] = await Promise.all([
    (async () => {
      const m = await fetchStockSnapshotsBatch(syms)
      await fillMissingCryptoSnapshots(syms, m)
      return m
    })(),
    refNamesFor(syms),
    stockSparkBatch(stockSyms),
  ])

  const cryptoMissingPx = syms.filter((s) => s.startsWith('X:') && pickPrice(snapMap.get(s)) == null)
  if (cryptoMissingPx.length) {
    const fills = await Promise.all(
      cryptoMissingPx.map(async (s) => [s, await pickLastCloseFromRecentAggs(s)] as const),
    )
    for (const [s, px] of fills) {
      if (px == null) continue
      const cur = snapMap.get(s)
      const injected: SnapTicker = cur
        ? {
            ...cur,
            lastTrade: {
              ...(typeof cur.lastTrade === 'object' && cur.lastTrade ? cur.lastTrade : {}),
              p: px,
            },
          }
        : { ticker: s, lastTrade: { p: px } }
      snapMap.set(s, applyMassiveSnapshotAliases(injected)!)
    }
  }

  /* Live browse prices come from the batched crypto snapshot (+ fills above). Do not fan out one
   * `/v2/aggs/.../minute` request per row — that was freezing the Crypto trade tab and hammering
   * Massive rate limits while duplicating data the snapshot already carries. */

  const sparkMap = new Map<string, number[]>(stockSparks)
  for (const sym of syms) {
    if (sym.startsWith('X:')) {
      sparkMap.set(sym, cryptoSparkFromSnapshot(snapMap.get(sym)))
    }
  }

  const rows: TradeBrowseRow[] = []
  for (const sym of syms) {
    const snap = snapMap.get(sym)
    const lastPrice = pickPrice(snap)
    const chp = changePctFromSnap(snap)
    const sparkline = sparkMap.get(sym) ?? []
    const spark =
      sparkline.length >= 2 ? sparkline : lastPrice != null ? [lastPrice, lastPrice] : [1, 1]
    const prevClose = numFromObj(snap?.prevDay, 'c', 'C', 'close')
    const sparkUp =
      spark.length >= 2 ? spark[spark.length - 1]! >= spark[0]! : (lastPrice ?? 0) >= (prevClose ?? lastPrice ?? 0)
    const positiveRow = chp != null && Number.isFinite(chp) ? chp >= 0 : sparkUp

    rows.push({
      symbol: sym,
      companyName: names.get(sym) ?? (sym.startsWith('X:') ? truncateName(cryptoPairDisplayName(sym)) : sym),
      price: fmtLastPrice(sym, lastPrice),
      changeLabel: chp != null && Number.isFinite(chp) ? fmtPctSigned(chp) : '—',
      positive: positiveRow,
      logoUrl: `/api/stocks/${encodeURIComponent(sym)}/branding-icon`,
      sparkline: spark,
    })
  }
  return rows
}

async function symbolsForCategory(
  cat: TradeCategoryId,
  opts?: { gameSlug?: string; userId?: string | null },
): Promise<string[]> {
  switch (cat) {
    case 'following': {
      const slug = opts?.gameSlug
      const uid = opts?.userId
      if (!slug || !uid || uid.length < 8) return []
      const list = await getFollowTickersForGame(uid, slug)
      return list.slice(0, 36)
    }
    case 'popular':
      return [...POPULAR]
    case 'gainers':
      return await movers('gainers')
    case 'losers':
      return await movers('losers')
    case 'active': {
      const [g, l, p] = await Promise.all([movers('gainers'), movers('losers'), Promise.resolve([...POPULAR])])
      const merged = [...new Set([...g, ...l, ...p])]
      const snaps = await fetchStockSnapshotsBatch(merged)
      return [...merged].sort((a, b) => {
        const va = snaps.get(a)?.day?.v ?? 0
        const vb = snaps.get(b)?.day?.v ?? 0
        return vb - va
      })
    }
    case 'tech':
      return [...TECH]
    case 'finance':
      return [...FINANCE]
    case 'healthcare':
      return [...HEALTHCARE]
    case 'energy':
      return [...ENERGY]
    case 'industrial':
      return [...INDUSTRIAL]
    case 'consumer':
      return [...CONSUMER]
    case 'infrastructure':
      return [...INFRASTRUCTURE]
    case 'utilities':
      return [...UTILITIES]
    case 'indexfunds':
      return [...INDEX_FUNDS]
    case 'etf':
      return await etfTickers(30)
    case 'crypto':
      return await cryptoTickers(24)
    default:
      return [...POPULAR]
  }
}

/** In-flight only (no browse payload cache) so every poll returns fresh Massive quotes for all games. */
const tradeBrowseInflight = new Map<string, Promise<TradeBrowsePayload>>()

function tradeBrowseInflightKey(gameSlug: string, viewerUserId: string | null, category: TradeCategoryId): string {
  return `${gameSlug}\t${viewerUserId ?? ''}\t${category}`
}

type TradeBrowsePayload = {
  category: TradeCategoryId
  categories: typeof TRADE_CATEGORY_OPTIONS
  rows: TradeBrowseRow[]
}

async function refreshTradeBrowse(
  gameSlug: string,
  viewerUserId: string | null,
  category: TradeCategoryId,
): Promise<TradeBrowsePayload> {
  const k = tradeBrowseInflightKey(gameSlug, viewerUserId, category)
  const pending = tradeBrowseInflight.get(k)
  if (pending) return pending
  const work = (async (): Promise<TradeBrowsePayload> => {
    const syms = await symbolsForCategory(category, { gameSlug, userId: viewerUserId })
    const rows = await buildRowsForSymbols(syms, 30)
    return {
      category,
      categories: TRADE_CATEGORY_OPTIONS,
      rows,
    }
  })()
  tradeBrowseInflight.set(k, work)
  work.finally(() => tradeBrowseInflight.delete(k))
  return work
}

export async function fetchTradeBrowse(
  gameSlug: string,
  viewerUserId: string | null,
  category: TradeCategoryId,
): Promise<TradeBrowsePayload> {
  return refreshTradeBrowse(gameSlug, viewerUserId, category)
}

/** Whether `sym` appears in the live browse list for `cat` (used for game trade filters). */
export async function isSymbolInTradeCategory(
  sym: string,
  cat: TradeCategoryId,
  ctx?: { gameSlug?: string; userId?: string | null },
): Promise<boolean> {
  if (cat === 'following') {
    const slug = ctx?.gameSlug
    const uid = ctx?.userId
    if (!slug || !uid || uid.length < 8) return false
    const want = resolveMassiveTicker(sym) ?? normalizeTicker(sym)
    if (!want) return false
    const list = await getFollowTickersForGame(uid, slug)
    return list.some((t) => (resolveMassiveTicker(t) ?? normalizeTicker(t)) === want)
  }
  const list = await symbolsForCategory(cat)
  return new Set(list).has(sym)
}

const TRADE_SEARCH_MAX_ROWS = 20
const TRADE_SEARCH_REF_LIMIT = '40'

async function referenceTickerSearch(q: string, market: 'stocks' | 'crypto'): Promise<RefTickerRow[]> {
  const data = await failNull(
    massiveGet<RefTickersResponse>('/v3/reference/tickers', {
      search: q,
      active: 'true',
      limit: TRADE_SEARCH_REF_LIMIT,
      market,
    }),
  )
  return data?.results ?? []
}

/** Higher = better match for ranking merged stock + crypto reference hits. */
function scoreSearchMatch(qNorm: string, tickerRaw: string, nameRaw: string, marketCap: number, apiOrder: number): number {
  const q = qNorm.trim().toLowerCase()
  if (!q) return apiOrder

  const tickFull = tickerRaw.toUpperCase()
  const tickShort = tickFull.startsWith('X:') ? tickFull.slice(2) : tickFull
  const qU = q.toUpperCase()
  const n = (nameRaw || '').toLowerCase()

  let score = 0
  if (tickShort === qU || tickFull === qU || tickFull === `X:${qU}`) {
    score = 100_000
  } else if (tickShort.startsWith(qU) || tickFull.startsWith(`X:${qU}`)) {
    score = 85_000 - Math.min(tickShort.length, 40) * 120
  } else if (n.startsWith(q)) {
    score = 72_000
  } else {
    const words = n.split(/[^a-z0-9]+/).filter(Boolean)
    const wordHit = words.some((w) => w.startsWith(q))
    if (wordHit) score = 58_000
    else if (n.includes(q)) score = 44_000
    else if (tickShort.includes(qU)) score = 34_000
    else score = 5000 - Math.min(apiOrder, 4999)
  }

  const mc = Number.isFinite(marketCap) && marketCap > 0 ? Math.log10(marketCap + 1) : 0
  score += mc * 8
  return score
}

const tradeSearchInflight = new Map<string, Promise<TradeBrowseRow[]>>()

async function refreshTradeSearch(cacheKey: string, q: string): Promise<TradeBrowseRow[]> {
  const pending = tradeSearchInflight.get(cacheKey)
  if (pending) return pending
  const work = (async (): Promise<TradeBrowseRow[]> => {
    const [stockHits, cryptoHits] = await Promise.all([
      referenceTickerSearch(q, 'stocks'),
      referenceTickerSearch(q, 'crypto'),
    ])

    const merged = new Map<string, { ticker: string; name: string; marketCap: number; order: number }>()
    let ord = 0
    for (const r of stockHits) {
      const t = normalizeTicker(r.ticker ?? '')
      if (!t || merged.has(t)) continue
      merged.set(t, { ticker: t, name: r.name ?? t, marketCap: r.market_cap ?? 0, order: ord++ })
    }
    for (const r of cryptoHits) {
      const t = normalizeCryptoCompositeTicker(r.ticker ?? '')
      if (!t || merged.has(t)) continue
      merged.set(t, { ticker: t, name: r.name ?? t, marketCap: r.market_cap ?? 0, order: ord++ })
    }

    const qLower = q.toLowerCase()
    const ranked = [...merged.values()]
      .map((row) => ({
        sym: row.ticker,
        score: scoreSearchMatch(qLower, row.ticker, row.name, row.marketCap, row.order),
      }))
      .sort((a, b) => b.score - a.score)

    const symbols = ranked.slice(0, TRADE_SEARCH_MAX_ROWS).map((x) => x.sym)
    if (!symbols.length) return []

    return buildRowsForSymbols(symbols, TRADE_SEARCH_MAX_ROWS)
  })()
  tradeSearchInflight.set(cacheKey, work)
  work.finally(() => tradeSearchInflight.delete(cacheKey))
  return work
}

/** Ranked symbol search (stocks + ETFs + crypto); live prices/sparks filled like browse rows. */
export async function fetchTradeSearch(queryRaw: string): Promise<TradeBrowseRow[]> {
  const q = queryRaw.trim().slice(0, 80)
  if (q.length < 1) return []

  const cacheKey = q.toLowerCase()
  return refreshTradeSearch(cacheKey, q)
}

/** Hydrate browse rows for stored recent tickers (order preserved). */
export async function fetchTradeRecentRows(orderSymbols: string[]): Promise<TradeBrowseRow[]> {
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const raw of orderSymbols) {
    const t = normalizeCryptoCompositeTicker(raw) ?? normalizeTicker(raw)
    if (!t || seen.has(t)) continue
    seen.add(t)
    ordered.push(t)
  }
  if (!ordered.length) return []
  return buildRowsForSymbols(ordered.slice(0, 24), 24)
}
