import { massiveGet } from './massiveClient'

/** Raw-ish Massive shapes we read (subset). */
type TickerDetails = {
  results?: {
    name?: string
    description?: string
    ticker?: string
    market_cap?: number
    list_date?: string
    total_employees?: number
    homepage_url?: string
    primary_exchange?: string
    weighted_shares_outstanding?: number
    branding?: { icon_url?: string; logo_url?: string }
    address?: {
      address1?: string
      city?: string
      state?: string
      postal_code?: string
    }
  }
}

type Snapshot = {
  ticker?: {
    ticker?: string
    day?: { c?: number; h?: number; l?: number; o?: number; v?: number }
    prevDay?: { c?: number }
    lastTrade?: { p?: number }
    lastQuote?: { p?: number; P?: number }
    min?: { c?: number }
    todaysChange?: number
    todaysChangePerc?: number
  }
}

type IncomeRow = {
  timeframe?: string
  fiscal_year?: number
  fiscal_quarter?: number
  period_end?: string
  revenue?: number
  gross_profit?: number
  net_income_loss_attributable_common_shareholders?: number
  tickers?: string[]
}

type IncomeResponse = { results?: IncomeRow[] }

type RatiosRow = {
  ticker?: string
  date?: string
  price?: number
  earnings_per_share?: number
  price_to_earnings?: number
  return_on_equity?: number
  dividend_yield?: number
  market_cap?: number
}

type RatiosResponse = { results?: RatiosRow[] }

type DividendResponse = { results?: { cash_amount?: number; frequency?: number }[] }

type VxIS = {
  revenues?: { value?: number }
  net_income_loss_available_to_common_stockholders_basic?: { value?: number }
  net_income_loss?: { value?: number }
  diluted_earnings_per_share?: { value?: number }
}

type VxFinRow = {
  timeframe?: string
  fiscal_year?: string
  fiscal_period?: string
  financials?: { income_statement?: VxIS }
}

type VxFinResponse = { results?: VxFinRow[] }

type AggBar = { t?: number; o?: number; h?: number; l?: number; c?: number; v?: number }
type AggsResponse = { results?: AggBar[]; ticker?: string }

