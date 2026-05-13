import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeTicker, resolveMassiveTicker } from './stockService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FOLLOWS_PATH = path.join(__dirname, 'data', 'follows.json')

/** Maps opaque client user ids → canonical ticker list (uppercase / X: crypto). */
type FollowsFile = Record<string, string[]>

async function readStore(): Promise<FollowsFile> {
  try {
    const raw = await fs.readFile(FOLLOWS_PATH, 'utf8')
    return JSON.parse(raw) as FollowsFile
  } catch {
    return {}
  }
}

async function writeStore(data: FollowsFile): Promise<void> {
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

export async function getFollowTickers(userId: string): Promise<string[]> {
  const s = await readStore()
  const list = Array.isArray(s[userId]) ? s[userId] : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of list) {
    const c = resolveMassiveTicker(t) ?? normalizeTicker(t)
    if (c && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  out.sort((a, b) => a.localeCompare(b))
  return out
}

export async function isFollowing(userId: string, ticker: string): Promise<boolean> {
  const sym = resolveMassiveTicker(ticker)
  if (!sym) return false
  const tickers = await getFollowTickers(userId)
  return tickers.some((stored) => (resolveMassiveTicker(stored) ?? normalizeTicker(stored)) === sym)
}

export async function setFollowing(userId: string, ticker: string, following: boolean): Promise<{ ok: boolean; following: boolean }> {
  const sym = resolveMassiveTicker(ticker)
  if (!sym) return { ok: false, following: false }

  const s = await readStore()
  const cur = new Set(s[userId] ?? [])
  for (const x of [...cur]) {
    const c = resolveMassiveTicker(x) ?? normalizeTicker(x)
    if (c === sym) cur.delete(x)
  }
  if (following) cur.add(sym)
  else cur.delete(sym)

  const next = [...cur].sort((a, b) => a.localeCompare(b))
  s[userId] = next
  await writeStore(s)

  return { ok: true, following: cur.has(sym) }
}
