import {
  buildPortfolioRows,
  buildPortfolioTotals,
  getPlayerPerformAggregate,
  type PortfolioApiRow,
  type PortfolioTotals,
} from './portfolioService'
import type { PerformStockRow } from '../src/perform/performTypes'
import {
  deriveLegacyUserId,
  getUserPublicProfile,
  upsertProfileFromTradeContext,
  ensureUserProfileRecord,
} from './userProfileService'
import { getLedgerHoldingsForGame } from './userGameStateService'
import { getGameJoinedAtIso, seedGameJoinedDaysAgo } from './gameMembershipService'
import { getGameLeaderboardStanding } from './gameLeaderboardService'
import { getSetupProfileForUserGame } from './userSetupProfileService'

function hashUint(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

const DEMO_DISPLAY_PRESETS: Record<string, { displayName: string; avatarUrl: string }> = {
  'demo-jack-rs': { displayName: 'Jack Roberts', avatarUrl: '/figma-assets/user-jack.png' },
  'demo-miley-sm': { displayName: 'Miley Schmidt', avatarUrl: '/figma-assets/user-miley.png' },
  'demo-p-mrose-92': { displayName: 'Mike Rose', avatarUrl: '/figma-assets/challenge/gain-1.png' },
  'demo-p-jan-ms-087': { displayName: 'Jessica An', avatarUrl: '/figma-assets/challenge/gain-2.png' },
  'demo-p-melis-089': { displayName: 'Melissa Hernandez', avatarUrl: '/figma-assets/challenge/gain-3.png' },
  'demo-p-jopia-074': { displayName: 'Jose Pia', avatarUrl: '/figma-assets/challenge/gain-4.png' },
}

function fmtUsdSigned(n: number): string {
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n)
  return `${sign}$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

export type PlayerGameProfilePayload = {
  gameSlug: string
  profile: {
    userId: string
    displayName: string
    username: string | null
    avatarUrl: string
    joinedAtIso: string
    memberDays: number
    /** ISO when the user first traded or opened Perform/Portfolio for this game; null if unknown. */
    joinedGameAtIso: string | null
    /** Calendar days in this game slug; null until `joinedGameAtIso` exists. */
    daysInThisGame: number | null
  }
  stats: {
    netWorth: string
    netWorthSub: string
    totalReturn: string
    totalReturnSub: string
    todayReturn: string
    todayReturnSub: string
  }
  rank: {
    rankOrdinal: string
    outOfLabel: string
    streakLabel: string
    fillPct: number
  }
  topGainers: PerformStockRow[]
  topLosers: PerformStockRow[]
  holdings: PortfolioApiRow[]
  totals: PortfolioTotals
}

function memberDaysSince(iso: string): number {
  try {
    const t = new Date(iso).getTime()
    const now = Date.now()
    if (!Number.isFinite(t)) return 1
    return Math.max(1, Math.floor((now - t) / (24 * 3600 * 1000)))
  } catch {
    return 1
  }
}

function daysInGameSince(iso: string | null): number | null {
  if (!iso || iso.length < 10) return null
  return memberDaysSince(iso)
}

function portfolioApiRowToPerform(row: PortfolioApiRow): PerformStockRow {
  const spark =
    Array.isArray(row.sparkline) && row.sparkline.length >= 2
      ? row.sparkline
      : [0.4, row.positive ? 0.82 : 0.35]
  return {
    symbol: row.ticker,
    companyName: row.name,
    price: row.priceDisplay,
    changeLabel: row.changeLabel,
    positive: row.positive,
    logoUrl: row.logoUrl,
    sparkline: spark,
    changeVariant: undefined,
  }
}

async function hydrateProfileBasics(userId: string): Promise<{
  displayName: string
  avatarUrl: string
  joinedAtIso: string
}> {
  const preset = DEMO_DISPLAY_PRESETS[userId]
  if (preset) {
    await upsertProfileFromTradeContext(userId, {
      ...preset,
      joinedSeedDaysAgo: 45 + (hashUint(`${userId}|join`) % 540),
    })
    const p = await getUserPublicProfile(userId)
    if (p) return { displayName: p.displayName, avatarUrl: p.avatarUrl, joinedAtIso: p.joinedAtIso }
  }
  const ensured = await ensureUserProfileRecord(userId)
  return {
    displayName: ensured.displayName,
    avatarUrl: ensured.avatarUrl,
    joinedAtIso: ensured.joinedAtIso,
  }
}

export async function fetchPlayerGameProfile(slug: string, rawUserId: string): Promise<PlayerGameProfilePayload | null> {
  const userIdRaw = rawUserId.trim()
  const userId = /^[a-zA-Z0-9_.-]{8,128}$/.test(userIdRaw)
    ? userIdRaw
    : deriveLegacyUserId(userIdRaw)

  if (!userId || userId.length < 8) return null

  const slugKey = String(slug ?? '').trim()
  const agg = await getPlayerPerformAggregate(slugKey, userId)
  if (!agg) return null

  let records
  try {
    records = await getLedgerHoldingsForGame(userId, slugKey)
  } catch {
    records = []
  }

  let rows: PortfolioApiRow[] = []
  if (records.length > 0) {
    rows = await buildPortfolioRows(records)
  }
  const totals = await buildPortfolioTotals(slugKey, userId, rows)

  let topGainers: PerformStockRow[] = []
  let topLosers: PerformStockRow[] = []
  if (rows.length > 0) {
    const withChange = rows.filter((r) => typeof r.changePct === 'number' && Number.isFinite(r.changePct as number))
    const byDayMove = [...withChange].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    const topGainersSlice = byDayMove.slice(0, 8)
    const topLosersSlice = [...withChange].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 8)
    topGainers = topGainersSlice.map(portfolioApiRowToPerform)
    topLosers = topLosersSlice.map(portfolioApiRowToPerform)
  }

  const profHydrated = await hydrateProfileBasics(userId)
  const setupProfile = await getSetupProfileForUserGame(userId, slugKey)
  const displayName = setupProfile
    ? `${setupProfile.firstName} ${setupProfile.lastName}`.trim()
    : profHydrated.displayName
  const avatarUrl = setupProfile?.avatarUrl ?? profHydrated.avatarUrl

  let joinedGameIso = await getGameJoinedAtIso(userId, slugKey)
  if (!joinedGameIso && DEMO_DISPLAY_PRESETS[userId]) {
    const back = 11 + (hashUint(`${userId}|${slugKey}|game`) % 220)
    joinedGameIso = await seedGameJoinedDaysAgo(userId, slugKey, back)
  }

  const standing = await getGameLeaderboardStanding(slugKey, userId, {
    subjectNetWorthHint: agg.netWorth,
  })

  return {
    gameSlug: slugKey,
    profile: {
      userId,
      displayName,
      username: setupProfile?.username ?? null,
      avatarUrl,
      joinedAtIso: profHydrated.joinedAtIso,
      memberDays: memberDaysSince(profHydrated.joinedAtIso),
      joinedGameAtIso: joinedGameIso ?? null,
      daysInThisGame: daysInGameSince(joinedGameIso ?? null),
    },
    stats: {
      netWorth: fmtUsdSigned(agg.netWorth),
      netWorthSub: `${fmtUsdSigned(agg.costBasis)} in stocks · ${fmtUsdSigned(agg.cash)} cash`,
      totalReturn: fmtPct(agg.totalReturnPct),
      totalReturnSub: `${agg.totalReturnDollars >= 0 ? 'Up' : 'Down'} ${fmtUsdSigned(Math.abs(agg.totalReturnDollars))}`,
      todayReturn: fmtPct(agg.todayPct),
      todayReturnSub: `${agg.todayDollars >= 0 ? 'Up' : 'Down'} ${fmtUsdSigned(Math.abs(agg.todayDollars))}`,
    },
    rank: {
      rankOrdinal: standing.rankOrdinal,
      outOfLabel: standing.outOfLabel,
      streakLabel: standing.streakLabel,
      fillPct: standing.fillPct,
    },
    topGainers,
    topLosers,
    holdings: rows,
    totals,
  }
}
