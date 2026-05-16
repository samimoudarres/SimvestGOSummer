import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchCreateGameSettings, type CreateSettingsGetResponse } from '../createGame/createGameSettingsApi'

import {

  cacheGameHeaderFromCreateSettings,

  getCachedGameHeaderState,

  type CachedGameHeaderState,

} from '../game/gameShellCache'

import { gameHostLine, gameTitle, slugToVariant } from './gameMeta'

import { useGameMembersPreview } from './useGameMembersPreview'



type RuntimeShell = CachedGameHeaderState['runtimeShell']



function emptyRuntimeShell(): RuntimeShell {

  return { title: null, hostLine: null, endsAtIso: null }

}



function headerStateFromCache(slug: string): CachedGameHeaderState | null {

  return getCachedGameHeaderState(slug)

}



/**

 * Live game name, host line, countdown, and members-preview roster — same data the Activity tab uses.

 * Other challenge tabs mount this hook so the gradient header stays consistent when switching routes.

 */

export function useGameChallengeHeader(gameSlug: string) {

  const variant = useMemo(() => slugToVariant(gameSlug), [gameSlug])

  const isTemplate = variant === 'template'



  const cachedInit = useMemo(() => headerStateFromCache(gameSlug), [gameSlug])



  const [templateTitle, setTemplateTitle] = useState<string | null>(

    () => cachedInit?.templateTitle ?? null,

  )

  const [templateHostLine, setTemplateHostLine] = useState<string | null>(

    () => cachedInit?.templateHostLine ?? null,

  )

  const [newGamePublished, setNewGamePublished] = useState<boolean | null>(

    () => cachedInit?.newGamePublished ?? null,

  )

  const [runtimeShell, setRuntimeShell] = useState<RuntimeShell>(

    () => cachedInit?.runtimeShell ?? emptyRuntimeShell(),

  )

  const [nowMs, setNowMs] = useState(() => Date.now())



  const applyCachedHeader = useCallback((cached: CachedGameHeaderState) => {

    setTemplateTitle(cached.templateTitle)

    setTemplateHostLine(cached.templateHostLine)

    setNewGamePublished(cached.newGamePublished)

    setRuntimeShell(cached.runtimeShell)

  }, [])



  const ingestCreateSettingsResponse = useCallback(

    (d: CreateSettingsGetResponse) => {

      const cached = cacheGameHeaderFromCreateSettings(gameSlug, d)

      applyCachedHeader(cached)

    },

    [gameSlug, applyCachedHeader],

  )



  useEffect(() => {

    const cached = headerStateFromCache(gameSlug)

    if (cached) applyCachedHeader(cached)

  }, [gameSlug, applyCachedHeader])



  const reload = useCallback(async () => {

    const d = await fetchCreateGameSettings(gameSlug)

    ingestCreateSettingsResponse(d)

    return d

  }, [gameSlug, ingestCreateSettingsResponse])



  useEffect(() => {

    let cancelled = false

    void (async () => {

      try {

        const d = await fetchCreateGameSettings(gameSlug)

        if (cancelled) return

        ingestCreateSettingsResponse(d)

      } catch {

        if (!cancelled) {

          const cached = headerStateFromCache(gameSlug)

          if (cached) {

            applyCachedHeader(cached)

          } else {

            setRuntimeShell(emptyRuntimeShell())

            if (isTemplate) setNewGamePublished(false)

          }

        }

      }

    })()

    return () => {

      cancelled = true

    }

  }, [gameSlug, ingestCreateSettingsResponse, isTemplate, applyCachedHeader])



  useEffect(() => {

    const onVis = () => {

      if (document.visibilityState === 'visible') void reload().catch(() => {})

    }

    document.addEventListener('visibilitychange', onVis)

    return () => document.removeEventListener('visibilitychange', onVis)

  }, [reload])



  const shellIsLive = !isTemplate || newGamePublished === true



  const {

    members: rosterMembers,

    totalPlayers,

    status: rosterStatus,

  } = useGameMembersPreview(gameSlug || undefined, Boolean(gameSlug) && shellIsLive)



  useEffect(() => {

    if (!runtimeShell.endsAtIso) return

    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)

    return () => window.clearInterval(id)

  }, [runtimeShell.endsAtIso])



  const headerTitle = useMemo(

    () =>

      isTemplate && templateTitle

        ? templateTitle

        : runtimeShell.title ?? gameTitle(variant),

    [isTemplate, templateTitle, runtimeShell.title, variant],

  )



  const headerHost = useMemo(

    () =>

      isTemplate && templateHostLine

        ? templateHostLine

        : runtimeShell.hostLine ?? gameHostLine(variant),

    [isTemplate, templateHostLine, runtimeShell.hostLine, variant],

  )



  const headerCountdown = useMemo(() => {

    const iso = runtimeShell.endsAtIso

    if (!iso) return null

    const endMs = new Date(iso).getTime()

    if (!Number.isFinite(endMs)) return null

    const remaining = endMs - nowMs

    if (remaining <= 0) return 'Game ended'

    const totalHours = Math.floor(remaining / 3_600_000)

    const days = Math.floor(totalHours / 24)

    const hours = totalHours % 24

    if (days > 0) return `Ends in ${days}d ${hours}h`

    if (hours > 0) return `Ends in ${hours}h`

    const minutes = Math.max(1, Math.floor(remaining / 60_000))

    return `Ends in ${minutes}m`

  }, [runtimeShell.endsAtIso, nowMs])



  const gameHasEnded = useMemo(() => {

    const iso = runtimeShell.endsAtIso

    if (!iso) return false

    const endMs = new Date(iso).getTime()

    return Number.isFinite(endMs) && nowMs > endMs

  }, [runtimeShell.endsAtIso, nowMs])



  return {

    variant,

    isTemplate,

    shellIsLive,

    newGamePublished,

    headerTitle,

    headerHost,

    headerCountdown,

    rosterMembers,

    totalPlayers,

    rosterStatus,

    runtimeShellEndsAtIso: runtimeShell.endsAtIso,

    gameHasEnded,

    ingestCreateSettingsResponse,

    reload,

  }

}


