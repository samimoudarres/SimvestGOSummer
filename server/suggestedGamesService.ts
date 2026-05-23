/**
 * Suggested-games surface for the home screen (paginated rotation).
 * Eligibility and sorting live in `publicGamesCatalogService`.
 */

import {
  listPublicCatalogItems,
  type PublicGameCatalogItem,
  type PublicGameTheme,
} from './publicGamesCatalogService'

/** Shown on the new-player home empty state; refresh rotates by this stride. */
export const SUGGESTED_PAGE_SIZE = 3

export type SuggestedGameTheme = PublicGameTheme

export type SuggestedGameDto = PublicGameCatalogItem & {
  /** Legacy field kept for home cards that still reference it. */
  playerLine: string
}

export type SuggestedGamesPayload = {
  games: SuggestedGameDto[]
  /** How many live public games matched (after excluding the viewer's own). */
  totalEligible: number
  pageSize: number
}

function toSuggestedDto(item: PublicGameCatalogItem): SuggestedGameDto {
  const count = item.playerCount
  const playerLine =
    count <= 0
      ? 'Be the first to join'
      : count === 1
        ? '1 player has joined'
        : `${count} players have joined`
  return { ...item, playerLine }
}

/**
 * Build the suggestions list. `viewerUserId` may be `null` for an
 * unauthenticated probe (we still return suggestions, just without the
 * "exclude games you already joined" filter).
 *
 * `offset` selects a rotating window of `SUGGESTED_PAGE_SIZE` games from the
 * full sorted pool (stride matches page size so each refresh advances to the
 * next slice, wrapping).
 */
export async function buildSuggestedGames(
  viewerUserId: string | null,
  offsetRaw = 0,
): Promise<SuggestedGamesPayload> {
  const offsetBase =
    typeof offsetRaw === 'number' && Number.isFinite(offsetRaw) && offsetRaw >= 0
      ? Math.min(Math.floor(offsetRaw), 1_000_000)
      : 0

  const allItems = await listPublicCatalogItems(viewerUserId)
  const allDtos = allItems.map(toSuggestedDto)
  const n = allDtos.length

  if (n === 0) {
    return { games: [], totalEligible: 0, pageSize: SUGGESTED_PAGE_SIZE }
  }

  if (n <= SUGGESTED_PAGE_SIZE) {
    return { games: allDtos, totalEligible: n, pageSize: SUGGESTED_PAGE_SIZE }
  }

  const start = offsetBase % n
  const games: SuggestedGameDto[] = []
  for (let i = 0; i < SUGGESTED_PAGE_SIZE; i++) {
    games.push(allDtos[(start + i) % n]!)
  }
  return { games, totalEligible: n, pageSize: SUGGESTED_PAGE_SIZE }
}
