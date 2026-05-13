import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ensureGameJoinedAt } from './gameMembershipService'
import { getRuntimeRules } from './gameRuntimeRulesService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REQ_PATH = path.join(__dirname, 'data', 'game-join-requests.json')

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

async function readAll(): Promise<GameJoinRequest[]> {
  try {
    const raw = await fs.readFile(REQ_PATH, 'utf8')
    const j = JSON.parse(raw) as FileShape
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
  } catch {
    return []
  }
}

async function writeAll(items: GameJoinRequest[]): Promise<void> {
  await fs.writeFile(REQ_PATH, JSON.stringify({ version: 1, items }, null, 2), 'utf8')
}

export async function findPendingRequest(gameSlug: string, userId: string): Promise<GameJoinRequest | null> {
  const all = await readAll()
  return (
    all.find((r) => r.gameSlug === gameSlug && r.userId === userId && r.status === 'pending') ?? null
  )
}

export async function createJoinRequestIfNeeded(input: {
  gameSlug: string
  userId: string
  displayName: string
}): Promise<{ created: boolean; request: GameJoinRequest }> {
  const existing = await findPendingRequest(input.gameSlug, input.userId)
  if (existing) return { created: false, request: existing }
  const req: GameJoinRequest = {
    id: randomUUID(),
    gameSlug: input.gameSlug,
    userId: input.userId,
    displayName: input.displayName.trim() || input.userId,
    status: 'pending',
    createdAtIso: new Date().toISOString(),
  }
  const all = await readAll()
  all.push(req)
  await writeAll(all)
  return { created: true, request: req }
}

export async function listPendingJoinRequestsForHost(
  gameSlug: string,
  hostUserId: string,
): Promise<GameJoinRequest[]> {
  const rules = await getRuntimeRules(gameSlug)
  if (!rules || rules.hostUserId !== hostUserId) return []
  const all = await readAll()
  return all.filter((r) => r.gameSlug === gameSlug && r.status === 'pending')
}

export async function approveJoinRequest(
  requestId: string,
  hostUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await readAll()
  const idx = all.findIndex((r) => r.id === requestId)
  if (idx < 0) return { ok: false, error: 'Request not found' }
  const r = all[idx]!
  if (r.status !== 'pending') return { ok: false, error: 'Request is not pending' }
  const rules = await getRuntimeRules(r.gameSlug)
  if (!rules || rules.hostUserId !== hostUserId) {
    return { ok: false, error: 'Only the game host can approve join requests.' }
  }
  await ensureGameJoinedAt(r.userId, r.gameSlug)
  const now = new Date().toISOString()
  all[idx] = { ...r, status: 'approved', resolvedAtIso: now }
  await writeAll(all)
  return { ok: true }
}

export async function rejectJoinRequest(
  requestId: string,
  hostUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await readAll()
  const idx = all.findIndex((r) => r.id === requestId)
  if (idx < 0) return { ok: false, error: 'Request not found' }
  const r = all[idx]!
  if (r.status !== 'pending') return { ok: false, error: 'Request is not pending' }
  const rules = await getRuntimeRules(r.gameSlug)
  if (!rules || rules.hostUserId !== hostUserId) {
    return { ok: false, error: 'Only the game host can reject join requests.' }
  }
  const now = new Date().toISOString()
  all[idx] = { ...r, status: 'rejected', resolvedAtIso: now }
  await writeAll(all)
  return { ok: true }
}

export async function countPendingForGame(gameSlug: string): Promise<number> {
  const all = await readAll()
  return all.filter((r) => r.gameSlug === gameSlug && r.status === 'pending').length
}
