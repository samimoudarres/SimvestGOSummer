import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import { readCachedLeaderboard, writeCachedLeaderboard } from '../leaderboard/leaderboardSessionCache'
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
  const cachedInitial =
    enabled && gameSlug ? readCachedLeaderboard(gameSlug, 'today') : null
  const [rows, setRows] = useState<TopGainStripRow[]>(() =>
    cachedInitial ? mapRows(cachedInitial.rows) : [],
  )
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(!!cachedInitial)
  const skipLoadingUiRef = useRef(!!cachedInitial)

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!gameSlug || !enabled) return
      const silent =
        mode === 'refresh'
          ? hasLoadedRef.current
          : skipLoadingUiRef.current || hasLoadedRef.current
      if (mode === 'initial') skipLoadingUiRef.current = false
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
        writeCachedLeaderboard(gameSlug, 'today', json)
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
    if (!enabled || !gameSlug) {
      hasLoadedRef.current = false
      skipLoadingUiRef.current = false
      setRows([])
      setStatus('idle')
      setError(null)
      return
    }
    const cached = readCachedLeaderboard(gameSlug, 'today')
    hasLoadedRef.current = !!cached
    skipLoadingUiRef.current = !!cached
    if (cached) {
      setRows(mapRows(cached.rows))
      setStatus('ready')
      setError(null)
    } else {
      setRows([])
      setStatus('idle')
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
    window.addEventListener('simvest:activity-refresh', onActivity)
    window.addEventListener('simvest:holdings-refresh', onHoldings)
    const stopPoll = visibilityAwareInterval(tick, {
      visibleMs: REFRESH_MS,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
    })
    return () => {
      window.removeEventListener('simvest:activity-refresh', onActivity)
      window.removeEventListener('simvest:holdings-refresh', onHoldings)
      stopPoll()
    }
  }, [enabled, gameSlug, load])

  return { rows, status, error, reload: () => void load('refresh') }
}
