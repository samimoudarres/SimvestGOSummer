/**
 * US equity regular-session calendar + stable mark prices when the NYSE/Nasdaq
 * regular session is closed (weekends, pre-market, after-hours).
 *
 * Crypto (`X:`) is unaffected — it trades 24/7.
 *
 * Snapshots can return different fields on batch vs single-ticker calls; we cache
 * one stable quote per symbol per NY calendar day so feed/leaderboard numbers
 * do not flicker between refreshes.
 */

import { pickTickerSnapshotPrice } from './stockService'

const NY_TZ = 'America/New_York'
const SESSION_OPEN_MIN = 9 * 60 + 30 // 9:30 ET
const SESSION_CLOSE_MIN = 16 * 60 // 4:00 PM ET
const STABLE_QUOTE_CACHE_MS = 10 * 60_000

export type SnapshotTickerLike = {
  day?: { c?: number; o?: number }
  prevDay?: { c?: number }
  lastTrade?: { p?: number }
  lastQuote?: { p?: number; P?: number }
  min?: { c?: number }
  todaysChange?: number
  todaysChangePerc?: number
}

type StableUsQuote = {
  markPx: number
  dayChangePerShare: number
  dayChangePct: number
}

const stableQuoteCache = new Map<string, { exp: number; quote: StableUsQuote }>()
const MAX_STABLE_QUOTE_CACHE = 300

function putStableQuote(sym: string, quote: StableUsQuote, exp: number): void {
  if (stableQuoteCache.size >= MAX_STABLE_QUOTE_CACHE) {
    const first = stableQuoteCache.keys().next().value
    if (first != null) stableQuoteCache.delete(first)
  }
  stableQuoteCache.set(sym, { exp, quote })
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

function nyWallClock(atMs: number): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(atMs))
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { weekday: map[wd] ?? 1, minutes: hour * 60 + minute }
}

/** `YYYY-MM-DD` in US/Eastern — cache key for stable closes. */
export function etDateKey(atMs = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(atMs))
}

export function isUsEquitySymbol(sym: string): boolean {
  return !!sym && !sym.toUpperCase().startsWith('X:')
}

/** Mon–Fri on the US equity calendar (exchange holidays not modeled). */
export function isUsEquityCalendarTradingDay(atMs = Date.now()): boolean {
  const { weekday } = nyWallClock(atMs)
  return weekday >= 1 && weekday <= 5
}

/** Regular session 9:30 AM – 4:00 PM Eastern, Mon–Fri. */
export function isUsEquityRegularSessionOpen(atMs = Date.now()): boolean {
  if (!isUsEquityCalendarTradingDay(atMs)) return false
  const { minutes } = nyWallClock(atMs)
  return minutes >= SESSION_OPEN_MIN && minutes < SESSION_CLOSE_MIN
}

function readTodaysChangePerc(s: SnapshotTickerLike | undefined): number | null {
  if (!s) return null
  const raw = s as Record<string, unknown>
  const fromSnap =
    typeof s.todaysChangePerc === 'number' && Number.isFinite(s.todaysChangePerc)
      ? s.todaysChangePerc
      : typeof raw.todays_change_perc === 'number' && Number.isFinite(raw.todays_change_perc)
        ? raw.todays_change_perc
        : typeof raw.todays_change_percent === 'number' && Number.isFinite(raw.todays_change_percent)
          ? raw.todays_change_percent
          : null
  return fromSnap
}

function readTodaysChangeDollars(s: SnapshotTickerLike | undefined): number | null {
  if (!s) return null
  const raw = s as Record<string, unknown>
  if (typeof s.todaysChange === 'number' && Number.isFinite(s.todaysChange)) return s.todaysChange
  if (typeof raw.todays_change === 'number' && Number.isFinite(raw.todays_change)) return raw.todays_change
  return null
}

/**
 * Weekend/holiday Massive shape: `day` is all zeros and `todaysChangePerc` is forced to 0,
 * while the last completed session lives in `prevDay` (OHLC). Treating that 0% as real made
 * Trade browse / detail show +0.00% with flat sparks.
 */
export function isSnapshotDaySessionEmpty(s: SnapshotTickerLike | undefined): boolean {
  if (!s?.day) return true
  const c = numFromObj(s.day, 'c', 'C', 'close')
  const o = numFromObj(s.day, 'o', 'O', 'open')
  return c == null && o == null
}

/** Last-session open→close from `prevDay` when Massive zeroed `day` (weekend). */
export function changeFromPrevDaySession(s: SnapshotTickerLike | undefined): {
  perShare: number
  pct: number
} | null {
  const o = numFromObj(s?.prevDay, 'o', 'O', 'open')
  const c = numFromObj(s?.prevDay, 'c', 'C', 'close')
  if (o == null || c == null || o === 0) return null
  return { perShare: c - o, pct: ((c - o) / o) * 100 }
}

/**
 * Stable US equity mark when the regular session is closed.
 * - Weekends/holidays (non trading day): `prevDay.c` only (last completed session).
 * - After hours on a trading day: `day.c` then `prevDay.c`.
 * Never uses lastTrade / min / quote (those caused feed flicker).
 */
