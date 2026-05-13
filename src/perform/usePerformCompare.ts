import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { ChartRange } from '../stocks/stockDetailTypes'
import type { PerformCompareChartPayload } from './performTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePerformCompare(gameSlug: string | undefined, range: ChartRange, withTokens: string[]) {
  const [data, setData] = useState<PerformCompareChartPayload | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [refreshBump, setRefreshBump] = useState(0)
  /** Same slug+range+comparisons as last fetch — when only refreshBump changes, keep chart visible (background refresh). */
  const lastFetchKeyRef = useRef<string>('')

  const withParam = [...new Set(withTokens)].sort().join(',')

  useEffect(() => {
    if (!gameSlug) return
    let cancelled = false
    const fetchKey = `${gameSlug}|${range}|${withParam}`
    const isBackgroundPoll = fetchKey === lastFetchKeyRef.current && refreshBump > 0
    lastFetchKeyRef.current = fetchKey
    if (!isBackgroundPoll) {
      setStatus('loading')
      setError(null)
    }

    const q = new URLSearchParams()
    q.set('range', range)
    if (withParam.length > 0) q.set('with', withParam)
    if (refreshBump > 0) q.set('cb', String(refreshBump))

    const url = `/api/games/${encodeURIComponent(gameSlug)}/perform/compare?${q}`

    simvestFetch(url)
      .then((r) =>
        r
          .json()
          .then((body) => ({ ok: r.ok, body }))
          .catch(() => ({ ok: false, body: { error: 'Bad response' } })),
      )
      .then(({ ok, body }) => {
        if (cancelled) return
        if (ok && body && typeof body === 'object' && Array.isArray(body.series)) {
          const p = body as PerformCompareChartPayload
          const now = Date.now()
          const payload: PerformCompareChartPayload = {
            ...p,
            sampledAtMs: Array.isArray(p.sampledAtMs) ? p.sampledAtMs : [],
            domainStartMs: typeof p.domainStartMs === 'number' ? p.domainStartMs : now,
            domainEndMs: typeof p.domainEndMs === 'number' ? p.domainEndMs : now,
          }
          setData(payload)
          setStatus('ready')
        } else if (isBackgroundPoll) {
          setStatus('ready')
        } else {
          setError(typeof body?.error === 'string' ? body.error : 'Compare chart failed')
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
  }, [gameSlug, range, withParam, refreshBump])

  useEffect(() => {
    if (!gameSlug) return
    const onHoldingsRefresh = (ev: Event) => {
      const slug = (ev as CustomEvent<{ gameSlug?: string }>).detail?.gameSlug
      if (!slug || slug === gameSlug) setRefreshBump((b) => b + 1)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') setRefreshBump((b) => b + 1)
    }
    window.addEventListener('simvest:holdings-refresh', onHoldingsRefresh)
    document.addEventListener('visibilitychange', onVisible)
    const t = window.setInterval(() => setRefreshBump((b) => b + 1), 10_000)
    return () => {
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(t)
    }
  }, [gameSlug])

  return { data, status, error }
}
