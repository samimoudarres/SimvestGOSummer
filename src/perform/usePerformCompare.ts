import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCacheStale,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import type { ChartRange } from '../stocks/stockDetailTypes'
import type { PerformCompareChartPayload } from './performTypes'
import {
  PERFORM_COMPARE_CACHE_MS,
  normalizeCompareChartPayload,
  performCompareChartCacheKey,
  performCompareChartUrl,
  prefetchPerformCompareRanges,
} from './performChartPrefetch'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePerformCompare(gameSlug: string | undefined, range: ChartRange, withTokens: string[]) {
  const withParam = [...new Set(withTokens)].sort().join(',')
  const initialKey = gameSlug ? performCompareChartCacheKey(gameSlug, range, withParam) : ''
  const cachedInitial = initialKey
    ? readSimvestJsonCacheStale<PerformCompareChartPayload>(initialKey)
    : undefined

  const [data, setData] = useState<PerformCompareChartPayload | null>(() => cachedInitial ?? null)
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const [refreshBump, setRefreshBump] = useState(0)
  const hasDataRef = useRef(!!cachedInitial)
  const scopeRef = useRef(`${gameSlug}|${withParam}`)

  useEffect(() => {
    hasDataRef.current = !!data?.series?.length
  }, [data])

  useEffect(() => {
    if (!gameSlug) return
    let cancelled = false
    const scope = `${gameSlug}|${withParam}`
    const scopeChanged = scopeRef.current !== scope
    scopeRef.current = scope

    const key = performCompareChartCacheKey(gameSlug, range, withParam)
    const cached = readSimvestJsonCacheStale<PerformCompareChartPayload>(key)
    const isBackgroundPoll = !scopeChanged && refreshBump > 0 && hasDataRef.current

    if (cached?.series?.length) {
      setData(cached)
      hasDataRef.current = true
      setStatus('ready')
      setError(null)
    } else if (scopeChanged) {
      setData(null)
      hasDataRef.current = false
      setStatus('loading')
      setError(null)
    } else if (!isBackgroundPoll) {
      setStatus(hasDataRef.current ? 'ready' : 'loading')
      setError(null)
    }

    prefetchPerformCompareRanges(gameSlug, withParam ? withParam.split(',').filter(Boolean) : [])

    const url = performCompareChartUrl(gameSlug, range, withParam, refreshBump > 0 ? refreshBump : undefined)
    void dedupeSimvestJsonFetch(`${key}|${refreshBump}`, async () => {
      const r = await simvestFetch(url)
      const body = await r.json().catch(() => ({ error: 'Bad response' }))
      return { ok: r.ok, body }
    })
      .then(({ ok, body }) => {
        if (cancelled) return
        if (ok) {
          const payload = normalizeCompareChartPayload(body)
          if (payload) {
            writeSimvestJsonCache(key, payload, PERFORM_COMPARE_CACHE_MS)
            setData(payload)
            hasDataRef.current = true
            setStatus('ready')
            setError(null)
          } else if (isBackgroundPoll || hasDataRef.current) {
            setStatus('ready')
          } else {
            setError(typeof body?.error === 'string' ? body.error : 'Compare chart failed')
            setData(null)
            setStatus('error')
          }
        } else if (isBackgroundPoll || hasDataRef.current) {
          setStatus('ready')
        } else {
          setError(typeof body?.error === 'string' ? body.error : 'Compare chart failed')
          setData(null)
          setStatus('error')
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (isBackgroundPoll || hasDataRef.current) {
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
    const stopPoll = visibilityAwareInterval(() => setRefreshBump((b) => b + 1), {
      visibleMs: 12_000,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
      runOnVisible: false,
    })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
      document.removeEventListener('visibilitychange', onVisible)
      stopPoll()
    }
  }, [gameSlug])

  return { data, status, error }
}
