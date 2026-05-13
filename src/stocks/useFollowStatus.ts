import { useCallback, useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'

export function useFollowStatus(ticker: string | undefined) {
  const [following, setFollowing] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setStatus('loading')
    simvestFetch(`/api/me/following/${encodeURIComponent(ticker)}`)
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
  }, [ticker])

  const toggle = useCallback(async () => {
    if (!ticker) return
    const next = !following
    const prev = following
    setFollowing(next)
    try {
      const r = await simvestFetch(`/api/me/following/${encodeURIComponent(ticker)}`, {
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
  }, [ticker, following])

  return { following, status, toggle }
}
