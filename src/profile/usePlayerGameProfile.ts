import { useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { PlayerGameProfilePayload } from './playerProfileTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function usePlayerGameProfile(gameSlug: string | undefined, profileUserId: string | undefined) {
  const [data, setData] = useState<PlayerGameProfilePayload | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameSlug || !profileUserId || profileUserId.trim().length < 2) {
      setData(null)
      setStatus('idle')
      setError(null)
      return
    }

    let cancelled = false
    const uidEnc = encodeURIComponent(profileUserId.trim())
    const url = `/api/games/${encodeURIComponent(gameSlug)}/users/${uidEnc}/profile`

    const pull = (quiet?: boolean) => {
      if (!quiet) {
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
          const errMsg = typeof (body as { error?: unknown })?.error === 'string' ? String((body as { error: string }).error) : null
          if (ok && body && typeof body === 'object' && 'profile' in body) {
            setData(body as PlayerGameProfilePayload)
            setStatus('ready')
            return
          }
          if (!quiet) {
            setError(errMsg ?? 'Could not load profile')
            setStatus('error')
            setData(null)
          }
        })
        .catch(() => {
          if (!cancelled && !quiet) {
            setError('Network error')
            setStatus('error')
            setData(null)
          }
        })
    }

    pull()

    const refresh = window.setInterval(() => pull(true), 15_000)
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
      window.clearInterval(refresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('simvest:holdings-refresh', onHoldingsRefresh)
    }
  }, [gameSlug, profileUserId])

  return { data, status, error }
}
