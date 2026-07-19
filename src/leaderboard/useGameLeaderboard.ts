import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import type { LeaderboardPayload, LeaderboardSortKey } from './leaderboardTypes'
import { readCachedLeaderboard, writeCachedLeaderboard } from './leaderboardSessionCache'
import { prefetchLeaderboardAllSorts } from './leaderboardPrefetch'

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
    prefetchLeaderboardAllSorts(gameSlug)
    const cached = readCachedLeaderboard(gameSlug, sort)
    if (cached) {
      setData(cached)
      hasDataRef.current = true
      skipInitialLoadingUiRef.current = true
      setStatus('ok')
      setError(null)
    } else {
      /* Keep previous sort’s rows on screen while the new sort loads. */
      skipInitialLoadingUiRef.current = hasDataRef.current
      if (!hasDataRef.current) {
        setStatus('idle')
      }
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
      setError(null)
    } catch (e) {
      if (!hasDataRef.current) {
        setError(e instanceof Error ? e.message : 'Could not load leaderboard')
        setStatus('error')
      }
    }
  }, [gameSlug, sort])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!gameSlug) return
    if (data?.gameFinished) return
    return visibilityAwareInterval(() => void load(), {
      visibleMs: 45_000,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
    })
  }, [gameSlug, load, data?.gameFinished])

  return { data, status, error, reload: load }
}
