import { randomUUID } from 'node:crypto'
import { dataFilePath } from './dataDir.ts'
import { readDataJsonObject, writeDataJsonObject, withDataJsonDocumentLock } from './db/persistedJson.ts'
import { normalizeUserId } from './followsService'
import { ensureGameJoinedAt } from './gameMembershipService'
import { canonicalGameSlugKey, normalizeGameSlugParam } from './gameSlugNormalize'
import { getRuntimeRules } from './gameRuntimeRulesService'

const REQ_PATH = dataFilePath('game-join-requests.json')

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected'

export type GameJoinRequest = {
  id: string
  gameSlug: string
  userId: string
  displayName: string
  status: JoinRequestStatus
  createdAtIso: string
  resolvedAtIso?: string
}

type FileShape = {
  version?: number
  items?: unknown[]
}

export function viewerIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = typeof a === 'string' ? a.trim() : ''
  const tb = typeof b === 'string' ? b.trim() : ''
  if (!ta || !tb) return false
  if (ta === tb) return true
  const na = normalizeUserId(ta)
  const nb = normalizeUserId(tb)
  return Boolean(na && nb && na === nb)
}

function slugMatches(storedSlug: string, querySlug: string): boolean {
  const a = canonicalGameSlugKey(storedSlug)
  const b = canonicalGameSlugKey(querySlug)
  return Boolean(a && b && a === b)
}

async function readAllUnlocked(): Promise<GameJoinRequest[]> {
  const j = await readDataJsonObject<FileShape>(REQ_PATH)
  if (!j) return []
  const items = Array.isArray(j.items) ? j.items : []
  const out: GameJoinRequest[] = []
  for (const row of items) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const gameSlug = typeof o.gameSlug === 'string' ? o.gameSlug : ''
    const userId = typeof o.userId === 'string' ? o.userId : ''
    const displayName = typeof o.displayName === 'string' ? o.displayName : ''
    const status = o.status === 'pending' || o.status === 'approved' || o.status === 'rejected' ? o.status : null
    const createdAtIso = typeof o.createdAtIso === 'string' ? o.createdAtIso : ''
    if (!id || !gameSlug || !userId || !status || !createdAtIso) continue
    const resolvedAtIso = typeof o.resolvedAtIso === 'string' ? o.resolvedAtIso : undefined
    out.push({ id, gameSlug, userId, displayName, status, createdAtIso, resolvedAtIso })
  }
  return out
}

async function readAll(): Promise<GameJoinRequest[]> {
  return withDataJsonDocumentLock(REQ_PATH, readAllUnlocked)
}

async function writeAllUnlocked(items: GameJoinRequest[]): Promise<void> {
  await writeDataJsonObject(REQ_PATH, { version: 1, items })
}

async function writeAll(items: GameJoinRequest[]): Promise<void> {
  return withDataJsonDocumentLock(REQ_PATH, () => writeAllUnlocked(items))
}

/** Admin dashboard — all join requests, newest first. */
export async function listAllJoinRequests(): Promise<GameJoinRequest[]> {
  const all = await readAll()
  return [...all].sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1))
}

export async function findPendingRequest(gameSlug: string, userId: string): Promise<GameJoinRequest | null> {
  const all = await readAll()
  return (
    all.find(
      (r) => slugMatches(r.gameSlug, gameSlug) && viewerIdsMatch(r.userId, userId) && r.status === 'pending',
    ) ?? null
  )
}

export async function createJoinRequestIfNeeded(input: {
  gameSlug: string
  userId: string
  displayName: string
}): Promise<{ created: boolean; request: GameJoinRequest }> {
  const gameSlug = normalizeGameSlugParam(input.gameSlug)
  const userId = normalizeUserId(input.userId.trim()) ?? input.userId.trim()
  if (!gameSlug || userId.length < 8) {
    throw new Error('Invalid join request input')
  }
  return withDataJsonDocumentLock(REQ_PATH, async () => {
    const all = await readAllUnlocked()
    const existing = all.find(
      (r) => slugMatches(r.gameSlug, gameSlug) && viewerIdsMatch(r.userId, userId) && r.status === 'pending',
    )
    if (existing) return { created: false, request: existing }
    const req: GameJoinRequest = {
      id: randomUUID(),
      gameSlug,
      userId,
      displayName: input.displayName.trim() || userId,
      status: 'pending',
      createdAtIso: new Date().toISOString(),
    }
    all.push(req)
    await writeAllUnlocked(all)
    queueMicrotask(() => {
      void import('./notificationEvents')
        .then(async (m) => {
          const rules = await getRuntimeRules(gameSlug)
          const host = rules?.hostUserId?.trim()
          if (!host) return
          await m.notifyHostJoinRequest({
            gameSlug,
            hostUserId: host,
            requesterDisplayName: req.displayName,
          })
        })
        .catch(() => {})
    })
    return { created: true, request: req }
  })
}

