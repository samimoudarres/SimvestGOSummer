/**
 * Unpack json_documents payloads into normalized tables for Supabase Table Editor.
 * Runtime services continue to use json_documents as source of truth.
 */
import type pg from 'pg'

async function clearAndInsert(
  client: pg.PoolClient,
  clearSql: string,
  insertFn: () => Promise<void>,
): Promise<void> {
  await client.query(clearSql)
  await insertFn()
}

export async function syncNormalizedFromDocuments(client: pg.PoolClient): Promise<void> {
  const docs = await client.query<{ name: string; payload: unknown }>(
    'select name, payload from json_documents',
  )
  const byName = new Map(docs.rows.map((r) => [r.name, r.payload]))

  // user-accounts.json
  const accountsFile = byName.get('user-accounts.json') as
    | { accounts?: Record<string, Record<string, unknown>> }
    | undefined
  await clearAndInsert(client, 'delete from user_accounts', async () => {
    for (const [userId, a] of Object.entries(accountsFile?.accounts ?? {})) {
      await client.query(
        `insert into user_accounts (
          user_id, first_name, last_name, contact_kind, contact, contact_lower,
          password_hash, display_name, avatar_url, created_at, updated_at, raw
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12::jsonb)
        on conflict (user_id) do update set
          first_name=excluded.first_name, last_name=excluded.last_name,
          contact_kind=excluded.contact_kind, contact=excluded.contact,
          contact_lower=excluded.contact_lower, password_hash=excluded.password_hash,
          display_name=excluded.display_name, avatar_url=excluded.avatar_url,
          created_at=excluded.created_at, updated_at=excluded.updated_at, raw=excluded.raw`,
        [
          userId,
          String(a.firstName ?? ''),
          String(a.lastName ?? ''),
          String(a.contactKind ?? 'email'),
          String(a.contact ?? ''),
          String(a.contactLower ?? ''),
          String(a.passwordHash ?? ''),
          String(a.displayName ?? ''),
          String(a.avatarUrl ?? ''),
          a.createdAtIso ?? null,
          a.updatedAtIso ?? null,
          JSON.stringify(a),
        ],
      )
    }
  })

  // user-profiles.json
  const profilesFile = byName.get('user-profiles.json') as
    | { profiles?: Record<string, Record<string, unknown>> }
    | undefined
  await clearAndInsert(client, 'delete from user_profiles', async () => {
    for (const [userId, p] of Object.entries(profilesFile?.profiles ?? {})) {
      await client.query(
        `insert into user_profiles (user_id, display_name, avatar_url, joined_at, raw)
         values ($1,$2,$3,$4::timestamptz,$5::jsonb)
         on conflict (user_id) do update set
           display_name=excluded.display_name, avatar_url=excluded.avatar_url,
           joined_at=excluded.joined_at, raw=excluded.raw`,
        [
          userId,
          String(p.displayName ?? ''),
          String(p.avatarUrl ?? ''),
          p.joinedAtIso ?? null,
          JSON.stringify(p),
        ],
      )
    }
  })

  // user-setup-profiles.json
  const setupFile = byName.get('user-setup-profiles.json') as
    | { profiles?: Record<string, unknown> }
    | undefined
  await clearAndInsert(client, 'delete from user_setup_profiles', async () => {
    for (const [key, payload] of Object.entries(setupFile?.profiles ?? {})) {
      const sep = key.indexOf(':::')
      if (sep < 0) continue
      const userId = key.slice(0, sep)
      const gameSlug = key.slice(sep + 3)
      await client.query(
        `insert into user_setup_profiles (user_id, game_slug, payload, updated_at)
         values ($1,$2,$3::jsonb,now())
         on conflict (user_id, game_slug) do update set payload=excluded.payload, updated_at=now()`,
        [userId, gameSlug, JSON.stringify(payload)],
      )
    }
  })

  // game-runtime-rules.json
  const rulesFile = byName.get('game-runtime-rules.json') as
    | { bySlug?: Record<string, Record<string, unknown>> }
    | undefined
  await clearAndInsert(client, 'delete from game_runtime_rules', async () => {
    for (const [slug, r] of Object.entries(rulesFile?.bySlug ?? {})) {
      await client.query(
        `insert into game_runtime_rules (slug, host_user_id, title, payload, updated_at)
         values ($1,$2,$3,$4::jsonb,now())
         on conflict (slug) do update set
           host_user_id=excluded.host_user_id, title=excluded.title,
           payload=excluded.payload, updated_at=now()`,
        [slug, r.hostUserId ?? null, r.title ?? null, JSON.stringify(r)],
      )
    }
  })

  // game-definitions.json
  const defsFile = byName.get('game-definitions.json') as
    | { games?: Record<string, unknown> }
    | { definitions?: Record<string, unknown> }
    | Record<string, unknown>
    | undefined
  await clearAndInsert(client, 'delete from game_definitions', async () => {
    const map =
      (defsFile && 'games' in defsFile && defsFile.games) ||
      (defsFile && 'definitions' in defsFile && defsFile.definitions) ||
      (defsFile && typeof defsFile === 'object' ? defsFile : {})
    for (const [slug, payload] of Object.entries(map as Record<string, unknown>)) {
      if (slug === 'games' || slug === 'definitions' || slug === 'version') continue
      await client.query(
        `insert into game_definitions (slug, payload) values ($1,$2::jsonb)
         on conflict (slug) do update set payload=excluded.payload`,
        [slug, JSON.stringify(payload)],
      )
    }
  })

  // user-game-membership.json
  const memFile = byName.get('user-game-membership.json') as
    | { joins?: Record<string, string> }
    | undefined
  await clearAndInsert(client, 'delete from user_game_membership', async () => {
    for (const [key, joinedAt] of Object.entries(memFile?.joins ?? {})) {
      const sep = key.indexOf(':::')
      if (sep < 0) continue
      await client.query(
        `insert into user_game_membership (user_id, game_slug, joined_at)
         values ($1,$2,$3::timestamptz)
         on conflict (user_id, game_slug) do update set joined_at=excluded.joined_at`,
        [key.slice(0, sep), key.slice(sep + 3), joinedAt],
      )
    }
  })

  // game-join-requests.json
  const joinFile = byName.get('game-join-requests.json') as
    | { items?: Array<Record<string, unknown>> }
    | undefined
  await clearAndInsert(client, 'delete from game_join_requests', async () => {
    for (const item of joinFile?.items ?? []) {
      const id = String(item.id ?? '')
      if (!id) continue
      await client.query(
        `insert into game_join_requests (id, game_slug, user_id, status, payload, created_at)
         values ($1,$2,$3,$4,$5::jsonb,$6::timestamptz)
         on conflict (id) do update set
           game_slug=excluded.game_slug, user_id=excluded.user_id, status=excluded.status,
           payload=excluded.payload, created_at=excluded.created_at`,
        [
          id,
          String(item.gameSlug ?? ''),
          String(item.userId ?? ''),
          String(item.status ?? 'pending'),
          JSON.stringify(item),
          item.createdAtIso ?? item.createdAt ?? null,
        ],
      )
    }
  })

  // user-game-state.json → cash / holdings / lots
  const stateFile = byName.get('user-game-state.json') as
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
  await client.query('delete from user_game_lots')
  await client.query('delete from user_game_holdings')
  await client.query('delete from user_game_cash')
  for (const [userId, games] of Object.entries(stateFile?.users ?? {})) {
    for (const [gameSlug, row] of Object.entries(games)) {
      await client.query(
        `insert into user_game_cash (user_id, game_slug, cash) values ($1,$2,$3)
         on conflict (user_id, game_slug) do update set cash=excluded.cash`,
        [userId, gameSlug, Number(row.cash ?? 0)],
      )
      for (const h of row.holdings ?? []) {
        const ticker = String(h.ticker ?? h.symbol ?? '')
        if (!ticker) continue
        await client.query(
          `insert into user_game_holdings (user_id, game_slug, ticker, shares, avg_cost, payload)
           values ($1,$2,$3,$4,$5,$6::jsonb)
           on conflict (user_id, game_slug, ticker) do update set
             shares=excluded.shares, avg_cost=excluded.avg_cost, payload=excluded.payload`,
          [
            userId,
            gameSlug,
            ticker,
            Number(h.shares ?? h.qty ?? 0),
            h.avgCost ?? h.avg_cost ?? null,
            JSON.stringify(h),
          ],
        )
      }
      for (const lot of row.lots ?? []) {
        await client.query(
          `insert into user_game_lots (user_id, game_slug, ticker, shares, cost_basis, opened_at, payload)
           values ($1,$2,$3,$4,$5,$6::timestamptz,$7::jsonb)`,
          [
            userId,
            gameSlug,
            String(lot.ticker ?? ''),
            Number(lot.shares ?? 0),
            lot.costBasis ?? lot.cost_basis ?? null,
            lot.openedAtIso ?? lot.openedAt ?? null,
            JSON.stringify(lot),
          ],
        )
      }
    }
  }

  // game-feed.json
  const feedFile = byName.get('game-feed.json') as { posts?: Array<Record<string, unknown>> } | undefined
  await clearAndInsert(client, 'delete from game_feed_posts', async () => {
    for (const post of feedFile?.posts ?? []) {
      const id = String(post.id ?? '')
      if (!id) continue
      await client.query(
        `insert into game_feed_posts (id, user_id, game_slug, post_kind, posted_at, payload)
         values ($1,$2,$3,$4,$5::timestamptz,$6::jsonb)
         on conflict (id) do update set
           user_id=excluded.user_id, game_slug=excluded.game_slug, post_kind=excluded.post_kind,
           posted_at=excluded.posted_at, payload=excluded.payload`,
        [
          id,
          post.userId ?? null,
          post.gameSlug ?? null,
          post.postKind ?? null,
          post.postedAtIso ?? post.postedAt ?? null,
          JSON.stringify(post),
        ],
      )
    }
  })

  // feed-post-social.json
  const social = byName.get('feed-post-social.json') as
    | {
        postLikes?: Record<string, string[]>
        comments?: Record<string, Array<Record<string, unknown>>>
        commentLikes?: Record<string, string[]>
      }
    | undefined
  await client.query('delete from feed_post_likes')
  await client.query('delete from feed_comment_likes')
  await client.query('delete from feed_comments')
  for (const [postId, users] of Object.entries(social?.postLikes ?? {})) {
    for (const userId of users) {
      await client.query(
        `insert into feed_post_likes (post_id, user_id) values ($1,$2) on conflict do nothing`,
        [postId, userId],
      )
    }
  }
  for (const [postId, comments] of Object.entries(social?.comments ?? {})) {
    for (const c of comments) {
      const id = String(c.id ?? '')
      if (!id) continue
      await client.query(
        `insert into feed_comments (id, post_id, user_id, body, created_at, payload)
         values ($1,$2,$3,$4,$5::timestamptz,$6::jsonb)
         on conflict (id) do update set body=excluded.body, payload=excluded.payload`,
        [id, postId, c.userId ?? null, c.body ?? null, c.createdAtIso ?? null, JSON.stringify(c)],
      )
    }
  }
  for (const [commentId, users] of Object.entries(social?.commentLikes ?? {})) {
    for (const userId of users) {
      await client.query(
        `insert into feed_comment_likes (comment_id, user_id) values ($1,$2) on conflict do nothing`,
        [commentId, userId],
      )
    }
  }

  // feed-poll-votes.json
  const votes = byName.get('feed-poll-votes.json') as { votes?: Record<string, string> } | undefined
  await clearAndInsert(client, 'delete from feed_poll_votes', async () => {
    for (const [key, optionId] of Object.entries(votes?.votes ?? {})) {
      const sep = key.indexOf(':::')
      if (sep < 0) continue
      await client.query(
        `insert into feed_poll_votes (post_id, user_id, option_id) values ($1,$2,$3)
         on conflict (post_id, user_id) do update set option_id=excluded.option_id`,
        [key.slice(0, sep), key.slice(sep + 3), optionId],
      )
    }
  })

  // follows.json — nested userId -> gameSlug -> tickers[]
  const follows = byName.get('follows.json') as
    | Record<string, Record<string, string[]>>
    | { byUser?: Record<string, Record<string, string[]>> }
    | undefined
  const followMap =
    follows && 'byUser' in follows && follows.byUser
      ? follows.byUser
      : ((follows as Record<string, Record<string, string[]>>) ?? {})
  await clearAndInsert(client, 'delete from follows', async () => {
    for (const [userId, games] of Object.entries(followMap)) {
      if (userId === 'byUser' || userId === 'version') continue
      if (!games || typeof games !== 'object') continue
      for (const [gameSlug, tickers] of Object.entries(games)) {
        if (!Array.isArray(tickers)) continue
        for (const ticker of tickers) {
          await client.query(
            `insert into follows (user_id, game_slug, ticker) values ($1,$2,$3) on conflict do nothing`,
            [userId, gameSlug, ticker],
          )
        }
      }
    }
  })

  // game-final-snapshots.json
  const finals = byName.get('game-final-snapshots.json') as
    | { bySlug?: Record<string, unknown> }
    | undefined
  await clearAndInsert(client, 'delete from game_final_snapshots', async () => {
    for (const [slug, payload] of Object.entries(finals?.bySlug ?? {})) {
      await client.query(
        `insert into game_final_snapshots (game_slug, payload, updated_at)
         values ($1,$2::jsonb,now())
         on conflict (game_slug) do update set payload=excluded.payload, updated_at=now()`,
        [slug, JSON.stringify(payload)],
      )
    }
  })

  // vapid-keys.json → app_secrets
  const vapid = byName.get('vapid-keys.json')
  if (vapid) {
    await client.query(
      `insert into app_secrets (key, value, updated_at) values ('vapid-keys', $1::jsonb, now())
       on conflict (key) do update set value=excluded.value, updated_at=now()`,
      [JSON.stringify(vapid)],
    )
  }
}
