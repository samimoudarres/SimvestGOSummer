import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCacheStale,
  simvestJsonCacheKey,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { LIVE_MARKETS_POLL_HIDDEN_MS, LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import { isSimvestPollDebugEnabled } from '../lib/debugPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import type { StockDetailPayload } from './stockDetailTypes'
import { STOCK_DETAIL_CACHE_MS, stockDetailUrl } from './stockDetailPrefetch'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function useStockDetail(ticker: string | undefined) {
  const cacheKey = ticker ? simvestJsonCacheKey(stockDetailUrl(ticker)) : ''
  const cachedInitial = cacheKey
    ? readSimvestJsonCacheStale<StockDetailPayload>(cacheKey)
    : undefined
  const [data, setData] = useState<StockDetailPayload | null>(() => cachedInitial ?? null)
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(!!cachedInitial)

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    const url = stockDetailUrl(ticker)
    const key = simvestJsonCacheKey(url)
    const cached = readSimvestJsonCacheStale<StockDetailPayload>(key)
    if (cached) {
      setData(cached)
      hasDataRef.current = true
      setStatus('ready')
      setError(null)
    } else {
      /* Keep prior ticker painted until the new one arrives (prefetch usually fills cache). */
      setStatus(hasDataRef.current ? 'ready' : 'loading')
      if (!hasDataRef.current) setError(null)
    }

    const load = (isPoll: boolean) => {
      if (!isPoll && !readSimvestJsonCacheStale<StockDetailPayload>(key) && !hasDataRef.current) {
        setStatus('loading')
        setError(null)
      }
      void dedupeSimvestJsonFetch(key, async () => {
        const r = await simvestFetch(url, { cache: 'no-store' })
        const body = await r.json().catch(() => ({ error: 'Bad response' }))
        return { ok: r.ok, status: r.status, body }
      })
        .then(({ ok, status: httpStatus, body }) => {
          if (cancelled) return
          if (ok && body && typeof body.ticker === 'string') {
            const next = body as StockDetailPayload
            writeSimvestJsonCache(key, next, STOCK_DETAIL_CACHE_MS)
            setData(next)
            hasDataRef.current = true
            setStatus('ready')
          } else {
            if (isPoll && isSimvestPollDebugEnabled()) {
              console.warn('[SimvestPoll] stock detail failed (prior payload kept)', {
                ticker,
                httpStatus,
                body,
              })
            }
            if (!isPoll && !readSimvestJsonCacheStale<StockDetailPayload>(key) && !hasDataRef.current) {
              setError(typeof body?.error === 'string' ? body.error : 'Failed to load stock')
              setStatus('error')
            }
          }
        })
        .catch(() => {
          if (!cancelled && !isPoll && !readSimvestJsonCacheStale<StockDetailPayload>(key) && !hasDataRef.current) {
            setError('Network error')
            setStatus('error')
          }
        })
    }

    load(false)
    const stopPoll = visibilityAwareInterval(() => load(true), {
      visibleMs: LIVE_MARKETS_POLL_MS,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
      runOnVisible: false,
    })
    const offVisible = onDocumentVisible(() => load(true))
    return () => {
      cancelled = true
      stopPoll()
      offVisible()
    }
  }, [ticker])

  return { data, status, error }
}
