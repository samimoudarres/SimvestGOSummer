import {
  estimatePeriodReturnPct,
  getNetWorthHistory,
  getRecordedNetWorth,
} from './gameNetWorthSnapshotService'
import { listParticipantIdsForGame } from './gameParticipantIds'
import { ensureUserProfilesBatch } from './userProfileService'
import {
  gameProfileAvatarUrl,
  gameProfileDisplayLabel,
  loadAllSetupProfilesByKey,
} from './userSetupProfileService'
import { resolveProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { ensureGameFinalSnapshot } from './gameFinalSnapshotService'
import { resolveRankStreakLabel } from './performRankStreakService'

/** Avoid static import cycle with `portfolioService` (Perform dashboard imports leaderboard). */
async function aggregateNetWorth(slug: string, uid: string): Promise<number> {
  const { getPlayerPerformAggregate } = await import('./portfolioService')
  const agg = await getPlayerPerformAggregate(slug, uid)
  return agg?.netWorth ?? FALLBACK_NET_WORTH
}

/** Matches demo ledger default when user has never traded but has no snapshot yet. */
const FALLBACK_NET_WORTH = 100_000

export function ordinalEnglish(n: number): string {
  const v = Math.max(1, Math.floor(n))
  const tens = v % 100
  if (tens >= 11 && tens <= 13) return `${v}th`
  switch (v % 10) {
    case 1:
      return `${v}st`
    case 2:
      return `${v}nd`
    case 3:
      return `${v}rd`
    default:
      return `${v}th`
  }
}

export function leaderboardFillPct(rank: number, total: number): number {
  if (total <= 1) return 88
  const p = (total - rank) / (total - 1)
  return Math.round(42 + Math.min(1, Math.max(0, p)) * 54)
}

function mergeParticipantIdsWithSnapshot(
  ids: string[],
  snap: { players?: Record<string, unknown> } | null,
): string[] {
  const s = new Set(ids.filter((id) => id.length >= 8))
  if (snap?.players) {
    for (const id of Object.keys(snap.players)) {
      if (id.length >= 8) s.add(id)
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b))
}

export type GameLeaderboardStanding = {
  rank: number
  totalCompetitors: number
  subjectNetWorth: number
  rankOrdinal: string
  outOfLabel: string
  /** Null when the player has not held this rank for 2+ consecutive UTC days. */
  streakLabel: string | null
  fillPct: number
}

/**
 * Competition ranking by net worth (higher = better). Ties share the same rank number; the next
 * rank skips (e.g. 1, 1, 3). Subject always uses a live aggregate; others use snapshots when
 * available so we do not refetch every holding on every page view.
 */
export async function getGameLeaderboardStanding(
  gameSlug: string,
  subjectUserId: string,
  opts?: { subjectNetWorthHint?: number },
): Promise<GameLeaderboardStanding> {
  const slug = String(gameSlug ?? '').trim()
  if (!subjectUserId || subjectUserId.length < 8) {
    return {
      rank: 1,
      totalCompetitors: 1,
      subjectNetWorth: FALLBACK_NET_WORTH,
      rankOrdinal: '1st',
      outOfLabel: 'out of 1 competitor',
      streakLabel: null,
      fillPct: 88,
    }
  }

  let participants = await listParticipantIdsForGame(slug)
  if (!participants.includes(subjectUserId)) {
    participants = [...participants, subjectUserId].sort((a, b) => a.localeCompare(b))
  }

  if (participants.length === 0) {
    participants = [subjectUserId]
  }

  const finalSnap = await ensureGameFinalSnapshot(slug)
  participants = mergeParticipantIdsWithSnapshot(participants, finalSnap)
  if (finalSnap) {
    const scores = participants.map((id) => ({
      id,
      nw: finalSnap.players[id]?.netWorth ?? FALLBACK_NET_WORTH,
    }))
    scores.sort((a, b) => {
      const d = b.nw - a.nw
      if (Math.abs(d) > 1e-6) return d
      return a.id.localeCompare(b.id)
    })
    const hint = opts?.subjectNetWorthHint
    const nwSelf =
      hint !== undefined && Number.isFinite(hint)
        ? hint
        : finalSnap.players[subjectUserId]?.netWorth ?? FALLBACK_NET_WORTH
    const strictlyBetter = scores.filter((s) => s.nw > nwSelf + 1e-9).length
    const rank = strictlyBetter + 1
    const total = scores.length
    const compWord = total === 1 ? 'competitor' : 'competitors'
    const streakLabel = await resolveRankStreakLabel(slug, subjectUserId, rank)
    return {
      rank,
      totalCompetitors: total,
      subjectNetWorth: nwSelf,
      rankOrdinal: ordinalEnglish(rank),
      outOfLabel: `out of ${total} ${compWord}`,
      streakLabel,
      fillPct: leaderboardFillPct(rank, total),
    }
  }

  const scores: { id: string; nw: number }[] = []

  for (const uid of participants) {
    let nw: number
    if (uid === subjectUserId) {
      const hint = opts?.subjectNetWorthHint
      nw =
        hint !== undefined && Number.isFinite(hint)
          ? hint
          : await aggregateNetWorth(slug, uid)
    } else {
      const snap = await getRecordedNetWorth(slug, uid)
      if (snap !== undefined && Number.isFinite(snap)) {
        nw = snap
      } else {
        nw = await aggregateNetWorth(slug, uid)
      }
    }
    scores.push({ id: uid, nw })
  }

  scores.sort((a, b) => {
    const d = b.nw - a.nw
    if (Math.abs(d) > 1e-6) return d
    return a.id.localeCompare(b.id)
  })

  const self = scores.find((s) => s.id === subjectUserId)
  const nwSelf = self?.nw ?? FALLBACK_NET_WORTH
  const strictlyBetter = scores.filter((s) => s.nw > nwSelf + 1e-9).length
  const rank = strictlyBetter + 1
  const total = scores.length
  const compWord = total === 1 ? 'competitor' : 'competitors'
  const streakLabel = await resolveRankStreakLabel(slug, subjectUserId, rank)

  return {
    rank,
    totalCompetitors: total,
    subjectNetWorth: nwSelf,
    rankOrdinal: ordinalEnglish(rank),
    outOfLabel: `out of ${total} ${compWord}`,
    streakLabel,
    fillPct: leaderboardFillPct(rank, total),
  }
}

export type LeaderboardSortKey = 'overall_return' | 'today' | 'past_7d' | 'past_month'

export const LEADERBOARD_SORT_LABELS: Record<LeaderboardSortKey, string> = {
  overall_return: 'Overall Return',
  today: "Today's Return",
  past_7d: 'Past 7 Days',
  past_month: 'Past Month',
}

export function parseLeaderboardSort(raw: string | undefined): LeaderboardSortKey {
  const u = String(raw ?? '').toLowerCase().trim()
  if (u === 'today') return 'today'
  if (u === 'past_7d' || u === '7d' || u === 'past7') return 'past_7d'
  if (u === 'past_month' || u === 'month' || u === '30d') return 'past_month'
  return 'overall_return'
}

function formatLeaderboardHandle(displayName: string, userId: string): string {
  const compact = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 22)
  if (compact.length >= 4) return `@${compact}`
  const tail = userId.replace(/[^a-z0-9]/gi, '').slice(-12)
  return `@${tail || 'player'}`
}

