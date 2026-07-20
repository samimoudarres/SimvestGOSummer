/**
 * Dual-write helpers for hottest launch data: user game ledger + feed posts.
 * When DATABASE_URL is set, mutations also update normalized tables so we are
 * not solely dependent on whole-document JSON RMW for durability/inspectability.
 * JSON documents remain in sync for backward-compatible readers.
 */
import type pg from 'pg'
import { getDatabaseUrl } from './backend.ts'
import { getPgPool, withPgClient } from './client.ts'

export type NormalizedLot = {
  ticker: string
  shares: number
  entryPrice: number
  boughtAtIso: string
}

export type NormalizedHolding = {
  ticker: string
  shares: number
  avgCost: number
}

export type NormalizedLedger = {
  cash: number
  holdings: NormalizedHolding[]
  lots: NormalizedLot[]
}

export type NormalizedFeedPostRow = {
  id: string
  userId: string | null
  gameSlug: string | null
  postKind: string | null
  postedAtIso: string | null
  payload: Record<string, unknown>
}

function pgReady(): boolean {
  return Boolean(getDatabaseUrl() && getPgPool())
}

export async function upsertUserGameLedgerSql(
  userId: string,
  gameSlug: string,
  ledger: NormalizedLedger,
  client?: pg.PoolClient,
): Promise<void> {
  if (!pgReady() && !client) return
  const run = async (c: pg.PoolClient) => {
    await c.query(
      `insert into user_game_cash (user_id, game_slug, cash) values ($1,$2,$3)
       on conflict (user_id, game_slug) do update set cash = excluded.cash`,
      [userId, gameSlug, Number(ledger.cash ?? 0)],
    )
    await c.query('delete from user_game_holdings where user_id = $1 and game_slug = $2', [
      userId,
      gameSlug,
    ])
    await c.query('delete from user_game_lots where user_id = $1 and game_slug = $2', [
      userId,
      gameSlug,
    ])
    for (const h of ledger.holdings ?? []) {
      const ticker = String(h.ticker ?? '').trim()
      if (!ticker) continue
      await c.query(
        `insert into user_game_holdings (user_id, game_slug, ticker, shares, avg_cost, payload)
         values ($1,$2,$3,$4,$5,$6::jsonb)`,
        [userId, gameSlug, ticker, Number(h.shares ?? 0), h.avgCost ?? null, JSON.stringify(h)],
      )
    }
    for (const lot of ledger.lots ?? []) {
      const ticker = String(lot.ticker ?? '').trim()
      if (!ticker) continue
      await c.query(
        `insert into user_game_lots (user_id, game_slug, ticker, shares, cost_basis, opened_at, payload)
         values ($1,$2,$3,$4,$5,$6::timestamptz,$7::jsonb)`,
        [
          userId,
          gameSlug,
          ticker,
          Number(lot.shares ?? 0),
          lot.entryPrice ?? null,
          lot.boughtAtIso ?? null,
          JSON.stringify(lot),
        ],
      )
    }
  }
  if (client) {
    await run(client)
    return
  }
  await withPgClient(run)
}

export async function deleteUserGameLedgerSql(
  userId: string,
  gameSlug: string,
  client?: pg.PoolClient,
): Promise<void> {
  if (!pgReady() && !client) return
  const run = async (c: pg.PoolClient) => {
    await c.query('delete from user_game_lots where user_id = $1 and game_slug = $2', [
      userId,
      gameSlug,
    ])
    await c.query('delete from user_game_holdings where user_id = $1 and game_slug = $2', [
      userId,
      gameSlug,
    ])
    await c.query('delete from user_game_cash where user_id = $1 and game_slug = $2', [
      userId,
      gameSlug,
    ])
  }
  if (client) {
    await run(client)
    return
  }
  await withPgClient(run)
}

export async function deleteAllLedgersForGameSql(gameSlug: string): Promise<void> {
  if (!pgReady()) return
  await withPgClient(async (c) => {
    await c.query('delete from user_game_lots where game_slug = $1', [gameSlug])
    await c.query('delete from user_game_holdings where game_slug = $1', [gameSlug])
    await c.query('delete from user_game_cash where game_slug = $1', [gameSlug])
  })
}

