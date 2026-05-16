import { useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { isMassiveCryptoSymbol } from '../stocks/displayTicker'
import type { TradeBrowseRow } from './tradeTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

/** Loads ranked search hits or hydrated recent tickers (debounced query handled by caller). */
export function useTradeSearchResults(
  gameSlug: string | undefined,
  enabled: boolean,
  debouncedQuery: string,
  recentTickers: string[],
) {
  const [rows, setRows] = useState<TradeBrowseRow[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !gameSlug) {
      setRows([])
      setStatus('idle')
      setError(null)
      return
    }

    let cancelled = false

    const run = async (isPoll: boolean) => {
      const q = debouncedQuery.trim()
      const nonCryptoRecents = recentTickers.filter((s) => !isMassiveCryptoSymbol(s))

      if (q.length < 1) {
        if (nonCryptoRecents.length < 1) {
          if (!cancelled) {
            setRows([])
            setStatus('ready')
            setError(null)
          }
          return
        }
        if (!cancelled && !isPoll) {
          setStatus('loading')
          setError(null)
        }
        const recents = nonCryptoRecents.map((s) => encodeURIComponent(s)).join(',')
        const r = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/trade/search?recents=${recents}`, {
          cache: 'no-store',
        })
        const body = (await r.json().catch(() => ({}))) as { rows?: unknown; error?: string }
        if (cancelled) return
        if (r.ok && body && Array.isArray(body.rows)) {
          const rows = (body.rows as TradeBrowseRow[]).filter((row) => !isMassiveCryptoSymbol(row.symbol))
          setRows(rows)
          setStatus('ready')
        } else if (!isPoll) {
          setError(typeof body?.error === 'string' ? body.error : 'Could not load recents')
          setStatus('error')
        }
        return
      }

      if (!cancelled && !isPoll) {
        setStatus('loading')
        setError(null)
      }
      const r = await simvestFetch(
        `/api/games/${encodeURIComponent(gameSlug)}/trade/search?q=${encodeURIComponent(q)}`,
        { cache: 'no-store' },
      )
      const body = (await r.json().catch(() => ({}))) as { rows?: unknown; error?: string }
      if (cancelled) return
      if (r.ok && body && Array.isArray(body.rows)) {
        const rows = (body.rows as TradeBrowseRow[]).filter((row) => !isMassiveCryptoSymbol(row.symbol))
        setRows(rows)
        setStatus('ready')
      } else if (!isPoll) {
        setError(typeof body?.error === 'string' ? body.error : 'Search failed')
        setStatus('error')
      }
    }

    void run(false)
    const id = window.setInterval(() => void run(true), LIVE_MARKETS_POLL_MS)
    const offVisible = onDocumentVisible(() => void run(true))
    return () => {
      cancelled = true
      window.clearInterval(id)
      offVisible()
    }
  }, [enabled, gameSlug, debouncedQuery, recentTickers])

  return { rows, status, error }
}
