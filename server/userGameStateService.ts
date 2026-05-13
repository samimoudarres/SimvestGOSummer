import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeCryptoCompositeTicker, normalizeTicker } from './stockService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_PATH = path.join(__dirname, 'data', 'user-game-state.json')
const LEGACY_HOLDINGS_PATH = path.join(__dirname, 'data', 'holdings.json')

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
const LEGACY_LOT_TIME = '1970-01-01T00:00:00.000Z'

function emptyState(): PortfolioStateV2 {
  return { version: 3, legacyHoldings: {}, users: {} }
}

function mergeTickerLots(rows: HoldingRecord[]): HoldingRecord[] {
  const by = new Map<string, HoldingRecord>()
  for (const r of rows) {
    const t = normalizeTicker(r.ticker)
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

export async function readPortfolioState(): Promise<PortfolioStateV2> {
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
          await writePortfolioState(s)
        }
        if (!s.legacyHoldings || Object.keys(s.legacyHoldings).length === 0) {
          const leg = await readLegacyHoldingsOnly()
          if (Object.keys(leg).length) {
            s.legacyHoldings = { ...leg, ...s.legacyHoldings }
            await writePortfolioState(s)
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
  await writePortfolioState(initial)
  return initial
}

export async function writePortfolioState(s: PortfolioStateV2): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true })
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2), 'utf8')
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
  const state = await readPortfolioState()
  state.legacyHoldings[gameSlug] = mergeTickerLots(rows)
  await writePortfolioState(state)
}

export async function applyTradeToUserLedger(input: ApplyTradeInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = String(input.ticker ?? '').trim()
  const sym = normalizeCryptoCompositeTicker(raw) ?? normalizeTicker(raw)
  if (!sym) return { ok: false, error: 'Invalid ticker' }
  if (!Number.isFinite(input.shares) || input.shares <= 0) return { ok: false, error: 'Invalid shares' }
  if (!Number.isFinite(input.fillPrice) || input.fillPrice <= 0) return { ok: false, error: 'Invalid price' }
  if (!Number.isFinite(input.orderTotal) || input.orderTotal <= 0) return { ok: false, error: 'Invalid order total' }

  const state = await readPortfolioState()
  const ledger = ledgerFor(state, input.userId, input.gameSlug)

  if (input.side === 'buy') {
    if (ledger.cash + 1e-9 < input.orderTotal) {
      return { ok: false, error: 'Insufficient cash for this trade (demo account)' }
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
      .filter((l) => normalizeTicker(l.ticker) === sym)
      .reduce((s, l) => s + l.shares, 0)
    if (owned + 1e-9 < input.shares) return { ok: false, error: 'Not enough shares to sell' }
    ledger.cash += input.orderTotal
    let remaining = input.shares
    const sorted = [...ledger.lots].sort((a, b) => (a.boughtAtIso < b.boughtAtIso ? -1 : 1))
    const next: PositionLot[] = []
    for (const lot of sorted) {
      if (normalizeTicker(lot.ticker) !== sym) {
        next.push(lot)
        continue
      }
      if (remaining <= 1e-9) {
        next.push(lot)
        continue
      }
      if (lot.shares <= remaining + 1e-9) {
        remaining -= lot.shares
      } else {
        next.push({ ...lot, shares: lot.shares - remaining })
        remaining = 0
      }
    }
    ledger.lots = next.filter((l) => l.shares > 1e-8)
    ledger.holdings = lotsToHoldings(ledger.lots)
  }

  setLedger(state, input.userId, input.gameSlug, ledger)
  if (!state.users[input.userId]?.[input.gameSlug]) {
    return { ok: false, error: 'Could not attach ledger to portfolio state' }
  }
  await writePortfolioState(state)
  return { ok: true }
}