export async function renameGameSlugInLedgerSql(fromSlug: string, toSlug: string): Promise<void> {
  if (!pgReady() || !fromSlug || !toSlug || fromSlug === toSlug) return
  await withPgClient(async (c) => {
    // Prefer keeping rows already at toSlug; drop colliding fromSlug leftovers after rename.
    await c.query(
      `delete from user_game_cash a
       using user_game_cash b
       where a.user_id = b.user_id and a.game_slug = $1 and b.game_slug = $2`,
      [fromSlug, toSlug],
    )
    await c.query(`update user_game_cash set game_slug = $2 where game_slug = $1`, [
      fromSlug,
      toSlug,
    ])
    await c.query(
      `delete from user_game_holdings a
       using user_game_holdings b
       where a.user_id = b.user_id and a.ticker = b.ticker
         and a.game_slug = $1 and b.game_slug = $2`,
      [fromSlug, toSlug],
    )
    await c.query(`update user_game_holdings set game_slug = $2 where game_slug = $1`, [
      fromSlug,
      toSlug,
    ])
    await c.query(`update user_game_lots set game_slug = $2 where game_slug = $1`, [
      fromSlug,
      toSlug,
    ])
  })
}

export async function upsertFeedPostSql(post: NormalizedFeedPostRow): Promise<void> {
  if (!pgReady() || !post.id) return
  await withPgClient(async (c) => {
    await c.query(
      `insert into game_feed_posts (id, user_id, game_slug, post_kind, posted_at, payload)
       values ($1,$2,$3,$4,$5::timestamptz,$6::jsonb)
       on conflict (id) do update set
         user_id = excluded.user_id,
         game_slug = excluded.game_slug,
         post_kind = excluded.post_kind,
         posted_at = excluded.posted_at,
         payload = excluded.payload`,
      [
        post.id,
        post.userId,
        post.gameSlug,
        post.postKind,
        post.postedAtIso,
        JSON.stringify(post.payload),
      ],
    )
  })
}

export async function deleteFeedPostSql(postId: string): Promise<void> {
  if (!pgReady() || !postId) return
  await withPgClient(async (c) => {
    await c.query('delete from game_feed_posts where id = $1', [postId])
  })
}

export async function deleteFeedPostsForGameSql(gameSlug: string): Promise<void> {
  if (!pgReady() || !gameSlug) return
  await withPgClient(async (c) => {
    await c.query('delete from game_feed_posts where game_slug = $1', [gameSlug])
  })
}