function fmtUsdShort(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function fmtPrice(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return `${n.toFixed(2)}%`
}

function fmtShares(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** If |v| ≤ 1, treat as decimal ratio (0.42 → 42%). */
function fmtMaybeRatioAsPct(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  if (Math.abs(v) <= 1) return fmtPct(v * 100)
  return fmtPct(v)
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const MS_PER_DAY = 86_400_000

export function normalizeTicker(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase()
  /* Polygon crypto composites, e.g. X:BTCUSD */
  if (trimmed.startsWith('X:')) {
    const x = trimmed.replace(/[^A-Z0-9.:]/g, '')
    if (!/^X:[A-Z0-9.-]+$/.test(x) || x.length < 5 || x.length > 24) return null
    return x
  }
  const t = trimmed.replace(/[^A-Z0-9.-]/g, '')
  if (!t || t.length > 12) return null
  return t
}

/**
 * Massive/Polygon crypto composites always use `X:` in snapshot + agg APIs. Reference search
 * sometimes returns pairs without the prefix (e.g. `BTCUSD`) — map those to the composite form.
 * Unprefixed values must look like a crypto pair (quote or cross) so we never turn stocks into `X:`.
 */
export function normalizeCryptoCompositeTicker(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase()
  if (!trimmed) return null
  if (trimmed.startsWith('X:')) {
    return normalizeTicker(trimmed.replace(/[^A-Z0-9.:]/g, ''))
  }
  const collapsed = trimmed.replace(/[^A-Z0-9]/g, '')
  if (!collapsed || collapsed.length < 5 || collapsed.length > 22) return null
  if (!/(USD|USDT|EUR|GBP|USDC|DAI|BTC|ETH)$/.test(collapsed)) return null
  return normalizeTicker(`X:${collapsed}`)
}

/** URL / client ticker → Massive symbol (`AAPL` or `X:BTCUSD`). Always use for `/api/stocks/:ticker` and detail. */
export function resolveMassiveTicker(raw: string): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  return normalizeCryptoCompositeTicker(s) ?? normalizeTicker(s)
}

async function failNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

export type StockDetailBar = { t: number; o: number; h: number; l: number; c: number; v: number }

/** Crypto 1D charts: last ~24h. Prefer wall-clock; if that yields nothing (skew / bucket times), use newest bar in the payload as the anchor. */
function clipCryptoRolling24hBars(bars: StockDetailBar[]): StockDetailBar[] {
  if (!bars.length) return []
  const sorted = [...bars].sort((a, b) => a.t - b.t)
  const now = Date.now()
  const wallStart = now - MS_PER_DAY
  const wallEnd = now + 15 * 60 * 1000
  const byWall = sorted.filter((b) => Number.isFinite(b.t) && b.t >= wallStart && b.t <= wallEnd)
  if (byWall.length > 0) return byWall
  const latest = sorted[sorted.length - 1]!.t
  const relStart = latest - MS_PER_DAY
  return sorted.filter((b) => b.t >= relStart)
}

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
  /** Proxied path — browser loads `/api/stocks/.../branding-icon` (API key stays server-side). */
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
  /** When revenue / net income bars are unavailable, chart can use diluted EPS by period. */
  financialsEpsAnnual: { year: number; eps: number }[]
  financialsEpsQuarterly: { year: number; quarter: number; eps: number }[]
  updatedAt: string
}

/** Massive/Polygon sometimes uses `price` on last_trade / last_quote instead of `p`. */
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

/** Last trade / quote price from a Massive snapshot ticker object (stocks or crypto). */
export function pickTickerSnapshotPrice(s: Snapshot['ticker'] | undefined): number | null {
  if (!s) return null
  const root = s as Record<string, unknown>
  const fmv = root.fmv
  if (typeof fmv === 'number' && Number.isFinite(fmv) && fmv > 0) return fmv
  const p =
    numFromObj(s.lastTrade, 'p', 'P', 'price') ??
    numFromObj(s.lastQuote, 'p', 'P', 'price') ??
    numFromObj(s.min, 'c', 'C', 'close') ??
    numFromObj(s.day, 'c', 'C', 'close') ??
    numFromObj(s.prevDay, 'c', 'C', 'close')
  return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null
}

function pickPrice(s: Snapshot['ticker']): number | null {
  return pickTickerSnapshotPrice(s)
}

function formatHQ(r: TickerDetails['results']): string {
  if (!r?.address) return '—'
  const { city, state, address1 } = r.address
  const parts = [address1, city, state].filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}

function formatCryptoHeadquarters(r: TickerDetails['results'] | undefined): string {
  const hq = formatHQ(r)
  if (hq !== '—') return hq
  const ex = (r?.primary_exchange ?? '').trim()
  if (ex.length) return ex
  return 'Global (digital)'
}

function buildAnnualFromVx(rows: VxFinRow[] | undefined): StockFinancialYear[] {
  if (!rows?.length) return []
  const byYear = new Map<number, StockFinancialYear>()
  for (const row of rows) {
    if (String(row.timeframe) !== 'annual') continue
    const y = Number(row.fiscal_year)
    if (!Number.isFinite(y)) continue
    const is = row.financials?.income_statement
    if (!is) continue
    const revenue = is.revenues?.value ?? 0
    const net =
      is.net_income_loss_available_to_common_stockholders_basic?.value ??
      is.net_income_loss?.value ??
      0
    if (!byYear.has(y)) byYear.set(y, { year: y, revenue, netIncome: net })
  }
  const years = [...byYear.keys()].sort((a, b) => a - b)
  return years.slice(-6).map((y) => byYear.get(y)!)
}

function buildQuarterlyFromVx(rows: VxFinRow[] | undefined): StockFinancialQuarter[] {
  if (!rows?.length) return []
  const list: StockFinancialQuarter[] = []
  for (const row of rows) {
    if (String(row.timeframe) !== 'quarterly') continue
    const y = Number(row.fiscal_year)
    const m = String(row.fiscal_period ?? '').match(/Q(\d)/i)
    const q = m ? Number(m[1]) : 0
    if (!Number.isFinite(y) || q < 1 || q > 4) continue
    const is = row.financials?.income_statement
    if (!is) continue
    const revenue = is.revenues?.value ?? 0
    const net =
      is.net_income_loss_available_to_common_stockholders_basic?.value ??
      is.net_income_loss?.value ??
      0
    list.push({ year: y, quarter: q, revenue, netIncome: net })
  }
  list.sort((a, b) => a.year * 10 + a.quarter - (b.year * 10 + b.quarter))
  return list.slice(-8)
}

function buildEpsAnnualFromVx(rows: VxFinRow[] | undefined): { year: number; eps: number }[] {
  if (!rows?.length) return []
  const byYear = new Map<number, number>()
  for (const row of rows) {
    if (String(row.timeframe) !== 'annual') continue
    const y = Number(row.fiscal_year)
    const v = row.financials?.income_statement?.diluted_earnings_per_share?.value
    if (!Number.isFinite(y) || v == null || !Number.isFinite(v)) continue
    if (!byYear.has(y)) byYear.set(y, v)
  }
  const years = [...byYear.keys()].sort((a, b) => a - b)
  return years.slice(-6).map((year) => ({ year, eps: byYear.get(year)! }))
}

function buildEpsQuarterlyFromVx(rows: VxFinRow[] | undefined): { year: number; quarter: number; eps: number }[] {
  if (!rows?.length) return []
  const list: { year: number; quarter: number; eps: number }[] = []
  for (const row of rows) {
    if (String(row.timeframe) !== 'quarterly') continue
    const y = Number(row.fiscal_year)
    const m = String(row.fiscal_period ?? '').match(/Q(\d)/i)
    const q = m ? Number(m[1]) : 0
    const v = row.financials?.income_statement?.diluted_earnings_per_share?.value
    if (!Number.isFinite(y) || q < 1 || q > 4 || v == null || !Number.isFinite(v)) continue
    list.push({ year: y, quarter: q, eps: v })
  }
  list.sort((a, b) => a.year * 10 + a.quarter - (b.year * 10 + b.quarter))
  return list.slice(-8)
}

export function unwrapCryptoSnapshotBody(raw: unknown): Snapshot['ticker'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const blocks: Record<string, unknown>[] = [o]
  if (o.ticker && typeof o.ticker === 'object') blocks.push(o.ticker as Record<string, unknown>)
  if (o.results && typeof o.results === 'object') {
    const r = o.results as Record<string, unknown>
    blocks.push(r)
    if (r.ticker && typeof r.ticker === 'object') blocks.push(r.ticker as Record<string, unknown>)
  }
  const merged: Record<string, unknown> = {}
  for (const b of blocks) {
    for (const [k, v] of Object.entries(b)) {
      if (v !== undefined && merged[k] === undefined) merged[k] = v
    }
  }
  if (
    'day' in merged ||
    'lastTrade' in merged ||
    'lastQuote' in merged ||
    'prevDay' in merged ||
    'prev_day' in merged ||
    'min' in merged ||
    'todaysChange' in merged ||
    'todays_change' in merged ||
    'todaysChangePerc' in merged ||
    'todays_change_perc' in merged
  ) {
    return merged as Snapshot['ticker']
  }
  return undefined
}

/**
 * Massive crypto snapshot JSON often mixes snake_case (`last_trade`, `todays_change_perc`) with
 * camelCase. Normalize before any shared `lastTrade` / `todaysChangePerc` reads (trade browse,
 * portfolio, feed hydration).
 */
export function normalizeCryptoSnapshotShape(t: Snapshot['ticker'] | undefined): Snapshot['ticker'] | undefined {
  if (!t || typeof t !== 'object') return t
  const o = t as Record<string, unknown>
  const out = { ...t } as Record<string, unknown>
  if (!out.lastTrade && o.last_trade && typeof o.last_trade === 'object') {
    out.lastTrade = o.last_trade
  }
  if (!out.lastQuote && o.last_quote && typeof o.last_quote === 'object') {
    out.lastQuote = o.last_quote
  }
  if (!out.prevDay && o.prev_day && typeof o.prev_day === 'object') {
    out.prevDay = o.prev_day
  }
  if (!out.day && o.day && typeof o.day === 'object') {
    out.day = o.day
  }
  if (out.todaysChange === undefined && typeof o.todays_change === 'number') {
    out.todaysChange = o.todays_change
  }
  if (out.todaysChangePerc === undefined && typeof o.todays_change_perc === 'number') {
    out.todaysChangePerc = o.todays_change_perc
  }
  if (out.todaysChangePerc === undefined && typeof o.todays_change_percent === 'number') {
    out.todaysChangePerc = o.todays_change_percent
  }
  return out as Snapshot['ticker']
}

async function fetchCryptoDetailPayload(sym: string): Promise<StockDetailPayload> {
  const [ref, snapRaw] = await Promise.all([
    massiveGet<TickerDetails>(`/v3/reference/tickers/${encodeURIComponent(sym)}`),
    failNull(
      massiveGet<unknown>(`/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(sym)}`),
    ),
  ])
  const r = ref.results
  if (!r) {
    throw new Error(`Unknown crypto ticker: ${sym}`)
  }
  const name = r.name ?? sym
  const description = r.description ?? ''
  const iconUrl = `/api/stocks/${encodeURIComponent(sym)}/branding-icon`
  const tkr = normalizeCryptoSnapshotShape(unwrapCryptoSnapshotBody(snapRaw))
  let lastPrice = pickPrice(tkr)
  let barsForCrypto: StockDetailBar[] | undefined
  const ensureCryptoBars = async (): Promise<StockDetailBar[]> => {
    if (!barsForCrypto) {
      try {
        barsForCrypto = await fetchStockBars1DayOrLastTwoSessions(sym)
      } catch {
        barsForCrypto = []
      }
    }
    return barsForCrypto
  }
  /* Match baseline: do not block on 1D aggs when snapshot already has a price (saves one Massive
   * round-trip per crypto detail load and avoids coupling header price to bar fetch latency). */
  if (lastPrice == null || !Number.isFinite(lastPrice) || lastPrice <= 0) {
    const bars = await ensureCryptoBars()
    const tail = bars.filter((b) => Number.isFinite(b.c) && b.c > 0)
    const c = tail[tail.length - 1]?.c
    if (c != null && Number.isFinite(c) && c > 0) lastPrice = c
  }
  if (lastPrice == null || !Number.isFinite(lastPrice) || lastPrice <= 0) {
    const px = await fetchLatestCryptoAggClose(sym)
    if (px != null && Number.isFinite(px) && px > 0) lastPrice = px
  }
  const lastPriceLabel =
    lastPrice != null && Number.isFinite(lastPrice) && lastPrice > 0 && lastPrice < 1
      ? `$${lastPrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`
      : fmtPrice(lastPrice)

  const prevClose = numFromObj(tkr?.prevDay, 'c', 'C', 'close')
  let ch: number | null = null
  let chp: number | null = null
  if (lastPrice != null && prevClose != null) {
    ch = lastPrice - prevClose
    if (prevClose !== 0) chp = (ch! / prevClose) * 100
  }
  if (ch == null && typeof tkr?.todaysChange === 'number' && Number.isFinite(tkr.todaysChange)) {
    ch = tkr.todaysChange
  }
  if (chp == null || !Number.isFinite(chp)) {
    if (typeof tkr?.todaysChangePerc === 'number' && Number.isFinite(tkr.todaysChangePerc)) {
      chp = tkr.todaysChangePerc
    }
  }
  if (chp == null || !Number.isFinite(chp)) {
    const open = numFromObj(tkr?.day, 'o', 'O', 'open')
    if (lastPrice != null && open != null && open !== 0) {
      chp = ((lastPrice - open) / open) * 100
      if (ch == null) ch = lastPrice - open
    }
  }
  if (chp == null || !Number.isFinite(chp)) {
    const bars = await ensureCryptoBars()
    const valid = bars.filter((b) => Number.isFinite(b.c) && b.c > 0)
    if (valid.length >= 2 && lastPrice != null) {
      const first = valid[0]!.c
      const lastB = valid[valid.length - 1]!.c
      if (first > 0) chp = ((lastB - first) / first) * 100
    }
  }
  const changeTodayLabel =
    chp != null && Number.isFinite(chp) ? `${chp >= 0 ? '+' : ''}${chp.toFixed(2)}%` : '—'
  const day = tkr?.day
  const dayLo = day?.l
  const dayHi = day?.h
  const dayRange =
    dayLo != null && dayHi != null && Number.isFinite(dayLo) && Number.isFinite(dayHi)
      ? `${fmtPrice(dayLo)} – ${fmtPrice(dayHi)}`
      : '—'

  return {
    ticker: sym,
    name,
    description,
    iconUrl,
    lastPrice,
    lastPriceLabel,
    changeToday: ch,
    changeTodayPct: chp,
    changeTodayLabel,
    about: {
      ceo: '—',
      founded: r.list_date ? String(r.list_date).slice(0, 4) : '—',
      employees: r.total_employees != null ? String(r.total_employees) : '—',
      headquarters: formatCryptoHeadquarters(r),
    },
    keyStatsPage1: [
      { label: 'Market cap', value: fmtUsdShort(r.market_cap ?? undefined) },
      { label: '24h volume', value: fmtShares(day?.v ?? undefined) },
      { label: 'Primary exchange', value: r.primary_exchange ?? '—' },
    ],
    keyStatsPage2: [
      { label: 'Previous close', value: fmtPrice(prevClose ?? undefined) },
      { label: '24h range (low – high)', value: dayRange },
      { label: 'Asset class', value: 'Crypto' },
    ],
    financialsAnnual: [],
    financialsQuarterly: [],
    financialsEpsAnnual: [],
    financialsEpsQuarterly: [],
    updatedAt: new Date().toISOString(),
  }
}

export async function fetchStockDetail(ticker: string): Promise<StockDetailPayload> {
  const sym = resolveMassiveTicker(ticker)
  if (!sym) {
    throw new Error('Invalid ticker')
  }

  if (sym.startsWith('X:')) {
    return fetchCryptoDetailPayload(sym)
  }

  const [
    ref,
    snap,
    incAnnual,
    incQuarterly,
    incTtm,
    ratiosRes,
    divRes,
    vxAnnual,
    vxQuarterly,
    vxTtmRes,
  ] = await Promise.all([
    massiveGet<TickerDetails>(`/v3/reference/tickers/${encodeURIComponent(sym)}`),
    failNull(
      massiveGet<Snapshot>(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(sym)}`),
    ),
    failNull(
      massiveGet<IncomeResponse>('/stocks/financials/v1/income-statements', {
        'tickers.any_of': sym,
        timeframe: 'annual',
        limit: '50',
        sort: 'fiscal_year.desc',
      }),
    ),
    failNull(
      massiveGet<IncomeResponse>('/stocks/financials/v1/income-statements', {
        'tickers.any_of': sym,
        timeframe: 'quarterly',
        limit: '80',
        sort: 'period_end.desc',
      }),
    ),
    failNull(
      massiveGet<IncomeResponse>('/stocks/financials/v1/income-statements', {
        'tickers.any_of': sym,
        timeframe: 'trailing_twelve_months',
        limit: '5',
        sort: 'period_end.desc',
      }),
    ),
    failNull(
      massiveGet<RatiosResponse>('/stocks/financials/v1/ratios', {
        ticker: sym,
        limit: '20',
        sort: 'date.desc',
      }),
    ),
    failNull(
      massiveGet<DividendResponse>('/v3/reference/dividends', {
        ticker: sym,
        limit: '1',
        order: 'desc',
        sort: 'ex_dividend_date',
      }),
    ),
    failNull(
      massiveGet<VxFinResponse>('/vX/reference/financials', {
        ticker: sym,
        timeframe: 'annual',
        limit: '24',
      }),
    ),
    failNull(
      massiveGet<VxFinResponse>('/vX/reference/financials', {
        ticker: sym,
        timeframe: 'quarterly',
        limit: '36',
      }),
    ),
    failNull(
      massiveGet<VxFinResponse>('/vX/reference/financials', {
        ticker: sym,
        timeframe: 'ttm',
        limit: '5',
      }),
    ),
  ])

  const r = ref.results
  if (!r) {
    throw new Error(`Unknown ticker: ${sym}`)
  }

  const name = r.name ?? sym
  const description = r.description ?? ''
  const iconUrl = `/api/stocks/${encodeURIComponent(sym)}/branding-icon`

  const tkr = snap?.ticker
  const day = tkr?.day
  const prev = tkr?.prevDay
  const lastPrice = pickPrice(tkr)
  const lastPriceLabel = fmtPrice(lastPrice)
  const ch = tkr?.todaysChange ?? null
  const chp = tkr?.todaysChangePerc ?? null
  const changeTodayLabel =
    chp != null && Number.isFinite(chp) ? `${chp >= 0 ? '+' : ''}${chp.toFixed(2)}%` : '—'

  let financialsAnnual: StockFinancialYear[] = []
  const v1AnnualRows = (incAnnual?.results ?? []).filter((x) => x.timeframe === 'annual' && x.fiscal_year)
  if (v1AnnualRows.length) {
    const annualByYear = new Map<number, IncomeRow>()
    for (const row of v1AnnualRows) {
      const y = row.fiscal_year!
      const prevR = annualByYear.get(y)
      if (!prevR || (row.period_end ?? '') > (prevR.period_end ?? '')) annualByYear.set(y, row)
    }
    const yearsSorted = [...annualByYear.keys()].sort((a, b) => a - b)
    financialsAnnual = yearsSorted.slice(-6).map((y) => {
      const row = annualByYear.get(y)!
      return {
        year: y,
        revenue: row.revenue ?? 0,
        netIncome: row.net_income_loss_attributable_common_shareholders ?? 0,
      }
    })
  } else {
    financialsAnnual = buildAnnualFromVx(vxAnnual?.results)
  }

  let financialsQuarterly: StockFinancialQuarter[] = []
  const v1Q = (incQuarterly?.results ?? []).filter((x) => x.timeframe === 'quarterly' && x.fiscal_year)
  if (v1Q.length) {
    const qSorted = [...v1Q].sort((a, b) => {
      const ta = `${String(a.fiscal_year).padStart(4, '0')}-${a.fiscal_quarter ?? 0}`
      const tb = `${String(b.fiscal_year).padStart(4, '0')}-${b.fiscal_quarter ?? 0}`
      return ta.localeCompare(tb)
    })
    financialsQuarterly = qSorted.slice(-8).map((row) => ({
      year: row.fiscal_year ?? 0,
      quarter: row.fiscal_quarter ?? 0,
      revenue: row.revenue ?? 0,
      netIncome: row.net_income_loss_attributable_common_shareholders ?? 0,
    }))
  } else {
    financialsQuarterly = buildQuarterlyFromVx(vxQuarterly?.results)
  }

  financialsAnnual = financialsAnnual.filter((x) => x.revenue !== 0 || x.netIncome !== 0)
  financialsQuarterly = financialsQuarterly.filter((x) => x.revenue !== 0 || x.netIncome !== 0)
  if (!financialsAnnual.length) {
    financialsAnnual = buildAnnualFromVx(vxAnnual?.results).filter((x) => x.revenue !== 0 || x.netIncome !== 0)
  }
  if (!financialsQuarterly.length) {
    financialsQuarterly = buildQuarterlyFromVx(vxQuarterly?.results).filter(
      (x) => x.revenue !== 0 || x.netIncome !== 0,
    )
  }

  const financialsEpsAnnual = buildEpsAnnualFromVx(vxAnnual?.results)
  const financialsEpsQuarterly = buildEpsQuarterlyFromVx(vxQuarterly?.results)

  const ttmV1 = (incTtm?.results ?? []).find((x) => x.timeframe === 'trailing_twelve_months')
  const vxTtmRow = vxTtmRes?.results?.find((x) => String(x.timeframe) === 'ttm')
  const ttmRevenue =
    ttmV1?.revenue ?? vxTtmRow?.financials?.income_statement?.revenues?.value ?? undefined
  const ttmNet =
    ttmV1?.net_income_loss_attributable_common_shareholders ??
    vxTtmRow?.financials?.income_statement?.net_income_loss_available_to_common_stockholders_basic?.value ??
    vxTtmRow?.financials?.income_statement?.net_income_loss?.value ??
    undefined

  const ratioRows = ratiosRes?.results ?? []
  const ratio = ratioRows.find((row) => String(row.ticker ?? '').toUpperCase() === sym) ?? ratioRows[0]

  let peLabel = '—'
  if (ratio?.price_to_earnings != null && Number.isFinite(ratio.price_to_earnings)) {
    peLabel = ratio.price_to_earnings.toFixed(2)
  } else {
    const vxEps = vxTtmRow?.financials?.income_statement?.diluted_earnings_per_share?.value
    if (lastPrice != null && vxEps != null && vxEps > 0) {
      peLabel = (lastPrice / vxEps).toFixed(2)
    }
  }

  let divYieldLabel = '—'
  if (ratio?.dividend_yield != null && Number.isFinite(ratio.dividend_yield)) {
    divYieldLabel = fmtMaybeRatioAsPct(ratio.dividend_yield)
  } else {
    const d = divRes?.results?.[0]
    if (d?.cash_amount != null && d.frequency && lastPrice != null && lastPrice > 0) {
      const annualUsd = d.cash_amount * d.frequency
      divYieldLabel = fmtPct((annualUsd / lastPrice) * 100)
    } else if (divRes && (divRes.results?.length ?? 0) === 0) {
      divYieldLabel = 'None (no dividend)'
    }
  }

  const mc = r.market_cap ?? ratio?.market_cap
  const volToday = day?.v
  const prevClose = prev?.c
  const dayLo = day?.l
  const dayHi = day?.h
  const dayRange =
    dayLo != null && dayHi != null && Number.isFinite(dayLo) && Number.isFinite(dayHi)
      ? `${fmtPrice(dayLo)} – ${fmtPrice(dayHi)}`
      : '—'

  const listedYear = r.list_date ? String(r.list_date).slice(0, 4) : '—'
  const employees =
    r.total_employees != null ? r.total_employees.toLocaleString('en-US') : '—'

  const epsTtm =
    ratio?.earnings_per_share ??
    vxTtmRow?.financials?.income_statement?.diluted_earnings_per_share?.value ??
    undefined
  const epsLabel = epsTtm != null && Number.isFinite(epsTtm) ? `$${Number(epsTtm).toFixed(2)}` : '—'

  const keyStatsPage1: { label: string; value: string }[] = [
    { label: 'Market cap', value: fmtUsdShort(mc ?? undefined) },
    { label: 'P/E ratio', value: peLabel },
    { label: 'Dividend yield', value: divYieldLabel },
    { label: 'Revenue (last 12 months)', value: fmtUsdShort(ttmRevenue ?? undefined) },
    { label: 'Net profit (last 12 months)', value: fmtUsdShort(ttmNet ?? undefined) },
    { label: "Today's volume", value: fmtShares(volToday ?? undefined) },
  ]

  const keyStatsPage2: { label: string; value: string }[] = [
    { label: 'Previous close', value: fmtPrice(prevClose ?? undefined) },
    { label: "Today's range (low – high)", value: dayRange },
    { label: 'Earnings per share (TTM)', value: epsLabel },
    { label: 'Primary exchange', value: r.primary_exchange ?? '—' },
    { label: 'Employees (approx.)', value: employees },
    { label: 'Year listed', value: listedYear },
  ]

  const founded = r.list_date ? String(r.list_date).slice(0, 4) : '—'

  return {
    ticker: sym,
    name,
    description,
    iconUrl,
    lastPrice,
    lastPriceLabel,
    changeToday: ch,
    changeTodayPct: chp,
    changeTodayLabel,
    about: {
      ceo: '—',
      founded,
      employees,
      headquarters: formatHQ(r),
    },
    keyStatsPage1,
    keyStatsPage2,
    financialsAnnual,
    financialsQuarterly,
    financialsEpsAnnual,
    financialsEpsQuarterly,
    updatedAt: new Date().toISOString(),
  }
}

export type ChartRange = '1D' | '5D' | '1M' | '3M' | '1Y' | '5Y'

/** When set, aggs are loaded for this wall-clock window instead of “ending at now”. Used by perform compare so bars align with chart `sampledAtMs`. */
export type FetchStockBarsWindow = {
  windowStartMs: number
  windowEndMs: number
}

/** Massive/Polygon aggregate timestamps are usually ms; normalize ns or sec shapes defensively. */
export function normalizeAggTimestampMs(t: number): number {
  if (!Number.isFinite(t)) return t
  if (t > 1e15) return Math.floor(t / 1e6)
  if (t > 1e12) return Math.floor(t)
  if (t > 1e9 && t < 1e11) return Math.floor(t * 1000)
  return Math.floor(t)
}

export async function fetchStockBars(
  ticker: string,
  range: ChartRange,
  window?: FetchStockBarsWindow | null,
): Promise<StockDetailBar[]> {
  const sym = resolveMassiveTicker(ticker)
  if (!sym) return []
  let to: Date
  let from: Date
  let multiplier = 1
  let timespan: 'minute' | 'hour' | 'day' = 'day'

  switch (range) {
    case '1D':
      multiplier = 5
      timespan = 'minute'
      break
    case '5D':
      multiplier = 15
      timespan = 'minute'
      break
    case '1M':
      multiplier = 1
      timespan = 'day'
      break
    case '3M':
      multiplier = 1
      timespan = 'day'
      break
    case '1Y':
      multiplier = 1
      timespan = 'day'
      break
    case '5Y':
      multiplier = 1
      timespan = 'day'
      break
    default:
      multiplier = 1
      timespan = 'day'
  }

  const DAY_MS = MS_PER_DAY

  if (window && Number.isFinite(window.windowStartMs) && Number.isFinite(window.windowEndMs)) {
    let endMs = window.windowEndMs
    let startMs = window.windowStartMs
    if (startMs >= endMs) {
      startMs = endMs - DAY_MS
    }
    to = new Date(endMs)
    from = new Date(startMs)
    /*
     * Intraday aggs: chart window can be < one UTC calendar day while Massive expects a multi-day
     * /from/to/ span — too-tight ymd(from)/ymd(to) returns empty or errors. Pad start backward and
     * enforce a minimum span so compare 1D / 5D always get bars to resample.
     */
    if (timespan === 'minute') {
      from = new Date(Math.min(startMs, endMs) - DAY_MS)
      if (endMs - from.getTime() < 2.5 * DAY_MS) {
        from = new Date(endMs - Math.ceil(2.5 * DAY_MS))
      }
    } else if (timespan === 'day') {
      /*
       * Daily aggregates are keyed by calendar day in /from/to/. A wall-clock window shorter than
       * a few days often collapses to a single bar; resampling then yields a flat line. Ensure a
       * minimum span comparable to the selected chart range so perform / net-worth MTM curves move.
       */
      const span = endMs - startMs
      const minSpan =
        range === '1M'
          ? 28 * DAY_MS
          : range === '3M'
            ? 90 * DAY_MS
            : range === '1Y'
              ? 365 * DAY_MS
              : range === '5Y'
                ? 5 * 365 * DAY_MS
                : 5 * DAY_MS
      if (span < minSpan) {
        from = new Date(endMs - minSpan)
      }
    }
  } else {
    to = new Date()
    /* Crypto 1D: request ~48h of UTC calendar coverage so `ymd(from)`/`ymd(to)` always spans the rolling window, then clip to last 24h (avoids local `setDate` vs UTC `ymd` mismatch). */
    if (range === '1D' && sym.startsWith('X:')) {
      from = new Date(to.getTime() - 2 * DAY_MS)
    } else {
      from = new Date(to)
      switch (range) {
        case '1D':
          from.setDate(from.getDate() - 1)
          break
        case '5D':
          from.setDate(from.getDate() - 5)
          break
        case '1M':
          from.setMonth(from.getMonth() - 1)
          break
        case '3M':
          from.setMonth(from.getMonth() - 3)
          break
        case '1Y':
          from.setFullYear(from.getFullYear() - 1)
          break
        case '5Y':
          from.setFullYear(from.getFullYear() - 5)
          break
        default:
          from.setFullYear(from.getFullYear() - 1)
          break
      }
    }
  }

  const path = `/v2/aggs/ticker/${encodeURIComponent(sym)}/range/${multiplier}/${timespan}/${ymd(from)}/${ymd(to)}`
  /* Crypto composites (X:…) use unadjusted bars; stocks use adjusted. */
  const data = await massiveGet<AggsResponse>(path, {
    adjusted: sym.startsWith('X:') ? 'false' : 'true',
    sort: 'asc',
    limit: '5000',
  })

  const bars = (data.results ?? [])
    .filter((b): b is AggBar & { t: number } => typeof b.t === 'number')
    .map((b) => ({
      t: normalizeAggTimestampMs(b.t!),
      o: b.o ?? b.c ?? 0,
      h: b.h ?? b.c ?? 0,
      l: b.l ?? b.c ?? 0,
      c: b.c ?? 0,
      v: b.v ?? 0,
    }))

  if (!window && range === '1D' && sym.startsWith('X:')) {
    return clipCryptoRolling24hBars(bars)
  }
  return bars
}

const US_MARKET_TZ = 'America/New_York'

function easternDayKey(utcMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: US_MARKET_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utcMs))
}

/** Keep bars whose ET session date is one of the last `dayCount` distinct dates in the series (sorted by time). */
export function sliceBarsToLastDistinctMarketDays(bars: StockDetailBar[], dayCount: number): StockDetailBar[] {
  if (!bars.length || dayCount < 1) return []
  const ordered = [...bars].sort((a, b) => a.t - b.t)
  const distinctDays = [...new Set(ordered.map((b) => easternDayKey(b.t)))].sort()
  const lastDays = distinctDays.slice(-dayCount)
  const allow = new Set(lastDays)
  return ordered.filter((b) => allow.has(easternDayKey(b.t)))
}

/** Fewer than this many 1D intraday points → treat as missing (e.g. weekend) and widen to prior sessions. */
const MIN_1D_INTRADAY_BARS = 2

function isSparseOrMissing1Day(bars: StockDetailBar[]): boolean {
  return bars.length < MIN_1D_INTRADAY_BARS
}

/**
 * Prefer true 1D intraday. If data is empty or too sparse (weekends, holidays), use the last two ET market days from 5D aggs.
 */
export async function fetchStockBars1DayOrLastTwoSessions(ticker: string): Promise<StockDetailBar[]> {
  const sym = resolveMassiveTicker(ticker)
  if (!sym) return []

  /* Crypto trades 24/7 — avoid slicing by US equity sessions; 1D is always rolling last 24h (see fetchStockBars clip). */
  if (sym.startsWith('X:')) {
    const oneDay = await fetchStockBars(sym, '1D')
    if (!isSparseOrMissing1Day(oneDay)) return oneDay
    const fiveDay = await fetchStockBars(sym, '5D')
    const fiveDay24 = clipCryptoRolling24hBars(fiveDay)
    if (!isSparseOrMissing1Day(fiveDay24)) return fiveDay24
    const oneM = await fetchStockBars(sym, '1M')
    const oneM24 = clipCryptoRolling24hBars(oneM)
    if (!isSparseOrMissing1Day(oneM24)) return oneM24
    return fiveDay24.length ? fiveDay24 : oneDay
  }

  const oneDay = await fetchStockBars(sym, '1D')
  if (!isSparseOrMissing1Day(oneDay)) {
    return oneDay
  }
  const fiveDay = await fetchStockBars(sym, '5D')
  const twoSessions = sliceBarsToLastDistinctMarketDays(fiveDay, 2)
  if (twoSessions.length >= MIN_1D_INTRADAY_BARS) {
    return twoSessions
  }
  if (fiveDay.length >= MIN_1D_INTRADAY_BARS) {
    return fiveDay
  }
  return twoSessions.length ? twoSessions : fiveDay
}

/**
 * When snapshot `lastTrade` / quotes are empty (plan limits, new listing, or odd JSON), use the
 * most recent aggregate close — same path as charts. Keeps browse/portfolio prices aligned with
 * what users see on the detail screen.
 */
export async function pickLastCloseFromRecentAggs(sym: string): Promise<number | null> {
  const resolved = resolveMassiveTicker(sym)
  if (!resolved) return null
  try {
    const bars = await fetchStockBars1DayOrLastTwoSessions(resolved)
    for (let i = bars.length - 1; i >= 0; i--) {
      const c = bars[i]!.c
      if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Last aggregate close at or before `endMs` (game freeze / final mark). */
export async function fetchLastCloseAtOrBefore(sym: string, endMs: number): Promise<number | null> {
  const resolved = resolveMassiveTicker(sym)
  if (!resolved) return null
  const end = Number.isFinite(endMs) ? endMs : Date.now()
  const MS_DAY = 86_400_000
  try {
    const intraday = await fetchStockBars(resolved, '1D', {
      windowStartMs: end - 3 * MS_DAY,
      windowEndMs: end,
    })
    const intr = [...intraday]
      .filter((b) => Number.isFinite(b.t) && b.t <= end && typeof b.c === 'number' && b.c > 0)
      .sort((a, b) => a.t - b.t)
    if (intr.length) return intr[intr.length - 1]!.c
    const daily = await fetchStockBars(resolved, '1M', {
      windowStartMs: end - 400 * MS_DAY,
      windowEndMs: end,
    })
    const ds = [...daily]
      .filter((b) => Number.isFinite(b.t) && b.t <= end && typeof b.c === 'number' && b.c > 0)
      .sort((a, b) => a.t - b.t)
    if (ds.length) return ds[ds.length - 1]!.c
  } catch {
    /* fall through */
  }
  return pickLastCloseFromRecentAggs(resolved)
}

/**
 * Most recent 1-minute bar close for a crypto composite. Unlike US equities, crypto trades 24/7,
 * but Massive snapshot `lastTrade` can lag or appear “stuck” outside regular equity hours; this
 * path tracks the rolling minute aggregate so headline prices keep updating overnight.
 */
export async function fetchLatestCryptoAggClose(sym: string): Promise<number | null> {
  const resolved = resolveMassiveTicker(sym)
  if (!resolved?.startsWith('X:')) return null
  const to = new Date()
  const from = new Date(to.getTime() - 2 * MS_PER_DAY)
  try {
    const data = await massiveGet<AggsResponse>(
      `/v2/aggs/ticker/${encodeURIComponent(resolved)}/range/1/minute/${ymd(from)}/${ymd(to)}`,
      { adjusted: 'false', sort: 'desc', limit: '1' },
    )
    const c = data.results?.[0]?.c
    return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : null
  } catch {
    return null
  }
}
