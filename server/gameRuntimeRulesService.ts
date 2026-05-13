import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TradeCategoryId } from './tradeService'
import { isTradeCategory } from './tradeService'
import { listGameDefinitions } from './gameDefinitionsStore'
import {
  defaultPaletteIdForSlug,
  decorEmojiForIcon,
  isLoadScreenIconId,
  isThemePaletteId,
  type ThemePaletteId,
} from '../src/game/gameThemePresets.ts'
import { sanitizeLoadScreenEmoji } from '../src/game/loadScreenEmoji.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RULES_PATH = path.join(__dirname, 'data', 'game-runtime-rules.json')

const MS_DAY = 86_400_000

export type DurationPreset = '1d' | '1w' | '1m' | '1y' | 'custom'

export type AssetsMode = 'all' | 'stocks_only' | 'crypto_only' | 'category'

export type VisibilityMode = 'public' | 'private'

export type GameRuntimeRules = {
  hostUserId: string | null
  gameDisplayName: string
  durationPreset: DurationPreset
  /** YYYY-MM-DD when preset is `custom` */
  customEndsOn: string | null
  startsAtIso: string
  endsAtIso: string | null
  assetsMode: AssetsMode
  assetsCategory: TradeCategoryId | null
  visibility: VisibilityMode
  /** Persisted palette for welcome + in-game chrome. */
  themePaletteId: ThemePaletteId
  /** Decorative emoji on the join welcome screen (one grapheme). */
  loadScreenEmoji: string
  /** Shown as “Hosted by …” on the load-in screen. */
  hostDisplayName: string
  /** Host finished the create-game wizard (step 2). */
  setupComplete: boolean
  /** Issued when the host finishes create-game; used for join links without a static `game-definitions.json` row. */
  joinCode: string | null
  updatedAtIso: string
}

type RulesFile = {
  version?: number
  bySlug?: Record<string, unknown>
}

function isDurationPreset(s: string): s is DurationPreset {
  return s === '1d' || s === '1w' || s === '1m' || s === '1y' || s === 'custom'
}

function isAssetsMode(s: string): s is AssetsMode {
  return s === 'all' || s === 'stocks_only' || s === 'crypto_only' || s === 'category'
}

function isVisibility(s: string): s is VisibilityMode {
  return s === 'public' || s === 'private'
}

export function computeGameEndIso(
  startsAtIso: string,
  durationPreset: DurationPreset,
  customEndsOn: string | null,
): string | null {
  const start = new Date(startsAtIso).getTime()
  if (!Number.isFinite(start)) return null
  switch (durationPreset) {
    case '1d':
      return new Date(start + MS_DAY).toISOString()
    case '1w':
      return new Date(start + 7 * MS_DAY).toISOString()
    case '1m':
      return new Date(start + 30 * MS_DAY).toISOString()
    case '1y':
      return new Date(start + 365 * MS_DAY).toISOString()
    case 'custom': {
      if (!customEndsOn || !/^\d{4}-\d{2}-\d{2}$/.test(customEndsOn)) return null
      const [y, mo, d] = customEndsOn.split('-').map((x) => Number(x))
      if (!y || !mo || !d) return null
      const endMs = Date.UTC(y, mo - 1, d, 23, 59, 59, 999)
      if (endMs <= start) return null
      return new Date(endMs).toISOString()
    }
    default:
      return null
  }
}

