import { getRuntimeRules } from './gameRuntimeRulesService'
import {
  challengeVarsForPalette,
  resolvePalette,
  welcomeThemeForPalette,
} from '../src/game/gameThemePresets.ts'

/** Welcome / join palette colors for the Simvest home “your games” row (matches host theme step). */
export type HomeJoinedGameCardThemeJson = {
  joinButtonColor: string
  joinButtonBorderColor: string
  welcomeGradientAngleDeg: number
  welcomeGradientFrom: string
  welcomeGradientTo: string
  prizeAmountColor: string
  titleTextShadow?: string
}

/** Flat map for JSON + applying to inline style on client. */
export async function getGameChromeCssVarsForSlug(gameSlug: string): Promise<Record<string, string>> {
  const rules = await getRuntimeRules(gameSlug)
  const pid = resolvePalette(gameSlug, rules?.themePaletteId ?? null)
  const v = challengeVarsForPalette(pid)
  return { ...v } as Record<string, string>
}

export async function getHomeCardThemeForSlug(gameSlug: string): Promise<HomeJoinedGameCardThemeJson> {
  const rules = await getRuntimeRules(gameSlug)
  const pid = resolvePalette(gameSlug, rules?.themePaletteId ?? null)
  const w = welcomeThemeForPalette(pid)
  const out: HomeJoinedGameCardThemeJson = {
    joinButtonColor: w.joinButtonColor,
    joinButtonBorderColor: w.joinButtonBorderColor,
    welcomeGradientAngleDeg: w.welcomeGradientAngleDeg,
    welcomeGradientFrom: w.welcomeGradientFrom,
    welcomeGradientTo: w.welcomeGradientTo,
    prizeAmountColor: w.prizeAmountColor,
  }
  if (w.titleTextShadow && w.titleTextShadow.trim().length > 0) {
    out.titleTextShadow = w.titleTextShadow.trim()
  }
  return out
}
