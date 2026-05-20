import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import { dataFilePath } from './dataDir.ts'
import { runSerializedByKey } from './fsMutationQueue'
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

const RULES_PATH = dataFilePath('game-runtime-rules.json')

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

/** Crypto is paused — host create-game saves must not enable crypto trading. */
function normalizeAssetsModeForHostSettings(
  am: AssetsMode,
  assetsCategory: TradeCategoryId | null,
): { assetsMode: AssetsMode; assetsCategory: TradeCategoryId | null } {
  if (am === 'crypto_only' || am === 'all') {
    return { assetsMode: 'stocks_only', assetsCategory: null }
  }
  if (am === 'category') {
    if (assetsCategory === 'crypto') {
      return { assetsMode: 'stocks_only', assetsCategory: null }
    }
    return { assetsMode: 'category', assetsCategory }
  }
  return { assetsMode: 'stocks_only', assetsCategory: null }
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

/**
 * In-memory defaults for the shared `new` template when the persisted row belongs
 * to another user. The client can edit and save without seeing someone else's title.
 */
export function buildFreshNewTemplateDraftForViewer(viewerUserId: string, hostLineLabel: string): GameRuntimeRules {
  const startsAtIso = new Date().toISOString()
  const endsAtIso = computeGameEndIso(startsAtIso, '1m', null)
  if (!endsAtIso) {
    throw new Error('Could not compute default end date for new template draft.')
  }
  const label = hostLineLabel.trim().slice(0, 80)
  return {
    hostUserId: viewerUserId,
    gameDisplayName: '',
    durationPreset: '1m',
    customEndsOn: null,
    startsAtIso,
    endsAtIso,
    assetsMode: 'all',
    assetsCategory: null,
    visibility: 'public',
    themePaletteId: defaultPaletteIdForSlug('new'),
    loadScreenEmoji: sanitizeLoadScreenEmoji('🍁'),
    hostDisplayName: label,
    setupComplete: false,
    joinCode: null,
    updatedAtIso: new Date().toISOString(),
  }
}

export function calendarDaysBetween(startIso: string, endIso: string | null): number | null {
  if (!endIso) return null
  const a = new Date(startIso).getTime()
  const b = new Date(endIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.max(1, Math.ceil((b - a) / MS_DAY))
}

/** Accepts JSON `joinCode` as string or number; always returns a 6-digit string or null. */
export function normalizeSixDigitJoinCode(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const t = raw.trim()
    return /^\d{6}$/.test(t) ? t : null
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.floor(raw)
    if (!Number.isFinite(n) || n < 0 || n > 999999) return null
    const s = String(n).padStart(6, '0')
    return /^\d{6}$/.test(s) ? s : null
  }
  return null
}

/** Express may pass `code` as string, number, or repeated query as string[]. */
export function joinCodeFromHttpQuery(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  if (Array.isArray(raw)) return joinCodeFromHttpQuery(raw[0])
  if (typeof raw === 'number' && Number.isFinite(raw)) return normalizeSixDigitJoinCode(raw)
  if (typeof raw === 'string') {
    const digits = raw.replace(/[^\d]/g, '')
    if (digits.length === 6) return digits
    return normalizeSixDigitJoinCode(raw)
  }
  return null
}

function randomSixDigitJoinCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function allocateJoinCodeFromTaken(taken: Set<string>): string {
  for (let i = 0; i < 400; i++) {
    const c = randomSixDigitJoinCode()
    if (!taken.has(c)) return c
  }
  throw new Error('Could not allocate a unique join code')
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
  const joinCode = normalizeSixDigitJoinCode(o.joinCode)
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

async function readFileRaw(): Promise<RulesFile> {
  try {
    const raw = await fs.readFile(RULES_PATH, 'utf8')
    return JSON.parse(raw) as RulesFile
  } catch {
    return { version: 1, bySlug: {} }
  }
}

async function writeFileRaw(data: RulesFile): Promise<void> {
  await fs.writeFile(RULES_PATH, JSON.stringify(data, null, 2), 'utf8')
}

export async function getRuntimeRules(gameSlug: string): Promise<GameRuntimeRules | null> {
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const raw = f.bySlug?.[gameSlug]
    const parsed = parseRules(raw, gameSlug)
    if (parsed) return parsed
    if (!raw || typeof raw !== 'object') return null
    const o = raw as Record<string, unknown>
    if (o.setupComplete !== true) return null
    const repaired = attemptRepairRuntimeRawForParse(raw)
    if (!repaired) return null
    return parseRules(repaired, gameSlug)
  })
}

