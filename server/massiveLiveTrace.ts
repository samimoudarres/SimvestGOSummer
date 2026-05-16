/**
 * Opt-in tracing for Massive live pricing paths (`MASSIVE_LIVE_TRACE=1`).
 * Parses raw JSON to estimate “as of” time vs server clock — proves upstream vs in-app lag.
 */

function envFlag(name: string): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function massiveLiveTraceEnabled(): boolean {
  return envFlag('MASSIVE_LIVE_TRACE')
}

export function isLivePricingPathname(pathname: string): boolean {
  return pathname.includes('/v2/snapshot/') || pathname.includes('/v2/aggs/ticker/')
}

/** Polygon/Massive timestamps: ns, µs, or ms since epoch. */
function toUnixMs(n: number): number | null {
  if (!Number.isFinite(n)) return null
  if (n > 1e16) return Math.floor(n / 1e6)
  if (n > 1e14) return Math.floor(n / 1e3)
  if (n > 1e12) return Math.floor(n)
  if (n > 1e9) return Math.floor(n * 1000)
  return null
}

function numFrom(o: unknown, keys: string[]): number | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

function maxObservedFromTradeLike(o: unknown): number | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const keys = ['sip_timestamp', 'SIP_timestamp', 'participant_timestamp', 't', 'T', 'timestamp', 'time']
  let best: number | null = null
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'number') {
      const ms = toUnixMs(v)
      if (ms != null && (best == null || ms > best)) best = ms
    }
  }
  return best
}

function walkSnapshotTicker(t: unknown, depth = 0): { observedMs: number | null; price: number | null } {
  if (depth > 8 || !t || typeof t !== 'object') return { observedMs: null, price: null }
  const o = t as Record<string, unknown>
  let observed: number | null = null
  const merge = (ms: number | null) => {
    if (ms != null && (observed == null || ms > observed)) observed = ms
  }
  merge(maxObservedFromTradeLike(o.lastTrade))
  merge(maxObservedFromTradeLike(o.last_trade))
  merge(maxObservedFromTradeLike(o.lastQuote))
  merge(maxObservedFromTradeLike(o.last_quote))
  merge(maxObservedFromTradeLike(o.min))
  merge(maxObservedFromTradeLike(o.day))
  merge(maxObservedFromTradeLike(o.prevDay))
  merge(maxObservedFromTradeLike(o.prev_day))
  const inner = o.ticker
  if (inner && typeof inner === 'object') {
    const innerRes = walkSnapshotTicker(inner, depth + 1)
    merge(innerRes.observedMs)
  }
  const price =
    numFrom(o.lastTrade, ['p', 'P', 'price']) ??
    numFrom(o.last_trade as object, ['p', 'P', 'price']) ??
    numFrom(o.lastQuote, ['p', 'P', 'price']) ??
    numFrom(o.min, ['c', 'C', 'close']) ??
    numFrom(o.day, ['c', 'C', 'close']) ??
    null
  return { observedMs: observed, price: typeof price === 'number' && price > 0 ? price : null }
}

function walkAggs(text: string): { observedMs: number | null; price: number | null } {
  try {
    const j = JSON.parse(text) as { results?: { t?: number; c?: number }[] }
    const rows = j.results ?? []
    let bestT: number | null = null
    let price: number | null = null
    for (const row of rows) {
      if (row && typeof row.t === 'number' && Number.isFinite(row.t)) {
        const ms = toUnixMs(row.t) ?? row.t
        if (ms != null && (bestT == null || ms > bestT)) {
          bestT = ms
          if (typeof row.c === 'number' && row.c > 0) price = row.c
        }
      }
    }
    return { observedMs: bestT, price }
  } catch {
    return { observedMs: null, price: null }
  }
}

export type MassiveLiveTraceSummary = {
  observedMs: number | null
  price: number | null
  tickers: { sym: string; observedMs: number | null; price: number | null }[]
}

