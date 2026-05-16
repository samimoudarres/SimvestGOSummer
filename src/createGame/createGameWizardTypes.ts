import type { ThemePaletteId } from '../game/gameThemePresets'
import { TRADE_CATEGORY_OPTIONS, type TradeCategoryId } from '../trade/tradeTypes'

export type DurationPreset = '1d' | '1w' | '1m' | '1y' | 'custom'

export type AssetsMode = 'all' | 'stocks_only' | 'crypto_only' | 'category'

/** Host wizard choices while crypto trading is paused (no crypto-only / stocks+crypto). */
export const CREATE_GAME_ASSET_OPTIONS: { id: AssetsMode; label: string }[] = [
  { id: 'stocks_only', label: 'All stocks' },
  { id: 'category', label: 'Single category (industry)' },
]

export type VisibilityMode = 'public' | 'private'

/** Stock browse categories hosts may pick — excludes crypto. */
export const CREATE_GAME_CATEGORY_OPTIONS = TRADE_CATEGORY_OPTIONS.filter((c) => c.id !== 'crypto')

/** Map legacy saved modes to a wizard-safe value. */
export function normalizeCreateGameAssetsMode(mode: AssetsMode): AssetsMode {
  if (mode === 'category') return 'category'
  if (mode === 'crypto_only' || mode === 'all') return 'stocks_only'
  return 'stocks_only'
}

/** Mirrors server `GameRuntimeRules` fields needed by the wizard. */
export type CreateGameSettingsDto = {
  hostUserId: string | null
  gameDisplayName: string
  durationPreset: DurationPreset
  customEndsOn: string | null
  startsAtIso: string
  endsAtIso: string | null
  assetsMode: AssetsMode
  assetsCategory: TradeCategoryId | null
  visibility: VisibilityMode
  themePaletteId: ThemePaletteId
  loadScreenEmoji: string
  hostDisplayName: string
  setupComplete: boolean
  updatedAtIso: string
}

export type CreateGameSettingsPutBody = {
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
  /** Only sent from the final create step; tells the server to wipe stale `new`-slug data. */
  forceNewGameInstance?: boolean
}