export async function listPendingJoinRequestsForHost(
  gameSlug: string,
  hostUserId: string,
): Promise<GameJoinRequest[]> {
  const rules = await getRuntimeRules(gameSlug)
  if (!rules || !viewerIdsMatch(rules.hostUserId, hostUserId)) return []
  const all = await readAll()
  return all
    .filter((r) => slugMatches(r.gameSlug, gameSlug) && r.status === 'pending')
    .sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1))
}

/** Every pending request across games where `hostUserId` is the runtime host. */
export async function listAllPendingJoinRequestsForHost(hostUserId: string): Promise<GameJoinRequest[]> {
  const hostNorm = normalizeUserId(hostUserId.trim()) ?? hostUserId.trim()
  if (hostNorm.length < 8) return []
  const all = await readAll()
  const pending = all.filter((r) => r.status === 'pending')
  const out: GameJoinRequest[] = []
  for (const r of pending) {
    const rules = await getRuntimeRules(r.gameSlug)
    if (!rules || !viewerIdsMatch(rules.hostUserId, hostNorm)) continue
    out.push(r)
  }
  return out.sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1))
}

export async function approveJoinRequest(
  requestId: string,
  hostUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withDataJsonDocumentLock(REQ_PATH, async () => {
    const all = await readAllUnlocked()
    const idx = all.findIndex((r) => r.id === requestId)
    if (idx < 0) return { ok: false, error: 'Request not found' }
    const r = all[idx]!
    if (r.status !== 'pending') return { ok: false, error: 'Request is not pending' }
    const rules = await getRuntimeRules(r.gameSlug)
    if (!rules || !viewerIdsMatch(rules.hostUserId, hostUserId)) {
      return { ok: false, error: 'Only the game host can approve join requests.' }
    }
    await ensureGameJoinedAt(r.userId, r.gameSlug)
    const now = new Date().toISOString()
    all[idx] = { ...r, status: 'approved', resolvedAtIso: now }
    await writeAllUnlocked(all)
    queueMicrotask(() => {
      void import('./notificationEvents')
        .then(async (m) => {
          const host = rules.hostUserId?.trim()
          if (!host) return
          await m.notifyHostMemberJoined({
            gameSlug: r.gameSlug,
            hostUserId: host,
            memberDisplayName: r.displayName,
          })
        })
        .catch(() => {})
    })
    return { ok: true }
  })
}

export async function rejectJoinRequest(
  requestId: string,
  hostUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withDataJsonDocumentLock(REQ_PATH, async () => {
    const all = await readAllUnlocked()
    const idx = all.findIndex((r) => r.id === requestId)
    if (idx < 0) return { ok: false, error: 'Request not found' }
    const r = all[idx]!
    if (r.status !== 'pending') return { ok: false, error: 'Request is not pending' }
    const rules = await getRuntimeRules(r.gameSlug)
    if (!rules || !viewerIdsMatch(rules.hostUserId, hostUserId)) {
      return { ok: false, error: 'Only the game host can reject join requests.' }
    }
    const now = new Date().toISOString()
    all[idx] = { ...r, status: 'rejected', resolvedAtIso: now }
    await writeAllUnlocked(all)
    return { ok: true }
  })
}

export async function countPendingForGame(gameSlug: string): Promise<number> {
  const all = await readAll()
  return all.filter((r) => slugMatches(r.gameSlug, gameSlug) && r.status === 'pending').length
}

/** Drop every join-request row for a user/game (used when they leave or are kicked). */
export async function clearJoinRequestsForUserGame(userId: string, gameSlug: string): Promise<number> {
  if (!userId || !gameSlug) return 0
  return withDataJsonDocumentLock(REQ_PATH, async () => {
    const all = await readAllUnlocked()
    const next = all.filter((r) => !(slugMatches(r.gameSlug, gameSlug) && viewerIdsMatch(r.userId, userId)))
    if (next.length === all.length) return 0
    await writeAllUnlocked(next)
    return all.length - next.length
  })
}

/** Update `gameSlug` on every join-request row (archive shared `new` slot). */
export async function renameGameSlugInJoinRequests(fromSlug: string, toSlug: string): Promise<number> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return 0
  return withDataJsonDocumentLock(REQ_PATH, async () => {
    const all = await readAllUnlocked()
    let moved = 0
    for (const row of all) {
      if (!slugMatches(row.gameSlug, fromSlug)) continue
      row.gameSlug = toSlug
      moved += 1
    }
    if (moved > 0) await writeAllUnlocked(all)
    return moved
  })
}

/** Remove all join requests targeting a game (pending or resolved). */
export async function clearAllJoinRequestsForGame(gameSlug: string): Promise<number> {
  if (!gameSlug) return 0
  return withDataJsonDocumentLock(REQ_PATH, async () => {
    const all = await readAllUnlocked()
    const next = all.filter((r) => !slugMatches(r.gameSlug, gameSlug))
    const removed = all.length - next.length
    if (removed > 0) await writeAllUnlocked(next)
    return removed
  })
}
