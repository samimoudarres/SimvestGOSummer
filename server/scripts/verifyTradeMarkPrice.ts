/**
 * Unit-style checks for trade fill slip band (no network).
 *
 *   npx tsx server/scripts/verifyTradeMarkPrice.ts
 */
import { resolveTradeFillPrice, TRADE_FILL_SLIP_BAND } from '../tradeMarkPrice'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const mark = 100
const within = resolveTradeFillPrice({
  shares: 2,
  serverMark: mark,
  clientFillPrice: mark * (1 + TRADE_FILL_SLIP_BAND * 0.5),
})
assert(within.usedClientPrice, 'client within band should be used')
assert(Math.abs(within.fillPrice - mark * (1 + TRADE_FILL_SLIP_BAND * 0.5)) < 1e-9, 'fill')
assert(Math.abs(within.orderTotal - within.fillPrice * 2) < 1e-9, 'orderTotal')

const outside = resolveTradeFillPrice({
  shares: 3,
  serverMark: mark,
  clientFillPrice: mark * 1.5,
})
assert(!outside.usedClientPrice, 'client outside band should be overridden')
assert(outside.fillPrice === mark, 'server mark used')
assert(outside.orderTotal === 300, 'orderTotal from mark')

const missing = resolveTradeFillPrice({ shares: 1, serverMark: mark, clientFillPrice: null })
assert(!missing.usedClientPrice && missing.fillPrice === mark, 'null client → mark')

console.log(`OK — slip band ±${TRADE_FILL_SLIP_BAND * 100}% fill resolution`)
