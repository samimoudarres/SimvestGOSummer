/**
 * In-process session + document-lock smoke (no HTTP server).
 *
 *   npx tsx server/scripts/verifySessionInProcess.ts
 */
import {
  createSession,
  invalidateAllSessionsForUser,
  invalidateSession,
  resolveSessionUserId,
} from '../sessionService'
import { resolveTradeFillPrice } from '../tradeMarkPrice'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function main(): Promise<void> {
  const userId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const { token } = await createSession(userId)
  assert(token.length >= 32, 'token length')
  const resolved = await resolveSessionUserId(token)
  assert(resolved === userId, 'resolve session')
  assert((await resolveSessionUserId('not-a-real-token-xxxxxx')) === null, 'bad token')

  await invalidateSession(token)
  assert((await resolveSessionUserId(token)) === null, 'after logout')

  const { token: t2 } = await createSession(userId)
  await invalidateAllSessionsForUser(userId)
  assert((await resolveSessionUserId(t2)) === null, 'invalidate all')

  const fill = resolveTradeFillPrice({ shares: 2, serverMark: 50, clientFillPrice: 100 })
  assert(fill.fillPrice === 50 && fill.orderTotal === 100, 'server mark wins outside band')

  console.log('OK — session create/resolve/invalidate + fill resolution')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
