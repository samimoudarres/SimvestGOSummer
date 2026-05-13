import type { ThemePaletteId } from '../game/gameThemePresets'
import type { TradeCategoryId } from '../trade/tradeTypes'

export type DurationPreset = '1d' | '1w' | '1m' | '1y' | 'custom'

export type AssetsMode = 'all' | 'stocks_only' | 'crypto_only' | 'category'

export type VisibilityMode = 'public' | 'private'

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
}
