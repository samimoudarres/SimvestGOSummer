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
assert(pickUsEquityFrozenChangePct(snap, tueAfterClose) === 5.26, 'Frozen % from snapshot')
assert(pickUsEquityFrozenChangePct(snap, satAfternoon) === 0, 'Weekend today % is zero')

console.log('verifyUsEquityMarkPrice: ok')
