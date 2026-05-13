import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFS_PATH = path.join(__dirname, 'data', 'game-definitions.json')

export type GamePrizeDef = {
  rank: number
  amountCents: number
}

export type GameTimelineDef = {
  /** `rolling`: bounds are recomputed from server clock (see `startDaysAgo` / `endDaysFromNow`). `fixed`: use ISO strings. */
  mode: 'fixed' | 'rolling'
  /** Rolling only: virtual game start = now minus this many calendar days (86400000 ms steps). */
  startDaysAgo?: number
  /** Rolling only: virtual game end = now plus this many days; omit or null = no end clamp (open-ended). */
  endDaysFromNow?: number | null
  /** Fixed mode (or optional display hints): explicit calendar bounds. */
  startIso?: string | null
  endIso?: string | null
}

export type GameDefinition = {
  slug: string
  /** Six-digit numeric string, unique across all games. */
  joinCode: string
  displayTitle: string
  welcomeTagline: string
  timeline?: GameTimelineDef
  /** Pre-rendered lines under the hero title (keeps UX flexible until setup UI exists). */
  timelineDetailLines: string[]
  economics: {
    buyInCents: number
    prizes: GamePrizeDef[]
    prizePoolNote: string
  }
  theme: {
    welcomeGradientAngleDeg: number
    welcomeGradientFrom: string
    welcomeGradientTo: string
    joinButtonColor: string
    joinButtonBorderColor: string
    prizeAmountColor: string
    titleTextShadow?: string
    backArrowColor?: string
  }
  /** Reserved for upcoming per-game authoring (assets, toggles, copy blocks, analytics tags, …). */
  welcomeCustomization?: Record<string, unknown>
}

type DefinitionsFile = {
  version?: number
  games?: unknown[]
}

function isSixDigitCode(s: string): boolean {
  return /^\d{6}$/.test(s)
}

function assertGame(raw: unknown): GameDefinition | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const slug = typeof o.slug === 'string' ? o.slug.trim() : ''
  const joinCode = typeof o.joinCode === 'string' ? o.joinCode.trim() : ''
  const displayTitle = typeof o.displayTitle === 'string' ? o.displayTitle.trim() : ''
  const welcomeTagline = typeof o.welcomeTagline === 'string' ? o.welcomeTagline.trim() : ''
  if (!slug || !joinCode || !displayTitle || !welcomeTagline) return null
  if (!isSixDigitCode(joinCode)) return null

  const timelineRaw = o.timeline && typeof o.timeline === 'object' ? (o.timeline as Record<string, unknown>) : {}
  const modeRaw = timelineRaw.mode
  const mode = modeRaw === 'rolling' || modeRaw === 'fixed' ? modeRaw : undefined
  const startIso =
    timelineRaw.startIso === null ? null : typeof timelineRaw.startIso === 'string' ? timelineRaw.startIso : undefined
  const endIso =
    timelineRaw.endIso === null ? null : typeof timelineRaw.endIso === 'string' ? timelineRaw.endIso : undefined
  const startDaysAgo = Number(timelineRaw.startDaysAgo)

  const timelineDetailLines = Array.isArray(o.timelineDetailLines)
    ? o.timelineDetailLines.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : []

  const econRaw = o.economics && typeof o.economics === 'object' ? (o.economics as Record<string, unknown>) : null
  if (!econRaw) return null
  const buyInCents = Number(econRaw.buyInCents)
  const prizePoolNote =
    typeof econRaw.prizePoolNote === 'string' ? econRaw.prizePoolNote : 'For games with a buy in, prize money will increase as more people join'
  const prizesRaw = econRaw.prizes
  if (!Array.isArray(prizesRaw) || prizesRaw.some((p) => !p || typeof p !== 'object')) return null
  const prizes = prizesRaw.map((p) => {
    const pr = p as Record<string, unknown>
    const rank = Number(pr.rank)
    const amountCents = Number(pr.amountCents)
    return { rank, amountCents }
  })
  if (prizes.some((p) => !Number.isFinite(p.rank) || p.rank <= 0)) return null
  if (prizes.some((p) => !Number.isFinite(p.amountCents) || p.amountCents < 0)) return null

  const themeRaw = o.theme && typeof o.theme === 'object' ? (o.theme as Record<string, unknown>) : null
  if (!themeRaw) return null
  const angle = Number(themeRaw.welcomeGradientAngleDeg)
  const welcomeGradientFrom = String(themeRaw.welcomeGradientFrom ?? '')
  const welcomeGradientTo = String(themeRaw.welcomeGradientTo ?? '')
  const joinButtonColor = String(themeRaw.joinButtonColor ?? '')
  const joinButtonBorderColor = String(themeRaw.joinButtonBorderColor ?? '')
  const prizeAmountColor = String(themeRaw.prizeAmountColor ?? '')
  if (
    !Number.isFinite(angle) ||
    !welcomeGradientFrom ||
    !welcomeGradientTo ||
    !joinButtonColor ||
    !joinButtonBorderColor ||
    !prizeAmountColor
  ) {
    return null
  }
  const titleTextShadow =
    typeof themeRaw.titleTextShadow === 'string' && themeRaw.titleTextShadow.trim().length > 0
      ? themeRaw.titleTextShadow
      : undefined
  const backArrowColor =
    typeof themeRaw.backArrowColor === 'string' && themeRaw.backArrowColor.trim().length > 0
      ? themeRaw.backArrowColor
      : '#ffffff'

  const welcomeCustomization =
    o.welcomeCustomization && typeof o.welcomeCustomization === 'object' ? (o.welcomeCustomization as Record<string, unknown>) : {}

  let timeline: GameTimelineDef | undefined
  if (mode === 'rolling' && Number.isFinite(startDaysAgo) && startDaysAgo >= 0) {
    const t: GameTimelineDef = {
      mode: 'rolling',
      startDaysAgo: Math.floor(startDaysAgo),
    }
    if (Object.prototype.hasOwnProperty.call(timelineRaw, 'endDaysFromNow')) {
      if (timelineRaw.endDaysFromNow === null) t.endDaysFromNow = null
      else if (typeof timelineRaw.endDaysFromNow === 'number' && Number.isFinite(timelineRaw.endDaysFromNow)) {
        t.endDaysFromNow = Math.max(0, timelineRaw.endDaysFromNow)
      }
    }
    timeline = t
  } else if (startIso !== undefined || endIso !== undefined) {
    timeline = { mode: 'fixed', startIso, endIso }
  }

  const game: GameDefinition = {
    slug,
    joinCode,
    displayTitle,
    welcomeTagline,
    ...(timeline ? { timeline } : {}),
    timelineDetailLines,
    economics: {
      buyInCents: Number.isFinite(buyInCents) ? Math.max(0, Math.floor(buyInCents)) : 0,
      prizes,
      prizePoolNote,
    },
    theme: {
      welcomeGradientAngleDeg: angle,
      welcomeGradientFrom,
      welcomeGradientTo,
      joinButtonColor,
      joinButtonBorderColor,
      prizeAmountColor,
      titleTextShadow,
      backArrowColor,
    },
    welcomeCustomization,
  }
  return game
}

