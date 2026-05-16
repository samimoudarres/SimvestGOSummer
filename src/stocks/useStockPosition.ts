import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'

export type StockPosition = {
  shares: number
  avgCost: number
  costBasis: number
  cashAvailable: number
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

const POLL_MS = 30_000

/**
 * Reports the viewer's current position in a single ticker for a single game.
 * Used by `StockDetailScreen` to flip the BUY button to TRADE once any shares are held,
 * and to power the sell sheet's "owned shares / position value" display.
 *
 * Refreshes on `simvest:holdings-refresh` events so a buy/sell flip-flops the button immediately.
 */
export function useStockPosition(gameSlug: string | undefined, ticker: string | undefined) {
  const [position, setPosition] = useState<StockPosition | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const load = useCallback(
    async (silent = false) => {
      if (!gameSlug || !ticker) return
      if (!silent) {
        setStatus('loading')
        setError(null)
      }
      try {
        const res = await simvestFetch(
          `/api/games/${encodeURIComponent(gameSlug)}/stocks/${encodeURIComponent(ticker)}/position`,
        )
        if (cancelledRef.current) return
        if (!res.ok) {
          if (!silent) {
            setError((await res.text()) || 'Position lookup failed')
            setStatus('error')
          }
          return
        }
        const body = (await res.json()) as Partial<StockPosition>
        setPosition({
          shares: Number.isFinite(body.shares) ? Number(body.shares) : 0,
          avgCost: Number.isFinite(body.avgCost) ? Number(body.avgCost) : 0,
          costBasis: Number.isFinite(body.costBasis) ? Number(body.costBasis) : 0,
          cashAvailable: Number.isFinite(body.cashAvailable) ? Number(body.cashAvailable) : 0,
        })
        setStatus('ready')
      } catch (err) {
        if (cancelledRef.current) return
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Network error')
          setStatus('error')
        }
      }
    },
    [gameSlug, ticker],
  )

  useEffect(() => {
    cancelledRef.current = false
    void load(false)
    return () => {
      cancelledRef.current = true
    }
  }, [load])

  useEffect(() => {
    if (!gameSlug || !ticker) return
    const onHoldings = (ev: Event) => {
      const d = (ev as CustomEvent<{ gameSlug?: string }>).detail
      if (!d?.gameSlug || d.gameSlug === gameSlug) void load(true)
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    window.addEventListener('simvest:holdings-refresh', onHoldings)
    document.addEventListener('visibilitychange', onVis)
    const id = window.setInterval(() => void load(true), POLL_MS)
    return () => {
      window.removeEventListener('simvest:holdings-refresh', onHoldings)
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(id)
    }
  }, [gameSlug, ticker, load])

  return {
    position,
    status,
    error,
    /** Force a re-fetch (used right after a trade to reflect the new position immediately). */
    reload: () => void load(true),
  }
}
