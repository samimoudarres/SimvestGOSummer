import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import type { PlayerGameProfilePayload } from './playerProfileTypes'
import {
  readCachedPlayerProfile,
  writeCachedPlayerProfile,
} from './playerProfileSessionCache'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePlayerGameProfile(gameSlug: string | undefined, profileUserId: string | undefined) {
  const cachedInitial =
    gameSlug && profileUserId && profileUserId.trim().length >= 2
      ? readCachedPlayerProfile(gameSlug, profileUserId.trim())
      : null
  const [data, setData] = useState<PlayerGameProfilePayload | null>(() => cachedInitial)
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(!!cachedInitial)

  useEffect(() => {
    if (!gameSlug || !profileUserId || profileUserId.trim().length < 2) {
      setData(null)
      setStatus('idle')
      setError(null)
      hasDataRef.current = false
      return
    }

    const uid = profileUserId.trim()
    const cached = readCachedPlayerProfile(gameSlug, uid)
    hasDataRef.current = !!cached
    if (cached) {
      setData(cached)
      setStatus('ready')
      setError(null)
    } else {
      setData(null)
      setStatus('loading')
      setError(null)
      hasDataRef.current = false
    }

    let cancelled = false
    const url = `/api/games/${encodeURIComponent(gameSlug)}/users/${encodeURIComponent(uid)}/profile`

    const pull = (quiet?: boolean) => {
      if (!quiet && !hasDataRef.current) {
        setStatus('loading')
        setError(null)
      }
      simvestFetch(url)
        .then((r) =>
          r
            .json()
            .then((body) => ({ ok: r.ok, body }))
            .catch(() => ({ ok: false, body: { error: 'Bad response' } as { error?: string } })),
        )
        .then(({ ok, body }) => {
          if (cancelled) return
          const errMsg =
            typeof (body as { error?: unknown })?.error === 'string'
              ? String((body as { error: string }).error)
              : null
          if (ok && body && typeof body === 'object' && 'profile' in body) {
            const payload = body as PlayerGameProfilePayload
            setData(payload)
            writeCachedPlayerProfile(gameSlug, uid, payload)
            hasDataRef.current = true
            setStatus('ready')
            setError(null)
            return
          }
          if (!quiet && !hasDataRef.current) {
            setError(errMsg ?? 'Could not load profile')
            setStatus('error')
            setData(null)
          }
        })
        .catch(() => {
          if (!cancelled && !quiet && !hasDataRef.current) {
            setError('Network error')
            setStatus('error')
            setData(null)
          }
        })
    }

    pull(!!cached)

    const stopPoll = visibilityAwareInterval(() => pull(true), {
      visibleMs: 15_000,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
      runOnVisible: false,
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull(true)
    }
    const onHoldingsRefresh = (ev: Event) => {
      const slug = (ev as CustomEvent<{ gameSlug?: string }>).detail?.gameSlug
      if (!slug || slug === gameSlug) pull(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('simvest:holdings-refresh', onHoldingsRefresh)

    return () => {
      cancelled = true
      stopPoll()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
    }
  }, [gameSlug, profileUserId])

  return { data, status, error }
}
