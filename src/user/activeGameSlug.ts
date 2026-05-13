const STORAGE_KEY = 'simvest-active-game-slug-v1'

/** Remember last game route the user visited so stock buy defaults match that game. */
export function rememberActiveGameSlug(slug: string | undefined): void {
  const s = typeof slug === 'string' ? slug.trim() : ''
  if (s.length < 2) return
  try {
    localStorage.setItem(STORAGE_KEY, s)
  } catch {
    /* private mode / quota */
  }
}

export function readActiveGameSlug(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim()
    return v && v.length >= 2 ? v : null
  } catch {
    return null
  }
}
