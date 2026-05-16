import { useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { isSimvestPollDebugEnabled } from '../lib/debugPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import type { TradeBrowsePayload, TradeCategoryId } from './tradeTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function useTradeBrowse(gameSlug: string | undefined, category: TradeCategoryId) {
  const [payload, setPayload] = useState<TradeBrowsePayload | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameSlug) return
    let cancelled = false

    const load = (isPoll: boolean) => {
      if (!isPoll) {
        setStatus('loading')
        setError(null)
      }
      simvestFetch(
        `/api/games/${encodeURIComponent(gameSlug)}/trade/browse?category=${encodeURIComponent(category)}`,
        { cache: 'no-store' },
      )
        .then(async (r) => {
          const body = await r.json().catch(() => ({ error: 'Bad response' }))
          return { ok: r.ok, status: r.status, body }
        })
        .then(({ ok, status, body }) => {
          if (cancelled) return
          if (ok && body && Array.isArray(body.rows) && Array.isArray(body.categories)) {
            setPayload(body as TradeBrowsePayload)
            setStatus('ready')
          } else {
            if (isPoll && isSimvestPollDebugEnabled()) {
              console.warn('[SimvestPoll] trade/browse failed (prior payload kept)', {
                gameSlug,
                category,
                httpStatus: status,
                body,
              })
            }
            if (!isPoll) {
              setError(typeof body?.error === 'string' ? body.error : 'Could not load symbols')
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
  }, [gameSlug, category])

  return { payload, status, error }
}
