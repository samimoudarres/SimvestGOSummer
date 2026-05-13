import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { ChartRange, PlayerNetWorthChartPayload } from '../stocks/stockDetailTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

function normalizePayload(body: unknown): PlayerNetWorthChartPayload | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const bars = b.bars
  if (!Array.isArray(bars) || bars.length === 0) return null
  const first = bars[0] as Record<string, unknown> | undefined
  if (!first || typeof first.t !== 'number' || typeof first.c !== 'number') return null
  return body as PlayerNetWorthChartPayload
}

export function usePlayerNetWorthChart(
  gameSlug: string | undefined,
  userId: string | undefined,
  range: ChartRange,
  enabled: boolean,
) {
  const [data, setData] = useState<PlayerNetWorthChartPayload | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [refreshBump, setRefreshBump] = useState(0)
  const lastFetchKeyRef = useRef<string>('')

  useEffect(() => {
    if (!enabled || !gameSlug || !userId || userId.length < 8) {
      setData(null)
      setStatus('idle')
      setError(null)
      return
    }
    let cancelled = false
    const fetchKey = `${gameSlug}|${userId}|${range}`
    const isBackgroundPoll = fetchKey === lastFetchKeyRef.current && refreshBump > 0
    lastFetchKeyRef.current = fetchKey
    if (!isBackgroundPoll) {
      setStatus('loading')
      setError(null)
    }

    const q = new URLSearchParams()
    q.set('range', range)
    if (refreshBump > 0) q.set('cb', String(refreshBump))
    const url = `/api/games/${encodeURIComponent(gameSlug)}/users/${encodeURIComponent(userId)}/net-worth-chart?${q}`

    simvestFetch(url)
      .then((r) =>
        r
          .json()
          .then((body) => ({ ok: r.ok, body }))
          .catch(() => ({ ok: false, body: { error: 'Bad response' } })),
      )
      .then(({ ok, body }) => {
        if (cancelled) return
        if (ok) {
          const p = normalizePayload(body)
          if (p) {
            setData(p)
            setStatus('ready')
          } else if (isBackgroundPoll) {
            setStatus('ready')
          } else {
            setError('Invalid chart data')
            setData(null)
            setStatus('error')
          }
        } else if (isBackgroundPoll) {
          setStatus('ready')
        } else {
          setError(typeof (body as { error?: string })?.error === 'string' ? (body as { error: string }).error : 'Chart failed')
          setData(null)
          setStatus('error')
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (isBackgroundPoll) {
            setStatus('ready')
          } else {
            setError('Network error')
            setData(null)
            setStatus('error')
          }
        }
      })

    return () => {
      cancelled = true
    }
  }, [gameSlug, userId, range, enabled, refreshBump])

  useEffect(() => {
    if (!enabled || !gameSlug) return
    const onHoldingsRefresh = (ev: Event) => {
      const slug = (ev as CustomEvent<{ gameSlug?: string }>).detail?.gameSlug
      if (!slug || slug === gameSlug) setRefreshBump((x) => x + 1)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') setRefreshBump((x) => x + 1)
    }
    window.addEventListener('simvest:holdings-refresh', onHoldingsRefresh)
    document.addEventListener('visibilitychange', onVisible)
    const t = window.setInterval(() => setRefreshBump((x) => x + 1), 10_000)
    return () => {
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(t)
    }
  }, [gameSlug, enabled])

  return { data, status, error }
}