/**
 * Enumerate every runtime-rules row that parses cleanly. Used by
 * `suggestedGamesService` to surface live public games on a fresh user's
 * home screen. Filtering (visibility / setupComplete / timeline window) is
 * left to callers so each surface can apply its own selection criteria.
 */
export async function listAllRuntimeRules(): Promise<Array<{ slug: string; rules: GameRuntimeRules }>> {
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const out: Array<{ slug: string; rules: GameRuntimeRules }> = []
    for (const [slug, raw] of Object.entries(f.bySlug ?? {})) {
      const rules = parseRules(raw, slug)
      if (rules) out.push({ slug, rules })
    }
    return out
  })
}

async function loadTakenJoinCodes(rulesFile: RulesFile): Promise<Set<string>> {
  const taken = new Set<string>()
  for (const g of await listGameDefinitions()) {
    const c = normalizeSixDigitJoinCode(g.joinCode)
    if (c) taken.add(c)
  }
  for (const raw of Object.values(rulesFile.bySlug ?? {})) {
    if (!raw || typeof raw !== 'object') continue
    const c = normalizeSixDigitJoinCode((raw as Record<string, unknown>).joinCode)
    if (c) taken.add(c)
  }
  return taken
}

export async function allocateUniqueJoinCodeForGame(): Promise<string> {
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const taken = await loadTakenJoinCodes(f)
    return allocateJoinCodeFromTaken(taken)
  })
}

/**
 * If a published row has a valid join code on disk but fails strict parse (corrupt optional
 * fields), coerce minimal required fields so join-by-code still resolves.
 */
function attemptRepairRuntimeRawForParse(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const o = { ...(raw as Record<string, unknown>) }
  if (typeof o.gameDisplayName !== 'string' || !o.gameDisplayName.trim()) {
    o.gameDisplayName = 'Game'
  }
  if (typeof o.durationPreset !== 'string' || !isDurationPreset(o.durationPreset)) {
    o.durationPreset = '1m'
  }
  if (typeof o.assetsMode !== 'string' || !isAssetsMode(o.assetsMode)) {
    o.assetsMode = 'all'
  }
  if (typeof o.visibility !== 'string' || !isVisibility(o.visibility)) {
    o.visibility = 'public'
  }
  if (typeof o.startsAtIso !== 'string' || !o.startsAtIso.trim()) {
    o.startsAtIso = new Date().toISOString()
  }
  if (typeof o.updatedAtIso !== 'string' || !o.updatedAtIso.trim()) {
    o.updatedAtIso = new Date().toISOString()
  }
  if (o.assetsMode === 'category') {
    if (typeof o.assetsCategory !== 'string' || !isTradeCategory(o.assetsCategory)) {
      o.assetsMode = 'all'
      o.assetsCategory = null
    }
  }
  if (o.durationPreset === 'custom') {
    if (typeof o.customEndsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.customEndsOn)) {
      o.durationPreset = '1m'
      o.customEndsOn = null
    }
  }
  return o
}

/** Resolve a host-published runtime game by its persisted join code (not the static `new` template code). */
export async function findRuntimeRulesByJoinCode(
  codeRaw: string,
): Promise<{ slug: string; rules: GameRuntimeRules } | null> {
  const code = joinCodeFromHttpQuery(codeRaw) ?? normalizeSixDigitJoinCode(codeRaw)
  if (!code) return null
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const by = f.bySlug ?? {}
    for (const [slug, raw] of Object.entries(by)) {
      const rules = parseRules(raw, slug)
      const rowCode = normalizeSixDigitJoinCode(rules?.joinCode ?? null)
      if (rules?.setupComplete && rowCode === code) return { slug, rules }
    }
    for (const [slug, raw] of Object.entries(by)) {
      if (!raw || typeof raw !== 'object') continue
      const o = raw as Record<string, unknown>
      if (o.setupComplete !== true) continue
      const rawRowCode =
        joinCodeFromHttpQuery(o.joinCode ?? '') ?? normalizeSixDigitJoinCode(o.joinCode)
      if (rawRowCode !== code) continue
      const repaired = attemptRepairRuntimeRawForParse(raw)
      if (!repaired) continue
      const rules = parseRules(repaired, slug)
      if (rules?.setupComplete && normalizeSixDigitJoinCode(rules.joinCode) === code) {
        return { slug, rules }
      }
    }
    return null
  })
}

