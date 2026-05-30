import fs from 'node:fs/promises'
import { dataFilePath, ensureParentDirForFile } from './dataDir.ts'
import { getAllFollowTickersForUser } from './followsService'
import { getMergedHoldings } from './userGameStateService'
import { resolveMassiveTicker, fetchStockBars, type Snapshot } from './stockService'
import { massiveGet } from './massiveClient'
import { pickStockMarkPrice } from './usEquityMarkPrice'
import { notifyStockHoldingMove, notifyStockWatchMove } from './notificationEvents'

const DEDUP_PATH = dataFilePath('push-alert-dedup.json')
const MS_DAY = 86_400_000
const SCAN_INTERVAL_MS = 20 * 60 * 1000

type DedupFile = { sent: Record<string, string> }

let dedupMutex = Promise.resolve()
let scanTimer: ReturnType<typeof setInterval> | null = null

function dedupKey(userId: string, ticker: string, kind: string, day: string): string {
  return `${userId}:::${ticker}:::${kind}:::${day}`
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

async function readDedup(): Promise<DedupFile> {
  try {
    const raw = JSON.parse(await fs.readFile(DEDUP_PATH, 'utf8')) as DedupFile
    if (raw && typeof raw.sent === 'object') return raw
  } catch {
    /* */
  }
  return { sent: {} }
}

async function writeDedup(data: DedupFile): Promise<void> {
  await ensureParentDirForFile(DEDUP_PATH)
  const cutoff = Date.now() - 14 * MS_DAY
  const next: Record<string, string> = {}
  for (const [k, iso] of Object.entries(data.sent)) {
    const t = Date.parse(iso)
    if (Number.isFinite(t) && t >= cutoff) next[k] = iso
  }
  await fs.writeFile(DEDUP_PATH, JSON.stringify({ sent: next }, null, 2), 'utf8')
}

async function markSentIfNew(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    dedupMutex = dedupMutex.then(async () => {
      const file = await readDedup()
      if (file.sent[key]) {
        resolve(false)
        return
      }
      file.sent[key] = new Date().toISOString()
      await writeDedup(file)
      resolve(true)
    })
  })
}

function derivedDayChangePct(sym: string, snap: Snapshot['ticker'] | undefined, atMs: number): number | null {
  if (!snap) return null
  const raw = snap as Record<string, unknown>
  const fromSnap =
    typeof snap.todaysChangePerc === 'number' && Number.isFinite(snap.todaysChangePerc)
      ? snap.todaysChangePerc
      : typeof raw.todays_change_perc === 'number'
        ? raw.todays_change_perc
        : null
  if (fromSnap != null) return fromSnap
  const last = pickStockMarkPrice(sym, snap, atMs)
  const prev = snap.prevDay?.c
  if (last != null && prev != null && prev !== 0) return ((last - prev) / prev) * 100
  return null
}

async function fetchWeekChangePct(sym: string): Promise<number | null> {
  const resolved = resolveMassiveTicker(sym)
  if (!resolved) return null
  try {
    const bars = await fetchStockBars(resolved, '1M', {
      windowStartMs: Date.now() - 14 * MS_DAY,
      windowEndMs: Date.now(),
    })
    const closes = bars
      .filter((b) => typeof b.c === 'number' && Number.isFinite(b.c) && b.c > 0)
      .sort((a, b) => a.t - b.t)
    if (closes.length < 6) return null
    const last = closes[closes.length - 1]!.c
    const ref = closes[closes.length - 6]!.c
    if (!ref) return null
    return ((last - ref) / ref) * 100
  } catch {
    return null
  }
}

async function loadSnapshots(symbols: string[]): Promise<Map<string, Snapshot['ticker']>> {
  const out = new Map<string, Snapshot['ticker']>()
  if (!symbols.length) return out
  const uniq = [...new Set(symbols.map((s) => resolveMassiveTicker(s)).filter((s): s is string => !!s))]
  const chunk = 40
  for (let i = 0; i < uniq.length; i += chunk) {
    const slice = uniq.slice(i, i + chunk)
    try {
      const data = await massiveGet<{ tickers?: Snapshot[] }>(
        `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${slice.map(encodeURIComponent).join(',')}`,
      )
      for (const row of data.tickers ?? []) {
        const t = row.ticker?.ticker
        if (t) out.set(t, row.ticker)
      }
    } catch {
      /* skip batch */
    }
  }
  return out
}

function passesThreshold(pct: number, window: 'day' | 'week'): boolean {
  const abs = Math.abs(pct)
  return window === 'day' ? abs >= 5 : abs >= 10
}