export async function listFeedPostsForGameSql(
  gameSlug: string,
  opts?: { limit?: number; beforeIso?: string },
): Promise<NormalizedFeedPostRow[] | null> {
  if (!pgReady() || !gameSlug) return null
  const limit =
    typeof opts?.limit === 'number' && Number.isFinite(opts.limit)
      ? Math.min(500, Math.max(1, Math.floor(opts.limit)))
      : 500
  const before = typeof opts?.beforeIso === 'string' ? opts.beforeIso.trim() : ''
  try {
    const res = before
      ? await getPgPool()!.query<{
          id: string
          user_id: string | null
          game_slug: string | null
          post_kind: string | null
          posted_at: Date | string | null
          payload: Record<string, unknown>
        }>(
          `select id, user_id, game_slug, post_kind, posted_at, payload
           from game_feed_posts
           where lower(game_slug) = lower($1) and posted_at < $2::timestamptz
           order by posted_at desc
           limit $3`,
          [gameSlug, before, limit],
        )
      : await getPgPool()!.query<{
          id: string
          user_id: string | null
          game_slug: string | null
          post_kind: string | null
          posted_at: Date | string | null
          payload: Record<string, unknown>
        }>(
          `select id, user_id, game_slug, post_kind, posted_at, payload
           from game_feed_posts
           where lower(game_slug) = lower($1)
           order by posted_at desc
           limit $2`,
          [gameSlug, limit],
        )
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      gameSlug: r.game_slug,
      postKind: r.post_kind,
      postedAtIso:
        r.posted_at instanceof Date
          ? r.posted_at.toISOString()
          : r.posted_at
            ? String(r.posted_at)
            : null,
      payload: r.payload ?? {},
    }))
  } catch (err) {
    console.warn(
      '[simvest] feed SQL list failed, falling back to JSON:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/** Global newest posts (home activity). Prefers SQL so trade appends that skip the JSON blob still appear. */
export async function listRecentFeedPostsSql(
  limit = 48,
): Promise<NormalizedFeedPostRow[] | null> {
  if (!pgReady()) return null
  const cap =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.min(200, Math.max(1, Math.floor(limit)))
      : 48
  try {
    const res = await getPgPool()!.query<{
      id: string
      user_id: string | null
      game_slug: string | null
      post_kind: string | null
      posted_at: Date | string | null
      payload: Record<string, unknown>
    }>(
      `select id, user_id, game_slug, post_kind, posted_at, payload
       from game_feed_posts
       order by posted_at desc
       limit $1`,
      [cap],
    )
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      gameSlug: r.game_slug,
      postKind: r.post_kind,
      postedAtIso:
        r.posted_at instanceof Date
          ? r.posted_at.toISOString()
          : r.posted_at
            ? String(r.posted_at)
            : null,
      payload: r.payload ?? {},
    }))
  } catch (err) {
    console.warn(
      '[simvest] recent feed SQL list failed, falling back to JSON:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

export async function countFeedPostsSql(): Promise<number | null> {
  if (!pgReady()) return null
  try {
    const res = await getPgPool()!.query<{ n: string }>('select count(*)::text as n from game_feed_posts')
    return Number(res.rows[0]?.n ?? 0)
  } catch {
    return null
  }
}

export async function countLedgerCashRowsSql(): Promise<number | null> {
  if (!pgReady()) return null
  try {
    const res = await getPgPool()!.query<{ n: string }>('select count(*)::text as n from user_game_cash')
    return Number(res.rows[0]?.n ?? 0)
  } catch {
    return null
  }
}

/** One-shot: unpack JSON docs into normalized hot tables when they look empty. */
export async function backfillNormalizedHotPathFromJsonDocs(): Promise<{
  ledgers: number
  posts: number
  feedWasEmpty: boolean
} | null> {
  if (!pgReady()) return null
  return withPgClient(async (c) => {
    const cashCount = await c.query<{ n: string }>('select count(*)::text as n from user_game_cash')
    const feedCount = await c.query<{ n: string }>('select count(*)::text as n from game_feed_posts')
    const cashN = Number(cashCount.rows[0]?.n ?? 0)
    const feedWasEmpty = Number(feedCount.rows[0]?.n ?? 0) === 0

    let ledgers = 0
    let posts = 0

    if (cashN === 0) {
      const stateDoc = await c.query<{ payload: unknown }>(
        `select payload from json_documents where name = 'user-game-state.json'`,
      )
      const state = stateDoc.rows[0]?.payload as
        | {
            users?: Record<
              string,
              Record<
                string,
                {
                  cash?: number
                  holdings?: Array<Record<string, unknown>>
                  lots?: Array<Record<string, unknown>>
                }
              >
            >
          }
        | undefined
      for (const [userId, games] of Object.entries(state?.users ?? {})) {
        for (const [gameSlug, row] of Object.entries(games ?? {})) {
          const holdings: NormalizedHolding[] = []
          for (const h of row.holdings ?? []) {
            const ticker = String(h.ticker ?? h.symbol ?? '').trim()
            if (!ticker) continue
            holdings.push({
              ticker,
              shares: Number(h.shares ?? h.qty ?? 0),
              avgCost: Number(h.avgCost ?? h.avg_cost ?? 0),
            })
          }
          const lots: NormalizedLot[] = []
          for (const lot of row.lots ?? []) {
            lots.push({
              ticker: String(lot.ticker ?? ''),
              shares: Number(lot.shares ?? 0),
              entryPrice: Number(lot.entryPrice ?? lot.costBasis ?? lot.cost_basis ?? 0),
              boughtAtIso: String(lot.boughtAtIso ?? lot.openedAtIso ?? lot.openedAt ?? ''),
            })
          }
          await upsertUserGameLedgerSql(
            userId,
            gameSlug,
            { cash: Number(row.cash ?? 0), holdings, lots },
            c,
          )
          ledgers += 1
        }
      }
    }

    /* Always upsert feed from JSON so listPostsForGame SQL path cannot miss history. */
    {
      const feedDoc = await c.query<{ payload: unknown }>(
        `select payload from json_documents where name = 'game-feed.json'`,
      )
      const feed = feedDoc.rows[0]?.payload as
        | { posts?: Array<Record<string, unknown>> }
        | undefined
      for (const post of feed?.posts ?? []) {
        const id = String(post.id ?? '')
        if (!id) continue
        const postedAt = String(post.timestampIso ?? post.postedAtIso ?? post.postedAt ?? '') || null
        const rawSlug = post.gameSlug != null ? String(post.gameSlug) : null
        const slug = rawSlug ? rawSlug.trim().toLowerCase() : null
        await c.query(
          `insert into game_feed_posts (id, user_id, game_slug, post_kind, posted_at, payload)
           values ($1,$2,$3,$4,$5::timestamptz,$6::jsonb)
           on conflict (id) do update set
             user_id = excluded.user_id,
             game_slug = excluded.game_slug,
             post_kind = excluded.post_kind,
             posted_at = excluded.posted_at,
             payload = excluded.payload`,
          [
            id,
            post.userId != null ? String(post.userId) : null,
            slug,
            post.postKind != null ? String(post.postKind) : null,
            postedAt,
            JSON.stringify(post),
          ],
        )
        posts += 1
      }
    }

    return { ledgers, posts, feedWasEmpty }
  })
}
