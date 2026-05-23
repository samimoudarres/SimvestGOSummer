import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { PublicGameItem } from './publicGamesTypes'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export function usePublicGames(enabled: boolean) {
  const [games, setGames] = useState<PublicGameItem[]>([])
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const inflightRef = useRef(false)

  const load = useCallback(async () => {
    if (inflightRef.current) return
    inflightRef.current = true
    setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'))
    setError(null)
    try {
      const resp = await simvestFetch('/api/games/public', { method: 'GET' })
      if (!resp.ok) {
        setStatus('error')
        setError(`Public games request failed (${resp.status})`)
        return
      }
      const body = (await resp.json()) as { games?: PublicGameItem[] }
      setGames(Array.isArray(body.games) ? body.games : [])
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not load public games')
    } finally {
      inflightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      setGames([])
      setStatus('idle')
      setError(null)
      return
    }
    void load()
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [enabled, load])

  return { games, status, error, reload: load }
}
