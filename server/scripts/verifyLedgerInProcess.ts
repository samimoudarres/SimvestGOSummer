/**
 * Validates ledger → portfolio rows → perform stats without HTTP (no server required).
 * Runs three sequential buys and asserts positions and metrics update each round.
 *
 *   npx tsx server/scripts/verifyLedgerInProcess.ts
 */
import { applyTradeToUserLedger, getLedgerHoldingsForGame } from '../userGameStateService'
import { fetchPortfolioPayload, getPerformDashboard } from '../portfolioService'

const SLUG = 'nov-2024-stock-challenge'

function uid(): string {
  return `inproc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

async function main(): Promise<void> {
  if (!process.env.MASSIVE_API_KEY?.trim()) {
    console.log('SKIP: MASSIVE_API_KEY not set — ledger live-price checks skipped (OK in CI).')
    return
  }
  const userId = uid()
  const steps = [
    { ticker: 'AAPL', shares: 1, fillPrice: 180 },
    { ticker: 'MSFT', shares: 1, fillPrice: 380 },
    { ticker: 'NVDA', shares: 1, fillPrice: 120 },
  ] as const

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!
    const led = await applyTradeToUserLedger({
      userId,
      gameSlug: SLUG,
      ticker: s.ticker,
      side: 'buy',
      shares: s.shares,
      fillPrice: s.fillPrice,
      orderTotal: s.shares * s.fillPrice,
    })
    if (!led.ok) throw new Error(`trade ${i + 1}: ${led.error}`)

    const rawHoldings = await getLedgerHoldingsForGame(userId, SLUG)
    if (rawHoldings.length === 0) {
      throw new Error(`round ${i + 1}: ledger has no holdings after ok trade`)
    }

    const pf = await fetchPortfolioPayload(SLUG, userId)
    const symbols = new Set(pf.rows.map((r) => r.ticker))
    if (!symbols.has(s.ticker)) {
      throw new Error(`round ${i + 1}: portfolio missing ${s.ticker}, held ${[...symbols].join(',')}`)
    }
    if (pf.rows.length !== i + 1) {
      throw new Error(`round ${i + 1}: expected ${i + 1} positions, got ${pf.rows.length}`)
    }

    const perf = await getPerformDashboard(SLUG, userId)
    if (perf.stats.netWorth === '—') throw new Error(`round ${i + 1}: perform stats placeholder`)
    const you = perf.compare.series.find((x) => x.id === 'you')
    const nw = you?.values?.[you.values.length - 1]
    if (!Number.isFinite(nw) || (nw ?? 0) <= 0) throw new Error(`round ${i + 1}: bad chart net worth`)
  }

  console.log(`OK — ${steps.length} buys; portfolio + perform wired for uid=${userId}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
