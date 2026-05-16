import { listParticipantIdsForGame } from './gameParticipantIds'
import {
  findRuntimeRulesByJoinCode,
  getRuntimeRules,
  joinCodeFromHttpQuery,
  normalizeSixDigitJoinCode,
  type GameRuntimeRules,
} from './gameRuntimeRulesService'
import {
  getGameDefinitionByJoinCode,
  getGameDefinitionBySlug,
  resolveTimelineBoundsMs,
  type GameDefinition,
} from './gameDefinitionsStore'
import { welcomeThemeForPalette } from '../src/game/gameThemePresets.ts'
import { sanitizeLoadScreenEmoji } from '../src/game/loadScreenEmoji.ts'
import { TRADE_CATEGORY_OPTIONS } from './tradeService'

export type JoinWelcomePrizeDto = {
  rank: number
  label: string
  amountFormatted: string
}

export type JoinWelcomeThemeDto = {
  welcomeGradientAngleDeg: number
  welcomeGradientFrom: string
  welcomeGradientTo: string
  joinButtonColor: string
  joinButtonBorderColor: string
  prizeAmountColor: string
  titleTextShadow?: string
  backArrowColor?: string
}

export type JoinWelcomeDto = {
  gameSlug: string
  joinCode: string
  displayTitle: string
  welcomeTagline: string
  timelineIso?: {
    start?: string | null
    end?: string | null
  }
  timelineDetailLines: string[]
  buyInLine: string
  prizes: JoinWelcomePrizeDto[]
  prizePoolNote: string
  playerCount: number
  playerJoinLine: string
  theme: JoinWelcomeThemeDto
  welcomeCustomization: Record<string, unknown>
  /** When `approval_required`, completing profile setup creates a request instead of immediate membership. */
  joinPolicy: 'open' | 'approval_required'
  /** Hide buy-in + prize card when there is no buy-in and no prize money configured. */
  showWelcomeEconomics: boolean
  /** Shown above the title when the host set their display name in create-game. */
  hostedByLine: string | null
  /** Floating decor on the welcome screen; when null, client uses `welcomeCustomization` maple flag. */
  loadScreenDecorEmoji: string | null
}

function formatUsd(cents: number): string {
  const v = Math.max(0, Math.floor(cents)) / 100
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ordinalSuffix(n: number): string {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) return 'st'
  if (j === 2 && k !== 12) return 'nd'
  if (j === 3 && k !== 13) return 'rd'
  return 'th'
}

function buildPlayerJoinLine(count: number): string {
  if (count <= 0) return 'No players have joined yet'
  if (count === 1) return '1 player has joined'
  return `${count} players have joined`
}

function timelineLinesFromRules(rules: GameRuntimeRules, game: GameDefinition): string[] {
  const lines: string[] = []
  if (rules.endsAtIso) {
    lines.push(
      `Challenge runs until ${new Date(rules.endsAtIso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}.`,
    )
  } else if (game.timelineDetailLines[0]) {
    lines.push(game.timelineDetailLines[0])
  }
  const cat = rules.assetsCategory
  const assetLine =
    rules.assetsMode === 'all'
      ? 'Allowed to trade: All stocks.'
      : rules.assetsMode === 'stocks_only'
        ? 'Allowed to trade: Stocks only.'
        : rules.assetsMode === 'crypto_only'
          ? 'Allowed to trade: Crypto only.'
          : cat
            ? `Browse any symbol; buys must be in the “${categoryLabel(cat)}” stock category.`
            : 'Browse any symbol; buys follow the host’s category rules.'
  lines.push(assetLine)
  /* Private / approval copy lives on the join welcome screen (`GameWelcomeScreen` `gw-privateNote`)
   * so we do not duplicate it here — it overlapped this block when both rendered in the same band. */
  return lines
}

function categoryLabel(cat: string): string {
  const hit = TRADE_CATEGORY_OPTIONS.find((c) => c.id === cat)
  return hit?.label ?? cat
}

/**
 * Join welcome needs static copy/theme defaults when `game-definitions.json` has no `new`
 * row (or failed to load). Runtime rules still carry the real title, schedule, and join code.
 */
const JOIN_RUNTIME_WELCOME_TEMPLATE: GameDefinition = {
  slug: 'new',
  joinCode: '000000',
  displayTitle: 'YOUR NEW GAME',
  welcomeTagline: 'Let the games begin!',
  timeline: { mode: 'rolling', startDaysAgo: 0, endDaysFromNow: null },
  timelineDetailLines: [
    'Runs in real time — challenge window follows the host’s schedule.',
    'Allowed to trade: Stocks & Crypto',
  ],
  economics: {
    buyInCents: 0,
    prizes: [
      { rank: 1, amountCents: 0 },
      { rank: 2, amountCents: 0 },
      { rank: 3, amountCents: 0 },
    ],
    prizePoolNote: 'For games with a buy in, prize money will increase as more people join',
  },
  theme: {
    welcomeGradientAngleDeg: 135,
    welcomeGradientFrom: '#0a9be3',
    welcomeGradientTo: '#05557d',
    joinButtonColor: '#0fae37',
    joinButtonBorderColor: '#0fae37',
    prizeAmountColor: '#0fae37',
    titleTextShadow: '0 0 10px rgba(255, 255, 255, 0.45)',
    backArrowColor: '#ffffff',
  },
  welcomeCustomization: {
    showMapleLeaf: false,
    showStockChartWatermark: true,
    welcomeCardGlow: '0 0 10px rgba(255,255,255,0.35)',
  },
}

