/**
 * One-shot proof: compare server clock vs timestamps embedded in Massive snapshot / agg JSON.
 *
 * Usage (from repo root):
 *   npx tsx server/scripts/verifyMassiveLiveLag.ts
 *
 * Requires `MASSIVE_API_KEY` in `.env` (same as the app).
 */
import 'dotenv/config'

import { massiveGet } from '../massiveClient'
import { summarizeMassiveLiveResponse } from '../massiveLiveTrace'

function utcYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type Row = {
  label: string
  snapshotPath: string
  aggPath: string
  aggAdjusted: 'true' | 'false'
}

const ROWS: Row[] = [
  {
    label: 'AAPL',
    snapshotPath: '/v2/snapshot/locale/us/markets/stocks/tickers/AAPL',
    aggPath: '/v2/aggs/ticker/AAPL/range/1/minute',
    aggAdjusted: 'true',
  },
  {
    label: 'TSLA',
    snapshotPath: '/v2/snapshot/locale/us/markets/stocks/tickers/TSLA',
    aggPath: '/v2/aggs/ticker/TSLA/range/1/minute',
    aggAdjusted: 'true',
  },
  {
    label: 'X:BTCUSD',
    snapshotPath: `/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent('X:BTCUSD')}`,
    aggPath: `/v2/aggs/ticker/${encodeURIComponent('X:BTCUSD')}/range/1/minute`,
    aggAdjusted: 'false',
  },
  {
    label: 'X:ETHUSD',
    snapshotPath: `/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent('X:ETHUSD')}`,
    aggPath: `/v2/aggs/ticker/${encodeURIComponent('X:ETHUSD')}/range/1/minute`,
    aggAdjusted: 'false',
  },
]

async function main(): Promise<void> {
  if (!process.env.MASSIVE_API_KEY?.trim()) {
    console.error('MASSIVE_API_KEY is not set. Add it to .env in the project root.')
    process.exit(1)
  }

  const to = new Date()
  const from = new Date(to.getTime() - 2 * 86400000)
  const fromY = utcYmd(from)
  const toY = utcYmd(to)

  console.log('=== Massive live lag check ===')
  console.log(`serverNowIso=${to.toISOString()}`)
  console.log('')

  for (const r of ROWS) {
    console.log(`-- ${r.label} --`)
    try {
      const snapObj = await massiveGet<unknown>(r.snapshotPath)
      const snapText = JSON.stringify(snapObj)
      const snapPathname = r.snapshotPath.split('?')[0]!
      const snapSum = summarizeMassiveLiveResponse(snapPathname, snapText)
      const serverMs = Date.now()
      const lagSnapSec =
        snapSum.observedMs != null ? ((serverMs - snapSum.observedMs) / 1000).toFixed(3) : 'n/a'
      console.log(`  SNAPSHOT path=${r.snapshotPath}`)
      console.log(`  snapshot price=${snapSum.price ?? 'n/a'}`)
      console.log(
        `  snapshot latestObservedIso=${snapSum.observedMs != null ? new Date(snapSum.observedMs).toISOString() : 'n/a'}`,
      )
      console.log(`  snapshot lagSec=${lagSnapSec}`)
      if (snapSum.tickers.length) {
        for (const t of snapSum.tickers) {
          const lag = t.observedMs != null ? ((serverMs - t.observedMs) / 1000).toFixed(3) : 'n/a'
          console.log(`    row ${t.sym} price=${t.price ?? 'n/a'} lagSec=${lag}`)
        }
      }

      const aggPathFull = `${r.aggPath}/${fromY}/${toY}`
      const aggObj = await massiveGet<unknown>(aggPathFull, {
        adjusted: r.aggAdjusted,
        sort: 'desc',
        limit: '2',
      })
      const aggText = JSON.stringify(aggObj)
      const aggPathname = aggPathFull.split('?')[0]!
      const aggSum = summarizeMassiveLiveResponse(aggPathname, aggText)
      const lagAggSec =
        aggSum.observedMs != null ? ((serverMs - aggSum.observedMs) / 1000).toFixed(3) : 'n/a'
      console.log(`  AGG path=${aggPathFull}`)
      console.log(`  agg lastClose=${aggSum.price ?? 'n/a'}`)
      console.log(
        `  agg barEndIso=${aggSum.observedMs != null ? new Date(aggSum.observedMs).toISOString() : 'n/a'}`,
      )
      console.log(`  agg lagSec=${lagAggSec}`)
    } catch (e) {
      console.log(`  ERROR ${e instanceof Error ? e.message : String(e)}`)
    }
    console.log('')
  }

  console.log('Interpretation:')
  console.log(
    '- If lagSec is already ~900–1200s on BOTH snapshot and agg lines, Massive is sending delayed market data for this key (not an app cache bug).',
  )
  console.log(
    '- If lagSec is small here but the browser UI is stale, run the API with MASSIVE_LIVE_TRACE=1 and watch for cache-hit / 429 / inflight lines.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
