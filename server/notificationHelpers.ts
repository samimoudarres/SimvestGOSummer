import { gameTitle, slugToVariant } from '../src/challenge/gameMeta'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { canonicalGameSlugKey } from './gameSlugNormalize'

export async function resolveGameDisplayName(gameSlug: string): Promise<string> {
  const slug = canonicalGameSlugKey(gameSlug)
  if (!slug) return 'your game'
  const rules = await getRuntimeRules(slug)
  const fromRules = rules?.gameDisplayName?.trim()
  if (fromRules) return fromRules
  return gameTitle(slugToVariant(slug))
}

export function clipNotificationText(text: string, max = 110): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function formatSignedPct(pct: number): string {
  const n = Math.round(pct * 10) / 10
  const sign = n > 0 ? '+' : ''
  return `${sign}${n}%`
}

export function gameFeedPath(gameSlug: string): string {
  return `/g/${encodeURIComponent(canonicalGameSlugKey(gameSlug) || gameSlug)}`
}

export function joinRequestsPath(gameSlug: string): string {
  return `/g/${encodeURIComponent(canonicalGameSlugKey(gameSlug) || gameSlug)}/join-requests`
}

export function stockDetailPath(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker.trim().toUpperCase())}`
}
