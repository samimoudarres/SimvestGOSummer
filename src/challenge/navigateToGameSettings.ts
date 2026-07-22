/** Open Activity with the game settings popover (⋯ menu on other tabs). */
export function navigateToGameSettings(
  navigate: (to: string, opts?: { state?: unknown; replace?: boolean }) => void,
  gameSlug: string,
): void {
  const slug = gameSlug.trim()
  if (!slug) return
  navigate(`/g/${encodeURIComponent(slug)}`, { state: { openGameSettings: true } })
}