export function calendarDaysBetween(startIso: string, endIso: string | null): number | null {
  if (!endIso) return null
  const a = new Date(startIso).getTime()
  const b = new Date(endIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.max(1, Math.ceil((b - a) / MS_DAY))
}

function parseRules(raw: unknown, gameSlug: string): GameRuntimeRules | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const gameDisplayName = typeof o.gameDisplayName === 'string' ? o.gameDisplayName.trim() : ''
  const durationPresetRaw = typeof o.durationPreset === 'string' ? o.durationPreset : ''
  const durationPreset = isDurationPreset(durationPresetRaw) ? durationPresetRaw : null
  const assetsModeRaw = typeof o.assetsMode === 'string' ? o.assetsMode : ''
  const assetsMode = isAssetsMode(assetsModeRaw) ? assetsModeRaw : null
  const visibilityRaw = typeof o.visibility === 'string' ? o.visibility : ''
  const visibility = isVisibility(visibilityRaw) ? visibilityRaw : null
  const startsAtIso = typeof o.startsAtIso === 'string' ? o.startsAtIso : ''
  const endsAtIso = o.endsAtIso === null ? null : typeof o.endsAtIso === 'string' ? o.endsAtIso : null
  const hostUserId = o.hostUserId === null ? null : typeof o.hostUserId === 'string' ? o.hostUserId : null
  const customEndsOn = o.customEndsOn === null ? null : typeof o.customEndsOn === 'string' ? o.customEndsOn : null
  const assetsCategory =
    o.assetsCategory === null
      ? null
      : typeof o.assetsCategory === 'string' && isTradeCategory(o.assetsCategory)
        ? o.assetsCategory
        : null
  const updatedAtIso = typeof o.updatedAtIso === 'string' ? o.updatedAtIso : ''
  const themePaletteIdRaw = typeof o.themePaletteId === 'string' ? o.themePaletteId : ''
  const themePaletteId = isThemePaletteId(themePaletteIdRaw)
    ? themePaletteIdRaw
    : defaultPaletteIdForSlug(gameSlug)
  let loadScreenEmoji = '🍁'
  if (typeof o.loadScreenEmoji === 'string' && o.loadScreenEmoji.trim()) {
    loadScreenEmoji = sanitizeLoadScreenEmoji(o.loadScreenEmoji)
  } else {
    const legacyId = typeof o.loadScreenIconId === 'string' ? o.loadScreenIconId : ''
    if (legacyId && isLoadScreenIconId(legacyId)) {
      loadScreenEmoji = sanitizeLoadScreenEmoji(decorEmojiForIcon(legacyId))
    }
  }
  const hostDisplayName =
    typeof o.hostDisplayName === 'string' ? o.hostDisplayName.trim().slice(0, 80) : ''
  const setupComplete = o.setupComplete === true
  let joinCode: string | null = null
  if (typeof o.joinCode === 'string' && /^\d{6}$/.test(o.joinCode.trim())) {
    joinCode = o.joinCode.trim()
  }
  if (!gameDisplayName || !durationPreset || !assetsMode || !visibility || !startsAtIso || !updatedAtIso) return null
  if (assetsMode === 'category' && !assetsCategory) return null
  if (durationPreset === 'custom' && (!customEndsOn || !/^\d{4}-\d{2}-\d{2}$/.test(customEndsOn))) return null
  return {
    hostUserId,
    gameDisplayName,
    durationPreset,
    customEndsOn,
    startsAtIso,
    endsAtIso,
    assetsMode,
    assetsCategory,
    visibility,
    themePaletteId,
    loadScreenEmoji,
    hostDisplayName,
    setupComplete,
    joinCode,
    updatedAtIso,
  }
}

async function readFile(): Promise<RulesFile> {
  try {
    const raw = await fs.readFile(RULES_PATH, 'utf8')
    return JSON.parse(raw) as RulesFile
  } catch {
    return { version: 1, bySlug: {} }
  }
}

async function writeFile(data: RulesFile): Promise<void> {
  await fs.writeFile(RULES_PATH, JSON.stringify(data, null, 2), 'utf8')
}

export async function getRuntimeRules(gameSlug: string): Promise<GameRuntimeRules | null> {
  const f = await readFile()
  const raw = f.bySlug?.[gameSlug]
  return parseRules(raw, gameSlug)
}

function randomSixDigitJoinCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function loadTakenJoinCodes(): Promise<Set<string>> {
  const taken = new Set<string>()
  for (const g of await listGameDefinitions()) {
    if (g.joinCode) taken.add(g.joinCode)
  }
  const f = await readFile()
  for (const raw of Object.values(f.bySlug ?? {})) {
    if (!raw || typeof raw !== 'object') continue
    const jc = (raw as Record<string, unknown>).joinCode
    if (typeof jc === 'string' && /^\d{6}$/.test(jc.trim())) taken.add(jc.trim())
  }
  return taken
}

