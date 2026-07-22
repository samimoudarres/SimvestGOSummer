import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { networkErrorMessage } from '../api/networkErrorMessage'
import { LIVE_MARKETS_POLL_HIDDEN_MS, LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import type { PerformDashboardPayload } from './performTypes'
import { readCachedPerform, writeCachedPerform } from './performSessionCache'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePerformDashboard(gameSlug: string | undefined) {
  const cachedInitial = gameSlug ? readCachedPerform(gameSlug) : null
  const [data, setData] = useState<PerformDashboardPayload | null>(() => cachedInitial)
  const [status, setStatus] = useState<Status>(() =>
    cachedInitial ? 'ready' : gameSlug ? 'loading' : 'idle',
  )
  const [fromApi, setFromApi] = useState(!!cachedInitial)
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(!!cachedInitial)
  const skipInitialLoadingUiRef = useRef(!!cachedInitial)
  const pullRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!gameSlug) return
    const cached = readCachedPerform(gameSlug)
    hasDataRef.current = !!cached
    skipInitialLoadingUiRef.current = !!cached
    setError(null)
    if (cached) {
      setData(cached)
      setFromApi(true)
      setStatus('ready')
    } else {
      setData(null)
      setFromApi(false)
      setStatus('loading')
      hasDataRef.current = false
    }
    let cancelled = false

    const pull = (silent = false) => {
      if (!silent && !hasDataRef.current) setStatus('loading')
      skipInitialLoadingUiRef.current = false
      simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/perform`)
        .then((r) => {
          if (r.ok) return r.json()
          if (r.status === 503) {
            return Promise.reject(
              new Error('Service temporarily unavailable. Please retry in a moment.'),
            )
          }
          return Promise.reject(new Error(String(r.status)))
        })
        .then((payload: PerformDashboardPayload) => {
          if (cancelled) return
          const next = { ...payload, gameSlug }
          setData(next)
          writeCachedPerform(gameSlug, next)
          hasDataRef.current = true
          setFromApi(true)
          setError(null)
          setStatus('ready')
        })
        .catch((err) => {
          if (cancelled) return
          if (!hasDataRef.current) {
            setData(null)
            setFromApi(false)
            setError(err instanceof Error ? networkErrorMessage(err) : 'Could not load performance')
            setStatus('error')
          }
        })
    }

    pullRef.current = () => pull(false)
    pull(skipInitialLoadingUiRef.current)
    const refresh = () => pull(true)
    const stopPoll = visibilityAwareInterval(refresh, {
      visibleMs: LIVE_MARKETS_POLL_MS,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
      runOnVisible: false,
    })

    const offVisible = onDocumentVisible(refresh)
    const onHoldingsRefresh = (ev: Event) => {
      const slug = (ev as CustomEvent<{ gameSlug?: string }>).detail?.gameSlug
      if (!slug || slug === gameSlug) refresh()
    }
    window.addEventListener('simvest:holdings-refresh', onHoldingsRefresh)

    return () => {
      cancelled = true
      stopPoll()
      offVisible()
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
    }
  }, [gameSlug])

  const retry = () => pullRef.current()

  return { data, status, fromApi, error, retry }
}
