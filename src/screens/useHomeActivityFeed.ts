import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { networkErrorMessage } from '../api/networkErrorMessage'
import { readCachedHomeFeed, writeCachedHomeFeed } from '../home/homeFeedSessionCache'
import { SIMVEST_USER_ID_STORAGE_KEY } from '../user/simvestUserId'
import type { GameFeedPostRow } from '../challenge/useGameFeed'
import {
  FEED_PAGE_SIZE,
  appendFeedPage,
  mergeFeedPage1,
  resolveNextBefore,
} from '../feed/feedPagination'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'

type Status = 'idle' | 'loading' | 'ready' | 'error'

const POLL_MS = 25_000

type FeedBody = {
  posts?: GameFeedPostRow[]
  nextBeforeIso?: string | null
  error?: string
}

export function useHomeActivityFeed() {
  const cachedInitial = readCachedHomeFeed()
  const [posts, setPosts] = useState<GameFeedPostRow[]>(() => cachedInitial ?? [])
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const hasLoadedOnceRef = useRef(!!cachedInitial)
  const skipInitialLoadingUiRef = useRef(!!cachedInitial)
  const nextBeforeRef = useRef<string | null>(null)
  const loadingMoreRef = useRef(false)
  const postsRef = useRef(posts)
  postsRef.current = posts
  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'more' = 'initial') => {
    if (mode === 'more') {
      if (loadingMoreRef.current || !hasMoreRef.current || !nextBeforeRef.current) return
      loadingMoreRef.current = true
      setLoadingMore(true)
    }
    const silent =
      mode === 'refresh' || mode === 'more'
        ? hasLoadedOnceRef.current
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
      const res = await simvestFetch(`/api/me/activity/feed?${qs.toString()}`)
      const body = (await res.json().catch(() => ({}))) as FeedBody
      if (!res.ok) {
        const msg = typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`
        if (!silent) {
          setError(msg)
          setPosts([])
          setStatus('error')
        }
        return
      }
      if (!body || !Array.isArray(body.posts)) {
        if (!silent) {
          setError('Invalid response')
          setPosts([])
          setStatus('error')
        }
        return
      }
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
          mode === 'refresh' && hasMoreRef.current && merged.length > page.length
        nextBeforeRef.current = resolveNextBefore(
          merged,
          keepOlderCursor ? null : serverNext,
          Boolean(serverNext) || keepOlderCursor,
        )
        setHasMore(Boolean(serverNext) || keepOlderCursor)
      }
      setPosts(nextPosts)
      writeCachedHomeFeed(nextPosts)
      hasLoadedOnceRef.current = true
      setStatus('ready')
    } catch (err) {
      if (!silent) {
        setError(networkErrorMessage(err))
        setPosts([])
        setStatus('error')
      }
    } finally {
      if (mode === 'more') {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    void load('initial')
  }, [load])

  useEffect(() => {
    const onUserId = () => {
      nextBeforeRef.current = null
      setHasMore(false)
      void load(hasLoadedOnceRef.current ? 'refresh' : 'initial')
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIMVEST_USER_ID_STORAGE_KEY) {
        nextBeforeRef.current = null
        setHasMore(false)
        void load(hasLoadedOnceRef.current ? 'refresh' : 'initial')
      }
    }
    window.addEventListener('simvest:user-id-changed', onUserId)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('simvest:user-id-changed', onUserId)
      window.removeEventListener('storage', onStorage)
    }
  }, [load])

  useEffect(() => {
    const tick = () => void load('refresh')
    const onActivity = () => tick()
    const onHoldings = () => tick()
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
  }, [load])

  return {
    posts,
    status,
    error,
    reload: () => void load('refresh'),
    hasMore,
    loadingMore,
    loadMore: () => void load('more'),
  }
}
