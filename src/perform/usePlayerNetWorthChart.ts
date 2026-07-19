import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCacheStale,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import type { ChartRange, PlayerNetWorthChartPayload } from '../stocks/stockDetailTypes'
import {
  PERFORM_NW_CACHE_MS,
  normalizeNetWorthChartPayload,
  performNetWorthChartCacheKey,
  performNetWorthChartUrl,
  prefetchNetWorthChartRanges,
} from './performChartPrefetch'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePlayerNetWorthChart(
  gameSlug: string | undefined,
  userId: string | undefined,
  range: ChartRange,
  enabled: boolean,
) {
  const initialKey =
    enabled && gameSlug && userId && userId.length >= 8
      ? performNetWorthChartCacheKey(gameSlug, userId, range)
      : ''
  const cachedInitial = initialKey
    ? readSimvestJsonCacheStale<PlayerNetWorthChartPayload>(initialKey)
    : undefined

  const [data, setData] = useState<PlayerNetWorthChartPayload | null>(() => cachedInitial ?? null)
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const [refreshBump, setRefreshBump] = useState(0)
  const identityRef = useRef(`${gameSlug}|${userId}`)
  const hasDataRef = useRef(!!cachedInitial)

  useEffect(() => {
    hasDataRef.current = !!data?.bars?.length
  }, [data])

  useEffect(() => {
    if (!enabled || !gameSlug || !userId || userId.length < 8) {
      setData(null)
      setStatus('idle')
      setError(null)
      hasDataRef.current = false
      return
    }

    const identity = `${gameSlug}|${userId}`
    const identityChanged = identityRef.current !== identity
    identityRef.current = identity

    let cancelled = false
    const key = performNetWorthChartCacheKey(gameSlug, userId, range)
    const cached = readSimvestJsonCacheStale<PlayerNetWorthChartPayload>(key)
    const isBackgroundPoll = !identityChanged && refreshBump > 0 && hasDataRef.current

    if (cached?.bars?.length) {
      setData(cached)
      hasDataRef.current = true
      setStatus('ready')
      setError(null)
    } else if (identityChanged) {
      setData(null)
      hasDataRef.current = false
      setStatus('loading')
      setError(null)
    } else if (!isBackgroundPoll) {
      /* Range change: keep prior chart painted until the new range arrives. */
      setStatus(hasDataRef.current ? 'ready' : 'loading')
      setError(null)
    }

    prefetchNetWorthChartRanges(gameSlug, userId)

    const url = performNetWorthChartUrl(gameSlug, userId, range, refreshBump > 0 ? refreshBump : undefined)

    void dedupeSimvestJsonFetch(`${key}|${refreshBump}`, async () => {
      const r = await simvestFetch(url)
      const body = await r.json().catch(() => ({ error: 'Bad response' }))
      return { ok: r.ok, body }
    })
      .then(({ ok, body }) => {
        if (cancelled) return
        if (ok) {
          const p = normalizeNetWorthChartPayload(body)
          if (p) {
            writeSimvestJsonCache(key, p, PERFORM_NW_CACHE_MS)
            setData(p)
            hasDataRef.current = true
            setStatus('ready')
            setError(null)
          } else if (isBackgroundPoll || hasDataRef.current) {
            setStatus('ready')
          } else {
            setError('Invalid chart data')
            setData(null)
            setStatus('error')
          }
        } else if (isBackgroundPoll || hasDataRef.current) {
          setStatus('ready')
        } else {
          setError(
            typeof (body as { error?: string })?.error === 'string'
              ? (body as { error: string }).error
              : 'Chart failed',
          )
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
    const stopPoll = visibilityAwareInterval(() => setRefreshBump((x) => x + 1), {
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
  }, [gameSlug, enabled])

  return { data, status, error }
}
