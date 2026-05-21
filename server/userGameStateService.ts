import fs from 'node:fs/promises'
import { dataFilePath, ensureParentDirForFile } from './dataDir.ts'
import { normalizeCryptoCompositeTicker, normalizeTicker, resolveMassiveTicker } from './stockService'
import { runSerializedByKey } from './fsMutationQueue'

const STATE_PATH = dataFilePath('user-game-state.json')
const PORTFOLIO_LOCK_KEY = STATE_PATH
const LEGACY_HOLDINGS_PATH = dataFilePath('holdings.json')

export type HoldingRecord = { ticker: string; shares: number; avgCost: number }
export type PositionLot = {
  ticker: string
  shares: number
  entryPrice: number
  boughtAtIso: string
}

export type UserGameLedger = {
  cash: number
  holdings: HoldingRecord[]
  /** FIFO lots preserve exact buy time/price for performance tracking. */
  lots: PositionLot[]
}

export type PortfolioStateV2 = {
  version: 3
  /** Seeded positions every user sees in portfolio (Figma dummy baseline). */
  legacyHoldings: Record<string, HoldingRecord[]>
  /** userId → gameSlug → ledger */
  users: Record<string, Record<string, UserGameLedger>>
}

/** Starting cash for a new ledger row — also used as portfolio chart baseline before first snapshot. */
export const DEFAULT_STARTING_CASH = 100_000
/** Lots migrated from v2 / seed data — not real fill timestamps (see portfolioService lot-day logic). */
export const LEGACY_LOT_TIME = '1970-01-01T00:00:00.000Z'

function emptyState(): PortfolioStateV2 {
  return { version: 3, legacyHoldings: {}, users: {} }
}

function canonicalHoldingTicker(raw: string): string | null {
  return resolveMassiveTicker(raw) ?? normalizeTicker(raw)
}

function mergeTickerLots(rows: HoldingRecord[]): HoldingRecord[] {
  const by = new Map<string, HoldingRecord>()
  for (const r of rows) {
    const t = canonicalHoldingTicker(r.ticker)
    if (!t || !Number.isFinite(r.shares) || r.shares <= 0 || !Number.isFinite(r.avgCost)) continue
    const prev = by.get(t)
    if (!prev) {
      by.set(t, { ticker: t, shares: r.shares, avgCost: r.avgCost })
      continue
    }
    const sh = prev.shares + r.shares
    const avg = (prev.shares * prev.avgCost + r.shares * r.avgCost) / sh
    by.set(t, { ticker: t, shares: sh, avgCost: avg })
  }
  return [...by.values()]
}

async function readLegacyHoldingsOnly(): Promise<Record<string, HoldingRecord[]>> {
  try {
    const raw = JSON.parse(await fs.readFile(LEGACY_HOLDINGS_PATH, 'utf8')) as unknown
    if (!raw || typeof raw !== 'object') return {}
    const o = raw as Record<string, unknown>
    if (Array.isArray(o['nov-2024-stock-challenge']) || Object.values(o).some((v) => Array.isArray(v))) {
      const out: Record<string, HoldingRecord[]> = {}
      for (const [k, v] of Object.entries(o)) {
        if (k === 'version') continue
        if (Array.isArray(v)) out[k] = v as HoldingRecord[]
      }
      return out
    }
  } catch {
    /* no legacy file */
  }
  return {}
}

/** Game keys where this user already has persisted ledger/state (played / traded). */
export async function listGameSlugsWithUserLedger(userId: string): Promise<string[]> {
  if (!userId || userId.length < 8) return []
  const s = await readPortfolioState()
  const ug = s.users[userId]
  if (!ug || typeof ug !== 'object') return []
  return Object.keys(ug).sort((a, b) => a.localeCompare(b))
}

/** Every user id with a ledger row for this game slug (still competing or finished). */
export async function listUserIdsWithLedgerForGame(gameSlug: string): Promise<string[]> {
  const slug = String(gameSlug ?? '').trim()
  if (!slug) return []
  const state = await readPortfolioState()
  const out: string[] = []
  for (const uid of Object.keys(state.users ?? {})) {
    if (uid.length < 8) continue
    if (state.users[uid]?.[slug]) out.push(uid)
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b))
}

async function writePortfolioStateToDisk(s: PortfolioStateV2): Promise<void> {
  await ensureParentDirForFile(STATE_PATH)
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2), 'utf8')
}

