import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { LeaderboardPayload, LeaderboardRow } from '../leaderboard/leaderboardTypes'

const TOP_N = 5
const REFRESH_MS = 20_000

export type TopGainStripRow = {
  userId: string
  displayName: string
  displayNameShort: string
  avatarUrl: string
  pctLabel: string
  positive: boolean
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

function shortName(name: string, max = 13): string {
  const t = name.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1)).trim()}…`
}

function mapRows(rows: LeaderboardRow[]): TopGainStripRow[] {
  return rows.slice(0, TOP_N).map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    displayNameShort: shortName(r.displayName),
    avatarUrl: r.avatarUrl,
    pctLabel: r.sortMetricLabel,
    positive: r.positive,
  }))
}

/**
 * Top players by today's portfolio return (same calculation as leaderboard "Today's Return").
 */
export function useGameTopGainsToday(gameSlug: string | undefined, enabled: boolean) {
  const [rows, setRows] = useState<TopGainStripRow[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!gameSlug || !enabled) return
      const silent = mode === 'refresh' && hasLoadedRef.current
      if (!silent) {
        setStatus('loading')
        setError(null)
      }
      try {
        const res = await simvestFetch(
          `/api/games/${encodeURIComponent(gameSlug)}/leaderboard?sort=${encodeURIComponent('today')}`,
        )
        const json = (await res.json().catch(() => ({}))) as LeaderboardPayload & { error?: string }
        if (!res.ok) {
          throw new Error(typeof json.error === 'string' ? json.error : `Request failed (${res.status})`)
        }
        setRows(mapRows(json.rows ?? []))
        hasLoadedRef.current = true
        setStatus('ready')
      } catch (e) {
        if (!silent) {
          setError(e instanceof Error ? e.message : 'Could not load top gains')
          setStatus('error')
          setRows([])
        }
      }
    },
    [gameSlug, enabled],
  )

  useEffect(() => {
    hasLoadedRef.current = false
    if (!enabled || !gameSlug) {
      setRows([])
      setStatus('idle')
      setError(null)
      return
    }
    void load('initial')
  }, [enabled, gameSlug, load])

  useEffect(() => {
    if (!enabled || !gameSlug) return
    const tick = () => void load('refresh')
    const onActivity = (ev: Event) => {
      const d = (ev as CustomEvent<{ gameSlug?: string }>).detail
      if (!d?.gameSlug || d.gameSlug === gameSlug) tick()
    }
    const onHoldings = (ev: Event) => {
      const d = (ev as CustomEvent<{ gameSlug?: string }>).detail
      if (!d?.gameSlug || d.gameSlug === gameSlug) tick()
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    window.addEventListener('simvest:activity-refresh', onActivity)
    window.addEventListener('simvest:holdings-refresh', onHoldings)
    document.addEventListener('visibilitychange', onVis)
    const id = window.setInterval(tick, REFRESH_MS)
    return () => {
      window.removeEventListener('simvest:activity-refresh', onActivity)
      window.removeEventListener('simvest:holdings-refresh', onHoldings)
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(id)
    }
  }, [enabled, gameSlug, load])

  return { rows, status, error, reload: () => void load('refresh') }
}
