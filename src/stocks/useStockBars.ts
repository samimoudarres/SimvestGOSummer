import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCacheStale,
  simvestJsonCacheKey,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { isSimvestPollDebugEnabled } from '../lib/debugPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import type { ChartRange, StockBarsPayload } from './stockDetailTypes'
import {
  prefetchStockBarsAllRanges,
  STOCK_BARS_CACHE_MS,
  STOCK_BARS_POLL_MS,
  stockBarsUrl,
} from './stockDetailPrefetch'

type Status = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Stock price bars with instant range switches:
 * - seed from memory cache
 * - keep last bars visible while a new range loads (no blank / Loading chart…)
 * - prefetch every range in the background
 */
export function useStockBars(ticker: string | undefined, range: ChartRange) {
  const cacheKey = ticker ? simvestJsonCacheKey(stockBarsUrl(ticker, range)) : ''
  const cachedInitial = cacheKey
    ? readSimvestJsonCacheStale<StockBarsPayload>(cacheKey)
    : undefined
  const [bars, setBars] = useState<StockBarsPayload['bars']>(() => cachedInitial?.bars ?? [])
  const [status, setStatus] = useState<Status>(() => (cachedInitial?.bars?.length ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const tickerRef = useRef(ticker)
  const hasBarsRef = useRef(!!cachedInitial?.bars?.length)

  useEffect(() => {
    hasBarsRef.current = bars.length > 0
  }, [bars.length])

  useEffect(() => {
    if (!ticker) return
    const tickerChanged = tickerRef.current !== ticker
    tickerRef.current = ticker

    let cancelled = false
    const url = stockBarsUrl(ticker, range)
    const key = simvestJsonCacheKey(url)
    const cached = readSimvestJsonCacheStale<StockBarsPayload>(key)

    if (cached?.bars?.length) {
      setBars(cached.bars)
      hasBarsRef.current = true
      setStatus('ready')
      setError(null)
    } else if (tickerChanged) {
      setBars([])
      hasBarsRef.current = false
      setStatus('loading')
      setError(null)
    } else {
      /* Range change without cache: keep previous bars on screen; refresh underneath. */
      setStatus(hasBarsRef.current ? 'ready' : 'loading')
      setError(null)
    }

    prefetchStockBarsAllRanges(ticker)

    const load = (isPoll: boolean) => {
      const hasCached = !!readSimvestJsonCacheStale<StockBarsPayload>(key)?.bars?.length
      if (!isPoll && !hasCached && !hasBarsRef.current) {
        setStatus('loading')
      }
      void dedupeSimvestJsonFetch(key, async () => {
        const r = await simvestFetch(url, { cache: 'no-store' })
        const body = await r.json().catch(() => ({ error: 'Bad response' }))
        return { ok: r.ok, status: r.status, body }
      })
        .then(({ ok, status: httpStatus, body }) => {
          if (cancelled) return
          if (ok && Array.isArray(body?.bars)) {
            const next = body as StockBarsPayload
            writeSimvestJsonCache(key, next, STOCK_BARS_CACHE_MS)
            setBars(next.bars)
            hasBarsRef.current = next.bars.length > 0
            setStatus('ready')
            setError(null)
          } else {
            if (isPoll && isSimvestPollDebugEnabled()) {
              console.warn('[SimvestPoll] stock bars failed (prior bars kept)', {
                ticker,
                range,
                url,
                httpStatus,
                body,
              })
            }
            if (!isPoll && !readSimvestJsonCacheStale<StockBarsPayload>(key)?.bars?.length && !hasBarsRef.current) {
              setError(typeof body?.error === 'string' ? body.error : 'Failed to load chart')
              setStatus('error')
            }
          }
        })
        .catch(() => {
          if (
            !cancelled &&
            !isPoll &&
            !readSimvestJsonCacheStale<StockBarsPayload>(key)?.bars?.length &&
            !hasBarsRef.current
          ) {
            setError('Network error')
            setStatus('error')
          }
        })
    }

    load(false)
    const stopPoll = visibilityAwareInterval(() => load(true), {
      visibleMs: STOCK_BARS_POLL_MS,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
      runOnVisible: false,
    })
    const offVisible = onDocumentVisible(() => load(true))
    return () => {
      cancelled = true
      stopPoll()
      offVisible()
    }
  }, [ticker, range])

  return { bars, status, error }
}