function computeStableUsQuote(s: SnapshotTickerLike | undefined, atMs: number): StableUsQuote | null {
  const prev = numFromObj(s?.prevDay, 'c', 'C', 'close')
  const dayClose = numFromObj(s?.day, 'c', 'C', 'close')
  const dayEmpty = isSnapshotDaySessionEmpty(s)

  let markPx: number | null = null
  if (!isUsEquityCalendarTradingDay(atMs)) {
    // Weekends: `day` is often zeroed; last session close sits in `prevDay`.
    markPx = dayClose ?? prev
  } else if (!isUsEquityRegularSessionOpen(atMs)) {
    markPx = dayClose ?? prev
  } else {
    return null
  }

  if (markPx == null || !Number.isFinite(markPx) || markPx <= 0) return null

  /* Weekends/holidays: prefer real last-session move. Ignore Massive’s reset 0% when `day` is empty. */
  const fromSnap$ = readTodaysChangeDollars(s)
  const fromSnapPct = readTodaysChangePerc(s)
  const snapPctTrusted =
    fromSnapPct != null && Number.isFinite(fromSnapPct) && !(dayEmpty && Math.abs(fromSnapPct) < 1e-9)
  const snapDollarTrusted =
    fromSnap$ != null && Number.isFinite(fromSnap$) && !(dayEmpty && Math.abs(fromSnap$) < 1e-9)

  let dayChangePerShare = 0
  let dayChangePct = 0
  if (snapDollarTrusted) {
    dayChangePerShare = fromSnap$!
  } else if (prev != null && prev !== 0 && dayClose != null) {
    dayChangePerShare = dayClose - prev
  } else if (dayEmpty) {
    const fromPrevSession = changeFromPrevDaySession(s)
    if (fromPrevSession) dayChangePerShare = fromPrevSession.perShare
  }

  if (snapPctTrusted) {
    dayChangePct = fromSnapPct!
  } else if (prev != null && prev !== 0 && dayClose != null) {
    dayChangePct = ((dayClose - prev) / prev) * 100
  } else if (dayEmpty) {
    const fromPrevSession = changeFromPrevDaySession(s)
    if (fromPrevSession) dayChangePct = fromPrevSession.pct
  } else if (prev != null && prev !== 0 && dayChangePerShare !== 0) {
    dayChangePct = (dayChangePerShare / prev) * 100
  }

  return { markPx, dayChangePerShare, dayChangePct }
}

function getStableUsEquityQuote(
  sym: string,
  s: SnapshotTickerLike | undefined,
  atMs: number,
): StableUsQuote | null {
  if (!isUsEquitySymbol(sym) || isUsEquityRegularSessionOpen(atMs)) return null

  const cacheKey = `${sym}:v3:${etDateKey(atMs)}`
  const hit = stableQuoteCache.get(cacheKey)
  if (hit && hit.exp > atMs) return hit.quote

  const computed = computeStableUsQuote(s, atMs)
  if (!computed) return null

  putStableQuote(cacheKey, computed, atMs + STABLE_QUOTE_CACHE_MS)
  return computed
}

export function pickUsEquityOfficialClose(
  sym: string,
  s: SnapshotTickerLike | undefined,
  atMs = Date.now(),
): number | null {
  return getStableUsEquityQuote(sym, s, atMs)?.markPx ?? computeStableUsQuote(s, atMs)?.markPx ?? null
}

/**
 * Mark price for portfolio, feed, and browse.
 * US stocks outside regular session use a cached stable close; crypto stays live.
 */
export function pickStockMarkPrice(
  sym: string,
  s: SnapshotTickerLike | undefined,
  atMs = Date.now(),
): number | null {
  if (!isUsEquitySymbol(sym)) {
    return pickTickerSnapshotPrice(s as never)
  }
  if (isUsEquityRegularSessionOpen(atMs)) {
    return pickTickerSnapshotPrice(s as never)
  }
  const stable = getStableUsEquityQuote(sym, s, atMs)
  if (stable) return stable.markPx
  const fallback = computeStableUsQuote(s, atMs)
  return fallback?.markPx ?? null
}

/**
 * Per-share $ move vs prior close for the **completed** regular session.
 * Returns 0 on non-trading days and before the open; `null` during regular session (caller uses live math).
 */
export function pickUsEquityFrozenDayChangePerShare(
  sym: string,
  s: SnapshotTickerLike | undefined,
  atMs = Date.now(),
): number | null {
  if (!isUsEquitySymbol(sym) || isUsEquityRegularSessionOpen(atMs)) return null
  const stable = getStableUsEquityQuote(sym, s, atMs)
  if (stable) return stable.dayChangePerShare
  if (!isUsEquityCalendarTradingDay(atMs)) return 0
  const fromSnap = readTodaysChangeDollars(s)
  if (fromSnap != null && Number.isFinite(fromSnap)) return fromSnap
  const dayClose = numFromObj(s?.day, 'c', 'C', 'close')
  const prev = numFromObj(s?.prevDay, 'c', 'C', 'close')
  if (dayClose != null && prev != null && prev !== 0) return dayClose - prev
  return 0
}

/** Session % change when the regular US market is closed; `null` during regular session. */
export function pickUsEquityFrozenChangePct(
  sym: string,
  s: SnapshotTickerLike | undefined,
  atMs = Date.now(),
): number | null {
  if (!isUsEquitySymbol(sym) || isUsEquityRegularSessionOpen(atMs)) return null
  const stable = getStableUsEquityQuote(sym, s, atMs)
  if (stable) return stable.dayChangePct
  if (!isUsEquityCalendarTradingDay(atMs)) return 0
  const fromSnap = readTodaysChangePerc(s)
  if (fromSnap != null && Number.isFinite(fromSnap)) return fromSnap
  const perShare = pickUsEquityFrozenDayChangePerShare(sym, s, atMs)
  const prev = numFromObj(s?.prevDay, 'c', 'C', 'close')
  if (perShare != null && prev != null && prev !== 0) return (perShare / prev) * 100
  return 0
}
