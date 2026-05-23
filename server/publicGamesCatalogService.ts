/**
 * Canonical list of joinable public games for home suggestions and the
 * "Browse public games" screen.
 *
 * Sources:
 *   1. Host-published rows in `game-runtime-rules.json` (public, setup complete, live window).
 *   2. Built-in `game-definitions.json` challenges (e.g. Nov 2024) with rolling/fixed timelines
 *      that are currently active — these never appear in runtime rules but are always joinable.
 */

import { canonicalGameSlugKey } from './gameSlugNormalize'
import { listAllRuntimeRules, type GameRuntimeRules } from './gameRuntimeRulesService'
import {
  listGameDefinitions,
  resolveTimelineBoundsMs,
  type GameDefinition,
} from './gameDefinitionsStore'
import { listParticipantIdsForGame } from './gameParticipantIds'
import { listParticipationSlugsForUser } from './userParticipationSlugs'
import { TRADE_CATEGORY_OPTIONS } from './tradeService'
import { welcomeThemeForPalette } from '../src/game/gameThemePresets.ts'
import { ensureUserProfilesBatch } from './userProfileService'
import {
  gameProfileAvatarUrl,
  gameProfileDisplayLabel,
  loadAllSetupProfilesByKey,
} from './userSetupProfileService'
import { resolveProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'

const MS_HOUR = 3_600_000
const MS_DAY = 86_400_000
const MEMBER_AVATAR_CAP = 5
const MEMBER_NAME_CAP = 3

export type PublicGameTheme = {
  gradientFrom: string
  gradientTo: string
  gradientAngleDeg: number
  joinButtonColor: string
  joinButtonBorderColor: string
}

export type PublicGameMemberPreview = {
  userId: string
  displayName: string
  avatarUrl: string
}

export type PublicGameCatalogItem = {
  slug: string
  joinCode: string
  title: string
  hostedByLine: string | null
  playerCount: number
  /** e.g. "Alex, Sam, and 12 others" */
  membersLine: string
  memberAvatars: PublicGameMemberPreview[]
  rulesSummary: string
  durationLine: string
  startsAtIso: string | null
  endsAtIso: string | null
  theme: PublicGameTheme
  loadScreenEmoji: string | null
  /** Lowercase tokens for client-side search ranking. */
  searchText: string
}

function categoryLabel(cat: string): string {
  return TRADE_CATEGORY_OPTIONS.find((c) => c.id === cat)?.label ?? cat
}

function rulesSummaryFromRuntime(rules: GameRuntimeRules): string {
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

function rulesSummaryFromDefinition(def: GameDefinition): string {
  const hint = def.timelineDetailLines.find((l) => /allowed to trade/i.test(l))
  if (hint) {
    const m = hint.match(/Allowed to trade:\s*(.+)/i)
    if (m?.[1]) return m[1].trim()
  }
  return 'Stocks & Crypto'
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

function withinLiveWindow(startIso: string | null, endIso: string | null, nowMs: number): boolean {
  if (startIso) {
    const startMs = new Date(startIso).getTime()
    if (Number.isFinite(startMs) && startMs > nowMs) return false
  }
  if (!endIso) return true
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(endMs)) return true
  return nowMs < endMs
}

function themeFromRuntime(rules: GameRuntimeRules): PublicGameTheme {
  const theme = welcomeThemeForPalette(rules.themePaletteId)
  return {
    gradientFrom: theme.welcomeGradientFrom,
    gradientTo: theme.welcomeGradientTo,
    gradientAngleDeg: theme.welcomeGradientAngleDeg,
    joinButtonColor: theme.joinButtonColor,
    joinButtonBorderColor: theme.joinButtonBorderColor,
  }
}

function themeFromDefinition(def: GameDefinition): PublicGameTheme {
  return {
    gradientFrom: def.theme.welcomeGradientFrom,
    gradientTo: def.theme.welcomeGradientTo,
    gradientAngleDeg: def.theme.welcomeGradientAngleDeg,
    joinButtonColor: def.theme.joinButtonColor,
    joinButtonBorderColor: def.theme.joinButtonBorderColor,
  }
}

function formatTitle(raw: string): string {
  const t = raw.trim()
  if (!t) return 'Game'
  if (t === t.toUpperCase() && t.length > 4) {
    return t
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return t
}

function buildMembersLine(names: string[], total: number): string {
  if (total <= 0) return 'Be the first to join'
  const shown = names.slice(0, MEMBER_NAME_CAP)
  if (total <= MEMBER_NAME_CAP) {
    if (shown.length === 1) return shown[0]!
    if (shown.length === 2) return `${shown[0]} and ${shown[1]}`
    return `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`
  }
  const others = total - shown.length
  if (shown.length === 0) return `${total} players have joined`
  return `${shown.join(', ')}, and ${others} ${others === 1 ? 'other' : 'others'}`
}

async function hydrateMemberPreviews(
  slug: string,
  participantIds: string[],
): Promise<{ membersLine: string; memberAvatars: PublicGameMemberPreview[] }> {
  const total = participantIds.length
  const slice = participantIds.slice(0, MEMBER_AVATAR_CAP)
  const profileMap = await ensureUserProfilesBatch(slice)
  const setups = await loadAllSetupProfilesByKey()
  const names: string[] = []
  const memberAvatars: PublicGameMemberPreview[] = []
  for (const userId of slice) {
    const setup = setups.get(`${userId}:::${slug}`)
    const prof = profileMap.get(userId)
    const gameLabel = gameProfileDisplayLabel(setup)
    const displayName = gameLabel ?? prof?.displayName?.trim() ?? 'Player'
    names.push(displayName)
    const avatarUrl = resolveProfileAvatarUrl(
      gameProfileAvatarUrl(setup, prof?.avatarUrl) || prof?.avatarUrl || '',
    )
    memberAvatars.push({ userId, displayName, avatarUrl })
  }
  return { membersLine: buildMembersLine(names, total), memberAvatars }
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

async function itemFromRuntime(
  slug: string,
  rules: GameRuntimeRules,
  playerCount: number,
  nowMs: number,
): Promise<PublicGameCatalogItem> {
  const { membersLine, memberAvatars } = await hydrateMemberPreviews(
    slug,
    await listParticipantIdsForGame(slug),
  )
  const hostName = rules.hostDisplayName.trim()
  const hostedByLine = hostName ? `Hosted by ${hostName}` : null
  const startsAtIso = rules.startsAtIso
  const endsAtIso = rules.endsAtIso
  const title = formatTitle(rules.gameDisplayName)
  const duration = durationLine(endsAtIso, nowMs)
  const rulesSummary = rulesSummaryFromRuntime(rules)
  const emoji =
    typeof rules.loadScreenEmoji === 'string' && rules.loadScreenEmoji.trim()
      ? rules.loadScreenEmoji.trim()
      : null
  return {
    slug,
    joinCode: rules.joinCode!,
    title,
    hostedByLine,
    playerCount,
    membersLine,
    memberAvatars,
    rulesSummary,
    durationLine: duration,
    startsAtIso,
    endsAtIso,
    theme: themeFromRuntime(rules),
    loadScreenEmoji: emoji,
    searchText: buildSearchText([
      title,
      hostedByLine,
      rulesSummary,
      duration,
      rules.joinCode,
      startsAtIso,
      endsAtIso,
      hostName,
    ]),
  }
}

async function itemFromDefinition(
  def: GameDefinition,
  playerCount: number,
  nowMs: number,
): Promise<PublicGameCatalogItem> {
  const bounds = resolveTimelineBoundsMs(def.timeline, nowMs)
  const { membersLine, memberAvatars } = await hydrateMemberPreviews(
    def.slug,
    await listParticipantIdsForGame(def.slug),
  )
  const title = formatTitle(def.displayTitle)
  const duration = durationLine(bounds.endIso, nowMs)
  const rulesSummary = rulesSummaryFromDefinition(def)
  return {
    slug: def.slug,
    joinCode: def.joinCode,
    title,
    hostedByLine: null,
    playerCount,
    membersLine,
    memberAvatars,
    rulesSummary,
    durationLine: duration,
    startsAtIso: bounds.startIso,
    endsAtIso: bounds.endIso,
    theme: themeFromDefinition(def),
    loadScreenEmoji: null,
    searchText: buildSearchText([
      title,
      rulesSummary,
      duration,
      def.joinCode,
      bounds.startIso,
      bounds.endIso,
      def.welcomeTagline,
      ...def.timelineDetailLines,
    ]),
  }
}

export type ListPublicCatalogOptions = {
  /**
   * When true (home suggestions), hide games the viewer already joined, hosts,
   * or has ledger/feed rows for. When false (browse-all), every live public game
   * is listed so hosts can verify their game and new users see the full catalog.
   */
  excludeViewerParticipation?: boolean
}

/**
 * All joinable public games, sorted by player count (desc) then most recent start.
 */
export async function listPublicCatalogItems(
  viewerUserId: string | null,
  options: ListPublicCatalogOptions = {},
): Promise<PublicGameCatalogItem[]> {
  const excludeViewerParticipation = options.excludeViewerParticipation === true
  const nowMs = Date.now()

  const [allRules, participationSlugs, definitions] = await Promise.all([
    listAllRuntimeRules(),
    excludeViewerParticipation && viewerUserId
      ? listParticipationSlugsForUser(viewerUserId)
      : Promise.resolve<string[]>([]),
    listGameDefinitions(),
  ])

  const participationKey = new Set<string>()
  if (excludeViewerParticipation) {
    for (const s of participationSlugs) {
      const k = canonicalGameSlugKey(s)
      if (k) participationKey.add(k)
    }
  }

  const runtimeSlugsSeen = new Set<string>()
  const candidates: Array<{ kind: 'runtime'; slug: string; rules: GameRuntimeRules } | { kind: 'def'; def: GameDefinition }> = []

  for (const { slug, rules } of allRules) {
    if (!rules.setupComplete) continue
    if (rules.visibility !== 'public') continue
    if (!rules.joinCode || !/^\d{6}$/.test(rules.joinCode)) continue
    if (!withinLiveWindow(rules.startsAtIso, rules.endsAtIso, nowMs)) continue
    const k = canonicalGameSlugKey(slug)
    if (k && participationKey.has(k)) continue
    runtimeSlugsSeen.add(slug)
    candidates.push({ kind: 'runtime', slug, rules })
  }

  const newTemplateDef = definitions.find((d) => d.slug === 'new')
  const newTemplateJoinCode = newTemplateDef?.joinCode ?? null

  for (const def of definitions) {
    if (def.slug === 'new') continue
    if (runtimeSlugsSeen.has(def.slug)) continue
    if (
      def.slug !== 'nov-2024-stock-challenge' &&
      newTemplateJoinCode &&
      def.joinCode === newTemplateJoinCode
    ) {
      continue
    }
    const bounds = resolveTimelineBoundsMs(def.timeline, nowMs)
    if (!withinLiveWindow(bounds.startIso, bounds.endIso, nowMs)) continue
    const k = canonicalGameSlugKey(def.slug)
    if (k && participationKey.has(k)) continue
    candidates.push({ kind: 'def', def })
  }

  const withCounts = await Promise.all(
    candidates.map(async (c) => {
      const slug = c.kind === 'runtime' ? c.slug : c.def.slug
      const players = await listParticipantIdsForGame(slug)
      return { c, playerCount: players.length }
    }),
  )

  withCounts.sort((a, b) => {
    if (b.playerCount !== a.playerCount) return b.playerCount - a.playerCount
    const aStart =
      a.c.kind === 'runtime'
        ? new Date(a.c.rules.startsAtIso).getTime()
        : resolveTimelineBoundsMs(a.c.def.timeline, nowMs).startMs ?? 0
    const bStart =
      b.c.kind === 'runtime'
        ? new Date(b.c.rules.startsAtIso).getTime()
        : resolveTimelineBoundsMs(b.c.def.timeline, nowMs).startMs ?? 0
    return (bStart || 0) - (aStart || 0)
  })

  const items: PublicGameCatalogItem[] = []
  for (const { c, playerCount } of withCounts) {
    if (c.kind === 'runtime') {
      items.push(await itemFromRuntime(c.slug, c.rules, playerCount, nowMs))
    } else {
      items.push(await itemFromDefinition(c.def, playerCount, nowMs))
    }
  }
  return items
}
