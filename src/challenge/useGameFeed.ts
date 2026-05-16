import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { FeedPollPayload, RichTextSegment } from '../feed/richTextTypes'

export type GameFeedPostRow = {
  id: string
  userId: string
  gameSlug: string
  postKind?: 'trade' | 'text' | 'poll'
  author: string
  avatar: string
  gameName: string
  /** ISO UTC from server — used for sorting "Most Recent". */
  postedAtIso?: string
  timestamp: string
  tradeTitle: string
  tickerSymbol: string
  tickerImage: string
  changePct: string
  sharesBought: string
  orderTotal: string
  marketCap: string
  revenue: string
  rationale: string
  /** Trade rows only: 'buy' | 'sell' — drives the Bought/Sold label and realized-P&L block. */
  side?: 'buy' | 'sell'
  /** Trade rows only: fill price at the time of the trade, used to render Sale Price for sells. */
  purchasePrice?: number
  /** Sell rows only: cost basis of the FIFO lots unwound — used to render realized P&L. */
  costBasis?: number
  richSegments?: RichTextSegment[]
  attachmentImageUrl?: string | null
  poll?: FeedPollPayload | null
  social?: {
    likeCount: number
    likedByViewer: boolean
    commentCount: number
  }
  /** Server-derived: game has ended; social actions should be read-only in the client. */
  feedInteractionsLocked?: boolean
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

const POLL_MS = 20_000

export function useGameFeed(gameSlug: string | undefined) {
  const [posts, setPosts] = useState<GameFeedPostRow[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const hasShownPostsRef = useRef(false)

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!gameSlug) return
      const silent = mode === 'refresh' && hasShownPostsRef.current
      if (!silent) {
        setStatus('loading')
        setError(null)
      }
      try {
        const r = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/feed`)
        const body = await r.json().catch(() => ({}))
        if (r.ok && body && Array.isArray(body.posts)) {
          const next = body.posts as GameFeedPostRow[]
          setPosts(next)
          hasShownPostsRef.current = true
          setStatus('ready')
        } else if (silent) {
          setStatus('ready')
        } else {
          setError(typeof body?.error === 'string' ? body.error : 'Could not load feed')
          setStatus('error')
        }
      } catch {
        if (silent) {
          setStatus('ready')
        } else {
          setError('Network error')
          setStatus('error')
        }
      }
    },
    [gameSlug],
  )

  useEffect(() => {
    hasShownPostsRef.current = false
    void load('initial')
  }, [gameSlug, load])

  useEffect(() => {
    if (!gameSlug) return
    const tick = () => void load('refresh')
    const onActivity = (ev: Event) => {
      const d = (ev as CustomEvent<{ gameSlug?: string }>).detail
      if (!d?.gameSlug || d.gameSlug === gameSlug) tick()
    }
    const onHoldings = (ev: Event) => {
      const d = (ev as CustomEvent<{ gameSlug?: string }>).detail
      if (!d?.gameSlug || d.gameSlug === gameSlug) tick()
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    window.addEventListener('simvest:activity-refresh', onActivity)
    window.addEventListener('simvest:holdings-refresh', onHoldings)
    document.addEventListener('visibilitychange', onVis)
    const id = window.setInterval(tick, POLL_MS)
    return () => {
      window.removeEventListener('simvest:activity-refresh', onActivity)
      window.removeEventListener('simvest:holdings-refresh', onHoldings)
      document.removeEventListener('visibilitychange', onVis)
      window.clearInterval(id)
    }
  }, [gameSlug, load])

  return { posts, status, error, reload: () => void load('refresh') }
}
