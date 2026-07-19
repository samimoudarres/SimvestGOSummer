import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import {
  readCachedMembersPreview,
  writeCachedMembersPreview,
} from './membersPreviewSessionCache'
import { LIVE_MARKETS_POLL_HIDDEN_MS } from '../config/liveMarketsPoll'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'

export type GameMemberPreview = {
  userId: string
  displayName: string
  avatarUrl: string
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

const POLL_MS = 20_000

/** Live roster for game header (avatars + accurate player count). */
export function useGameMembersPreview(gameSlug: string | undefined, enabled: boolean) {
  const cachedInitial =
    enabled && gameSlug ? readCachedMembersPreview(gameSlug) : null
  const [totalPlayers, setTotalPlayers] = useState(() => cachedInitial?.totalPlayers ?? 0)
  const [members, setMembers] = useState<GameMemberPreview[]>(() => cachedInitial?.members ?? [])
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(!!cachedInitial)
  const skipLoadingUiRef = useRef(!!cachedInitial)

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!gameSlug?.trim() || !enabled) return
      const silent =
        mode === 'refresh'
          ? hasLoadedRef.current
          : skipLoadingUiRef.current || hasLoadedRef.current
      if (mode === 'initial') skipLoadingUiRef.current = false
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
        const nextTotal = typeof body.totalPlayers === 'number' ? body.totalPlayers : 0
        const nextMembers = Array.isArray(body.members) ? body.members : []
        setTotalPlayers(nextTotal)
        setMembers(nextMembers)
        writeCachedMembersPreview(gameSlug.trim(), nextTotal, nextMembers)
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
    if (!enabled || !gameSlug?.trim()) {
      hasLoadedRef.current = false
      skipLoadingUiRef.current = false
      setTotalPlayers(0)
      setMembers([])
      setStatus('idle')
      setError(null)
      return
    }
    const cached = readCachedMembersPreview(gameSlug)
    hasLoadedRef.current = !!cached
    skipLoadingUiRef.current = !!cached
    if (cached) {
      setTotalPlayers(cached.totalPlayers)
      setMembers(cached.members)
      setStatus('ready')
      setError(null)
    } else {
      setTotalPlayers(0)
      setMembers([])
      setStatus('idle')
    }
    void load('initial')
  }, [enabled, gameSlug, load])

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
  }, [enabled, gameSlug, load])

  return { totalPlayers, members, status, error, reload: () => void load('refresh') }
}
