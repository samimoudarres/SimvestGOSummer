/**
 * Quick sanity checks for US equity session mark-price helpers.
 * Run: npx tsx server/scripts/verifyUsEquityMarkPrice.ts
 */
import {
  isUsEquityRegularSessionOpen,
  isUsEquityCalendarTradingDay,
  pickUsEquityFrozenChangePct,
  pickStockMarkPrice,
} from '../usEquityMarkPrice'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

// Saturday 2026-05-16 15:00 ET (approx — use fixed UTC instant)
const satAfternoon = new Date('2026-05-16T19:00:00.000Z').getTime()
assert(!isUsEquityCalendarTradingDay(satAfternoon), 'Saturday is not a trading day')
assert(!isUsEquityRegularSessionOpen(satAfternoon), 'Saturday session closed')

// Tuesday after close 2026-05-19 21:00 UTC ≈ 5pm ET (DST)
const tueAfterClose = new Date('2026-05-19T21:00:00.000Z').getTime()
assert(isUsEquityCalendarTradingDay(tueAfterClose), 'Tuesday is a trading day')
assert(!isUsEquityRegularSessionOpen(tueAfterClose), 'After 4pm ET session closed')

const snap = {
  day: { c: 100 },
  prevDay: { c: 95 },
  lastTrade: { p: 101.5 },
  todaysChange: 5,
  todaysChangePerc: 5.26,
}

assert(pickStockMarkPrice('AAPL', snap, tueAfterClose) === 100, 'After hours uses day close not lastTrade')
assert(pickUsEquityFrozenChangePct('AAPL', snap, tueAfterClose) === 5.26, 'Frozen % from snapshot')
assert(pickUsEquityFrozenChangePct('AAPL', snap, satAfternoon) === 5.26, 'Weekend keeps last session %')

// Weekend: alternate snapshots must not flicker (batch vs single-ticker shapes)
const snapA = { day: { c: 81.21 }, prevDay: { c: 80.5 }, lastTrade: { p: 81.92 } }
const snapB = { prevDay: { c: 81.21 }, lastTrade: { p: 81.92 } }
const pxA = pickStockMarkPrice('KO', snapA, satAfternoon)
const pxB = pickStockMarkPrice('KO', snapB, satAfternoon)
assert(pxA === pxB, `Weekend KO mark must be stable (got ${pxA} vs ${pxB})`)
assert(pxA === 81.21, `Weekend uses day/prev close (got ${pxA})`)
const pctWeekendA = pickUsEquityFrozenChangePct('KO', snapA, satAfternoon)
assert(pctWeekendA != null && Math.abs(pctWeekendA - ((81.21 - 80.5) / 80.5) * 100) < 0.01, 'Weekend % from day vs prev')

// Massive weekend reset: day all zeros + todaysChangePerc=0, Friday OHLC in prevDay
const weekendReset = {
  day: { o: 0, h: 0, l: 0, c: 0, v: 0 },
  prevDay: { o: 394.855, h: 398.39, l: 389.39, c: 393.82 },
  todaysChange: 0,
  todaysChangePerc: 0,
  lastTrade: undefined,
}
assert(pickStockMarkPrice('MSFT', weekendReset, satAfternoon) === 393.82, 'Weekend mark from prevDay.c')
const pctReset = pickUsEquityFrozenChangePct('MSFT', weekendReset, satAfternoon)
const expectedOpenClose = ((393.82 - 394.855) / 394.855) * 100
assert(
  pctReset != null && Math.abs(pctReset - expectedOpenClose) < 0.01,
  `Weekend must ignore Massive 0% when day empty (got ${pctReset})`,
)
assert(Math.abs(pctReset!) > 0.01, 'Weekend % must not be +0.00')

// Since-purchase % for buy @ 80.88 must not jump when lastTrade drifts
const purchase = 80.88
const pctA = ((pxA! - purchase) / purchase) * 100
const pctB = ((pxB! - purchase) / purchase) * 100
assert(Math.abs(pctA - pctB) < 0.001, 'Since purchase % stable across snapshot shapes')

console.log('verifyUsEquityMarkPrice: ok')
