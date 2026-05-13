import { useCallback, useEffect, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'

export type ComposerContext = {
  userId: string
  displayName: string
  avatarUrl: string
  gameSlug: string
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

/** Avatar + display name + resolved game slug for posting (home or game activity). */
export function useComposerContext(gameSlugHint?: string | null) {
  const [ctx, setCtx] = useState<ComposerContext | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const q =
        typeof gameSlugHint === 'string' && gameSlugHint.trim().length > 0
          ? `?gameSlug=${encodeURIComponent(gameSlugHint.trim())}`
          : ''
      const res = await simvestFetch(`/api/me/composer-context${q}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`
        setError(msg)
        setCtx(null)
        setStatus('error')
        return
      }
      if (!body?.userId || typeof body.avatarUrl !== 'string') {
        setError('Invalid response')
        setCtx(null)
        setStatus('error')
        return
      }
      setCtx(body as ComposerContext)
      setStatus('ready')
    } catch {
      setError('Network error')
      setCtx(null)
      setStatus('error')
    }
  }, [gameSlugHint])

  useEffect(() => {
    void load()
  }, [load])

  return { ctx, status, error, reload: load }
}
