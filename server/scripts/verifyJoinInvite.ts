/**
 * Verifies game definitions + optional live GET /api/games/:slug/invite against a running API.
 * Run: npx tsx server/scripts/verifyJoinInvite.ts
 * With server: TEST_BASE=http://127.0.0.1:3001 npx tsx server/scripts/verifyJoinInvite.ts
 */
import { getGameDefinitionBySlug } from '../gameDefinitionsStore'

async function main() {
  const nov = await getGameDefinitionBySlug('nov-2024-stock-challenge')
  if (!nov || nov.joinCode !== '102024') {
    console.error('FAIL: expected nov-2024-stock-challenge joinCode 102024', nov)
    process.exit(1)
  }
  const neu = await getGameDefinitionBySlug('new')
  if (!neu || neu.joinCode !== '900001') {
    console.error('FAIL: expected new game joinCode 900001', neu)
    process.exit(1)
  }

  const base = (process.env.TEST_BASE ?? '').trim()
  if (!base) {
    console.log('OK (definitions only). Set TEST_BASE=http://127.0.0.1:3001 to hit the API.')
    return
  }

  const url = `${base.replace(/\/$/, '')}/api/games/nov-2024-stock-challenge/invite`
  const r = await fetch(url)
  const body = (await r.json().catch(() => ({}))) as { joinCode?: string; slug?: string; error?: string }
  if (!r.ok) {
    console.error('FAIL: HTTP', r.status, body)
    process.exit(1)
  }
  if (body.joinCode !== '102024' || body.slug !== 'nov-2024-stock-challenge') {
    console.error('FAIL: unexpected invite JSON', body)
    process.exit(1)
  }

  const welcomeUrl = `${base.replace(/\/$/, '')}/api/join/welcome?code=${encodeURIComponent('102024')}`
  const w = await fetch(welcomeUrl)
  const wBody = await w.json().catch(() => ({}))
  if (!w.ok || !wBody || typeof wBody.displayTitle !== 'string') {
    console.error('FAIL: join welcome for code 102024', w.status, wBody)
    process.exit(1)
  }

  console.log('OK definitions + /invite + /join/welcome for code 102024')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