export function dtoFromDefinition(game: GameDefinition, playerCount: number): JoinWelcomeDto {
  const rt = resolveTimelineBoundsMs(game.timeline ?? null, Date.now())
  if (rt.startMs != null && rt.endMs != null && rt.endMs < rt.startMs) {
    console.warn(`[join-welcome] Timeline order looks wrong for game ${game.slug}`)
  }

  const buyInCents = game.economics.buyInCents
  const buyInLine = buyInCents <= 0 ? 'BUY IN: FREE' : `BUY IN: ${formatUsd(buyInCents)}`

  const sortedPrizes = [...game.economics.prizes].sort((a, b) => a.rank - b.rank)
  const prizes: JoinWelcomePrizeDto[] = sortedPrizes.map((p) => ({
    rank: p.rank,
    label: `${p.rank}${ordinalSuffix(p.rank)}:`,
    amountFormatted: formatUsd(p.amountCents),
  }))

  const showWelcomeEconomics =
    buyInCents > 0 || game.economics.prizes.some((p) => p.amountCents > 0)

  return {
    gameSlug: game.slug,
    joinCode: game.joinCode,
    displayTitle: game.displayTitle,
    welcomeTagline: game.welcomeTagline,
    timelineIso: {
      start: rt.startIso,
      end: rt.endIso,
    },
    timelineDetailLines: game.timelineDetailLines,
    buyInLine,
    prizes,
    prizePoolNote: game.economics.prizePoolNote,
    playerCount,
    playerJoinLine: buildPlayerJoinLine(playerCount),
    theme: {
      welcomeGradientAngleDeg: game.theme.welcomeGradientAngleDeg,
      welcomeGradientFrom: game.theme.welcomeGradientFrom,
      welcomeGradientTo: game.theme.welcomeGradientTo,
      joinButtonColor: game.theme.joinButtonColor,
      joinButtonBorderColor: game.theme.joinButtonBorderColor,
      prizeAmountColor: game.theme.prizeAmountColor,
      titleTextShadow: game.theme.titleTextShadow,
      backArrowColor: game.theme.backArrowColor,
    },
    welcomeCustomization: game.welcomeCustomization ?? {},
    joinPolicy: 'open',
    showWelcomeEconomics,
    hostedByLine: null,
    loadScreenDecorEmoji: null,
  }
}

export async function buildJoinWelcomeDto(codeRaw: string): Promise<JoinWelcomeDto | null> {
  const code =
    joinCodeFromHttpQuery(codeRaw) ?? normalizeSixDigitJoinCode(codeRaw)
  if (!code) return null
  // Resolve host-published games by their issued join code first so codes stay unique and
  // do not collide with the static `new` template row in game-definitions.json.
  const rtHit = await findRuntimeRulesByJoinCode(code)
  if (rtHit) {
    const { slug, rules } = rtHit
    const template = (await getGameDefinitionBySlug('new')) ?? JOIN_RUNTIME_WELCOME_TEMPLATE
    const members = await listParticipantIdsForGame(slug)
    const dto = dtoFromDefinition(template, members.length)
    const joinCode = normalizeSixDigitJoinCode(rules.joinCode) ?? code
    const joinPolicy = rules.visibility === 'private' ? 'approval_required' : 'open'
    const theme = welcomeThemeForPalette(rules.themePaletteId)
    const hostedByLine = rules.hostDisplayName.trim()
      ? `Hosted by ${rules.hostDisplayName.trim()}`
      : null
    return {
      ...dto,
      gameSlug: slug,
      joinCode,
      joinPolicy,
      displayTitle: rules.gameDisplayName.toUpperCase(),
      welcomeTagline: template.welcomeTagline,
      timelineIso: { start: rules.startsAtIso, end: rules.endsAtIso },
      timelineDetailLines: timelineLinesFromRules(rules, template),
      theme,
      welcomeCustomization: {
        ...dto.welcomeCustomization,
        showMapleLeaf: false,
      },
      hostedByLine,
      loadScreenDecorEmoji: sanitizeLoadScreenEmoji(rules.loadScreenEmoji),
    }
  }

  const game = await getGameDefinitionByJoinCode(code)
  if (!game) return null

  // Template placeholder code for slug `new` must not join a real published challenge on
  // that slot once a unique runtime join code has been issued.
  if (game.slug === 'new') {
    const live = await getRuntimeRules('new')
    const liveCode = normalizeSixDigitJoinCode(live?.joinCode)
    const templateCode = normalizeSixDigitJoinCode(game.joinCode)
    if (live?.setupComplete && liveCode && templateCode && liveCode !== templateCode) {
      return null
    }
  }

  const members = await listParticipantIdsForGame(game.slug)
  const rules = await getRuntimeRules(game.slug)
  const dto = dtoFromDefinition(game, members.length)
  const joinPolicy = rules?.visibility === 'private' ? 'approval_required' : 'open'
  if (!rules) {
    return { ...dto, joinPolicy }
  }
  const theme = welcomeThemeForPalette(rules.themePaletteId)
  const hostedByLine = rules.hostDisplayName.trim()
    ? `Hosted by ${rules.hostDisplayName.trim()}`
    : null
  return {
    ...dto,
    joinPolicy,
    displayTitle: rules.gameDisplayName.toUpperCase(),
    timelineIso: { start: rules.startsAtIso, end: rules.endsAtIso },
    timelineDetailLines: timelineLinesFromRules(rules, game),
    theme,
    welcomeCustomization: {
      ...dto.welcomeCustomization,
      showMapleLeaf: false,
    },
    hostedByLine,
    loadScreenDecorEmoji: sanitizeLoadScreenEmoji(rules.loadScreenEmoji),
  }
}
