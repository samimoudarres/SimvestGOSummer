/** Massive REST client — key stays server-side only. Throttles + retries to avoid 429 rate limits. */

import {
  isLivePricingPathname,
  logMassive429,
  logMassiveNetworkResponse,
  massiveLiveTraceEnabled,
} from './massiveLiveTrace'

const MASSIVE_BASE = 'https://api.massive.com'

export class MassiveApiError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`Massive API ${status}: ${body.slice(0, 200)}`)
    this.status = status
    this.body = body
  }
}

function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

/* Defaults balance throughput vs 429s; override via env if your Massive plan is strict. */
const MAX_CONCURRENT = Math.max(1, readNonNegativeInt(process.env.MASSIVE_MAX_CONCURRENT, 5))
const MIN_GAP_MS = readNonNegativeInt(process.env.MASSIVE_MIN_GAP_MS, 55)
/** Non-live Massive GETs (reference, financials, …). Invalid env → safe default. */
const CACHE_TTL_MS = readNonNegativeInt(process.env.MASSIVE_CACHE_TTL_MS, 30_000)
/**
 * Snapshot + aggregate responses only. Short TTL coalesces duplicate identical requests
 * (detail + browse + portfolio polling) so we do not hammer Massive into sustained 429s.
 * Set to `0` in `.env` to disable live response caching entirely (higher 429 risk under load).
 * Values above `LIVE_RESPONSE_CACHE_HARD_CAP_MS` are clamped so a mis-set env cannot cache
 * quotes or aggregates for many minutes.
 */
const LIVE_RESPONSE_MAX_CACHE_MS = readNonNegativeInt(process.env.MASSIVE_LIVE_MAX_CACHE_MS, 2_000)
/** Never cache snapshot/aggs responses longer than this, regardless of `MASSIVE_CACHE_TTL_MS`. */
const LIVE_RESPONSE_CACHE_HARD_CAP_MS = 15_000

/**
 * Slow-changing Massive data: company name/description, financial statements, ratios, and
 * dividend declarations. Only the **list** route `/v3/reference/tickers` is long-cached —
 * `/v3/reference/tickers/{symbol}` must stay on `CACHE_TTL_MS` or a bad prefix match would
 * freeze reference payloads (and anything merged from them) for 30 minutes.
 */
const SLOW_CHANGING_CACHE_MS = Math.max(CACHE_TTL_MS, 30 * 60_000)

function responseCacheTtlMs(pathname: string): number {
  if (CACHE_TTL_MS <= 0) return 0
  const live =
    pathname.includes('/v2/snapshot/') ||
    pathname.includes('/v2/aggs/ticker/')
  if (live) {
    if (LIVE_RESPONSE_MAX_CACHE_MS <= 0) return 0
    return Math.min(CACHE_TTL_MS, LIVE_RESPONSE_MAX_CACHE_MS, LIVE_RESPONSE_CACHE_HARD_CAP_MS)
  }
  const slowChanging =
    pathname === '/v3/reference/tickers' ||
    /^\/v3\/reference\/tickers\/[^/]+$/.test(pathname) ||
    pathname.startsWith('/vX/reference/financials') ||
    pathname.startsWith('/stocks/financials/v1/') ||
    pathname.startsWith('/v3/reference/dividends')
  if (slowChanging) return SLOW_CHANGING_CACHE_MS
  return CACHE_TTL_MS
}
/** Abort hung TCP connections so one stalled fetch cannot occupy all concurrency slots forever. */
const FETCH_TIMEOUT_MS = Math.min(
  Math.max(readNonNegativeInt(process.env.MASSIVE_FETCH_TIMEOUT_MS, 25_000), 5000),
  120_000,
)

let activeRequests = 0
const waiters: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++
    return
  }
  await new Promise<void>((resolve) => {
    waiters.push(resolve)
  })
  activeRequests++
}

function releaseSlot(): void {
  activeRequests--
  const next = waiters.shift()
  if (next) next()
}

let lastRequestStart = 0

async function pace(): Promise<void> {
  if (MIN_GAP_MS <= 0) return
  const now = Date.now()
  const wait = Math.max(0, MIN_GAP_MS - (now - lastRequestStart))
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait))
  }
  lastRequestStart = Date.now()
}

function cacheKey(url: URL): string {
  const u = new URL(url.toString())
  u.searchParams.delete('apiKey')
  return u.toString()
}

