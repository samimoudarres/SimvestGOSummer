/**
 * Live check: fast list path + real session sparks (sync top-N, then full after backfill).
 * Run: npx tsx server/scripts/verifyIntradaySparks.ts
 */
import { config } from 'dotenv'
config()

import {
  LIST_SPARK_SYNC_MAX,
  fetchStockBars1DayOrLastTwoSessions,
  lastSessionMetricsFromBars,
} from '../stockService'
import { fetchTradeBrowse } from '../tradeService'
import { buildPortfolioRows } from '../portfolioService'

function uniqRounded(spark: number[]): number {
  return new Set(spark.map((v) => Math.round(v * 100) / 100)).size
}

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

  console.log('--- trade browse popular (cold sync top-N) ---')
  const t0 = Date.now()
  const browse = await fetchTradeBrowse('verify-local-fast', null, 'popular')
  const coldMs = Date.now() - t0
  console.log(`browse cold ${coldMs}ms rows=${browse.rows.length} syncMax=${LIST_SPARK_SYNC_MAX}`)
  if (coldMs > 12_000) {
    throw new Error(`browse cold path too slow: ${coldMs}ms (expected sync top-${LIST_SPARK_SYNC_MAX} only)`)
  }
  for (const sym of ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META'].slice(0, LIST_SPARK_SYNC_MAX)) {
    const row = browse.rows.find((r) => r.symbol === sym)
    if (!row) throw new Error(`browse missing ${sym}`)
    assertRealCurve(`browse-cold:${sym}`, row.sparkline)
  }

  console.log('--- wait for browse spark backfill ---')
  await new Promise((r) => setTimeout(r, 3500))
  const browse2 = await fetchTradeBrowse('verify-local-fast', null, 'popular')
  for (const sym of ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO'].slice(0, 8)) {
    const row = browse2.rows.find((r) => r.symbol === sym)
    if (!row) throw new Error(`browse2 missing ${sym}`)
    assertRealCurve(`browse-warm:${sym}`, row.sparkline)
  }

  console.log('--- portfolio rows ---')
  const holdings = symbols.map((ticker) => ({
    userId: 'verify',
    ticker,
    shares: 1,
    avgCost: 100,
  }))
  const t1 = Date.now()
  const rows = await buildPortfolioRows(holdings as never)
  console.log(`portfolio ${Date.now() - t1}ms`)
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
