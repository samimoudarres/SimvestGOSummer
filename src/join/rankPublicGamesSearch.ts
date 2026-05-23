import type { PublicGameItem } from './publicGamesTypes'

/**
 * Rank public games while typing: title matches first, then host, dates, rules, code.
 * When the query is empty, preserve popularity order from the API (player count).
 */
export function rankPublicGamesForQuery(games: PublicGameItem[], queryRaw: string): PublicGameItem[] {
  const q = queryRaw.trim().toLowerCase()
  if (!q) return games

  const tokens = q.split(/\s+/).filter(Boolean)

  const score = (g: PublicGameItem): number => {
    const title = g.title.toLowerCase()
    const host = (g.hostedByLine ?? '').toLowerCase()
    const blob = g.searchText || ''

    let s = 0
    if (title.includes(q)) s += 10_000
    if (title.startsWith(q)) s += 5_000
    if (host.includes(q)) s += 4_000
    if (g.joinCode.includes(q.replace(/\D/g, '')) && q.replace(/\D/g, '').length >= 2) s += 3_500
    if (g.durationLine.toLowerCase().includes(q)) s += 2_500
    if (g.rulesSummary.toLowerCase().includes(q)) s += 2_000
    if (blob.includes(q)) s += 800

    for (const tok of tokens) {
      if (title.includes(tok)) s += 600
      else if (host.includes(tok)) s += 400
      else if (blob.includes(tok)) s += 150
    }

    return s
  }

  return [...games]
    .map((g, index) => ({ g, index, s: score(g) }))
    .filter((row) => row.s > 0)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s
      if (b.g.playerCount !== a.g.playerCount) return b.g.playerCount - a.g.playerCount
      return a.index - b.index
    })
    .map((row) => row.g)
}