/** Load + migrate portfolio JSON. Call only inside `runSerializedByKey(PORTFOLIO_LOCK_KEY, …)`. */
async function loadPortfolioStateFromDisk(): Promise<PortfolioStateV2> {
  try {
    const raw = JSON.parse(await fs.readFile(STATE_PATH, 'utf8')) as unknown
    if (raw && typeof raw === 'object') {
      const r = raw as { version?: number; legacyHoldings?: Record<string, HoldingRecord[]>; users?: PortfolioStateV2['users'] }
      if (r.version === 2 || r.version === 3) {
        const s = raw as PortfolioStateV2
        if (s.version === 2) {
          for (const [uid, games] of Object.entries(s.users ?? {})) {
            for (const [slug, ledger] of Object.entries(games ?? {})) {
              const lots = (ledger.holdings ?? []).map((h) => ({
                ticker: h.ticker,
                shares: h.shares,
                entryPrice: h.avgCost,
                boughtAtIso: LEGACY_LOT_TIME,
              }))
              s.users[uid]![slug] = {
                cash: ledger.cash,
                holdings: mergeTickerLots(ledger.holdings ?? []),
                lots,
              }
            }
          }
          s.version = 3
          await writePortfolioStateToDisk(s)
        }
        if (!s.legacyHoldings || Object.keys(s.legacyHoldings).length === 0) {
          const leg = await readLegacyHoldingsOnly()
          if (Object.keys(leg).length) {
            s.legacyHoldings = { ...leg, ...s.legacyHoldings }
            await writePortfolioStateToDisk(s)
          }
        }
        return s
      }
    }
  } catch {
    /* missing */
  }
  const legacy = await readLegacyHoldingsOnly()
  const initial = emptyState()
  initial.legacyHoldings = legacy
  await writePortfolioStateToDisk(initial)
  return initial
}

export async function readPortfolioState(): Promise<PortfolioStateV2> {
  return runSerializedByKey(PORTFOLIO_LOCK_KEY, loadPortfolioStateFromDisk)
}

export async function writePortfolioState(s: PortfolioStateV2): Promise<void> {
  return runSerializedByKey(PORTFOLIO_LOCK_KEY, () => writePortfolioStateToDisk(s))
}

/** Drop a single user's ledger (cash + holdings + lots) for one game. Returns true when removed. */
export async function clearUserLedgerForGame(userId: string, gameSlug: string): Promise<boolean> {
  if (!userId || !gameSlug) return false
  return runSerializedByKey(PORTFOLIO_LOCK_KEY, async () => {
    const state = await loadPortfolioStateFromDisk()
    const games = state.users[userId]
    if (!games || !games[gameSlug]) return false
    delete games[gameSlug]
    if (Object.keys(games).length === 0) delete state.users[userId]
    await writePortfolioStateToDisk(state)
    return true
  })
}

/** Drop persisted ledger rows for **every** user for one game slug (shared-slot republish). */
export async function clearAllUserLedgersForGame(gameSlug: string): Promise<number> {
  if (!gameSlug) return 0
  return runSerializedByKey(PORTFOLIO_LOCK_KEY, async () => {
    const state = await loadPortfolioStateFromDisk()
    let removed = 0
    for (const uid of Object.keys(state.users ?? {})) {
      const games = state.users[uid]
      if (!games || typeof games !== 'object') continue
      if (!games[gameSlug]) continue
      delete games[gameSlug]
      removed++
      if (Object.keys(games).length === 0) delete state.users[uid]
    }
    if (removed > 0) await writePortfolioStateToDisk(state)
    return removed
  })
}

/** Remove seeded legacy baseline holdings for a slug so portfolio is not pre-filled. */
export async function clearLegacyHoldingsForGameSlot(gameSlug: string): Promise<void> {
  if (!gameSlug) return
  return runSerializedByKey(PORTFOLIO_LOCK_KEY, async () => {
    const state = await loadPortfolioStateFromDisk()
    if (!state.legacyHoldings?.[gameSlug]) return
    const next = { ...state.legacyHoldings }
    delete next[gameSlug]
    state.legacyHoldings = next
    await writePortfolioStateToDisk(state)
  })
}

