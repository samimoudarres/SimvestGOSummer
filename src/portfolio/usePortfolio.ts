import { useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import type { PortfolioApiRow, PortfolioTotals } from './portfolioTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePortfolio(gameSlug: string | undefined) {
  const [rows, setRows] = useState<PortfolioApiRow[]>([])
  const [totals, setTotals] = useState<PortfolioTotals | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameSlug) return
    setRows([])
    setTotals(null)
    setStatus('loading')
    setError(null)
    let cancelled = false
    const pull = () =>
      simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/portfolio`)
        .then((r) =>
          r
            .json()
            .then((body) => ({ ok: r.ok, body }))
            .catch(() => ({ ok: false, body: { error: 'Bad response' } })),
        )
        .then(({ ok, body }) => {
          if (cancelled) return
          if (ok && body && Array.isArray(body.rows) && body.totals && typeof body.totals === 'object') {
            setRows(body.rows as PortfolioApiRow[])
            setTotals(body.totals as PortfolioTotals)
            setStatus('ready')
            return
          }
          setError(typeof body?.error === 'string' ? body.error : 'Could not load portfolio')
          setStatus('error')
        })
        .catch(() => {
          if (!cancelled) {
            setError('Network error')
            setStatus('error')
          }
        })

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

  return { rows, totals, status, error }
}
