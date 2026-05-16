/**
 * Suggested-games surface for the home screen.
 *
 * A brand-new account has zero joined games and an empty activity feed, so
 * instead of staring at a blank slate we render a curated list of public,
 * currently-live games anyone can join. The list is built from
 * `gameRuntimeRulesService` rows that match three conditions:
 *
 *   1. `visibility === 'public'`        — host opted into open joining.
 *   2. `setupComplete === true`         — host actually finished the wizard
 *      and a `joinCode` is allocated.
 *   3. The current time is within `[startsAtIso, endsAtIso)` (or the game
 *      has no explicit end), so we never recommend something that already
 *      wrapped up.
 *
 * Games the caller (`viewerUserId`) already participates in (join, ledger,
 * or feed posts) are filtered out so suggestions disappear as they engage.
 *
 * The home empty-state requests a **page** of games (see `SUGGESTED_PAGE_SIZE`)
 * with an `offset` into the sorted pool so "refresh" can rotate through more
 * live public games when enough exist.
 *
 * Output is sorted by player count (descending) so the most active games
 * surface first; ties break on most-recent `startsAtIso` so freshly-started
 * games beat older ones with the same crowd size.
 */

import { canonicalGameSlugKey } from './gameSlugNormalize'
import { listAllRuntimeRules, type GameRuntimeRules } from './gameRuntimeRulesService'
import { listParticipantIdsForGame } from './gameParticipantIds'
import { listParticipationSlugsForUser } from './userParticipationSlugs'
import { TRADE_CATEGORY_OPTIONS } from './tradeService'
import { welcomeThemeForPalette } from '../src/game/gameThemePresets.ts'

/** Shown on the new-player home empty state; refresh rotates by this stride. */
export const SUGGESTED_PAGE_SIZE = 3
const MS_HOUR = 3_600_000
const MS_DAY = 86_400_000

export type SuggestedGameTheme = {
  gradientFrom: string
  gradientTo: string
  gradientAngleDeg: number
  joinButtonColor: string
  joinButtonBorderColor: string
}

export type SuggestedGameDto = {
  slug: string
  joinCode: string
  title: string
  /** Pre-built `Hosted by X` line; null when the host never set a display name. */
  hostedByLine: string | null
  playerCount: number
  playerLine: string
  /** One-line summary of what's tradable (e.g. "Stocks & Crypto", "Tech category"). */
  rulesSummary: string
  /** Pre-formatted "Ends in 3 days" / "Ends in 4 hours" / "Open-ended" hint. */
  durationLine: string
  theme: SuggestedGameTheme
}

export type SuggestedGamesPayload = {
  games: SuggestedGameDto[]
  /** How many live public games matched (after excluding the viewer's own). */
  totalEligible: number
  pageSize: number
}

function categoryLabel(cat: string): string {
  return TRADE_CATEGORY_OPTIONS.find((c) => c.id === cat)?.label ?? cat
}

function rulesSummary(rules: GameRuntimeRules): string {
  switch (rules.assetsMode) {
    case 'all':
      return 'All stocks'
    case 'stocks_only':
      return 'Stocks only'
    case 'crypto_only':
      return 'Crypto only'
    case 'category':
      return rules.assetsCategory ? `${categoryLabel(rules.assetsCategory)} category` : 'Single category'
    default:
      return 'Mixed assets'
  }
}

function durationLine(endsAtIso: string | null, nowMs: number): string {
  if (!endsAtIso) return 'Open-ended challenge'
  const endMs = new Date(endsAtIso).getTime()
  if (!Number.isFinite(endMs)) return 'Open-ended challenge'
  const remaining = endMs - nowMs
  if (remaining <= 0) return 'Wrapping up'
  if (remaining < MS_HOUR) {
    const mins = Math.max(1, Math.floor(remaining / 60_000))
    return `Ends in ${mins} ${mins === 1 ? 'minute' : 'minutes'}`
  }
  if (remaining < MS_DAY) {
    const hrs = Math.max(1, Math.floor(remaining / MS_HOUR))
    return `Ends in ${hrs} ${hrs === 1 ? 'hour' : 'hours'}`
  }
  const days = Math.max(1, Math.floor(remaining / MS_DAY))
  return `Ends in ${days} ${days === 1 ? 'day' : 'days'}`
}

function buildPlayerLine(count: number): string {
  if (count <= 0) return 'Be the first to join'
  if (count === 1) return '1 player has joined'
  return `${count} players have joined`
}

