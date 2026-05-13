import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'

export type GameMemberPreview = {
  userId: string
  displayName: string
  avatarUrl: string
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

const POLL_MS = 20_000

/** Live roster for game header (avatars + accurate player count). */
export function useGameMembersPreview(gameSlug: string | undefined, enabled: boolean) {
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [members, setMembers] = useState<GameMemberPreview[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!gameSlug?.trim() || !enabled) return
      const silent = mode === 'refresh' && hasLoadedRef.current
      if (!silent) {
        setStatus('loading')
        setError(null)
      }
      try {
        const res = await simvestFetch(
          `/api/games/${encodeURIComponent(gameSlug.trim())}/members-preview`,
        )
        const body = (await res.json().catch(() => ({}))) as {
          totalPlayers?: number
          members?: GameMemberPreview[]
          error?: string
        }
        if (!res.ok) {
          if (!silent) {
            setError(typeof body.error === 'string' ? body.error : `Request failed (${res.status})`)
            setMembers([])
            setTotalPlayers(0)
            setStatus('error')
          }
          return
        }
        setTotalPlayers(typeof body.totalPlayers === 'number' ? body.totalPlayers : 0)
        setMembers(Array.isArray(body.members) ? body.members : [])
        hasLoadedRef.current = true
        setStatus('ready')
      } catch {
        if (!silent) {
          setError('Network error')
          setMembers([])
          setTotalPlayers(0)
          setStatus('error')
        }
      }
    },
    [gameSlug, enabled],
  )

  useEffect(() => {
    hasLoadedRef.current = false
    void load('initial')
  }, [load])

  useEffect(() => {
    if (!enabled || !gameSlug?.trim()) return
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
  }, [enabled, gameSlug, load])

  return { totalPlayers, members, status, error, reload: () => void load('refresh') }
}