export async function allocateUniqueJoinCodeForGame(): Promise<string> {
  const taken = await loadTakenJoinCodes()
  for (let i = 0; i < 400; i++) {
    const c = randomSixDigitJoinCode()
    if (!taken.has(c)) {
      taken.add(c)
      return c
    }
  }
  throw new Error('Could not allocate a unique join code')
}

/** Resolve a host-published runtime game by its persisted join code (not the static `new` template code). */
export async function findRuntimeRulesByJoinCode(
  codeRaw: string,
): Promise<{ slug: string; rules: GameRuntimeRules } | null> {
  const code = typeof codeRaw === 'string' ? codeRaw.trim() : ''
  if (!/^\d{6}$/.test(code)) return null
  const f = await readFile()
  const by = f.bySlug ?? {}
  for (const [slug, raw] of Object.entries(by)) {
    const rules = parseRules(raw, slug)
    if (rules?.joinCode === code && rules.setupComplete) return { slug, rules }
  }
  return null
}

/** Backfill join code for games published before `joinCode` was added (idempotent). */
export async function ensureJoinCodeOnRuntimeIfMissing(gameSlug: string): Promise<GameRuntimeRules | null> {
  const cur = await getRuntimeRules(gameSlug)
  if (!cur?.setupComplete) return cur
  if (cur.joinCode && /^\d{6}$/.test(cur.joinCode)) return cur
  const code = await allocateUniqueJoinCodeForGame()
  const f = await readFile()
  const bySlug = { ...(f.bySlug ?? {}) }
  const next: GameRuntimeRules = { ...cur, joinCode: code, updatedAtIso: new Date().toISOString() }
  bySlug[gameSlug] = next
  await writeFile({ version: 1, bySlug })
  return next
}

export type CreateSettingsInput = {
  gameDisplayName: string
  durationPreset: DurationPreset
  customEndsOn: string | null
  assetsMode: AssetsMode
  assetsCategory: TradeCategoryId | null
  visibility: VisibilityMode
  themePaletteId?: ThemePaletteId
  loadScreenEmoji?: string
  hostDisplayName?: string
  setupComplete?: boolean
}

export function validateCreateSettingsInput(
  b: Record<string, unknown>,
): { ok: true; value: CreateSettingsInput } | { ok: false; error: string } {
  const gameDisplayName = typeof b.gameDisplayName === 'string' ? b.gameDisplayName.trim() : ''
  if (gameDisplayName.length < 1 || gameDisplayName.length > 80) {
    return { ok: false, error: 'Game name must be 1–80 characters.' }
  }
  const dp = typeof b.durationPreset === 'string' ? b.durationPreset : ''
  if (!isDurationPreset(dp)) {
    return { ok: false, error: 'Invalid duration preset.' }
  }
  const customEndsOn =
    b.customEndsOn === null || b.customEndsOn === undefined
      ? null
      : typeof b.customEndsOn === 'string'
        ? b.customEndsOn
        : '__bad__'
  if (customEndsOn === '__bad__') return { ok: false, error: 'Invalid custom end date.' }
  if (dp === 'custom') {
    if (!customEndsOn || !/^\d{4}-\d{2}-\d{2}$/.test(customEndsOn)) {
      return { ok: false, error: 'Custom duration requires an end date (YYYY-MM-DD).' }
    }
  }
  const am = typeof b.assetsMode === 'string' ? b.assetsMode : ''
  if (!isAssetsMode(am)) {
    return { ok: false, error: 'Invalid assets mode.' }
  }
  let assetsCategory: TradeCategoryId | null = null
  if (am === 'category') {
    const c = typeof b.assetsCategory === 'string' ? b.assetsCategory : ''
    if (!isTradeCategory(c)) return { ok: false, error: 'Pick a stock category when filtering by category.' }
    assetsCategory = c
  }
  const vis = typeof b.visibility === 'string' ? b.visibility : ''
  if (!isVisibility(vis)) {
    return { ok: false, error: 'Invalid visibility.' }
  }

  let themePaletteId: ThemePaletteId | undefined
  if (b.themePaletteId !== undefined && b.themePaletteId !== null) {
    if (typeof b.themePaletteId !== 'string' || !isThemePaletteId(b.themePaletteId)) {
      return { ok: false, error: 'Invalid theme palette.' }
    }
    themePaletteId = b.themePaletteId
  }

  let loadScreenEmoji: string | undefined
  if (b.loadScreenEmoji !== undefined && b.loadScreenEmoji !== null) {
    if (typeof b.loadScreenEmoji !== 'string') return { ok: false, error: 'Invalid load-screen emoji.' }
    loadScreenEmoji = sanitizeLoadScreenEmoji(b.loadScreenEmoji)
  } else if (b.loadScreenIconId !== undefined && b.loadScreenIconId !== null) {
    if (typeof b.loadScreenIconId === 'string' && isLoadScreenIconId(b.loadScreenIconId)) {
      loadScreenEmoji = sanitizeLoadScreenEmoji(decorEmojiForIcon(b.loadScreenIconId))
    } else if (typeof b.loadScreenIconId === 'string') {
      return { ok: false, error: 'Invalid load-screen icon.' }
    }
  }

  let hostDisplayName: string | undefined
  if (b.hostDisplayName !== undefined && b.hostDisplayName !== null) {
    if (typeof b.hostDisplayName !== 'string') return { ok: false, error: 'Invalid host display name.' }
    const t = b.hostDisplayName.trim().slice(0, 80)
    hostDisplayName = t
  }

  let setupComplete: boolean | undefined
  if (b.setupComplete !== undefined && b.setupComplete !== null) {
    if (typeof b.setupComplete !== 'boolean') return { ok: false, error: 'Invalid setupComplete flag.' }
    setupComplete = b.setupComplete
  }

  return {
    ok: true,
    value: {
      gameDisplayName,
      durationPreset: dp,
      customEndsOn: dp === 'custom' ? customEndsOn : null,
      assetsMode: am,
      assetsCategory: am === 'category' ? assetsCategory : null,
      visibility: vis,
      themePaletteId,
      loadScreenEmoji,
      hostDisplayName,
      setupComplete,
    },
  }
}

