/**
 * Live check: browse + portfolio sparks must be real session curves (not snapshot diagonals).
 * Run: npx tsx server/scripts/verifyIntradaySparks.ts
 */
import { config } from 'dotenv'
config()

import {
  fetchStockBars1DayOrLastTwoSessions,
  lastSessionMetricsFromBars,
} from '../stockService'
import { fetchTradeBrowse } from '../tradeService'
import { buildPortfolioRows } from '../portfolioService'

function uniqRounded(spark: number[]): number {
  return new Set(spark.map((v) => Math.round(v * 100) / 100)).size
}

/** Max |residual| from linear fit open→close across spark points (0 = perfect diagonal). */
function maxLinearResidual(spark: number[]): number {
  if (spark.length < 3) return 0
  const a = spark[0]!
  const b = spark[spark.length - 1]!
  let max = 0
  for (let i = 0; i < spark.length; i++) {
    const t = i / (spark.length - 1)
    const expected = a + (b - a) * t
    max = Math.max(max, Math.abs(spark[i]! - expected))
  }
  return max
}

function assertRealCurve(label: string, spark: number[]) {
  if (spark.length < 3) throw new Error(`${label}: spark too short (${spark.length})`)
  const uniq = uniqRounded(spark)
  if (uniq < 3) throw new Error(`${label}: spark nearly flat (uniq≈${uniq})`)
  const resid = maxLinearResidual(spark)
  const span = Math.abs(spark[spark.length - 1]! - spark[0]!) || 1
  const residPct = resid / span
  /* Snapshot diagonals are exact linear (resid≈0). Real intraday has wiggles. */
  if (residPct < 0.002 && spark.length >= 20) {
    throw new Error(
      `${label}: looks like snapshot diagonal (len=${spark.length} resid=${resid.toFixed(6)} residPct=${residPct.toFixed(5)})`,
    )
  }
  console.log(
    `ok ${label} len=${spark.length} uniq≈${uniq} resid=${resid.toFixed(4)} residPct=${residPct.toFixed(4)}`,
  )
}

async function main() {
  const symbols = ['AAPL', 'MSFT', 'META', 'NFLX', 'HSY']

  console.log('--- raw bars → lastSessionMetrics ---')
  for (const sym of symbols) {
    const bars = await fetchStockBars1DayOrLastTwoSessions(sym)
    const m = lastSessionMetricsFromBars(bars)
    console.log(`${sym} bars=${bars.length} sparkLen=${m.spark.length} change=${m.changePct?.toFixed(2) ?? '—'}%`)
    assertRealCurve(`bars:${sym}`, m.spark)
  }

  console.log('--- trade browse popular ---')
  const browse = await fetchTradeBrowse('verify-local', null, 'popular')
  for (const sym of ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META']) {
    const row = browse.rows.find((r) => r.symbol === sym)
    if (!row) throw new Error(`browse missing ${sym}`)
    assertRealCurve(`browse:${sym}`, row.sparkline)
  }

  console.log('--- portfolio rows (via buildPortfolioRows) ---')
  const holdings = symbols.map((ticker) => ({
    userId: 'verify',
    ticker,
    shares: 1,
    avgCost: 100,
  }))
  const rows = await buildPortfolioRows(holdings as never)
  for (const sym of symbols) {
    const row = rows.find((r) => r.ticker === sym)
    if (!row) throw new Error(`portfolio missing ${sym}`)
    assertRealCurve(`portfolio:${sym}`, row.sparkline)
  }

  console.log('verifyIntradaySparks: ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