function fmtUsdNW(n: number): string {
  const v = Math.round(Math.max(0, n))
  return `$${v.toLocaleString('en-US')}`
}

function fmtPctBadge(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

export type GameLeaderboardRowPayload = {
  rank: number
  userId: string
  displayName: string
  handle: string
  avatarUrl: string
  netWorth: number
  netWorthLabel: string
  /** Primary metric shown in the pill — matches active sort */
  sortMetricPct: number | null
  sortMetricLabel: string
  positive: boolean
  overallReturnPct: number
  todayReturnPct: number
  past7dReturnPct: number | null
  pastMonthReturnPct: number | null
}

export type GameLeaderboardPayload = {
  gameSlug: string
  sort: LeaderboardSortKey
  sortLabel: string
  totalPlayers: number
  rows: GameLeaderboardRowPayload[]
  /** True when the scheduled end time has passed — rows use final frozen marks. */
  gameFinished?: boolean
}

function sortMetricValue(
  sort: LeaderboardSortKey,
  overall: number,
  today: number,
  d7: number | null,
  d30: number | null,
): number {
  switch (sort) {
    case 'overall_return':
      return overall
    case 'today':
      return today
    case 'past_7d':
      return d7 ?? Number.NEGATIVE_INFINITY
    case 'past_month':
      return d30 ?? Number.NEGATIVE_INFINITY
    default:
      return overall
  }
}

function badgeMetricForSort(
  sort: LeaderboardSortKey,
  overall: number,
  today: number,
  d7: number | null,
  d30: number | null,
): number | null {
  switch (sort) {
    case 'overall_return':
      return overall
    case 'today':
      return today
    case 'past_7d':
      return d7
    case 'past_month':
      return d30
    default:
      return overall
  }
}

export async function fetchGameLeaderboardPayload(
  gameSlug: string,
  sort: LeaderboardSortKey,
): Promise<GameLeaderboardPayload> {
  const slug = String(gameSlug ?? '').trim()
  const { getPlayerPerformAggregate } = await import('./portfolioService')

  let participantIds = await listParticipantIdsForGame(slug)

  const rules = await getRuntimeRules(slug)
  const gameFinished =
    !!rules?.endsAtIso &&
    Number.isFinite(new Date(rules.endsAtIso).getTime()) &&
    Date.now() > new Date(rules.endsAtIso).getTime()
  const finalSnap = gameFinished ? await ensureGameFinalSnapshot(slug) : null
  participantIds = mergeParticipantIdsWithSnapshot(participantIds, finalSnap)

  const profiles = await ensureUserProfilesBatch(participantIds)
  const setupsByKey = await loadAllSetupProfilesByKey()

  type RowWork = {
    userId: string
    displayName: string
    handle: string
    avatarUrl: string
    nw: number
    overall: number
    today: number
    d7: number | null
    d30: number | null
    sortVal: number
  }

  const built: RowWork[] = await Promise.all(
    participantIds.map(async (uid) => {
      const profile = profiles.get(uid)
      const setup = setupsByKey.get(`${uid}:::${slug}`)
      const gameLabel = gameProfileDisplayLabel(setup)
      const displayName = gameLabel ?? profile?.displayName?.trim() ?? 'Player'
      const avatarUrl = resolveProfileAvatarUrl(
        gameProfileAvatarUrl(setup, profile?.avatarUrl) || profile?.avatarUrl || '',
      )
      const fullName = setup ? `${setup.firstName} ${setup.lastName}`.trim() : ''
      const handle =
        setup?.username?.trim() && fullName
          ? fullName
          : setup?.username?.trim()
            ? `@${setup.username.trim()}`
            : formatLeaderboardHandle(displayName, uid)

      const pf = finalSnap?.players[uid]
      if (pf && Number.isFinite(pf.netWorth)) {
        const nw = pf.netWorth
        const overall = Number.isFinite(pf.overallReturnPct) ? pf.overallReturnPct : 0
        const today = 0
        const d7 = null
        const d30 = null
        const sortVal = overall
        return {
          userId: uid,
          displayName,
          handle,
          avatarUrl,
          nw,
          overall,
          today,
          d7,
          d30,
          sortVal,
        }
      }

      const [agg, hist] = await Promise.all([
        getPlayerPerformAggregate(slug, uid),
        getNetWorthHistory(slug, uid),
      ])
      const nw =
        agg?.netWorth ??
        (await getRecordedNetWorth(slug, uid)) ??
        FALLBACK_NET_WORTH

      const overall = agg != null ? agg.totalReturnPct : 0
      const today = agg != null ? agg.todayPct : 0

      const d7 = estimatePeriodReturnPct(nw, hist, 7)
      const d30 = estimatePeriodReturnPct(nw, hist, 30)

      return {
        userId: uid,
        displayName,
        handle,
        avatarUrl,
        nw,
        overall,
        today,
        d7,
        d30,
        sortVal: sortMetricValue(sort, overall, today, d7, d30),
      }
    }),
  )

  built.sort((a, b) => {
    const d = b.sortVal - a.sortVal
    if (Math.abs(d) > 1e-9) return d
    const dw = b.nw - a.nw
    if (Math.abs(dw) > 1e-6) return dw
    return a.userId.localeCompare(b.userId)
  })

  const rows: GameLeaderboardRowPayload[] = []
  for (let i = 0; i < built.length; i++) {
    const r = built[i]!
    let rank: number
    if (i === 0) rank = 1
    else {
      const prev = built[i - 1]!
      if (Math.abs(prev.sortVal - r.sortVal) < 1e-9) {
        rank = rows[i - 1]!.rank
      } else {
        rank = i + 1
      }
    }

    const badgePct = finalSnap ? r.overall : badgeMetricForSort(sort, r.overall, r.today, r.d7, r.d30)
    rows.push({
      rank,
      userId: r.userId,
      displayName: r.displayName,
      handle: r.handle,
      avatarUrl: r.avatarUrl,
      netWorth: r.nw,
      netWorthLabel: fmtUsdNW(r.nw),
      sortMetricPct: badgePct,
      sortMetricLabel: fmtPctBadge(badgePct),
      positive: badgePct === null ? true : badgePct >= 0,
      overallReturnPct: r.overall,
      todayReturnPct: r.today,
      past7dReturnPct: r.d7,
      pastMonthReturnPct: r.d30,
    })
  }

  return {
    gameSlug: slug,
    sort,
    sortLabel: LEADERBOARD_SORT_LABELS[sort],
    totalPlayers: rows.length,
    rows,
    gameFinished: Boolean(finalSnap),
  }
}
