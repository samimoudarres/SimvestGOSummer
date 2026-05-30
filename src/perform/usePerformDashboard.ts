import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import type { PerformDashboardPayload } from './performTypes'
import { emptyPerformDashboard } from './performDummy'
import { readCachedPerform, writeCachedPerform } from './performSessionCache'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePerformDashboard(gameSlug: string | undefined) {
  const cachedInitial = gameSlug ? readCachedPerform(gameSlug) : null
  const [data, setData] = useState<PerformDashboardPayload | null>(() => cachedInitial)
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [fromApi, setFromApi] = useState(!!cachedInitial)
  const hasDataRef = useRef(!!cachedInitial)
  const skipInitialLoadingUiRef = useRef(!!cachedInitial)

  useEffect(() => {
    if (!gameSlug) return
    const cached = readCachedPerform(gameSlug)
    hasDataRef.current = !!cached
    skipInitialLoadingUiRef.current = !!cached
    if (cached) {
      setData(cached)
      setFromApi(true)
      setStatus('ready')
    } else {
      setData(null)
      setStatus('idle')
      setFromApi(false)
      hasDataRef.current = false
    }
    let cancelled = false
    const fallback = emptyPerformDashboard(gameSlug)

    const pull = (silent = false) => {
      if (!silent && !hasDataRef.current) setStatus('loading')
      skipInitialLoadingUiRef.current = false
      simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/perform`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((payload: PerformDashboardPayload) => {
          if (cancelled) return
          const next = { ...payload, gameSlug }
          setData(next)
          writeCachedPerform(gameSlug, next)
          hasDataRef.current = true
          setFromApi(true)
          setStatus('ready')
        })
        .catch(() => {
          if (cancelled) return
          if (!hasDataRef.current) {
            setData(fallback)
            setFromApi(false)
            setStatus('ready')
          }
        })
    }

    pull(skipInitialLoadingUiRef.current)
    const refresh = () => pull(true)
    const refreshId = window.setInterval(refresh, LIVE_MARKETS_POLL_MS)

    const offVisible = onDocumentVisible(refresh)
    const onHoldingsRefresh = (ev: Event) => {
      const slug = (ev as CustomEvent<{ gameSlug?: string }>).detail?.gameSlug
      if (!slug || slug === gameSlug) refresh()
    }
    window.addEventListener('simvest:holdings-refresh', onHoldingsRefresh)

    return () => {
      cancelled = true
      window.clearInterval(refreshId)
      offVisible()
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
    }
  }, [gameSlug])

  return { data, status, fromApi }
}
