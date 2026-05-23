/**
 * Suggested games hook for `SimvestHome` empty state.
 *
 * Hits `GET /api/games/suggested?offset=` (offset strides by page size for
 * "show more" rotation). Re-loads on:
 *   - mount (offset 0)
 *   - tab regaining focus (keeps current offset)
 *   - `simvest:activity-refresh` / holdings (offset reset so joined games drop out)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { PublicGameItem } from '../join/publicGamesTypes'

/** Must stay in sync with `SUGGESTED_PAGE_SIZE` in `server/suggestedGamesService.ts`. */
const SUGGESTED_PAGE_STRIDE = 3

export type SuggestedGame = PublicGameItem & {
  playerLine: string
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

type LoadWhy = 'mount' | 'visibility' | 'activity' | 'rotate'

export type UseSuggestedGamesResult = {
  games: SuggestedGame[]
  totalEligible: number
  pageSize: number
  /** True when more than one page of suggestions exists (refresh shows a different triple). */
  canRotateMore: boolean
  /** True while a suggestions request is in flight (including silent refresh). */
  busy: boolean
  status: LoadStatus
  error: string | null
  /** Resets rotation and reloads (errors, activity after join). */
  reload: () => void
  /** Advances rotation and fetches the next window (no-op if `canRotateMore` is false). */
  rotate: () => void
}

export function useSuggestedGames(enabled: boolean): UseSuggestedGamesResult {
  const [games, setGames] = useState<SuggestedGame[]>([])
  const [totalEligible, setTotalEligible] = useState(0)
  const [pageSize, setPageSize] = useState(SUGGESTED_PAGE_STRIDE)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const inflightRef = useRef(false)
  const rotateOffsetRef = useRef(0)

  const load = useCallback(async (why: LoadWhy) => {
    if (inflightRef.current) return
    if (why === 'mount' || why === 'activity') {
      rotateOffsetRef.current = 0
    }
    if (why === 'rotate') {
      rotateOffsetRef.current += SUGGESTED_PAGE_STRIDE
    }

    inflightRef.current = true
    setBusy(true)
    const silent = why === 'rotate' || why === 'visibility'
    setStatus((prev) => (silent && prev === 'ready' ? 'ready' : 'loading'))
    setError(null)

    try {
      const offset = rotateOffsetRef.current
      const resp = await simvestFetch(`/api/games/suggested?offset=${encodeURIComponent(String(offset))}`, {
        method: 'GET',
      })
      if (!resp.ok) {
        if (why === 'rotate') {
          rotateOffsetRef.current -= SUGGESTED_PAGE_STRIDE
        }
        setStatus('error')
        setError(`Suggestions request failed (${resp.status})`)
        return
      }
      const body = (await resp.json()) as {
        games?: SuggestedGame[]
        totalEligible?: number
        pageSize?: number
      }
      setGames(Array.isArray(body.games) ? body.games : [])
      setTotalEligible(typeof body.totalEligible === 'number' ? body.totalEligible : 0)
      setPageSize(typeof body.pageSize === 'number' ? body.pageSize : SUGGESTED_PAGE_STRIDE)
      setStatus('ready')
    } catch (err) {
      if (why === 'rotate') {
        rotateOffsetRef.current -= SUGGESTED_PAGE_STRIDE
      }
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not load suggestions')
    } finally {
      inflightRef.current = false
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setGames([])
      setTotalEligible(0)
      setPageSize(SUGGESTED_PAGE_STRIDE)
      setBusy(false)
      setStatus('idle')
      setError(null)
      rotateOffsetRef.current = 0
      return
    }
    void load('mount')
    const onVis = () => {
      if (document.visibilityState === 'visible') void load('visibility')
    }
    const onActivity = () => void load('activity')
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('simvest:activity-refresh', onActivity)
    window.addEventListener('simvest:holdings-refresh', onActivity)
    const pollId = window.setInterval(() => void load('visibility'), 25_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('simvest:activity-refresh', onActivity)
      window.removeEventListener('simvest:holdings-refresh', onActivity)
      window.clearInterval(pollId)
    }
  }, [enabled, load])

  const reload = useCallback(() => void load('activity'), [load])

  const rotate = useCallback(() => {
    if (totalEligible <= SUGGESTED_PAGE_STRIDE) return
    void load('rotate')
  }, [load, totalEligible])

  const canRotateMore = totalEligible > SUGGESTED_PAGE_STRIDE

  return {
    games,
    totalEligible,
    pageSize,
    canRotateMore,
    busy,
    status,
    error,
    reload,
    rotate,
  }
}
