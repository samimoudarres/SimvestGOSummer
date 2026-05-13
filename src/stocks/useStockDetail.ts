import { useEffect, useState } from 'react'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import type { StockDetailPayload } from './stockDetailTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function useStockDetail(ticker: string | undefined) {
  const [data, setData] = useState<StockDetailPayload | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticker) return
    let cancelled = false

    const load = (isPoll: boolean) => {
      if (!isPoll) {
        setStatus('loading')
        setError(null)
      }
      fetch(`/api/stocks/${encodeURIComponent(ticker)}`, { cache: 'no-store' })
        .then((r) =>
          r
            .json()
            .then((body) => ({ ok: r.ok, body }))
            .catch(() => ({ ok: false, body: { error: 'Bad response' } })),
        )
        .then(({ ok, body }) => {
          if (cancelled) return
          if (ok && body && typeof body.ticker === 'string') {
            setData(body as StockDetailPayload)
            setStatus('ready')
          } else if (!isPoll) {
            setError(typeof body?.error === 'string' ? body.error : 'Failed to load stock')
            setStatus('error')
          }
        })
        .catch(() => {
          if (!cancelled && !isPoll) {
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
  }, [ticker])

  return { data, status, error }
}
