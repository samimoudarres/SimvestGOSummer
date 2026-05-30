import fs from 'node:fs/promises'
import { dataFilePath, ensureParentDirForFile } from './dataDir.ts'
import { fetchGameLeaderboardPayload } from './gameLeaderboardService.ts'
import { listUserIdsJoinedGame } from './gameMembershipService.ts'
import { notifyLeaderboardBigJump, notifyLeaderboardPodium } from './notificationEvents.ts'

const CACHE_PATH = dataFilePath('leaderboard-rank-cache.json')

type RankCacheFile = {
  /** gameSlug → userId → last known Overall Return rank */
  byGame: Record<string, Record<string, number>>
}

let mutex = Promise.resolve()

function runMutation<T>(fn: () => Promise<T>): Promise<T> {
  const p = mutex.then(fn)
  mutex = p.then(
    () => undefined,
    () => undefined,
  )
  return p
}

async function readCache(): Promise<RankCacheFile> {
  try {
    const raw = JSON.parse(await fs.readFile(CACHE_PATH, 'utf8')) as RankCacheFile
    if (raw && typeof raw.byGame === 'object' && !Array.isArray(raw.byGame)) return raw
  } catch {
    /* */
  }
  return { byGame: {} }
}

async function writeCache(data: RankCacheFile): Promise<void> {
  await ensureParentDirForFile(CACHE_PATH)
  await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2), 'utf8')
}

/** Distinct game slugs from membership rows (active games only). */
export async function listGameSlugsWithMembers(): Promise<string[]> {
  const membershipPath = dataFilePath('user-game-membership.json')
  let joins: Record<string, string> = {}
  try {
    const raw = JSON.parse(await fs.readFile(membershipPath, 'utf8')) as { joins?: Record<string, string> }
    joins = raw?.joins ?? {}
  } catch {
    return []
  }
  const slugs = new Set<string>()
  for (const k of Object.keys(joins)) {
    const idx = k.indexOf(':::')
    if (idx > 0) {
      const slug = k.slice(idx + 3)
      if (slug) slugs.add(slug)
    }
  }
  return [...slugs].sort((a, b) => a.localeCompare(b))
}

/**
 * Compare current Overall Return leaderboard ranks to the last snapshot; send push alerts.
 * Matches the app default (`overall_return` sort on the Leaderboard tab).
 */
export async function checkLeaderboardRankAlerts(gameSlug: string): Promise<void> {
  const slug = String(gameSlug ?? '').trim()
  if (!slug) return

  const payload = await fetchGameLeaderboardPayload(slug, 'overall_return')
  if (payload.totalPlayers < 2) return

  const current: Record<string, number> = {}
  const names = new Map<string, string>()
  for (const row of payload.rows) {
    current[row.userId] = row.rank
    names.set(row.userId, row.displayName?.trim() || 'A player')
  }

  await runMutation(async () => {
    const file = await readCache()
    const prev = file.byGame[slug] ?? {}
    const hadBaseline = Object.keys(prev).length > 0
    const members = await listUserIdsJoinedGame(slug)

    if (hadBaseline) {
      for (const [userId, newRank] of Object.entries(current)) {
        const oldRank = prev[userId]
        if (oldRank === undefined || !Number.isFinite(oldRank)) continue
        if (oldRank === newRank) continue

        const spotsGained = oldRank - newRank
        if (spotsGained > 3) {
          await notifyLeaderboardBigJump({
            gameSlug: slug,
            playerUserId: userId,
            playerDisplayName: names.get(userId) ?? 'A player',
            previousRank: oldRank,
            newRank,
            totalPlayers: payload.totalPlayers,
            recipientUserIds: members,
          })
        }

        if (newRank >= 1 && newRank <= 3 && oldRank > newRank) {
          await notifyLeaderboardPodium({
            userId,
            gameSlug: slug,
            rank: newRank,
            totalPlayers: payload.totalPlayers,
          })
        }
      }
    }

    file.byGame[slug] = current
    await writeCache(file)
  })
}

export async function scanLeaderboardRankAlertsAllGames(): Promise<void> {
  const slugs = await listGameSlugsWithMembers()
  for (const slug of slugs) {
    try {
      await checkLeaderboardRankAlerts(slug)
    } catch {
      /* skip game */
    }
  }
}