/** Backfill join code for games published before `joinCode` was added (idempotent). */
export async function ensureJoinCodeOnRuntimeIfMissing(gameSlug: string): Promise<GameRuntimeRules | null> {
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const raw = f.bySlug?.[gameSlug]
    const cur = parseRules(raw, gameSlug)
    if (!cur?.setupComplete) return cur
    if (normalizeSixDigitJoinCode(cur.joinCode)) return cur
    const taken = await loadTakenJoinCodes(f)
    const code = allocateJoinCodeFromTaken(taken)
    const bySlug = { ...(f.bySlug ?? {}) }
    const next: GameRuntimeRules = { ...cur, joinCode: code, updatedAtIso: new Date().toISOString() }
    bySlug[gameSlug] = next
    await writeFileRaw({ version: 1, bySlug })
    return next
  })
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
  /** When true with `setupComplete` on slug `new`, clears stale per-game stores and resets the timeline. */
  forceNewGameInstance?: boolean
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
  const amRaw = typeof b.assetsMode === 'string' ? b.assetsMode : ''
  if (!isAssetsMode(amRaw)) {
    return { ok: false, error: 'Invalid assets mode.' }
  }
  let assetsCategory: TradeCategoryId | null = null
  if (amRaw === 'category') {
    const c = typeof b.assetsCategory === 'string' ? b.assetsCategory : ''
    if (!isTradeCategory(c)) return { ok: false, error: 'Pick a stock category when filtering by category.' }
    assetsCategory = c
  }
  const { assetsMode: am, assetsCategory: normalizedCategory } = normalizeAssetsModeForHostSettings(
    amRaw,
    assetsCategory,
  )
  assetsCategory = normalizedCategory
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

  let forceNewGameInstance: boolean | undefined
  if (b.forceNewGameInstance !== undefined && b.forceNewGameInstance !== null) {
    if (typeof b.forceNewGameInstance !== 'boolean') return { ok: false, error: 'Invalid forceNewGameInstance flag.' }
    forceNewGameInstance = b.forceNewGameInstance ? true : undefined
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
      forceNewGameInstance,
    },
  }
}

/** Unique slug for a published challenge leaving the shared `new` slot (join code is unique). */
export async function pickPermanentSlugForArchive(rules: GameRuntimeRules): Promise<string> {
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const bySlug = f.bySlug ?? {}
    const code = normalizeSixDigitJoinCode(rules.joinCode)
    const base = code ? `live-${code}` : `live-${randomBytes(6).toString('hex')}`
    let candidate = base
    let n = 0
    while (bySlug[candidate] && n < 500) {
      n += 1
      candidate = `${base}-${n}`
    }
    return candidate
  })
}

/** Copy runtime rules from the shared `new` slot to a permanent slug before wiping `new` stores. */
/** Replace the shared `new` row with an unpublished draft (after archiving a live publish). */
export async function seedNewSlotDraftRow(hostUserId: string, hostDisplayName: string): Promise<GameRuntimeRules> {
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const draft = buildFreshNewTemplateDraftForViewer(hostUserId, hostDisplayName)
    const bySlug = { ...(f.bySlug ?? {}), new: draft }
    await writeFileRaw({ version: 1, bySlug })
    return draft
  })
}

export async function archiveRuntimeRulesRow(fromSlug: string, toSlug: string): Promise<void> {
  if (!fromSlug || !toSlug || fromSlug === toSlug) return
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const bySlug = { ...(f.bySlug ?? {}) }
    const raw = bySlug[fromSlug]
    if (!raw || typeof raw !== 'object') return
    bySlug[toSlug] = { ...(raw as Record<string, unknown>) }
    await writeFileRaw({ version: 1, bySlug })
  })
}

