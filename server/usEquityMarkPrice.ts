/**
 * US equity regular-session calendar + stable mark prices when the NYSE/Nasdaq
 * regular session is closed (weekends, pre-market, after-hours).
 *
 * Crypto (`X:`) is unaffected — it trades 24/7.
 */

import { pickTickerSnapshotPrice } from './stockService'

const NY_TZ = 'America/New_York'
const SESSION_OPEN_MIN = 9 * 60 + 30 // 9:30 ET
const SESSION_CLOSE_MIN = 16 * 60 // 4:00 PM ET

export type SnapshotTickerLike = {
  day?: { c?: number; o?: number }
  prevDay?: { c?: number }
  lastTrade?: { p?: number }
  lastQuote?: { p?: number; P?: number }
  min?: { c?: number }
  todaysChange?: number
  todaysChangePerc?: number
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

/** Last regular-session close from the snapshot day aggregate (not after-hours prints). */
export function pickUsEquityOfficialClose(s: SnapshotTickerLike | undefined): number | null {
  if (!s) return null
  const dayClose = numFromObj(s.day, 'c', 'C', 'close')
  if (dayClose != null) return dayClose
  return numFromObj(s.prevDay, 'c', 'C', 'close')
}

/**
 * Mark price for portfolio, feed, and browse.
 * US stocks outside regular session use the official session close; crypto stays live.
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
  return pickUsEquityOfficialClose(s) ?? pickTickerSnapshotPrice(s as never)
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
 * Per-share $ move vs prior close for the **completed** regular session.
 * Returns 0 on non-trading days and before the open; `null` during regular session (caller uses live math).
 */
export function pickUsEquityFrozenDayChangePerShare(
  s: SnapshotTickerLike | undefined,
  atMs = Date.now(),
): number | null {
  if (isUsEquityRegularSessionOpen(atMs)) return null
  if (!isUsEquityCalendarTradingDay(atMs)) return 0

  const fromSnap = readTodaysChangeDollars(s)
  if (fromSnap != null && Number.isFinite(fromSnap)) return fromSnap

  const close = pickUsEquityOfficialClose(s)
  const prev = numFromObj(s?.prevDay, 'c', 'C', 'close')
  if (close != null && prev != null && prev !== 0) return close - prev
  return 0
}

/** Session % change when the regular US market is closed; `null` during regular session. */
export function pickUsEquityFrozenChangePct(
  s: SnapshotTickerLike | undefined,
  atMs = Date.now(),
): number | null {
  if (isUsEquityRegularSessionOpen(atMs)) return null
  if (!isUsEquityCalendarTradingDay(atMs)) return 0

  const fromSnap = readTodaysChangePerc(s)
  if (fromSnap != null && Number.isFinite(fromSnap)) return fromSnap

  const perShare = pickUsEquityFrozenDayChangePerShare(s, atMs)
  const prev = numFromObj(s?.prevDay, 'c', 'C', 'close')
  if (perShare != null && prev != null && prev !== 0) return (perShare / prev) * 100
  return 0
}