export async function runStockMoveAlertScan(): Promise<void> {
  if (!process.env.MASSIVE_API_KEY?.trim()) return

  const userSlugs = new Map<string, string[]>()
  const holdingsByUserGame = new Map<string, { gameSlug: string; ticker: string }[]>()
  const watchByUser = new Map<string, string[]>()

  const membershipPath = dataFilePath('user-game-membership.json')
  let membershipRaw: { joins?: Record<string, string> } = { joins: {} }
  try {
    membershipRaw = JSON.parse(await fs.readFile(membershipPath, 'utf8')) as { joins?: Record<string, string> }
  } catch {
    return
  }
  const joins = membershipRaw.joins ?? {}
  const userIds = new Set<string>()
  for (const k of Object.keys(joins)) {
    const idx = k.indexOf(':::')
    if (idx <= 0) continue
    const uid = k.slice(0, idx)
    const slug = k.slice(idx + 3)
    if (uid.length < 8 || !slug) continue
    userIds.add(uid)
    const list = userSlugs.get(uid) ?? []
    list.push(slug)
    userSlugs.set(uid, list)
  }

  for (const uid of userIds) {
    const slugs = userSlugs.get(uid) ?? []
    for (const slug of slugs) {
      const holdings = await getMergedHoldings(uid, slug)
      for (const h of holdings) {
        if (!h.ticker?.trim() || !(h.shares > 0)) continue
        const sym = resolveMassiveTicker(h.ticker) ?? h.ticker
        const key = `${uid}:::${slug}`
        const list = holdingsByUserGame.get(key) ?? []
        list.push({ gameSlug: slug, ticker: sym })
        holdingsByUserGame.set(key, list)
      }
    }
    watchByUser.set(uid, await getAllFollowTickersForUser(uid))
  }

  const allSymbols = new Set<string>()
  for (const rows of holdingsByUserGame.values()) {
    for (const r of rows) allSymbols.add(r.ticker)
  }
  for (const list of watchByUser.values()) {
    for (const t of list) {
      const s = resolveMassiveTicker(t)
      if (s) allSymbols.add(s)
    }
  }

  const snaps = await loadSnapshots([...allSymbols])
  const nowMs = Date.now()
  const day = todayUtc()

  for (const [key, rows] of holdingsByUserGame) {
    const uid = key.split(':::')[0]!
    for (const { gameSlug, ticker } of rows) {
      const snap = snaps.get(ticker)
      const dayPct = derivedDayChangePct(ticker, snap, nowMs)
      if (dayPct != null && passesThreshold(dayPct, 'day')) {
        const dk = dedupKey(uid, ticker, 'hold-day', day)
        if (await markSentIfNew(dk)) {
          await notifyStockHoldingMove({
            userId: uid,
            gameSlug,
            ticker,
            tickerLabel: ticker.replace(/^X:/, ''),
            changePct: dayPct,
            window: 'day',
          })
        }
      }
      const weekPct = await fetchWeekChangePct(ticker)
      if (weekPct != null && passesThreshold(weekPct, 'week')) {
        const wk = dedupKey(uid, ticker, 'hold-week', day)
        if (await markSentIfNew(wk)) {
          await notifyStockHoldingMove({
            userId: uid,
            gameSlug,
            ticker,
            tickerLabel: ticker.replace(/^X:/, ''),
            changePct: weekPct,
            window: 'week',
          })
        }
      }
    }
  }

  for (const [uid, tickers] of watchByUser) {
    for (const raw of tickers) {
      const ticker = resolveMassiveTicker(raw) ?? raw
      const snap = snaps.get(ticker)
      const dayPct = derivedDayChangePct(ticker, snap, nowMs)
      if (dayPct != null && passesThreshold(dayPct, 'day')) {
        const dk = dedupKey(uid, ticker, 'watch-day', day)
        if (await markSentIfNew(dk)) {
          await notifyStockWatchMove({
            userId: uid,
            ticker,
            tickerLabel: ticker.replace(/^X:/, ''),
            changePct: dayPct,
            window: 'day',
          })
        }
      }
      const weekPct = await fetchWeekChangePct(ticker)
      if (weekPct != null && passesThreshold(weekPct, 'week')) {
        const wk = dedupKey(uid, ticker, 'watch-week', day)
        if (await markSentIfNew(wk)) {
          await notifyStockWatchMove({
            userId: uid,
            ticker,
            tickerLabel: ticker.replace(/^X:/, ''),
            changePct: weekPct,
            window: 'week',
          })
        }
      }
    }
  }
}

export function startStockMoveAlertScanner(): void {
  if (scanTimer) return
  void runStockMoveAlertScan().catch((err) => {
    console.warn('[simvest] stock alert scan failed:', err instanceof Error ? err.message : err)
  })
  scanTimer = setInterval(() => {
    void runStockMoveAlertScan().catch((err) => {
      console.warn('[simvest] stock alert scan failed:', err instanceof Error ? err.message : err)
    })
  }, SCAN_INTERVAL_MS)
}