function withinLiveWindow(rules: GameRuntimeRules, nowMs: number): boolean {
  const startMs = new Date(rules.startsAtIso).getTime()
  if (!Number.isFinite(startMs) || startMs > nowMs) return false
  if (!rules.endsAtIso) return true /* open-ended games count as live. */
  const endMs = new Date(rules.endsAtIso).getTime()
  if (!Number.isFinite(endMs)) return true
  return nowMs < endMs
}

function toDto(
  slug: string,
  rules: GameRuntimeRules,
  playerCount: number,
  nowMs: number,
): SuggestedGameDto {
  const theme = welcomeThemeForPalette(rules.themePaletteId)
  const hostName = rules.hostDisplayName.trim()
  return {
    slug,
    joinCode: rules.joinCode!,
    title: rules.gameDisplayName,
    hostedByLine: hostName ? `Hosted by ${hostName}` : null,
    playerCount,
    playerLine: buildPlayerLine(playerCount),
    rulesSummary: rulesSummary(rules),
    durationLine: durationLine(rules.endsAtIso, nowMs),
    theme: {
      gradientFrom: theme.welcomeGradientFrom,
      gradientTo: theme.welcomeGradientTo,
      gradientAngleDeg: theme.welcomeGradientAngleDeg,
      joinButtonColor: theme.joinButtonColor,
      joinButtonBorderColor: theme.joinButtonBorderColor,
    },
  }
}

/**
 * Build the suggestions list. `viewerUserId` may be `null` for an
 * unauthenticated probe (we still return suggestions, just without the
 * "exclude games you already joined" filter).
 *
 * `offset` selects a rotating window of `SUGGESTED_PAGE_SIZE` games from the
 * full sorted pool (stride matches page size so each refresh advances to the
 * next slice, wrapping).
 */
export async function buildSuggestedGames(
  viewerUserId: string | null,
  offsetRaw = 0,
): Promise<SuggestedGamesPayload> {
  const nowMs = Date.now()
  const offsetBase =
    typeof offsetRaw === 'number' && Number.isFinite(offsetRaw) && offsetRaw >= 0
      ? Math.min(Math.floor(offsetRaw), 1_000_000)
      : 0

  const [allRules, participationSlugs] = await Promise.all([
    listAllRuntimeRules(),
    viewerUserId ? listParticipationSlugsForUser(viewerUserId) : Promise.resolve<string[]>([]),
  ])

  const participationKey = new Set<string>()
  for (const s of participationSlugs) {
    const t = canonicalGameSlugKey(s)
    if (t) participationKey.add(t)
  }

  const candidates = allRules.filter(({ slug, rules }) => {
    if (!rules.setupComplete) return false
    if (rules.visibility !== 'public') return false
    if (!rules.joinCode || !/^\d{6}$/.test(rules.joinCode)) return false
    if (!withinLiveWindow(rules, nowMs)) return false
    const k = canonicalGameSlugKey(slug)
    if (k && participationKey.has(k)) return false
    /* Hosts who haven't finished setup are already filtered above; any
     * other runtime-rules row with `setupComplete && joinCode` is a real
     * publishable game regardless of its slug (the create-game wizard
     * persists under reusable slugs like `new`). */
    return true
  })

  /* Hydrate player counts in parallel — small N (≤ a few dozen), and the
   * helper hits a cached membership file so this is cheap. */
  const withCounts = await Promise.all(
    candidates.map(async ({ slug, rules }) => {
      const players = await listParticipantIdsForGame(slug)
      return { slug, rules, playerCount: players.length }
    }),
  )

  withCounts.sort((a, b) => {
    if (b.playerCount !== a.playerCount) return b.playerCount - a.playerCount
    const aStart = new Date(a.rules.startsAtIso).getTime()
    const bStart = new Date(b.rules.startsAtIso).getTime()
    return (bStart || 0) - (aStart || 0)
  })

  const allDtos = withCounts.map(({ slug, rules, playerCount }) => toDto(slug, rules, playerCount, nowMs))
  const n = allDtos.length

  if (n === 0) {
    return { games: [], totalEligible: 0, pageSize: SUGGESTED_PAGE_SIZE }
  }

  if (n <= SUGGESTED_PAGE_SIZE) {
    return { games: allDtos, totalEligible: n, pageSize: SUGGESTED_PAGE_SIZE }
  }

  const start = offsetBase % n
  const games: SuggestedGameDto[] = []
  for (let i = 0; i < SUGGESTED_PAGE_SIZE; i++) {
    games.push(allDtos[(start + i) % n]!)
  }
  return { games, totalEligible: n, pageSize: SUGGESTED_PAGE_SIZE }
}
