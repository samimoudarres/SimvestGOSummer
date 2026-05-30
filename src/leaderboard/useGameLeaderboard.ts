import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { LeaderboardPayload, LeaderboardSortKey } from './leaderboardTypes'
import { readCachedLeaderboard, writeCachedLeaderboard } from './leaderboardSessionCache'

type Status = 'idle' | 'loading' | 'ok' | 'error'

export function useGameLeaderboard(gameSlug: string | undefined, sort: LeaderboardSortKey) {
  const cachedInitial =
    gameSlug && sort ? readCachedLeaderboard(gameSlug, sort) : null
  const [data, setData] = useState<LeaderboardPayload | null>(() => cachedInitial)
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ok' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(!!cachedInitial)
  const skipInitialLoadingUiRef = useRef(!!cachedInitial)

  useEffect(() => {
    if (!gameSlug) return
    const cached = readCachedLeaderboard(gameSlug, sort)
    hasDataRef.current = !!cached
    skipInitialLoadingUiRef.current = !!cached
    if (cached) {
      setData(cached)
      setStatus('ok')
      setError(null)
    } else {
      setData(null)
      setStatus('idle')
      hasDataRef.current = false
    }
  }, [sort, gameSlug])

  const load = useCallback(async () => {
    if (!gameSlug) return
    const silent = skipInitialLoadingUiRef.current || hasDataRef.current
    skipInitialLoadingUiRef.current = false
    if (!silent) {
      setStatus('loading')
      setError(null)
    }
    try {
      const q = encodeURIComponent(sort)
      const res = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/leaderboard?sort=${q}`)
      if (!res.ok) {
        throw new Error(`Leaderboard failed (${res.status})`)
      }
      const json = (await res.json()) as LeaderboardPayload
      setData(json)
      writeCachedLeaderboard(gameSlug, sort, json)
      hasDataRef.current = true
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
