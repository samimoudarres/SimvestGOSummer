import { useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_HIDDEN_MS, LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'

/** Up to three tickers for the Trade “Following” category card preview (same game as trade screen). */
export function useGameFollowTickers(gameSlug: string | undefined): string[] {
  const [tickers, setTickers] = useState<string[]>([])

  useEffect(() => {
    if (!gameSlug) {
      setTickers([])
      return
    }
    let cancelled = false
    const load = () => {
      simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/me/following`, { cache: 'no-store' })
        .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
        .then(({ ok, body }) => {
          if (cancelled) return
          if (ok && body && Array.isArray(body.tickers)) {
            setTickers((body.tickers as string[]).slice(0, 3))
          }
        })
        .catch(() => {
          if (!cancelled) setTickers([])
        })
    }
    load()
    const stopPoll = visibilityAwareInterval(load, {
      visibleMs: LIVE_MARKETS_POLL_MS,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
      runOnVisible: false,
    })
    const off = onDocumentVisible(load)
    return () => {
      cancelled = true
      stopPoll()
      off()
    }
  }, [gameSlug])

  return tickers
}
