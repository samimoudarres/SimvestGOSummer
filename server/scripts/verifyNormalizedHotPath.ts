/**
 * Phase C: dual-write / SQL feed list smoke (JSON-only when DATABASE_URL unset).
 *
 *   npx tsx server/scripts/verifyNormalizedHotPath.ts
 */
import { randomUUID } from 'node:crypto'
import { getDatabaseUrl } from '../db/backend.ts'
import { getPgPool } from '../db/client.ts'
import {
  appendGameFeedPost,
  deleteAllFeedPostsForGame,
  listPostsForGame,
} from '../gameFeedService'
import {
  applyTradeToUserLedger,
  clearUserLedgerForGame,
  getUserLedger,
} from '../userGameStateService'

const SLUG = `phase-c-hotpath-${Date.now().toString(36)}`

function uid(): string {
  return `hotpath_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

async function main(): Promise<void> {
  const userId = uid()
  const buy = await applyTradeToUserLedger({
    userId,
    gameSlug: SLUG,
    ticker: 'AAPL',
    side: 'buy',
    shares: 2,
    fillPrice: 100,
    orderTotal: 200,
  })
  if (!buy.ok) throw new Error(`buy failed: ${buy.error}`)

  const ledger = await getUserLedger(userId, SLUG)
  if (Math.abs(ledger.cash - 99_800) > 1e-6) {
    throw new Error(`expected cash 99800 after buy, got ${ledger.cash}`)
  }
  if (ledger.holdings.length !== 1 || ledger.holdings[0]!.ticker !== 'AAPL') {
    throw new Error('expected AAPL holding after buy')
  }

  const postId = randomUUID()
  const post = await appendGameFeedPost({
    id: postId,
    userId,
    gameSlug: SLUG,
    author: 'Phase C',
    avatar: '',
    timestampIso: new Date().toISOString(),
    tradeTitle: "I'm buying AAPL",
    tickerSymbol: 'AAPL',
    tickerImage: '',
    changePct: '0%',
    sharesBought: '2',
    orderTotal: '$200.00',
    marketCap: '',
    revenue: '',
    rationale: 'phase-c verify',
    postKind: 'trade',
    side: 'buy',
    purchasePrice: 100,
  })
  if (post.id !== postId) throw new Error('post id mismatch')

  const listed = await listPostsForGame(SLUG, { limit: 10 })
  if (!listed.posts.some((p) => p.id === postId)) {
    throw new Error('listPostsForGame missing appended post')
  }

  const pg = Boolean(getDatabaseUrl() && getPgPool())
  if (pg) {
    const cash = await getPgPool()!.query(
      'select cash::float8 as cash from user_game_cash where user_id = $1 and game_slug = $2',
      [userId, SLUG],
    )
    if (!cash.rows[0] || Math.abs(Number(cash.rows[0].cash) - 99_800) > 1e-3) {
      throw new Error(`SQL cash dual-write missing/wrong: ${JSON.stringify(cash.rows[0])}`)
    }
    const feed = await getPgPool()!.query(
      'select id from game_feed_posts where id = $1',
      [postId],
    )
    if (!feed.rows[0]) throw new Error('SQL feed dual-write missing post row')
    console.log('OK — JSON + SQL dual-write verified for ledger + feed')
  } else {
    console.log('OK — JSON path verified (DATABASE_URL unset; SQL dual-write skipped)')
  }

  await clearUserLedgerForGame(userId, SLUG)
  await deleteAllFeedPostsForGame(SLUG)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
