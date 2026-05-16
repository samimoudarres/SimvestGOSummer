import { useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import type { PerformDashboardPayload } from './performTypes'
import { emptyPerformDashboard } from './performDummy'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePerformDashboard(gameSlug: string | undefined) {
  const [data, setData] = useState<PerformDashboardPayload | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [fromApi, setFromApi] = useState(false)

  useEffect(() => {
    if (!gameSlug) return
    setData(null)
    setStatus('loading')
    let cancelled = false
    const fallback = emptyPerformDashboard(gameSlug)

    const pull = () => {
      simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/perform`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((payload: PerformDashboardPayload) => {
          if (cancelled) return
          setData({ ...payload, gameSlug })
          setFromApi(true)
          setStatus('ready')
        })
        .catch(() => {
          if (cancelled) return
          setData(fallback)
          setFromApi(false)
          setStatus('ready')
        })
    }

    pull()
    const refresh = window.setInterval(pull, LIVE_MARKETS_POLL_MS)

    const offVisible = onDocumentVisible(pull)
    const onHoldingsRefresh = (ev: Event) => {
      const slug = (ev as CustomEvent<{ gameSlug?: string }>).detail?.gameSlug
      if (!slug || slug === gameSlug) pull()
    }
    window.addEventListener('simvest:holdings-refresh', onHoldingsRefresh)

    return () => {
      cancelled = true
      window.clearInterval(refresh)
      offVisible()
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
    }
  }, [gameSlug])

  return { data, status, fromApi }
}
