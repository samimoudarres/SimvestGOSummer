export type GameChallengeVariant = 'nov2024' | 'template' | 'custom'

export const GAME_SLUG = {
  nov2024: 'nov-2024-stock-challenge',
  newTemplate: 'new',
} as const

export function slugToVariant(slug: string): GameChallengeVariant {
  if (slug === GAME_SLUG.newTemplate) return 'template'
  if (slug === GAME_SLUG.nov2024) return 'nov2024'
  return 'custom'
}

export function gameTitle(variant: GameChallengeVariant): string {
  if (variant === 'template') return 'New game'
  if (variant === 'nov2024') return 'Nov. 2024 Stock Challenge'
  return 'Challenge'
}

export function gameHostLine(variant: GameChallengeVariant): string {
  if (variant === 'template') return 'Add a host'
  if (variant === 'nov2024') return 'Hosted by John Smith'
  return 'Hosted game'
}

/** Challenges shown in trade / buy flows (slug + display name). */
export const GAME_OPTIONS: { slug: string; title: string }[] = [
  { slug: GAME_SLUG.nov2024, title: 'Nov. 2024 Stock Challenge' },
  { slug: GAME_SLUG.newTemplate, title: 'New game' },
]