/** Copy per-game ledgers from anonymous viewer id into account id when the account has no row yet. */
export async function mergePortfolioViewerIds(fromUserId: string, toUserId: string): Promise<void> {
  if (!fromUserId || !toUserId || fromUserId.length < 8 || toUserId.length < 8 || fromUserId === toUserId) return
  return runSerializedByKey(PORTFOLIO_LOCK_KEY, async () => {
    const state = await loadPortfolioStateFromDisk()
    const fromGames = state.users[fromUserId]
    if (!fromGames || typeof fromGames !== 'object') return
    if (!state.users[toUserId]) state.users[toUserId] = {}
    const toGames = state.users[toUserId]!
    for (const [slug, ledger] of Object.entries(fromGames)) {
      if (!slug || toGames[slug]) continue
      toGames[slug] = ledger
    }
    delete state.users[fromUserId]
    await writePortfolioStateToDisk(state)
  })
}

/** Move every user's ledger + legacy holdings from one game slug to another. */
export async function renameGameSlugInPortfolioState(fromSlug: string, toSlug: string): Promise<number> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return 0
  return runSerializedByKey(PORTFOLIO_LOCK_KEY, async () => {
    const state = await loadPortfolioStateFromDisk()
    let moved = 0
    if (state.legacyHoldings[fromSlug]) {
      if (!state.legacyHoldings[toSlug]) {
        state.legacyHoldings[toSlug] = state.legacyHoldings[fromSlug]
      }
      delete state.legacyHoldings[fromSlug]
      moved += 1
    }
    for (const uid of Object.keys(state.users ?? {})) {
      const games = state.users[uid]
      if (!games?.[fromSlug]) continue
      if (!games[toSlug]) games[toSlug] = games[fromSlug]
      delete games[fromSlug]
      moved += 1
      if (Object.keys(games).length === 0) delete state.users[uid]
    }
    if (moved > 0) await writePortfolioStateToDisk(state)
    return moved
  })
}

function ledgerFor(state: PortfolioStateV2, userId: string, gameSlug: string): UserGameLedger {
  const u = state.users[userId]?.[gameSlug]
  if (u) {
    const lots =
      Array.isArray(u.lots) && u.lots.length
        ? [...u.lots]
        : (u.holdings ?? []).map((h) => ({
            ticker: h.ticker,
            shares: h.shares,
            entryPrice: h.avgCost,
            boughtAtIso: LEGACY_LOT_TIME,
          }))
    return { cash: u.cash, holdings: [...u.holdings], lots }
  }
  return { cash: DEFAULT_STARTING_CASH, holdings: [], lots: [] }
}

function setLedger(state: PortfolioStateV2, userId: string, gameSlug: string, ledger: UserGameLedger): void {
  if (!state.users[userId]) state.users[userId] = {}
  state.users[userId]![gameSlug] = {
    cash: ledger.cash,
    holdings: mergeTickerLots(ledger.holdings),
    lots: ledger.lots,
  }
}

function lotsToHoldings(lots: PositionLot[]): HoldingRecord[] {
  const rows = lots
    .filter((l) => Number.isFinite(l.shares) && l.shares > 0 && Number.isFinite(l.entryPrice) && l.entryPrice > 0)
    .map((l) => ({ ticker: l.ticker, shares: l.shares, avgCost: l.entryPrice }))
  return mergeTickerLots(rows)
}

/** Legacy seed + user fills (merged by ticker for display / P&L). */
export async function getLegacyHoldingsForGame(gameSlug: string): Promise<HoldingRecord[]> {
  const state = await readPortfolioState()
  return state.legacyHoldings[gameSlug] ?? []
}

export async function getMergedHoldings(userId: string, gameSlug: string): Promise<HoldingRecord[]> {
  const state = await readPortfolioState()
  const legacy = state.legacyHoldings[gameSlug] ?? []
  const user = ledgerFor(state, userId, gameSlug).holdings
  return mergeTickerLots([...legacy, ...user])
}

/** This user's actual positions from the trade ledger only (no seeded legacy holdings). */
export async function getLedgerHoldingsForGame(userId: string, gameSlug: string): Promise<HoldingRecord[]> {
  const state = await readPortfolioState()
  return [...ledgerFor(state, userId, gameSlug).holdings]
}

export async function getUserLedger(userId: string, gameSlug: string): Promise<UserGameLedger> {
  const state = await readPortfolioState()
  return ledgerFor(state, userId, gameSlug)
}

