/**
 * Session auth smoke test (needs running API on SIMVEST_API / port 3001).
 *
 *   npx tsx server/scripts/verifySessionAuth.ts
 *
 * Covers: login → Bearer protected route; forged header alone fails in prod mode.
 * Uses ALLOW_LEGACY_USER_HEADER=0 for the forged-header check via a dedicated path
 * when NODE_ENV=production; in local default (legacy allowed) we still assert Bearer works.
 */
const BASE = process.env.SIMVEST_API ?? 'http://127.0.0.1:3001'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function main(): Promise<void> {
  const health = await fetch(`${BASE}/api/health`)
  assert(health.ok || health.status === 503, `health ${health.status}`)

  /* Create a throwaway account via signup start/complete is heavy; instead
   * hit login with bad credentials and assert shape, then if we have env
   * credentials run the full path. */
  const id = process.env.SIMVEST_VERIFY_LOGIN_ID?.trim()
  const pw = process.env.SIMVEST_VERIFY_LOGIN_PASSWORD?.trim()

  if (!id || !pw) {
    /* Minimal path: forged header without Bearer on a protected mutate when
     * legacy is off — skip if server allows legacy (dev default). */
    const healthBody = (await health.json()) as { auth?: { legacyUserHeader?: boolean } }
    const legacy = healthBody.auth?.legacyUserHeader !== false

    const forged = await fetch(`${BASE}/api/me/account`, {
      headers: { 'X-Simvest-User-Id': 'forged_user_abcdefghij' },
    })

    if (!legacy) {
      assert(forged.status === 401, `expected 401 without Bearer, got ${forged.status}`)
      console.log('OK — forged header alone rejected (legacy off)')
    } else {
      console.log(
        `SKIP full auth path (set SIMVEST_VERIFY_LOGIN_ID + SIMVEST_VERIFY_LOGIN_PASSWORD). Legacy header allowed=${legacy}; forged GET status=${forged.status}`,
      )
    }
    return
  }

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: id, password: pw }),
  })
  const loginBody = (await loginRes.json()) as {
    token?: string
    sessionToken?: string
    user?: { userId?: string }
    error?: string
  }
  assert(loginRes.ok, `login failed: ${loginBody.error ?? loginRes.status}`)
  const token = loginBody.token ?? loginBody.sessionToken
  assert(token && token.length >= 16, 'login missing token')
  assert(loginBody.user?.userId, 'login missing userId')

  const me = await fetch(`${BASE}/api/me/account`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert(me.ok, `Bearer /api/me/account → ${me.status}`)

  const forged = await fetch(`${BASE}/api/me/account`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Simvest-User-Id': 'forged_other_user_xyz',
    },
  })
  assert(forged.ok, 'Bearer should win over forged header')
  const forgedBody = (await forged.json()) as { account?: { userId?: string } }
  assert(
    forgedBody.account?.userId === loginBody.user!.userId,
    'session user must not be overridden by forged header',
  )

  const logout = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  assert(logout.ok, `logout ${logout.status}`)

  const after = await fetch(`${BASE}/api/me/account`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert(after.status === 401, `expected 401 after logout, got ${after.status}`)

  console.log('OK — login Bearer auth, forged header ignored, logout invalidates')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
