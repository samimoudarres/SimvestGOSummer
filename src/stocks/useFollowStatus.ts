import { useCallback, useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'

export function useFollowStatus(ticker: string | undefined, gameSlug: string | undefined) {
  const [following, setFollowing] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (!ticker || !gameSlug) {
      setFollowing(false)
      setStatus('idle')
      return
    }
    let cancelled = false
    setStatus('loading')
    const url = `/api/games/${encodeURIComponent(gameSlug)}/me/following/${encodeURIComponent(ticker)}`
    simvestFetch(url)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return
        if (ok && body && typeof body.following === 'boolean') {
          setFollowing(body.following)
          setStatus('ready')
        } else {
          setStatus('error')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [ticker, gameSlug])

  const toggle = useCallback(async () => {
    if (!ticker || !gameSlug) return
    const next = !following
    const prev = following
    setFollowing(next)
    const url = `/api/games/${encodeURIComponent(gameSlug)}/me/following/${encodeURIComponent(ticker)}`
    try {
      const r = await simvestFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ following: next }),
      })
      const body = (await r.json().catch(() => ({}))) as { following?: boolean }
      if (!r.ok || typeof body.following !== 'boolean') {
        setFollowing(prev)
        return
      }
      setFollowing(body.following)
    } catch {
      setFollowing(prev)
    }
  }, [ticker, gameSlug, following])

  return { following, status, toggle }
}