/**
 * When the shared template slug `new` is (re)published with `setupComplete: true`, we may need to
 * wipe all on-disk rows keyed by that slug before saving new runtime rules. This predicate must stay
 * identical to the `completingPublish` branch inside `upsertRuntimeRules` so store resets and
 * timeline/join-code refresh never drift.
 */
export function shouldResetStoresForNewSlugPublish(
  gameSlug: string,
  opts: {
    setupComplete: boolean
    forceNewGameInstance?: boolean
    prev: GameRuntimeRules | null
    editorUserId: string
  },
): boolean {
  if (gameSlug !== 'new' || !opts.setupComplete) return false
  const { prev, editorUserId, forceNewGameInstance } = opts
  return (
    forceNewGameInstance === true ||
    !prev ||
    !prev.setupComplete ||
    (prev.hostUserId != null && prev.hostUserId !== editorUserId)
  )
}

export async function upsertRuntimeRules(
  gameSlug: string,
  input: CreateSettingsInput,
  editorUserId: string,
): Promise<GameRuntimeRules> {
  return runSerializedByKey(RULES_PATH, async () => {
    const f = await readFileRaw()
    const bySlug = { ...(f.bySlug ?? {}) }
    const prev = parseRules(bySlug[gameSlug], gameSlug)
    /** Another user occupied `new`: current editor becomes host and gets a fresh timeline. */
    const newSlotTakeover =
      gameSlug === 'new' && prev && prev.hostUserId != null && prev.hostUserId !== editorUserId
    const completingPublish = shouldResetStoresForNewSlugPublish(gameSlug, {
      setupComplete: input.setupComplete === true,
      forceNewGameInstance: input.forceNewGameInstance,
      prev,
      editorUserId,
    })
    const freshTimeline = Boolean(newSlotTakeover || completingPublish)
    const startsAtIso = freshTimeline ? new Date().toISOString() : (prev?.startsAtIso ?? new Date().toISOString())
    const endsAtIso = computeGameEndIso(startsAtIso, input.durationPreset, input.customEndsOn)
    if (!endsAtIso) {
      throw new Error('Could not compute game end date from the selected duration.')
    }
    const hostUserId =
      gameSlug === 'new' && prev && prev.hostUserId !== editorUserId
        ? editorUserId
        : (prev?.hostUserId ?? editorUserId)
    const themePaletteId =
      input.themePaletteId ?? prev?.themePaletteId ?? defaultPaletteIdForSlug(gameSlug)
    const loadScreenEmoji =
      input.loadScreenEmoji !== undefined
        ? sanitizeLoadScreenEmoji(input.loadScreenEmoji)
        : (prev?.loadScreenEmoji ?? sanitizeLoadScreenEmoji('🍁'))
    const hostDisplayName =
      input.hostDisplayName !== undefined ? input.hostDisplayName.trim().slice(0, 80) : (prev?.hostDisplayName ?? '')
    const setupComplete = input.setupComplete ?? prev?.setupComplete ?? false
    let joinCode: string | null = freshTimeline ? null : (prev?.joinCode ?? null)
    joinCode = normalizeSixDigitJoinCode(joinCode)
    if (setupComplete) {
      const taken = await loadTakenJoinCodes({ version: 1, bySlug })
      const prevCode = normalizeSixDigitJoinCode(prev?.joinCode)
      if (prevCode) taken.delete(prevCode)
      if (!joinCode || taken.has(joinCode)) {
        joinCode = allocateJoinCodeFromTaken(taken)
      }
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
    await writeFileRaw({ version: 1, bySlug })
    return next
  })
}

/**
 * Patch `endsAtIso` for one slug (e.g. “end game now”). Serialized with every other rules-store write.
 */
export async function forceGameEndIsoInStore(gameSlug: string, endsAtIso: string): Promise<void> {
  await runSerializedByKey(RULES_PATH, async () => {
    try {
      const f = await readFileRaw()
      const row = f.bySlug?.[gameSlug]
      if (!row || typeof row !== 'object') return
      const bySlug = {
        ...(f.bySlug ?? {}),
        [gameSlug]: {
          ...(row as Record<string, unknown>),
          endsAtIso,
          updatedAtIso: new Date().toISOString(),
        },
      }
      await writeFileRaw({ version: 1, bySlug })
    } catch {
      /* no rules file on disk — nothing to force */
    }
  })
}
