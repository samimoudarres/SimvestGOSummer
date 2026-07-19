/**
 * Unpack json_documents into normalized tables via Supabase service-role REST.
 * Usage: npx tsx server/scripts/syncNormalizedViaRest.ts
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), override: true })

async function main() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: docs, error } = await sb.from('json_documents').select('name,payload')
  if (error) throw error
  const byName = new Map((docs ?? []).map((d) => [d.name as string, d.payload]))

  const accountsFile = byName.get('user-accounts.json') as { accounts?: Record<string, Record<string, unknown>> }
  await sb.from('user_accounts').delete().neq('user_id', '')
  for (const [userId, a] of Object.entries(accountsFile?.accounts ?? {})) {
    const { error: e } = await sb.from('user_accounts').upsert({
      user_id: userId,
      first_name: String(a.firstName ?? ''),
      last_name: String(a.lastName ?? ''),
      contact_kind: String(a.contactKind ?? 'email'),
      contact: String(a.contact ?? ''),
      contact_lower: String(a.contactLower ?? ''),
      password_hash: String(a.passwordHash ?? ''),
      display_name: String(a.displayName ?? ''),
      avatar_url: String(a.avatarUrl ?? ''),
      created_at: (a.createdAtIso as string) ?? null,
      updated_at: (a.updatedAtIso as string) ?? null,
      raw: a,
    })
    if (e) throw e
  }
  console.log('Synced user_accounts')

  const memFile = byName.get('user-game-membership.json') as { joins?: Record<string, string> }
  await sb.from('user_game_membership').delete().neq('user_id', '')
  for (const [k, joinedAt] of Object.entries(memFile?.joins ?? {})) {
    const sep = k.indexOf(':::')
    if (sep < 0) continue
    const { error: e } = await sb.from('user_game_membership').upsert({
      user_id: k.slice(0, sep),
      game_slug: k.slice(sep + 3),
      joined_at: joinedAt,
    })
    if (e) throw e
  }
  console.log('Synced user_game_membership')

  const feedFile = byName.get('game-feed.json') as { posts?: Array<Record<string, unknown>> }
  await sb.from('game_feed_posts').delete().neq('id', '')
  for (const post of feedFile?.posts ?? []) {
    const id = String(post.id ?? '')
    if (!id) continue
    const { error: e } = await sb.from('game_feed_posts').upsert({
      id,
      user_id: (post.userId as string) ?? null,
      game_slug: (post.gameSlug as string) ?? null,
      post_kind: (post.postKind as string) ?? null,
      posted_at: (post.postedAtIso as string) ?? null,
      payload: post,
    })
    if (e) throw e
  }
  console.log('Synced game_feed_posts')

  const rulesFile = byName.get('game-runtime-rules.json') as {
    bySlug?: Record<string, Record<string, unknown>>
  }
  await sb.from('game_runtime_rules').delete().neq('slug', '')
  for (const [slug, r] of Object.entries(rulesFile?.bySlug ?? {})) {
    const { error: e } = await sb.from('game_runtime_rules').upsert({
      slug,
      host_user_id: (r.hostUserId as string) ?? null,
      title: (r.title as string) ?? null,
      payload: r,
      updated_at: new Date().toISOString(),
    })
    if (e) throw e
  }
  console.log('Synced game_runtime_rules')

  const stateFile = byName.get('user-game-state.json') as {
    users?: Record<string, Record<string, { cash?: number; holdings?: unknown[]; lots?: unknown[] }>>
  }
  await sb.from('user_game_cash').delete().neq('user_id', '')
  for (const [userId, games] of Object.entries(stateFile?.users ?? {})) {
    for (const [gameSlug, row] of Object.entries(games)) {
      const { error: e } = await sb.from('user_game_cash').upsert({
        user_id: userId,
        game_slug: gameSlug,
        cash: Number(row.cash ?? 0),
      })
      if (e) throw e
    }
  }
  console.log('Synced user_game_cash')
  console.log('Normalized sync complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