export async function upsertRuntimeRules(
  gameSlug: string,
  input: CreateSettingsInput,
  editorUserId: string,
): Promise<GameRuntimeRules> {
  const f = await readFile()
  const bySlug = { ...(f.bySlug ?? {}) }
  const prev = parseRules(bySlug[gameSlug], gameSlug)
  const startsAtIso = prev?.startsAtIso ?? new Date().toISOString()
  const endsAtIso = computeGameEndIso(startsAtIso, input.durationPreset, input.customEndsOn)
  if (!endsAtIso) {
    throw new Error('Could not compute game end date from the selected duration.')
  }
  const hostUserId = prev?.hostUserId ?? editorUserId
  const themePaletteId =
    input.themePaletteId ?? prev?.themePaletteId ?? defaultPaletteIdForSlug(gameSlug)
  const loadScreenEmoji =
    input.loadScreenEmoji !== undefined
      ? sanitizeLoadScreenEmoji(input.loadScreenEmoji)
      : (prev?.loadScreenEmoji ?? sanitizeLoadScreenEmoji('🍁'))
  const hostDisplayName =
    input.hostDisplayName !== undefined ? input.hostDisplayName.trim().slice(0, 80) : (prev?.hostDisplayName ?? '')
  const setupComplete = input.setupComplete ?? prev?.setupComplete ?? false
  let joinCode: string | null = prev?.joinCode ?? null
  if (joinCode && !/^\d{6}$/.test(joinCode)) joinCode = null
  if (setupComplete && !joinCode) {
    joinCode = await allocateUniqueJoinCodeForGame()
  }
  const next: GameRuntimeRules = {
    hostUserId,
    gameDisplayName: input.gameDisplayName,
    durationPreset: input.durationPreset,
    customEndsOn: input.durationPreset === 'custom' ? input.customEndsOn : null,
    startsAtIso,
    endsAtIso,
    assetsMode: input.assetsMode,
    assetsCategory: input.assetsMode === 'category' ? input.assetsCategory : null,
    visibility: input.visibility,
    themePaletteId,
    loadScreenEmoji,
    hostDisplayName,
    setupComplete,
    joinCode,
    updatedAtIso: new Date().toISOString(),
  }
  bySlug[gameSlug] = next
  await writeFile({ version: 1, bySlug })
  return next
}
