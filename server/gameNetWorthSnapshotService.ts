import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SNAP_PATH = path.join(__dirname, 'data', 'game-networth-snapshots.json')

export type NwPoint = { recordedAt: string; netWorth: number }

type LegacyRow = { netWorth: number; recordedAt: string }
type ModernRow = { points: NwPoint[] }

/** Per game slug → userId → net worth history (for period returns on leaderboard). */
type SnapFile = {
  games: Record<string, Record<string, LegacyRow | ModernRow>>
}

const MS_DAY = 86400000
const MAX_POINTS_PER_USER = 500

async function readSnapFile(): Promise<SnapFile> {
  try {
    const raw = JSON.parse(await fs.readFile(SNAP_PATH, 'utf8')) as SnapFile
    if (raw && raw.games && typeof raw.games === 'object') return raw
  } catch {
    /* missing */
  }
  return { games: {} }
}

async function writeSnapFile(data: SnapFile): Promise<void> {
  await fs.mkdir(path.dirname(SNAP_PATH), { recursive: true })
  await fs.writeFile(SNAP_PATH, JSON.stringify(data, null, 2), 'utf8')
}

function migrateRow(raw: unknown): NwPoint[] {
  if (raw && typeof raw === 'object' && Array.isArray((raw as ModernRow).points)) {
    return (raw as ModernRow).points.filter(
      (p) =>
        p &&
        typeof p.recordedAt === 'string' &&
        typeof p.netWorth === 'number' &&
        Number.isFinite(p.netWorth),
    )
  }
  if (
    raw &&
    typeof raw === 'object' &&
    'netWorth' in raw &&
    'recordedAt' in raw &&
    Number.isFinite((raw as LegacyRow).netWorth)
  ) {
    const r = raw as LegacyRow
    return [{ netWorth: r.netWorth, recordedAt: r.recordedAt }]
  }
  return []
}

function trimPoints(points: NwPoint[]): NwPoint[] {
  if (points.length <= MAX_POINTS_PER_USER) return points
  return points.slice(points.length - MAX_POINTS_PER_USER)
}

export async function recordGameNetWorthSnapshot(
  gameSlug: string,
  userId: string,
  netWorth: number,
): Promise<void> {
  const slug = String(gameSlug ?? '').trim()
  if (!userId || userId.length < 8 || !Number.isFinite(netWorth)) return
  const file = await readSnapFile()
  if (!file.games[slug]) file.games[slug] = {}

  const prev = migrateRow(file.games[slug]![userId])
  const nowIso = new Date().toISOString()
  const next: NwPoint[] = [...prev, { recordedAt: nowIso, netWorth }]
  next.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())

  const trimmed = trimPoints(next)
  file.games[slug]![userId] = { points: trimmed }
  await writeSnapFile(file)
}

export async function clearUserSnapshotsForGame(gameSlug: string, userId: string): Promise<boolean> {
  const slug = String(gameSlug ?? '').trim()
  if (!slug || !userId) return false
  const file = await readSnapFile()
  if (!file.games[slug]?.[userId]) return false
  delete file.games[slug]![userId]
  if (Object.keys(file.games[slug]!).length === 0) delete file.games[slug]
  await writeSnapFile(file)
  return true
}

/** Move snapshot history from one game slug to another. */
export async function renameGameSlugInNetWorthSnapshots(fromSlug: string, toSlug: string): Promise<boolean> {
  const from = String(fromSlug ?? '').trim()
  const to = String(toSlug ?? '').trim()
  if (!from || !to || from === to) return false
  const file = await readSnapFile()
  const block = file.games[from]
  if (!block) return false
  if (!file.games[to]) file.games[to] = block
  delete file.games[from]
  await writeSnapFile(file)
  return true
}

/** Drop net-worth history for every user under one game slug. */
export async function clearAllSnapshotsForGame(gameSlug: string): Promise<boolean> {
  const slug = String(gameSlug ?? '').trim()
  if (!slug) return false
  const file = await readSnapFile()
  if (!file.games[slug]) return false
  delete file.games[slug]
  await writeSnapFile(file)
  return true
}

export async function getRecordedNetWorth(
  gameSlug: string,
  userId: string,
): Promise<number | undefined> {
  const slug = String(gameSlug ?? '').trim()
  if (!userId || userId.length < 8) return undefined
  const file = await readSnapFile()
  const raw = file.games[slug]?.[userId]
  const pts = migrateRow(raw)
  if (pts.length === 0) return undefined
  const last = pts[pts.length - 1]!
  return Number.isFinite(last.netWorth) ? last.netWorth : undefined
}

export async function getNetWorthHistory(gameSlug: string, userId: string): Promise<NwPoint[]> {
  const slug = String(gameSlug ?? '').trim()
  if (!userId || userId.length < 8) return []
  const file = await readSnapFile()
  const raw = file.games[slug]?.[userId]
  const pts = migrateRow(raw)
  return [...pts].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
}

/**
 * Percent change in net worth over `periodDays` using stored snapshots.
 * Uses the latest snapshot at or before (now − period); if all data is newer than that cut,
 * falls back to earliest snapshot in the series (partial window).
 */
export function estimatePeriodReturnPct(
  currentNw: number,
  points: NwPoint[],
  periodDays: number,
): number | null {
  if (!Number.isFinite(currentNw) || points.length === 0 || periodDays <= 0) return null
  const sorted = [...points].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  )
  const cutoff = Date.now() - periodDays * MS_DAY

  let anchor: NwPoint | undefined
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!
    if (new Date(p.recordedAt).getTime() <= cutoff && p.netWorth > 1e-6) {
      anchor = p
      break
    }
  }

  const basis = anchor ?? (sorted[0]!.netWorth > 1e-6 ? sorted[0] : undefined)
  if (!basis || basis.netWorth <= 1e-6) return null
  return ((currentNw - basis.netWorth) / basis.netWorth) * 100
}
