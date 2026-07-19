/**
 * Warm only the JS chunk for a game tab — no API fan-out.
 * Session caches are filled when each screen mounts (SWR), which avoids saturating Massive.
 */
export type GameTabId = 'activity' | 'perform' | 'trade' | 'portfolio' | 'leaderboard'

const warmStarted = new Set<string>()

export function warmGameTabChunk(tab: GameTabId): void {
  if (warmStarted.has(tab)) return
  warmStarted.add(tab)
  if (tab === 'activity') {
    void import('../challenge/GameChallengeScreen')
    return
  }
  if (tab === 'perform') {
    void import('../perform/PerformScreen')
    return
  }
  if (tab === 'trade') {
    void import('../trade/TradeScreen')
    return
  }
  if (tab === 'portfolio') {
    void import('../portfolio/PortfolioScreen')
    return
  }
  void import('../leaderboard/LeaderboardScreen')
}

/** Warm all primary tabs after the user is already in a game (idle). */
export function warmAllGameTabChunksIdle(): void {
  const run = () => {
    warmGameTabChunk('activity')
    warmGameTabChunk('perform')
    warmGameTabChunk('trade')
    warmGameTabChunk('portfolio')
    warmGameTabChunk('leaderboard')
  }
  const ric = typeof window !== 'undefined' ? window.requestIdleCallback?.bind(window) : undefined
  if (ric) {
    ric(() => run(), { timeout: 2500 })
  } else {
    setTimeout(run, 400)
  }
}
