import { useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { isSimvestPollDebugEnabled } from '../lib/debugPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import type { ChartRange, StockBarsPayload } from './stockDetailTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function useStockBars(ticker: string | undefined, range: ChartRange) {
  const [bars, setBars] = useState<StockBarsPayload['bars']>([])
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
      const q = new URLSearchParams({ range })
      const url = `/api/stocks/${encodeURIComponent(ticker)}/bars?${q}`
      simvestFetch(url, { cache: 'no-store' })
        .then(async (r) => {
          const body = await r.json().catch(() => ({ error: 'Bad response' }))
          return { ok: r.ok, status: r.status, body }
        })
        .then(({ ok, status, body }) => {
          if (cancelled) return
          if (ok && Array.isArray(body?.bars)) {
            setBars(body.bars)
            setStatus('ready')
          } else {
            if (isPoll && isSimvestPollDebugEnabled()) {
              console.warn('[SimvestPoll] stock bars failed (prior bars kept)', {
                ticker,
                range,
                url,
                httpStatus: status,
                body,
              })
            }
            if (!isPoll) {
              setError(typeof body?.error === 'string' ? body.error : 'Failed to load chart')
              setStatus('error')
            }
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
  }, [ticker, range])

  return { bars, status, error }
}