type CacheEntry = { exp: number; text: string; storedAt?: number }
const responseCache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string>>()

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function fetchAbortSignal(): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(FETCH_TIMEOUT_MS)
  }
  const ac = new AbortController()
  setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
  return ac.signal
}

function parseRetryAfterSec(res: Response): number | null {
  const ra = res.headers.get('retry-after')
  if (!ra) return null
  const n = Number(ra)
  if (Number.isFinite(n) && n > 0) return Math.min(n, 120)
  const d = Date.parse(ra)
  if (Number.isFinite(d)) {
    const sec = Math.ceil((d - Date.now()) / 1000)
    return sec > 0 ? Math.min(sec, 120) : null
  }
  return null
}

/** Single-flight GET with concurrency limit, spacing, 429 retry, and optional short cache. */
export async function massiveGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const key = process.env.MASSIVE_API_KEY
  if (!key) {
    throw new Error('MASSIVE_API_KEY is not set. Add it to a .env file in the project root.')
  }
  const url = new URL(path.startsWith('/') ? path : `/${path}`, MASSIVE_BASE)
  url.searchParams.set('apiKey', key)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v)
    }
  }

  const ck = cacheKey(url)
  const now = Date.now()
  const ttlForUrl = responseCacheTtlMs(url.pathname)
  if (ttlForUrl > 0) {
    const hit = responseCache.get(ck)
    if (hit && hit.exp > now) {
      try {
        if (massiveLiveTraceEnabled() && isLivePricingPathname(url.pathname)) {
          const cacheAgeMs = hit.storedAt != null ? now - hit.storedAt : null
          logMassiveNetworkResponse(url.pathname, url.toString(), hit.text, 'cache-hit', cacheAgeMs)
        }
        return JSON.parse(hit.text) as T
      } catch {
        responseCache.delete(ck)
      }
    }
  }

  const pending = inflight.get(ck)
  if (pending) {
    try {
      const text = await pending
      if (massiveLiveTraceEnabled() && isLivePricingPathname(url.pathname)) {
        logMassiveNetworkResponse(url.pathname, url.toString(), text, 'inflight', null)
      }
      return JSON.parse(text) as T
    } catch (e) {
      if (e instanceof MassiveApiError) throw e
      throw new MassiveApiError(500, e instanceof Error ? e.message : 'Request failed')
    }
  }

  const promise = (async (): Promise<string> => {
    let lastErr: MassiveApiError | null = null
    for (let attempt = 0; attempt < 6; attempt++) {
      await acquireSlot()
      let backoffMs = 0
      try {
        await pace()

        const res = await fetch(url.toString(), {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
          signal: fetchAbortSignal(),
        })
        const text = await res.text()

        if (res.status === 429) {
          lastErr = new MassiveApiError(res.status, text)
          const retryAfter = parseRetryAfterSec(res)
          const base = retryAfter != null ? retryAfter * 1000 : Math.min(2500 * 2 ** attempt, 20_000)
          /* Small jitter so many parallel waiters do not retry Massive in the same millisecond. */
          backoffMs = base + Math.floor(Math.random() * 400)
          logMassive429(url.pathname, url.toString(), attempt, backoffMs, retryAfter)
        } else if (!res.ok) {
          throw new MassiveApiError(res.status, text)
        } else {
          const ttl = responseCacheTtlMs(url.pathname)
          if (ttl > 0) {
            responseCache.set(ck, { exp: Date.now() + ttl, text, storedAt: Date.now() })
          }
          if (massiveLiveTraceEnabled() && isLivePricingPathname(url.pathname)) {
            logMassiveNetworkResponse(url.pathname, url.toString(), text, 'network', null)
          }
          return text
        }
      } finally {
        /* Critical: release before sleeping on 429 so other routes (portfolio, trade, detail) are not starved. */
        releaseSlot()
      }
      if (backoffMs > 0) {
        await sleep(backoffMs)
        await pace()
      }
    }
    throw lastErr ?? new MassiveApiError(429, 'Too many retries after rate limit')
  })()

  inflight.set(ck, promise)
  try {
    const text = await promise
    try {
      return JSON.parse(text) as T
    } catch {
      throw new MassiveApiError(500, 'Invalid JSON from Massive')
    }
  } finally {
    inflight.delete(ck)
  }
}
