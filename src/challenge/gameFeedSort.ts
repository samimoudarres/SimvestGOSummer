import type { GameFeedPostRow } from './useGameFeed'

export type ActivitySortMode = 'recent' | 'top_gain' | 'purchase_amount'

export const ACTIVITY_SORT_MODES: ActivitySortMode[] = ['recent', 'top_gain', 'purchase_amount']

/** Parse display like "+1.36%", "-4.91%", "—" → signed number or null. */
export function parseSincePurchasePct(s: string): number | null {
  const raw = String(s ?? '')
    .trim()
    .replace(/%/g, '')
    .replace(/[−–]/g, '-')
    .replace(/,/g, '')
  if (!raw || raw === '—' || raw === '-') return null
  const n = Number.parseFloat(raw.replace(/^\+/, ''))
  return Number.isFinite(n) ? n : null
}

/** Parse "$2,794.44" → dollars or null. */
export function parseOrderTotalUsd(s: string): number | null {
  const raw = String(s ?? '').replace(/[$\s]/g, '').replace(/,/g, '')
  if (!raw || raw === '—') return null
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

export function postedAtMs(post: GameFeedPostRow): number {
  if (post.postedAtIso) {
    const ms = Date.parse(post.postedAtIso)
    if (!Number.isNaN(ms)) return ms
  }
  return 0
}

export function activitySortLabels(): Record<ActivitySortMode, string> {
  return {
    recent: 'Most Recent',
    top_gain: 'Top Gain (since purchase)',
    purchase_amount: 'Purchase Amount',
  }
}

export function sortFeedPosts(posts: GameFeedPostRow[], mode: ActivitySortMode): GameFeedPostRow[] {
  const out = [...posts]
  const byRecent = (a: GameFeedPostRow, b: GameFeedPostRow) => postedAtMs(b) - postedAtMs(a)

  out.sort((a, b) => {
    if (mode === 'recent') {
      return byRecent(a, b)
    }

    if (mode === 'top_gain') {
      const ak = parseSincePurchasePct(a.changePct)
      const bk = parseSincePurchasePct(b.changePct)
      const aFin = ak != null
      const bFin = bk != null
      if (aFin && bFin && bk !== ak) return bk - ak // higher % first (descending)
      if (aFin && !bFin) return -1 // finite before unknown
      if (!aFin && bFin) return 1
      return byRecent(a, b)
    }

    if (mode === 'purchase_amount') {
      const ao = parseOrderTotalUsd(a.orderTotal)
      const bo = parseOrderTotalUsd(b.orderTotal)
      const aFin = ao != null
      const bFin = bo != null
      if (aFin && bFin && bo !== ao) return bo - ao // larger order first (descending)
      if (aFin && !bFin) return -1
      if (!aFin && bFin) return 1
      return byRecent(a, b)
    }

    return byRecent(a, b)
  })

  return out
}
