import { useCallback, useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { LeaderboardPayload, LeaderboardSortKey } from './leaderboardTypes'

type Status = 'idle' | 'loading' | 'ok' | 'error'

export function useGameLeaderboard(gameSlug: string | undefined, sort: LeaderboardSortKey) {
  const [data, setData] = useState<LeaderboardPayload | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
  }, [sort, gameSlug])

  const load = useCallback(async () => {
    if (!gameSlug) return
    setStatus('loading')
    setError(null)
    try {
      const q = encodeURIComponent(sort)
      const res = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/leaderboard?sort=${q}`)
      if (!res.ok) {
        throw new Error(`Leaderboard failed (${res.status})`)
      }
      const json = (await res.json()) as LeaderboardPayload
      setData(json)
      setStatus('ok')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load leaderboard')
      setStatus('error')
    }
  }, [gameSlug, sort])

  useEffect(() => {
    void load()
  }, [load])

  /** Refresh when markets move — matches live perform/portfolio aggregates */
  useEffect(() => {
    if (!gameSlug) return
    if (data?.gameFinished) return
    const id = window.setInterval(() => void load(), 45_000)
    return () => window.clearInterval(id)
  }, [gameSlug, load, data?.gameFinished])

  return { data, status, error, reload: load }
}
