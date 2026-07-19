/**
 * Import local server/data/*.json into Supabase json_documents (+ normalized tables).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/scripts/migrateJsonToSupabase.ts
 *   npx tsx server/scripts/migrateJsonToSupabase.ts --data-dir /path/to/data
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { syncNormalizedFromDocuments } from '../db/syncNormalized.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), override: true })

const STORE_NAMES = [
  'user-accounts.json',
  'user-profiles.json',
  'user-setup-profiles.json',
  'user-game-membership.json',
  'game-join-requests.json',
  'game-runtime-rules.json',
  'game-definitions.json',
  'user-game-state.json',
  'holdings.json',
  'follows.json',
  'game-feed.json',
  'feed-post-social.json',
  'feed-poll-votes.json',
  'activity-author-notify-preferences.json',
  'game-networth-snapshots.json',
  'game-final-snapshots.json',
  'perform-rank-streaks.json',
  'leaderboard-rank-cache.json',
  'push-alert-dedup.json',
  'user-finished-game-home-views.json',
  'user-web-push-subscriptions.json',
  'user-native-push-tokens.json',
  'vapid-keys.json',
] as const

function parseArgs(): { dataDir: string } {
  const argv = process.argv.slice(2)
  let dataDir = path.join(__dirname, '..', 'data')
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data-dir' && argv[i + 1]) {
      dataDir = path.resolve(argv[++i])
    }
  }
  return { dataDir }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim()
  if (!connectionString) {
    console.error('Set DATABASE_URL (or SUPABASE_DB_URL) before migrating.')
    process.exit(1)
  }

  const { dataDir } = parseArgs()
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
  })

  const client = await pool.connect()
  try {
    let imported = 0
    for (const name of STORE_NAMES) {
      const filePath = path.join(dataDir, name)
      let raw: string
      try {
        raw = await fs.readFile(filePath, 'utf8')
      } catch {
        continue
      }
      let payload: unknown
      try {
        payload = JSON.parse(raw)
      } catch (err) {
        console.warn(`Skip ${name}: invalid JSON (${err instanceof Error ? err.message : err})`)
        continue
      }
      await client.query(
        `insert into json_documents (name, payload, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (name) do update
           set payload = excluded.payload, updated_at = now()`,
        [name, JSON.stringify(payload)],
      )
      imported++
      console.log(`Imported ${name}`)
    }

    console.log(`Syncing normalized tables from ${imported} document(s)…`)
    await syncNormalizedFromDocuments(client)
    console.log('Done.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