async function loadAll(): Promise<GameDefinition[]> {
  let rawJson: DefinitionsFile = {}
  try {
    rawJson = JSON.parse(await fs.readFile(DEFS_PATH, 'utf8')) as DefinitionsFile
  } catch {
    return []
  }
  const gamesRaw = rawJson.games ?? []
  const out: GameDefinition[] = []
  for (const g of gamesRaw) {
    const parsed = assertGame(g)
    if (parsed) out.push(parsed)
  }
  const byCode = new Map<string, GameDefinition>()
  const bySlug = new Set<string>()
  for (const game of out) {
    if (byCode.has(game.joinCode)) {
      console.warn(`[game-definitions] Skipping duplicate join code ${game.joinCode} (${game.slug})`)
      continue
    }
    if (bySlug.has(game.slug)) {
      console.warn(`[game-definitions] Skipping duplicate slug ${game.slug}`)
      continue
    }
    byCode.set(game.joinCode, game)
    bySlug.add(game.slug)
  }
  return [...byCode.values()]
}

let cache: { games: GameDefinition[]; map: Map<string, GameDefinition> } | null = null

async function getIndex(): Promise<{ games: GameDefinition[]; map: Map<string, GameDefinition> }> {
  if (cache) return cache
  const games = await loadAll()
  const map = new Map<string, GameDefinition>()
  for (const g of games) {
    map.set(g.joinCode, g)
  }
  cache = { games, map }
  return cache
}

/** Invalidate in-memory defs (future admin writes). */
export function invalidateGameDefinitionsCache(): void {
  cache = null
}

const DAY_MS = 86_400_000

/**
 * Resolves timeline bounds for charts and APIs. Rolling timelines move with the server clock so
 * “present-time” games stay accurate without editing JSON dates.
 */
export function resolveTimelineBoundsMs(
  timeline: GameTimelineDef | undefined | null,
  nowMs: number,
): { startMs: number | null; endMs: number | null; startIso: string | null; endIso: string | null } {
  if (!timeline) {
    return { startMs: null, endMs: null, startIso: null, endIso: null }
  }
  if (
    timeline.mode === 'rolling' &&
    typeof timeline.startDaysAgo === 'number' &&
    Number.isFinite(timeline.startDaysAgo) &&
    timeline.startDaysAgo >= 0
  ) {
    const startMs = nowMs - Math.floor(timeline.startDaysAgo) * DAY_MS
    let endMs: number | null = null
    if (typeof timeline.endDaysFromNow === 'number' && Number.isFinite(timeline.endDaysFromNow)) {
      endMs = nowMs + Math.max(0, timeline.endDaysFromNow) * DAY_MS
    }
    return {
      startMs,
      endMs,
      startIso: new Date(startMs).toISOString(),
      endIso: endMs != null ? new Date(endMs).toISOString() : null,
    }
  }

  const s = timeline.startIso != null ? Date.parse(timeline.startIso) : NaN
  const e = timeline.endIso != null ? Date.parse(timeline.endIso) : NaN
  return {
    startMs: Number.isFinite(s) ? s : null,
    endMs: Number.isFinite(e) ? e : null,
    startIso: timeline.startIso ?? null,
    endIso: timeline.endIso ?? null,
  }
}

export async function listGameDefinitions(): Promise<GameDefinition[]> {
  return (await getIndex()).games
}

export async function getGameDefinitionByJoinCode(codeRaw: string): Promise<GameDefinition | null> {
  const code = String(codeRaw ?? '').trim()
  if (!isSixDigitCode(code)) return null
  return (await getIndex()).map.get(code) ?? null
}

export async function getGameDefinitionBySlug(slug: string): Promise<GameDefinition | null> {
  const s = String(slug ?? '').trim()
  if (!s) return null
  return (await getIndex()).games.find((g) => g.slug === s) ?? null
}
