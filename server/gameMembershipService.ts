import fs from 'node:fs/promises'
import { dataFilePath } from './dataDir.ts'
import { runSerializedByKey } from './fsMutationQueue'

const MEMBERSHIP_PATH = dataFilePath('user-game-membership.json')
const MEMBERSHIP_LOCK_KEY = MEMBERSHIP_PATH

type MembershipFile = { joins: Record<string, string> }

function key(userId: string, gameSlug: string): string {
  return `${userId}:::${gameSlug}`
}

async function readFile(): Promise<MembershipFile> {
  try {
    const raw = JSON.parse(await fs.readFile(MEMBERSHIP_PATH, 'utf8')) as MembershipFile
    if (raw && raw.joins && typeof raw.joins === 'object') return raw
  } catch {
    /* missing */
  }
  return { joins: {} }
}

async function writeFile(data: MembershipFile): Promise<void> {
  await fs.mkdir(path.dirname(MEMBERSHIP_PATH), { recursive: true })
  await fs.writeFile(MEMBERSHIP_PATH, JSON.stringify(data, null, 2), 'utf8')
}

/** First time the user participates in this game (ISO UTC). */
export async function getGameJoinedAtIso(userId: string, gameSlug: string): Promise<string | null> {
  if (!userId || !gameSlug) return null
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const file = await readFile()
    const iso = file.joins[key(userId, gameSlug)]
    return typeof iso === 'string' && iso.length >= 10 ? iso : null
  })
}

/**
 * Persist join time once — earliest engagement wins (trade, portfolio tab, perform tab).
 * Returns canonical joined-at ISO string.
 */
export async function ensureGameJoinedAt(userId: string, gameSlug: string): Promise<string | null> {
  if (!userId || userId.length < 8 || !gameSlug) return null
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const file = await readFile()
    const k = key(userId, gameSlug)
    let cur = file.joins[k]
    if (!cur) {
      cur = new Date().toISOString()
      file.joins[k] = cur
      await writeFile(file)
    }
    return cur
  })
}

/** Remove the user's membership row for this game. Idempotent; returns true when something was removed. */
export async function removeGameMembership(userId: string, gameSlug: string): Promise<boolean> {
  if (!userId || !gameSlug) return false
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const file = await readFile()
    const k = key(userId, gameSlug)
    if (!(k in file.joins)) return false
    delete file.joins[k]
    await writeFile(file)
    return true
  })
}

/** Drop every membership row for a game (used when the host purges/ends the game permanently). */
export async function clearAllMembershipsForGame(gameSlug: string): Promise<number> {
  if (!gameSlug) return 0
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const file = await readFile()
    const suffix = `:::${gameSlug}`
    let removed = 0
    for (const k of Object.keys(file.joins)) {
      if (k.endsWith(suffix)) {
        delete file.joins[k]
        removed++
      }
    }
    if (removed > 0) await writeFile(file)
    return removed
  })
}

/** Demo / seeded profiles only — deterministic “days in this game”. */
/** All user IDs that have a stored join timestamp for this game. */
/** All distinct game slugs this user has a stored join timestamp for. */
export async function listGameSlugsJoinedByUser(userId: string): Promise<string[]> {
  if (!userId || userId.length < 8) return []
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const prefix = `${userId}:::`
    const file = await readFile()
    const slugs = new Set<string>()
    for (const k of Object.keys(file.joins)) {
      if (k.startsWith(prefix)) {
        const slug = k.slice(prefix.length)
        if (slug.length > 0) slugs.add(slug)
      }
    }
    return [...slugs].sort((a, b) => a.localeCompare(b))
  })
}

export async function listUserIdsJoinedGame(gameSlug: string): Promise<string[]> {
  if (!gameSlug) return []
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const file = await readFile()
    const suffix = `:::${gameSlug}`
    const out: string[] = []
    for (const k of Object.keys(file.joins)) {
      if (k.endsWith(suffix)) {
        const uid = k.slice(0, k.length - suffix.length)
        if (uid.length >= 8) out.push(uid)
      }
    }
    return [...new Set(out)].sort((a, b) => a.localeCompare(b))
  })
}

