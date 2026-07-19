# Supabase setup (one manual step)

Simvest keeps the **Express API**. Supabase is only the **Postgres database** that replaces `server/data/*.json` files.

## You do once

1. Create a free account at [supabase.com](https://supabase.com) and finish org onboarding.
2. Open [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) and generate a token.
3. Save it as **one line** in:

```
setup-input/supabase-access-token.txt
```

(Optional but recommended) Keep `setup-input/render-api-key.txt` so the script can set Render env vars automatically.

## Then run

```bash
node scripts/completeSupabaseSetup.mjs
```

The script will:

- Create (or reuse) a Supabase project named `simvest`
- Apply the SQL schema
- Import local `server/data/*.json` into Postgres
- Write `setup-input/supabase-env.txt` and merge keys into `.env`
- If a Render API key is present: set `DATABASE_URL` / Supabase vars on `simvest-api` and redeploy

## Verify

- Local: restart `npm run dev`, open the app, confirm `/api/health` shows `"storage":{"backend":"supabase","ok":true}`
- Dashboard: Table Editor → `json_documents` and normalized tables (`user_accounts`, `game_feed_posts`, …)

## Re-import JSON later

```bash
npm run db:migrate-json
```
