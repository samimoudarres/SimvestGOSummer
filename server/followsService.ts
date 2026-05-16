import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSerializedByKey } from './fsMutationQueue'
import { normalizeTicker, resolveMassiveTicker } from './stockService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FOLLOWS_PATH = path.join(__dirname, 'data', 'follows.json')
const FOLLOWS_LOCK_KEY = FOLLOWS_PATH

/** userId → gameSlug → ticker list (canonical symbols). */
type FollowsNested = Record<string, Record<string, string[]>>

async function readRaw(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(FOLLOWS_PATH, 'utf8')
    const j = JSON.parse(raw) as unknown
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function normalizeSym(ticker: string): string | null {
  return resolveMassiveTicker(ticker) ?? normalizeTicker(ticker)
}

function normalizeTickerList(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of list) {
    const c = normalizeSym(t)
    if (c && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  out.sort((a, b) => a.localeCompare(b))
  return out
}

/** Read file; migrate legacy flat `userId: string[]` to nested `userId: {}` (empty per-game lists). */
async function readNested(): Promise<FollowsNested> {
  const raw = await readRaw()
  const out: FollowsNested = {}
  let needsWrite = false
  for (const [uid, val] of Object.entries(raw)) {
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      const per: Record<string, string[]> = {}
      for (const [g, arr] of Object.entries(val as Record<string, unknown>)) {
        if (!g || typeof g !== 'string') continue
        if (Array.isArray(arr)) {
          per[g] = normalizeTickerList(arr.filter((x): x is string => typeof x === 'string'))
        }
      }
      out[uid] = per
    } else if (Array.isArray(val)) {
      needsWrite = true
      out[uid] = {}
    }
  }
  if (needsWrite) {
    await writeNested(out)
  }
  return out
}

async function writeNested(data: FollowsNested): Promise<void> {
  await fs.mkdir(path.dirname(FOLLOWS_PATH), { recursive: true })
  await fs.writeFile(FOLLOWS_PATH, JSON.stringify(data, null, 2), 'utf8')
}

/** Accept UUID or generated slug-style ids from localStorage. */
export function normalizeUserId(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!/^[a-zA-Z0-9_.-]{8,128}$/.test(t)) return null
  return t
}

export async function getFollowTickersForGame(userId: string, gameSlug: string): Promise<string[]> {
  if (!userId || userId.length < 8 || !gameSlug) return []
  const s = await readNested()
  const list = s[userId]?.[gameSlug] ?? []
  return normalizeTickerList(list)
}

/** Deduped union across all games (legacy / diagnostics). */
export async function getAllFollowTickersForUser(userId: string): Promise<string[]> {
  if (!userId || userId.length < 8) return []
  const s = await readNested()
  const per = s[userId] ?? {}
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of Object.values(per)) {
    for (const t of list) {
      const c = normalizeSym(t)
      if (c && !seen.has(c)) {
        seen.add(c)
        out.push(c)
      }
    }
  }
  out.sort((a, b) => a.localeCompare(b))
  return out
}

export async function isFollowingForGame(userId: string, gameSlug: string, ticker: string): Promise<boolean> {
  const sym = normalizeSym(ticker)
  if (!sym || !gameSlug) return false
  const tickers = await getFollowTickersForGame(userId, gameSlug)
  return tickers.some((stored) => normalizeSym(stored) === sym)
}

export async function setFollowingForGame(
  userId: string,
  gameSlug: string,
  ticker: string,
  following: boolean,
): Promise<{ ok: boolean; following: boolean }> {
  const sym = normalizeSym(ticker)
  if (!sym || !userId || userId.length < 8 || !gameSlug) return { ok: false, following: false }

  const s = await readNested()
  if (!s[userId]) s[userId] = {}
  const cur = new Set(s[userId][gameSlug] ?? [])
  for (const x of [...cur]) {
    if (normalizeSym(x) === sym) cur.delete(x)
  }
  if (following) cur.add(sym)

  const next = normalizeTickerList([...cur])
  s[userId][gameSlug] = next
  await writeNested(s)

  return { ok: true, following: next.includes(sym) }
}

/** Rename per-game follow lists when a game slug is archived off the shared `new` slot. */
export async function renameGameSlugInFollows(fromSlug: string, toSlug: string): Promise<number> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return 0
  return runSerializedByKey(FOLLOWS_LOCK_KEY, async () => {
    const raw = await readRaw()
    const s: FollowsNested = {}
    for (const [uid, val] of Object.entries(raw)) {
      if (val != null && typeof val === 'object' && !Array.isArray(val)) {
        const per: Record<string, string[]> = {}
        for (const [g, arr] of Object.entries(val as Record<string, unknown>)) {
          if (!g || typeof g !== 'string') continue
          if (Array.isArray(arr)) {
            per[g] = normalizeTickerList(arr.filter((x): x is string => typeof x === 'string'))
          }
        }
        s[uid] = per
      } else if (Array.isArray(val)) {
        s[uid] = {}
      }
    }
    let moved = 0
    for (const uid of Object.keys(s)) {
      const per = s[uid]!
      const list = per[fromSlug]
      if (!list?.length) continue
      const cur = per[toSlug] ?? []
      per[toSlug] = normalizeTickerList([...cur, ...list])
      delete per[fromSlug]
      moved += 1
    }
    if (moved > 0) await writeNested(s)
    return moved
  })
}

/** Merge per-game follow lists from a browser id into the canonical account id. */
export async function mergeFollowsViewerId(fromUserId: string, toUserId: string): Promise<void> {
  if (!fromUserId || !toUserId || fromUserId.length < 8 || toUserId.length < 8 || fromUserId === toUserId) return
  return runSerializedByKey(FOLLOWS_LOCK_KEY, async () => {
    const raw = await readRaw()
    const s: FollowsNested = {}
    for (const [uid, val] of Object.entries(raw)) {
      if (val != null && typeof val === 'object' && !Array.isArray(val)) {
        const per: Record<string, string[]> = {}
        for (const [g, arr] of Object.entries(val as Record<string, unknown>)) {
          if (!g || typeof g !== 'string') continue
          if (Array.isArray(arr)) {
            per[g] = normalizeTickerList(arr.filter((x): x is string => typeof x === 'string'))
          }
        }
        s[uid] = per
      } else if (Array.isArray(val)) {
        s[uid] = {}
      }
    }
    const fg = s[fromUserId]
    if (!fg || Object.keys(fg).length === 0) {
      delete s[fromUserId]
      await writeNested(s)
      return
    }
    if (!s[toUserId]) s[toUserId] = {}
    for (const [slug, list] of Object.entries(fg)) {
      const curTo = s[toUserId][slug] ?? []
      s[toUserId][slug] = normalizeTickerList([...curTo, ...list])
    }
    delete s[fromUserId]
    await writeNested(s)
  })
}