/**
 * Boot-time cleanup: drop membership rows whose game slug no longer exists in
 * runtime rules (orphaned keys after manual edits / restores).
 *
 * **Important:** We intentionally do *not* prune rows just because the user
 * lacks setup / ledger / feed evidence. That older heuristic removed legitimate
 * players mid-flow (e.g. joined but not yet posted or traded) and confused it
 * with stale auto-join spam — `ensureGameAccess` no longer auto-writes
 * membership for random page reads, so keeping rows for existing games is safe.
 */
export async function reconcileMembershipFile(input: {
  hostsByGameSlug: Map<string, string | null>
}): Promise<{ kept: number; removed: number; removedKeys: string[] }> {
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const file = await readFile()
    const next: MembershipFile = { joins: {} }
    const removedKeys: string[] = []
    for (const [k, iso] of Object.entries(file.joins)) {
      const idx = k.indexOf(':::')
      if (idx <= 0) {
        next.joins[k] = iso
        continue
      }
      const slug = k.slice(idx + 3)
      if (!slug || !input.hostsByGameSlug.has(slug)) {
        removedKeys.push(k)
      } else {
        next.joins[k] = iso
      }
    }
    if (removedKeys.length > 0) {
      await writeFile(next)
    }
    return { kept: Object.keys(next.joins).length, removed: removedKeys.length, removedKeys }
  })
}

/**
 * Rewrites `fromUserId:::slug` → `toUserId:::slug` so pre-login browser data
 * follows the canonical account id after auth.
 */
export async function mergeMembershipViewerIds(fromUserId: string, toUserId: string): Promise<void> {
  if (!fromUserId || !toUserId || fromUserId.length < 8 || toUserId.length < 8 || fromUserId === toUserId) return
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const file = await readFile()
    const prefix = `${fromUserId}:::`
    let changed = false
    const next: Record<string, string> = { ...file.joins }
    for (const k of Object.keys(next)) {
      if (!k.startsWith(prefix)) continue
      const slug = k.slice(prefix.length)
      if (!slug) continue
      const dest = key(toUserId, slug)
      const iso = next[k]!
      if (next[dest]) {
        const a = new Date(next[dest]!).getTime()
        const b = new Date(iso).getTime()
        if (Number.isFinite(a) && Number.isFinite(b)) {
          next[dest] = a <= b ? next[dest]! : iso
        }
      } else {
        next[dest] = iso
      }
      delete next[k]
      changed = true
    }
    if (changed) await writeFile({ joins: next })
  })
}

/** Re-key every `userId:::fromSlug` membership row to `userId:::toSlug`. */
export async function renameGameSlugInMembership(fromSlug: string, toSlug: string): Promise<number> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return 0
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const file = await readFile()
    const fromSuffix = `:::${fromSlug}`
    const next: Record<string, string> = { ...file.joins }
    let moved = 0
    for (const k of Object.keys(next)) {
      if (!k.endsWith(fromSuffix)) continue
      const uid = k.slice(0, k.length - fromSuffix.length)
      const dest = key(uid, toSlug)
      const iso = next[k]!
      delete next[k]
      if (next[dest]) {
        const a = new Date(next[dest]!).getTime()
        const b = new Date(iso).getTime()
        if (Number.isFinite(a) && Number.isFinite(b) && b < a) next[dest] = iso
      } else {
        next[dest] = iso
      }
      moved += 1
    }
    if (moved > 0) await writeFile({ joins: next })
    return moved
  })
}

export async function seedGameJoinedDaysAgo(
  userId: string,
  gameSlug: string,
  daysAgo: number,
): Promise<string | null> {
  if (!userId || userId.length < 8 || !gameSlug) return null
  return runSerializedByKey(MEMBERSHIP_LOCK_KEY, async () => {
    const d = Math.min(730, Math.max(1, Math.floor(daysAgo)))
    const file = await readFile()
    const k = key(userId, gameSlug)
    if (file.joins[k]) return file.joins[k]!
    const iso = new Date(Date.now() - d * 86400000).toISOString()
    file.joins[k] = iso
    await writeFile(file)
    return iso
  })
}
