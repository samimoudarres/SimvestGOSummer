import { readSessionJson, writeSessionJson } from '../lib/sessionJsonCache'
import { viewerScopedCacheKey } from '../lib/viewerScopedCacheKey'
import type { GameMemberPreview } from './useGameMembersPreview'

const MAX_AGE_MS = 2 * 60_000

export type CachedMembersPreview = {
  totalPlayers: number
  members: GameMemberPreview[]
}

function key(slug: string): string {
  return viewerScopedCacheKey('simvest-members-preview-v1', slug.trim().toLowerCase())
}

export function readCachedMembersPreview(slug: string): CachedMembersPreview | null {
  const data = readSessionJson<CachedMembersPreview>(key(slug), MAX_AGE_MS)
  if (!data || !Array.isArray(data.members) || typeof data.totalPlayers !== 'number') return null
  return data
}

export function writeCachedMembersPreview(
  slug: string,
  totalPlayers: number,
  members: GameMemberPreview[],
): void {
  writeSessionJson(key(slug), { totalPlayers, members })
}