export function summarizeMassiveLiveResponse(pathname: string, text: string): MassiveLiveTraceSummary {
  const tickers: { sym: string; observedMs: number | null; price: number | null }[] = []
  let observedMs: number | null = null
  let price: number | null = null

  if (pathname.includes('/v2/aggs/ticker/')) {
    const ag = walkAggs(text)
    observedMs = ag.observedMs
    price = ag.price
    return { observedMs, price, tickers }
  }

  try {
    const j = JSON.parse(text) as Record<string, unknown>
    const list = j.tickers
    if (Array.isArray(list)) {
      for (const raw of list) {
        const flat = raw && typeof raw === 'object' && (raw as Record<string, unknown>).ticker
        const row = (flat && typeof flat === 'object' ? { ...(raw as object), ...(flat as object) } : raw) as Record<
          string,
          unknown
        >
        const sym =
          (typeof row.ticker === 'string' ? row.ticker : null) ??
          (typeof (row as { T?: string }).T === 'string' ? (row as { T: string }).T : null) ??
          '?'
        const w = walkSnapshotTicker(row)
        tickers.push({ sym, observedMs: w.observedMs, price: w.price })
        if (w.observedMs != null && (observedMs == null || w.observedMs > observedMs)) observedMs = w.observedMs
        if (w.price != null) price = w.price
      }
      return { observedMs, price, tickers }
    }
    const single = j.ticker ?? j.results
    const w = walkSnapshotTicker(single)
    const sym =
      typeof (j as { ticker?: { ticker?: string } }).ticker?.ticker === 'string'
        ? (j as { ticker: { ticker: string } }).ticker.ticker
        : '?'
    tickers.push({ sym, observedMs: w.observedMs, price: w.price })
    return { observedMs: w.observedMs, price: w.price, tickers }
  } catch {
    return { observedMs: null, price: null, tickers }
  }
}

function redactUrl(u: string): string {
  return u.replace(/apiKey=[^&]+/i, 'apiKey=(redacted)')
}

export function logMassive429(pathname: string, fullUrl: string, attempt: number, backoffMs: number, retryAfter: number | null): void {
  if (!massiveLiveTraceEnabled()) return
  const serverIso = new Date().toISOString()
  console.warn(
    `[MassiveLiveTrace] 429 serverIso=${serverIso} attempt=${attempt} backoffMs=${Math.round(backoffMs)} retryAfterSec=${retryAfter ?? 'n/a'} path=${pathname} url=${redactUrl(fullUrl)}`,
  )
}

export function logMassiveNetworkResponse(
  pathname: string,
  fullUrl: string,
  text: string,
  source: 'network' | 'cache-hit' | 'inflight',
  cacheAgeMs: number | null,
): void {
  if (!massiveLiveTraceEnabled()) return
  if (!isLivePricingPathname(pathname)) return
  const serverMs = Date.now()
  const serverIso = new Date(serverMs).toISOString()
  const sum = summarizeMassiveLiveResponse(pathname, text)
  const parts: string[] = [
    `[MassiveLiveTrace] ${source}`,
    `serverIso=${serverIso}`,
    `path=${pathname}`,
    `url=${redactUrl(fullUrl)}`,
  ]
  if (cacheAgeMs != null) parts.push(`cacheAgeMs=${Math.round(cacheAgeMs)}`)
  if (sum.observedMs != null) {
    const lagSec = (serverMs - sum.observedMs) / 1000
    parts.push(`latestObservedIso=${new Date(sum.observedMs).toISOString()}`)
    parts.push(`lagSec=${lagSec.toFixed(3)}`)
  } else {
    parts.push(`latestObservedIso=n/a`)
    parts.push(`lagSec=n/a`)
  }
  if (sum.price != null) parts.push(`price=${sum.price}`)
  if (sum.tickers.length > 0 && sum.tickers.length <= 30) {
    const brief = sum.tickers
      .map((t) => {
        const lag =
          t.observedMs != null ? `${((serverMs - t.observedMs) / 1000).toFixed(1)}s` : 'n/a'
        return `${t.sym}:p=${t.price ?? 'n/a'}:lag=${lag}`
      })
      .join(' | ')
    parts.push(`rows=${brief}`)
  }
  console.log(parts.join(' '))
}
