/**
 * HTTP integration check (needs a running API on SIMVEST_API / port 3001).
 * Prefer `npm run test:ledger` — same assertions without a server.
 *
 *   npx tsx server/scripts/verifyTradeFlow.ts
 */
const BASE = process.env.SIMVEST_API ?? 'http://127.0.0.1:3001'
const SLUG = 'nov-2024-stock-challenge'

function makeUid(): string {
  return `verify_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

async function postTrade(userId: string, ticker: string, shares: number, fillPrice: number): Promise<void> {
  const orderTotal = shares * fillPrice
  const res = await fetch(`${BASE}/api/games/${encodeURIComponent(SLUG)}/trades/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Simvest-User-Id': userId,
    },
    body: JSON.stringify({
      clientUserId: userId,
      ticker,
      action: 'buy',
      shares,
      fillPrice,
      orderTotal,
      authorName: 'Verify',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`POST trades/complete ${res.status}: ${body}`)
  }
}

async function getPortfolio(userId: string): Promise<{ rows: { ticker: string }[]; totals: { cash: number } }> {
  const url = `${BASE}/api/games/${encodeURIComponent(SLUG)}/portfolio?uid=${encodeURIComponent(userId)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET portfolio ${res.status}`)
  return res.json() as Promise<{ rows: { ticker: string }[]; totals: { cash: number } }>
}

async function getPerform(userId: string): Promise<{ stats: { netWorth: string }; compare: { series: { id: string; values: number[] }[] } }> {
  const url = `${BASE}/api/games/${encodeURIComponent(SLUG)}/perform?uid=${encodeURIComponent(userId)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET perform ${res.status}`)
  return res.json() as Promise<{
    stats: { netWorth: string }
    compare: { series: { id: string; values: number[] }[] }
  }>
}

async function main(): Promise<void> {
  const userId = makeUid()
  const steps = [
    { ticker: 'AAPL', shares: 1, fillPrice: 180 },
    { ticker: 'MSFT', shares: 1, fillPrice: 380 },
    { ticker: 'NVDA', shares: 1, fillPrice: 120 },
  ] as const

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    await postTrade(userId, step.ticker, step.shares, step.fillPrice)

    const pf = await getPortfolio(userId)
    const symbols = new Set(pf.rows.map((r) => r.ticker))
    if (!symbols.has(step.ticker)) {
      throw new Error(`Round ${i + 1}: portfolio missing ${step.ticker}, got ${[...symbols].join(',')}`)
    }
    if (pf.rows.length !== i + 1) {
      throw new Error(`Round ${i + 1}: expected ${i + 1} positions, got ${pf.rows.length}`)
    }

    const perf = await getPerform(userId)
    if (perf.stats.netWorth === '—') {
      throw new Error(`Round ${i + 1}: perform stats still placeholder`)
    }
    const you = perf.compare.series.find((s) => s.id === 'you')
    if (!you?.values?.length) {
      throw new Error(`Round ${i + 1}: missing compare "you" series`)
    }
    const chartNw = you.values[you.values.length - 1]
    if (!Number.isFinite(chartNw) || chartNw <= 0) {
      throw new Error(`Round ${i + 1}: invalid chart net worth ${chartNw}`)
    }
  }

  console.log(`OK — ${steps.length} sequential buys; portfolio and perform updated for uid=${userId}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
