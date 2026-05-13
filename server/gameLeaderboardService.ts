import { normalizeUserId } from './followsService'
import { listPostsForGame } from './gameFeedService'
import { listUserIdsJoinedGame } from './gameMembershipService'
import {
  estimatePeriodReturnPct,
  getNetWorthHistory,
  getRecordedNetWorth,
} from './gameNetWorthSnapshotService'
import { readPortfolioState } from './userGameStateService'
import { ensureUserProfilesBatch } from './userProfileService'
import { loadAllSetupProfilesByKey } from './userSetupProfileService'

/** Avoid static import cycle with `portfolioService` (Perform dashboard imports leaderboard). */
async function aggregateNetWorth(slug: string, uid: string): Promise<number> {
  const { getPlayerPerformAggregate } = await import('./portfolioService')
  const agg = await getPlayerPerformAggregate(slug, uid)
  return agg?.netWorth ?? FALLBACK_NET_WORTH
}

/** Matches demo ledger default when user has never traded but has no snapshot yet. */
const FALLBACK_NET_WORTH = 100_000

function hashUint(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

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

/**
 * Everyone who should appear in standings: joined the game, has a ledger row for it,
 * or appears on the activity feed (author user id).
 */
export async function listParticipantIdsForGame(gameSlug: string): Promise<string[]> {
  const slug = String(gameSlug ?? '').trim()
  const ids = new Set<string>()

  for (const uid of await listUserIdsJoinedGame(slug)) {
    if (uid.length >= 8) ids.add(uid)
  }

  const state = await readPortfolioState()
  for (const [uid, games] of Object.entries(state.users ?? {})) {
    if (uid.length < 8) continue
    if (games && typeof games === 'object' && games[slug]) ids.add(uid)
  }

  try {
    const posts = await listPostsForGame(slug)
    for (const p of posts) {
      const u = normalizeUserId(typeof p.userId === 'string' ? p.userId.trim() : '')
      if (u) ids.add(u)
    }
  } catch {
    /* feed optional */
  }

  return [...ids].sort((a, b) => a.localeCompare(b))
}

function streakLabelPlaceholder(subjectUserId: string, rank: number): string {
  const streakDays = 1 + (hashUint(`${subjectUserId}|${rank}|stk`) % 5)
  return `${ordinalEnglish(streakDays)} day with this rank`
}

export type GameLeaderboardStanding = {
  rank: number
  totalCompetitors: number
  subjectNetWorth: number
  rankOrdinal: string
  outOfLabel: string
  streakLabel: string
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
      streakLabel: streakLabelPlaceholder('unknown', 1),
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

  return {
    rank,
    totalCompetitors: total,
    subjectNetWorth: nwSelf,
    rankOrdinal: ordinalEnglish(rank),
    outOfLabel: `out of ${total} ${compWord}`,
    streakLabel: streakLabelPlaceholder(subjectUserId, rank),
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
  if (participantIds.length === 0) {
    participantIds = []
  }

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

  const built: RowWork[] = []

  for (const uid of participantIds) {
    const profile = profiles.get(uid)
    const setup = setupsByKey.get(`${uid}:::${slug}`)
    const displayName = setup
      ? `${setup.firstName} ${setup.lastName}`.trim()
      : (profile?.displayName ?? 'Player')
    const avatarUrl =
      setup?.avatarUrl || profile?.avatarUrl || '/figma-assets/challenge/composer-avatar.png'
    const handle = setup?.username?.trim()
      ? `@${setup.username.trim()}`
      : formatLeaderboardHandle(displayName, uid)

    const agg = await getPlayerPerformAggregate(slug, uid)
    const nw =
      agg?.netWorth ??
      (await getRecordedNetWorth(slug, uid)) ??
      FALLBACK_NET_WORTH

    const overall = agg != null ? agg.totalReturnPct : 0
    const today = agg != null ? agg.todayPct : 0

    const hist = await getNetWorthHistory(slug, uid)
    const d7 = estimatePeriodReturnPct(nw, hist, 7)
    const d30 = estimatePeriodReturnPct(nw, hist, 30)

    const sortVal = sortMetricValue(sort, overall, today, d7, d30)

    built.push({
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
    })
  }

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

    const badgePct = badgeMetricForSort(sort, r.overall, r.today, r.d7, r.d30)
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
  }
}
