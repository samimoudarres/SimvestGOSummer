import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCache,
  simvestJsonCacheKey,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { isSimvestPollDebugEnabled } from '../lib/debugPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { TRADE_BROWSE_CACHE_MS } from './tradePrefetch'
import type { TradeBrowsePayload, TradeCategoryId } from './tradeTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

function browseUrl(gameSlug: string, category: TradeCategoryId): string {
  return `/api/games/${encodeURIComponent(gameSlug)}/trade/browse?category=${encodeURIComponent(category)}`
}

export function useTradeBrowse(gameSlug: string | undefined, category: TradeCategoryId) {
  const cacheKey =
    gameSlug && category ? simvestJsonCacheKey(browseUrl(gameSlug, category)) : ''
  const cachedInitial = cacheKey ? readSimvestJsonCache<TradeBrowsePayload>(cacheKey) : undefined
  const [payload, setPayload] = useState<TradeBrowsePayload | null>(() => cachedInitial ?? null)
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(!!cachedInitial)
  const skipInitialLoadingUiRef = useRef(!!cachedInitial)

  useEffect(() => {
    if (!gameSlug) return
    let cancelled = false
    const url = browseUrl(gameSlug, category)
    const key = simvestJsonCacheKey(url)
    const cached = readSimvestJsonCache<TradeBrowsePayload>(key)
    hasDataRef.current = !!cached
    skipInitialLoadingUiRef.current = !!cached
    if (cached) {
      setPayload(cached)
      setStatus('ready')
      setError(null)
    } else {
      setPayload(null)
      setStatus('idle')
      hasDataRef.current = false
    }

    const load = (isPoll: boolean) => {
      const silent = isPoll || skipInitialLoadingUiRef.current || hasDataRef.current
      if (!isPoll) skipInitialLoadingUiRef.current = false
      if (!silent) {
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
          if (ok && body && Array.isArray(body.rows) && Array.isArray(body.categories)) {
            const next = body as TradeBrowsePayload
            setPayload(next)
            writeSimvestJsonCache(key, next, TRADE_BROWSE_CACHE_MS)
            hasDataRef.current = true
            setStatus('ready')
          } else {
            if (isPoll && isSimvestPollDebugEnabled()) {
              console.warn('[SimvestPoll] trade/browse failed (prior payload kept)', {
                gameSlug,
                category,
                httpStatus,
                body,
              })
            }
            if (!silent) {
              setError(typeof body?.error === 'string' ? body.error : 'Could not load symbols')
              setStatus('error')
            }
          }
        })
        .catch(() => {
          if (!cancelled && !silent) {
            setError('Network error')
            setStatus('error')
          }
        })
    }

    load(false)
    const id = window.setInterval(() => load(true), LIVE_MARKETS_POLL_MS)
    const offVisible = onDocumentVisible(() => load(true))
    return () => {
      cancelled = true
      window.clearInterval(id)
      offVisible()
    }
  }, [gameSlug, category])

  return { payload, status, error }
}
