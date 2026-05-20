import { simvestFetch } from './simvestFetch'
import { welcomeThemeForPalette } from '../game/gameThemePresets'
import { firstGraphemeFromString } from '../game/loadScreenEmoji'

export type MyGameCardTheme = {
  joinButtonColor: string
  joinButtonBorderColor: string
  welcomeGradientAngleDeg: number
  welcomeGradientFrom: string
  welcomeGradientTo: string
  prizeAmountColor: string
  titleTextShadow?: string
}

export type MyGameSummary = {
  slug: string
  title: string
  subtitle: string
  cardTheme: MyGameCardTheme
  /** Host-selected load-screen emoji (one grapheme). */
  loadScreenEmoji: string
  status: 'live' | 'finished'
  endsAtIso: string | null
  /** True when this viewer published / owns the game runtime row. */
  isHost: boolean
  /** Pending private-game join requests awaiting host approval. */
  pendingJoinRequestCount: number
}

function defaultCardTheme(): MyGameCardTheme {
  const w = welcomeThemeForPalette('ocean_deep')
  return {
    joinButtonColor: w.joinButtonColor,
    joinButtonBorderColor: w.joinButtonBorderColor,
    welcomeGradientAngleDeg: w.welcomeGradientAngleDeg,
    welcomeGradientFrom: w.welcomeGradientFrom,
    welcomeGradientTo: w.welcomeGradientTo,
    prizeAmountColor: w.prizeAmountColor,
    ...(w.titleTextShadow && w.titleTextShadow.trim().length > 0
      ? { titleTextShadow: w.titleTextShadow.trim() }
      : {}),
  }
}

function parseCardTheme(raw: unknown): MyGameCardTheme {
  if (!raw || typeof raw !== 'object') return defaultCardTheme()
  const o = raw as Record<string, unknown>
  const joinButtonColor = typeof o.joinButtonColor === 'string' ? o.joinButtonColor : ''
  const joinButtonBorderColor = typeof o.joinButtonBorderColor === 'string' ? o.joinButtonBorderColor : ''
  const welcomeGradientFrom = typeof o.welcomeGradientFrom === 'string' ? o.welcomeGradientFrom : ''
  const welcomeGradientTo = typeof o.welcomeGradientTo === 'string' ? o.welcomeGradientTo : ''
  const prizeAmountColor = typeof o.prizeAmountColor === 'string' ? o.prizeAmountColor : ''
  const deg = Number(o.welcomeGradientAngleDeg)
  if (
    !joinButtonColor ||
    !joinButtonBorderColor ||
    !welcomeGradientFrom ||
    !welcomeGradientTo ||
    !prizeAmountColor ||
    !Number.isFinite(deg)
  ) {
    return defaultCardTheme()
  }
  const titleTextShadow =
    typeof o.titleTextShadow === 'string' && o.titleTextShadow.trim().length > 0
      ? o.titleTextShadow.trim()
      : undefined
  return {
    joinButtonColor,
    joinButtonBorderColor,
    welcomeGradientAngleDeg: deg,
    welcomeGradientFrom,
    welcomeGradientTo,
    prizeAmountColor,
    ...(titleTextShadow ? { titleTextShadow } : {}),
  }
}

export async function fetchMyJoinedGames(opts?: {
  /** Once per app open — counts toward hiding finished games after 5 home visits. */
  recordFinishedReopens?: boolean
}): Promise<MyGameSummary[]> {
  const q = opts?.recordFinishedReopens ? '?recordFinishedReopens=1' : ''
  const res = await simvestFetch(`/api/me/games${q}`)
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(t || `My games failed (${res.status})`)
  }
  const j = (await res.json()) as { games?: unknown }
  if (!Array.isArray(j.games)) return []
  const out: MyGameSummary[] = []
  for (const row of j.games) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const slug = typeof o.slug === 'string' ? o.slug : ''
    const title = typeof o.title === 'string' ? o.title : ''
    const subtitle = typeof o.subtitle === 'string' ? o.subtitle : ''
    if (!slug || !title) continue
    const statusRaw = o.status
    const status: 'live' | 'finished' =
      statusRaw === 'finished' ? 'finished' : 'live'
    const endsAtIso = typeof o.endsAtIso === 'string' && o.endsAtIso.length >= 10 ? o.endsAtIso : null
    const loadScreenEmoji =
      typeof o.loadScreenEmoji === 'string' && o.loadScreenEmoji.trim().length > 0
        ? firstGraphemeFromString(o.loadScreenEmoji)
        : firstGraphemeFromString('🍁')
    const isHost = o.isHost === true
    const pendingJoinRequestCount =
      typeof o.pendingJoinRequestCount === 'number' && Number.isFinite(o.pendingJoinRequestCount)
        ? Math.max(0, Math.floor(o.pendingJoinRequestCount))
        : 0
    out.push({
      slug,
      title,
      subtitle,
      cardTheme: parseCardTheme(o.cardTheme),
      loadScreenEmoji,
      status,
      endsAtIso,
      isHost,
      pendingJoinRequestCount,
    })
  }
  return out
}
