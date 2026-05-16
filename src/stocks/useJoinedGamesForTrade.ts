import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMyJoinedGames } from '../api/myGamesApi'

export type JoinedGameForTrade = { slug: string; title: string }

type Status = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Live list of competitions the viewer is actively a member of, used to populate
 * the "Competition" dropdown in the buy/sell sheets. Backed by `/api/me/games`,
 * so the list reflects the player's real membership in real time (no static
 * placeholders). Refetches whenever `enabled` flips on so the dropdown is fresh
 * each time the player opens a trade sheet.
 */
export function useJoinedGamesForTrade(enabled: boolean): {
  games: JoinedGameForTrade[]
  status: Status
  refresh: () => void
} {
  const [games, setGames] = useState<JoinedGameForTrade[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [tick, setTick] = useState(0)
  const cancelledRef = useRef(false)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!enabled) return
    cancelledRef.current = false
    setStatus('loading')
    void (async () => {
      try {
        const list = await fetchMyJoinedGames()
        if (cancelledRef.current) return
        const mapped: JoinedGameForTrade[] = list
          .map((g) => ({ slug: g.slug, title: g.title }))
          .filter((g) => g.slug.length > 0 && g.title.length > 0)
        setGames(mapped)
        setStatus('ready')
      } catch {
        if (cancelledRef.current) return
        setGames([])
        setStatus('error')
      }
    })()
    return () => {
      cancelledRef.current = true
    }
  }, [enabled, tick])

  return { games, status, refresh }
}
