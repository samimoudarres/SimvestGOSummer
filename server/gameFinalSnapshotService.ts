import fs from 'node:fs/promises'
import { dataFilePath, ensureParentDirForFile } from './dataDir.ts'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { getLedgerHoldingsForGame, getUserLedger } from './userGameStateService'
import { listParticipantIdsForGame } from './gameParticipantIds'
import { fetchLastCloseAtOrBefore, resolveMassiveTicker } from './stockService'

const SNAP_PATH = dataFilePath('game-final-snapshots.json')

export type GameFinalPlayerSnap = {
  netWorth: number
  costBasis: number
  overallReturnPct: number
}

export type GameFinalSnapshot = {
  endsAtIso: string
  capturedAtIso: string
  tickerLastPx: Record<string, number>
  players: Record<string, GameFinalPlayerSnap>
}

type SnapFile = {
  bySlug?: Record<string, GameFinalSnapshot>
}

const mem = new Map<string, GameFinalSnapshot>()
const inflight = new Map<string, Promise<GameFinalSnapshot | null>>()

async function readFile(): Promise<SnapFile> {
  try {
    const raw = JSON.parse(await fs.readFile(SNAP_PATH, 'utf8')) as SnapFile
    if (raw && raw.bySlug && typeof raw.bySlug === 'object') return raw
  } catch {
    /* missing */
  }
  return { bySlug: {} }
}

async function writeFile(data: SnapFile): Promise<void> {
  await ensureParentDirForFile(SNAP_PATH)
  await fs.writeFile(SNAP_PATH, JSON.stringify(data, null, 2), 'utf8')
}

/** Move a frozen end-of-game snapshot to a permanent slug. */
export async function renameGameSlugInFinalSnapshots(fromSlug: string, toSlug: string): Promise<boolean> {
  const from = String(fromSlug ?? '').trim()
  const to = String(toSlug ?? '').trim()
  if (!from || !to || from === to) return false
  const file = await readFile()
  const row = file.bySlug?.[from]
  if (!row) return false
  const bySlug = { ...(file.bySlug ?? {}) }
  if (!bySlug[to]) bySlug[to] = row
  delete bySlug[from]
  await writeFile({ bySlug })
  mem.delete(from)
  mem.delete(to)
  return true
}

async function uniqueTickersForGame(slug: string): Promise<string[]> {
  const ids = await listParticipantIdsForGame(slug)
  const syms = new Set<string>()
  for (const uid of ids) {
    let holdings: Awaited<ReturnType<typeof getLedgerHoldingsForGame>> = []
    try {
      holdings = await getLedgerHoldingsForGame(uid, slug)
    } catch {
      holdings = []
    }
    for (const h of holdings) {
      const s = resolveMassiveTicker(h.ticker)
      if (s) syms.add(s)
    }
  }
  return [...syms]
}

const PRICE_PARALLEL = 8

/** When `endsAtIso` is in the past, capture last tradeable valuations + per-player NW for frozen leaderboards. */
export async function ensureGameFinalSnapshot(gameSlug: string): Promise<GameFinalSnapshot | null> {
  const slug = String(gameSlug ?? '').trim()
  if (!slug) return null

  const rules = await getRuntimeRules(slug)
  if (!rules?.endsAtIso) return null
  const endMs = new Date(rules.endsAtIso).getTime()
  if (!Number.isFinite(endMs) || Date.now() <= endMs) return null

  const cached = mem.get(slug)
  if (cached && cached.endsAtIso === rules.endsAtIso) return cached

  const pending = inflight.get(slug)
  if (pending) return pending

  const work = (async (): Promise<GameFinalSnapshot | null> => {
    const file = await readFile()
    const bySlug = { ...(file.bySlug ?? {}) }
    const existing = bySlug[slug]
    if (existing && existing.endsAtIso === rules.endsAtIso) {
      mem.set(slug, existing)
      return existing
    }

    const tickers = await uniqueTickersForGame(slug)
    const tickerLastPx: Record<string, number> = {}
    for (let i = 0; i < tickers.length; i += PRICE_PARALLEL) {
      const chunk = tickers.slice(i, i + PRICE_PARALLEL)
      const part = await Promise.all(
        chunk.map(async (t) => {
          const px = await fetchLastCloseAtOrBefore(t, endMs)
          return [t, px] as const
        }),
      )
      for (const [t, px] of part) {
        if (px != null && Number.isFinite(px) && px > 0) tickerLastPx[t] = px
      }
    }

    const players: Record<string, GameFinalPlayerSnap> = {}
    const ids = await listParticipantIdsForGame(slug)
    for (const uid of ids) {
      let ledgerCash = 0
      let holdings: Awaited<ReturnType<typeof getLedgerHoldingsForGame>> = []
      try {
        const ledger = await getUserLedger(uid, slug)
        ledgerCash = Number.isFinite(ledger.cash) ? ledger.cash : 0
      } catch {
        ledgerCash = 0
      }
      try {
        holdings = await getLedgerHoldingsForGame(uid, slug)
      } catch {
        holdings = []
      }
      let costBasis = 0
      let marketValue = 0
      for (const h of holdings) {
        const sh = Number.isFinite(h.shares) ? h.shares : 0
        const ac = Number.isFinite(h.avgCost) && h.avgCost > 0 ? h.avgCost : 0
        const sym = resolveMassiveTicker(h.ticker)
        const px =
          sym && tickerLastPx[sym] != null && Number.isFinite(tickerLastPx[sym]!)
            ? tickerLastPx[sym]!
            : ac
        costBasis += sh * ac
        marketValue += sh * (Number.isFinite(px) && px > 0 ? px : ac)
      }
      const netWorth = Math.max(0, ledgerCash + marketValue)
      const overallReturnPct = costBasis > 1e-6 ? ((marketValue - costBasis) / costBasis) * 100 : 0
      players[uid] = { netWorth, costBasis, overallReturnPct }
    }

    const capturedAtIso = new Date().toISOString()
    const snap: GameFinalSnapshot = {
      endsAtIso: rules.endsAtIso,
      capturedAtIso,
      tickerLastPx,
      players,
    }
    bySlug[slug] = snap
    await writeFile({ bySlug })
    mem.set(slug, snap)
    return snap
  })()

  inflight.set(slug, work)
  try {
    return await work
  } finally {
    inflight.delete(slug)
  }
}
