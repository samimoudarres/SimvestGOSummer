/**
 * Live check: weekend Massive day-empty → non-zero % + moving spark for MSFT/AAPL.
 * Run: npx tsx server/scripts/verifyWeekendBrowseSpark.ts
 */
import { config } from 'dotenv'
config()
import { fetchTradeBrowse } from '../tradeService'

function sparkUniq(spark: number[]): number {
  const s = new Set(spark.map((v) => Math.round(v * 100) / 100))
  return s.size
}

async function main() {
  const payload = await fetchTradeBrowse('verify-local', null, 'popular')
  for (const sym of ['MSFT', 'AAPL', 'NVDA']) {
    const row = payload.rows.find((r) => r.symbol === sym)
    if (!row) {
      console.log(`${sym}: missing`)
      continue
    }
    const uniq = sparkUniq(row.sparkline)
    const zero = /^\+?0\.00%$/.test(row.changeLabel.trim())
    console.log(
      `${sym} change=${row.changeLabel} price=${row.price} sparkLen=${row.sparkline.length} sparkUniq≈${uniq} zero=${zero}`,
    )
    if (zero) throw new Error(`${sym} still +0.00%`)
    if (uniq < 2) throw new Error(`${sym} spark still flat`)
  }
  console.log('verifyWeekendBrowseSpark: ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
