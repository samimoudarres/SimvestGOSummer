import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { networkErrorMessage } from '../api/networkErrorMessage'
import { LIVE_MARKETS_POLL_HIDDEN_MS, LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { scheduleSparkFollowUp } from '../lib/scheduleSparkFollowUp'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import type { PortfolioApiRow, PortfolioTotals } from './portfolioTypes'
import { readCachedPortfolio, writeCachedPortfolio } from './portfolioSessionCache'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePortfolio(gameSlug: string | undefined) {
  const cachedInitial = gameSlug ? readCachedPortfolio(gameSlug) : null
  const [rows, setRows] = useState<PortfolioApiRow[]>(() => cachedInitial?.rows ?? [])
  const [totals, setTotals] = useState<PortfolioTotals | null>(() => cachedInitial?.totals ?? null)
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(!!cachedInitial)
  const skipInitialLoadingUiRef = useRef(!!cachedInitial)
  const pullRef = useRef<(silent?: boolean) => void>(() => {})

  useEffect(() => {
    if (!gameSlug) return
    const cached = readCachedPortfolio(gameSlug)
    hasDataRef.current = !!cached
    skipInitialLoadingUiRef.current = !!cached
    if (cached) {
      setRows(cached.rows)
      setTotals(cached.totals)
      setStatus('ready')
      setError(null)
    } else {
      setRows([])
      setTotals(null)
      setStatus('idle')
      hasDataRef.current = false
    }
    let cancelled = false
    const pull = (silent = false) => {
      if (!silent && !hasDataRef.current) {
        setStatus('loading')
        setError(null)
      }
      skipInitialLoadingUiRef.current = false
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
            const nextRows = body.rows as PortfolioApiRow[]
            const nextTotals = body.totals as PortfolioTotals
            setRows(nextRows)
            setTotals(nextTotals)
            writeCachedPortfolio(gameSlug, nextRows, nextTotals)
            hasDataRef.current = true
            setStatus('ready')
            return
          }
          if (!hasDataRef.current) {
            setError(typeof body?.error === 'string' ? body.error : 'Could not load portfolio')
            setStatus('error')
          }
        })
        .catch((err) => {
          if (!cancelled && !hasDataRef.current) {
            setError(networkErrorMessage(err))
            setStatus('error')
          }
        })
    }
    pullRef.current = pull

    pull(skipInitialLoadingUiRef.current)
    const refresh = () => pull(true)
    const stopSparkFollowUp = scheduleSparkFollowUp(refresh)
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
      stopSparkFollowUp()
      stopPoll()
      offVisible()
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
    }
  }, [gameSlug])

  const reload = useCallback(() => {
    pullRef.current(false)
  }, [])

  return { rows, totals, status, error, reload }
}
