import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { networkErrorMessage } from '../api/networkErrorMessage'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import { readCachedGameFeed, writeCachedGameFeed } from './gameFeedSessionCache'
import type { FeedPollPayload, RichTextSegment } from '../feed/richTextTypes'
import {
  FEED_PAGE_SIZE,
  appendFeedPage,
  mergeFeedPage1,
  resolveNextBefore,
} from '../feed/feedPagination'

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

type FeedBody = {
  posts?: GameFeedPostRow[]
  nextBeforeIso?: string | null
  error?: string
}

export function useGameFeed(gameSlug: string | undefined) {
  const cachedInitial = gameSlug ? readCachedGameFeed(gameSlug) : null
  const [posts, setPosts] = useState<GameFeedPostRow[]>(() => cachedInitial ?? [])
  const [status, setStatus] = useState<Status>(() => (cachedInitial != null ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const hasShownPostsRef = useRef(cachedInitial != null)
  const skipInitialLoadingUiRef = useRef(cachedInitial != null)
  const nextBeforeRef = useRef<string | null>(null)
  const loadingMoreRef = useRef(false)
  const postsRef = useRef(posts)
  postsRef.current = posts
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'more' = 'initial') => {
      if (!gameSlug) return
      if (mode === 'more') {
        if (loadingMoreRef.current || !hasMoreRef.current || !nextBeforeRef.current) return
        loadingMoreRef.current = true
        setLoadingMore(true)
      }
      const silent =
        mode === 'refresh' || mode === 'more'
          ? hasShownPostsRef.current
          : skipInitialLoadingUiRef.current
      if (mode === 'initial') skipInitialLoadingUiRef.current = false
      if (!silent && mode !== 'more') {
        setStatus('loading')
        setError(null)
      }
      try {
        const qs = new URLSearchParams()
        qs.set('limit', String(FEED_PAGE_SIZE))
        if (mode === 'more' && nextBeforeRef.current) {
          qs.set('before', nextBeforeRef.current)
        }
        const r = await simvestFetch(
          `/api/games/${encodeURIComponent(gameSlug)}/feed?${qs.toString()}`,
        )
        const body = (await r.json().catch(() => ({}))) as FeedBody
        if (r.ok && body && Array.isArray(body.posts)) {
          const page = body.posts
          const serverNext =
            typeof body.nextBeforeIso === 'string' && body.nextBeforeIso.trim()
              ? body.nextBeforeIso.trim()
              : null
          let nextPosts: GameFeedPostRow[]
          if (mode === 'more') {
            nextPosts = appendFeedPage(postsRef.current, page)
            nextBeforeRef.current = serverNext
            setHasMore(Boolean(serverNext))
          } else {
            const merged =
              mode === 'refresh' && postsRef.current.length > 0
                ? mergeFeedPage1(page, postsRef.current)
                : page
            nextPosts = merged
            const keepOlderCursor =
              mode === 'refresh' &&
              hasMoreRef.current &&
              merged.length > page.length
            nextBeforeRef.current = resolveNextBefore(
              merged,
              keepOlderCursor ? null : serverNext,
              Boolean(serverNext) || keepOlderCursor,
            )
            setHasMore(Boolean(serverNext) || keepOlderCursor)
          }
          setPosts(nextPosts)
          writeCachedGameFeed(gameSlug, nextPosts)
          hasShownPostsRef.current = true
          setStatus('ready')
        } else if (silent) {
          setStatus('ready')
        } else {
          setError(typeof body?.error === 'string' ? body.error : 'Could not load feed')
          setStatus('error')
        }
      } catch (err) {
        if (silent) {
          setStatus('ready')
        } else {
          setError(networkErrorMessage(err))
          setStatus('error')
        }
      } finally {
        if (mode === 'more') {
          loadingMoreRef.current = false
          setLoadingMore(false)
        }
      }
    },
    [gameSlug],
  )

  useEffect(() => {
    const cached = gameSlug ? readCachedGameFeed(gameSlug) : null
    hasShownPostsRef.current = cached != null
    skipInitialLoadingUiRef.current = cached != null
    nextBeforeRef.current = null
    setHasMore(false)
    if (cached != null) {
      setPosts(cached)
      setStatus('ready')
      setError(null)
    } else {
      setPosts([])
      setStatus('idle')
    }
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
    window.addEventListener('simvest:activity-refresh', onActivity)
    window.addEventListener('simvest:holdings-refresh', onHoldings)
    const stopPoll = visibilityAwareInterval(tick, {
      visibleMs: POLL_MS,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
    })
    return () => {
      window.removeEventListener('simvest:activity-refresh', onActivity)
      window.removeEventListener('simvest:holdings-refresh', onHoldings)
      stopPoll()
    }
  }, [gameSlug, load])

  const loadMore = useCallback(() => {
    void load('more')
  }, [load])

  return {
    posts,
    status,
    error,
    reload: () => void load('refresh'),
    hasMore,
    loadingMore,
    loadMore,
  }
}
