# Launch topology (Simvest API)

Production constraints until shared quotes + full SQL write cutover are ready.

## One API instance only

Run **exactly one** `simvest-api` instance.

- `render.yaml` sets `numInstances: 1`. Do not scale horizontally in the Render dashboard.
- Massive quote responses are cached **in-process** (`server/massiveClient.ts`). A second instance would double Massive traffic and serve divergent caches (no Redis).
- JSON document RMW uses Postgres advisory locks when `DATABASE_URL` is set, but hot paths (portfolio + feed) still dual-write large blobs; one writer process keeps contention and ops simple.

**Forbidden until Redis (or equivalent) + SQL-primary ledger/feed are proven:** `numInstances > 1`, autoscaling, or `WEB_CONCURRENCY > 1` (Node cluster workers).

## Required production env (Render)

| Variable | Required | Notes |
|----------|----------|--------|
| `MASSIVE_API_KEY` | **Yes** | Live prices, sparklines, logos. Boot refuses in production if missing. |
| `DATABASE_URL` | **Yes** | Direct Postgres (Supabase **connection string**). Advisory locks + normalized dual-write. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Optional | Media Storage / REST fallback. **Not** a substitute for `DATABASE_URL`. |

### Why not REST-only Supabase?

Service-role PostgREST (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` without `DATABASE_URL`) can store `json_documents`, but it does **not** provide transactional advisory locks. Production must use a Postgres URL so document locks and normalized SQL writes are safe.

Use the Supabase **Database** connection string (URI), not the REST URL alone. See [SUPABASE_SETUP_START_HERE.md](../SUPABASE_SETUP_START_HERE.md).

## Normalized hot tables (Phase C)

Trades and feed posts dual-write into:

- `user_game_cash` / `user_game_holdings` / `user_game_lots`
- `game_feed_posts`

`json_documents` (`user-game-state.json`, `game-feed.json`) stay in sync for backward-compatible reads. Feed list prefers SQL when Postgres is available.

**Backfill:** on boot (when `DATABASE_URL` is set), the API upserts all feed posts from `game-feed.json` into `game_feed_posts`, and upserts ledger rows from `user-game-state.json` when `user_game_cash` is empty. You can also re-run `npm run db:migrate-json` / `npm run db:sync-normalized`.

## Scaling later (out of scope for launch)

1. Shared short-TTL quote cache (Redis) **or** Massive plan that tolerates N× traffic.
2. SQL as sole source of truth for ledger + feed (drop whole-document RMW on the hot path).
3. Then raise `numInstances` carefully.