export async function getUserLots(userId: string, gameSlug: string): Promise<PositionLot[]> {
  const state = await readPortfolioState()
  return ledgerFor(state, userId, gameSlug).lots
}

export type TradeSide = 'buy' | 'sell'

export type ApplyTradeInput = {
  userId: string
  gameSlug: string
  ticker: string
  side: TradeSide
  shares: number
  fillPrice: number
  orderTotal: number
  boughtAtIso?: string
}

/** Mutates persisted ledger: cash, user-only holdings (legacy stays separate). */
export async function saveLegacyHoldingsForGame(gameSlug: string, rows: HoldingRecord[]): Promise<void> {
  return runSerializedByKey(PORTFOLIO_LOCK_KEY, async () => {
    const state = await loadPortfolioStateFromDisk()
    state.legacyHoldings[gameSlug] = mergeTickerLots(rows)
    await writePortfolioStateToDisk(state)
  })
}

export type ApplyTradeOk = {
  ok: true
  /** Sum of (shares × entryPrice) for every lot consumed by a sell — undefined for buys. */
  unwoundCostBasis?: number
}

export async function applyTradeToUserLedger(
  input: ApplyTradeInput,
): Promise<ApplyTradeOk | { ok: false; error: string }> {
  const raw = String(input.ticker ?? '').trim()
  const sym = normalizeCryptoCompositeTicker(raw) ?? normalizeTicker(raw)
  if (!sym) return { ok: false, error: 'Invalid ticker' }
  if (!Number.isFinite(input.shares) || input.shares <= 0) return { ok: false, error: 'Invalid shares' }
  if (!Number.isFinite(input.fillPrice) || input.fillPrice <= 0) return { ok: false, error: 'Invalid price' }
  if (!Number.isFinite(input.orderTotal) || input.orderTotal <= 0) return { ok: false, error: 'Invalid order total' }

  return runSerializedByKey(PORTFOLIO_LOCK_KEY, async () => {
    const state = await loadPortfolioStateFromDisk()
    const ledger = ledgerFor(state, input.userId, input.gameSlug)

    let unwoundCostBasis: number | undefined

    if (input.side === 'buy') {
      if (ledger.cash + 1e-9 < input.orderTotal) {
        return { ok: false, error: 'Insufficient cash for this trade' }
      }
      ledger.cash -= input.orderTotal
      ledger.lots = [
        ...ledger.lots,
        {
          ticker: sym,
          shares: input.shares,
          entryPrice: input.fillPrice,
          boughtAtIso: input.boughtAtIso ?? new Date().toISOString(),
        },
      ]
      ledger.holdings = lotsToHoldings(ledger.lots)
    } else {
      const owned = ledger.lots
        .filter((l) => (resolveMassiveTicker(l.ticker) ?? normalizeTicker(l.ticker)) === sym)
        .reduce((s, l) => s + l.shares, 0)
      if (owned + 1e-9 < input.shares) return { ok: false, error: 'Not enough shares to sell' }
      ledger.cash += input.orderTotal
      let remaining = input.shares
      let costBasis = 0
      const sorted = [...ledger.lots].sort((a, b) => (a.boughtAtIso < b.boughtAtIso ? -1 : 1))
      const next: PositionLot[] = []
      for (const lot of sorted) {
        if ((resolveMassiveTicker(lot.ticker) ?? normalizeTicker(lot.ticker)) !== sym) {
          next.push(lot)
          continue
        }
        if (remaining <= 1e-9) {
          next.push(lot)
          continue
        }
        if (lot.shares <= remaining + 1e-9) {
          costBasis += lot.shares * lot.entryPrice
          remaining -= lot.shares
        } else {
          costBasis += remaining * lot.entryPrice
          next.push({ ...lot, shares: lot.shares - remaining })
          remaining = 0
        }
      }
      ledger.lots = next.filter((l) => l.shares > 1e-8)
      ledger.holdings = lotsToHoldings(ledger.lots)
      unwoundCostBasis = costBasis
    }

    setLedger(state, input.userId, input.gameSlug, ledger)
    if (!state.users[input.userId]?.[input.gameSlug]) {
      return { ok: false, error: 'Could not attach ledger to portfolio state' }
    }
    await writePortfolioStateToDisk(state)
    return unwoundCostBasis != null ? { ok: true, unwoundCostBasis } : { ok: true }
  })
}
