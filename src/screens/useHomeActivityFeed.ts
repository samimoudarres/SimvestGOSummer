import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { GameFeedPostRow } from '../challenge/useGameFeed'

type Status = 'idle' | 'loading' | 'ready' | 'error'

const POLL_MS = 25_000

export function useHomeActivityFeed() {
  const [posts, setPosts] = useState<GameFeedPostRow[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const hasLoadedOnceRef = useRef(false)

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    const silent = mode === 'refresh' && hasLoadedOnceRef.current
    if (!silent) {
      setStatus('loading')
      setError(null)
    }
    try {
      const res = await simvestFetch('/api/me/activity/feed')
      const body = await res.json().catch(() => ({}))
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
      setPosts(body.posts as GameFeedPostRow[])
      hasLoadedOnceRef.current = true
      setStatus('ready')
    } catch {
      if (!silent) {
        setError('Network error')
        setPosts([])
        setStatus('error')
      }
    }
  }, [])

  useEffect(() => {
    void load('initial')
  }, [load])

  useEffect(() => {
    const tick = () => void load('refresh')
    const onActivity = () => tick()
    const onHoldings = () => tick()
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
  }, [load])

  return { posts, status, error, reload: () => void load('refresh') }
}
