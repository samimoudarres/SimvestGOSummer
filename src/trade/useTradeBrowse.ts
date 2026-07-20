import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCacheStale,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { LIVE_MARKETS_POLL_HIDDEN_MS, LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { isSimvestPollDebugEnabled } from '../lib/debugPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { scheduleSparkFollowUp } from '../lib/scheduleSparkFollowUp'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import { TRADE_BROWSE_CACHE_MS, tradeBrowseClientCacheKey, warmBrowseRowDetailCaches } from './tradePrefetch'
import type { TradeBrowsePayload, TradeCategoryId } from './tradeTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

function browseUrl(gameSlug: string, category: TradeCategoryId): string {
  return `/api/games/${encodeURIComponent(gameSlug)}/trade/browse?category=${encodeURIComponent(category)}`
}

export function useTradeBrowse(gameSlug: string | undefined, category: TradeCategoryId) {
  const cacheKey =
    gameSlug && category ? tradeBrowseClientCacheKey(browseUrl(gameSlug, category)) : ''
  const cachedInitial = cacheKey ? readSimvestJsonCacheStale<TradeBrowsePayload>(cacheKey) : undefined
  const matchingInitial =
    cachedInitial && cachedInitial.category === category ? cachedInitial : undefined
  const [payload, setPayload] = useState<TradeBrowsePayload | null>(() => matchingInitial ?? null)
  const [status, setStatus] = useState<Status>(() => (matchingInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasDataForCategoryRef = useRef(!!matchingInitial)
  const skipInitialLoadingUiRef = useRef(!!matchingInitial)

  useEffect(() => {
    if (!gameSlug) return
    let cancelled = false
    const url = browseUrl(gameSlug, category)
    const key = tradeBrowseClientCacheKey(url)
    const cached = readSimvestJsonCacheStale<TradeBrowsePayload>(key)
    const cachedMatch = cached && cached.category === category ? cached : undefined
    hasDataForCategoryRef.current = !!cachedMatch
    skipInitialLoadingUiRef.current = !!cachedMatch
    if (cachedMatch) {
      setPayload(cachedMatch)
      setStatus('ready')
      setError(null)
    } else {
      /* Never keep another category's rows as "current" — that made tabs look stuck. */
      setPayload(null)
      setStatus('loading')
      setError(null)
    }

    const load = (isPoll: boolean) => {
      const silent = isPoll || skipInitialLoadingUiRef.current || hasDataForCategoryRef.current
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
            if (next.category !== category) return
            setPayload(next)
            writeSimvestJsonCache(key, next, TRADE_BROWSE_CACHE_MS)
            hasDataForCategoryRef.current = true
            setStatus('ready')
            if (!isPoll) warmBrowseRowDetailCaches(next.rows)
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
    const stopSparkFollowUp = scheduleSparkFollowUp(() => load(true))
    const stopPoll = visibilityAwareInterval(() => load(true), {
      visibleMs: LIVE_MARKETS_POLL_MS,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
      runOnVisible: false,
    })
    const offVisible = onDocumentVisible(() => load(true))
    return () => {
      cancelled = true
      stopSparkFollowUp()
      stopPoll()
      offVisible()
    }
  }, [gameSlug, category])

  return { payload, status, error }
}
