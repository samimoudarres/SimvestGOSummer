import { slugToVariant } from '../challenge/gameMeta'
import { fetchCreateGameSettings, type CreateSettingsGetResponse } from '../createGame/createGameSettingsApi'
import { simvestFetch } from '../api/simvestFetch'
import { writeCachedGameFeed } from '../challenge/gameFeedSessionCache'
import type { GameFeedPostRow } from '../challenge/useGameFeed'
import { prefetchLeaderboardAllSorts } from '../leaderboard/leaderboardPrefetch'
import { prefetchPerformCharts } from '../perform/performChartPrefetch'
import { fetchGameChrome } from './gameChromeApi'
import { warmAllGameTabChunksIdle, warmGameTabChunk } from './warmGameTabChunks'

export type CachedGameHeaderState = {
  templateTitle: string | null
  templateHostLine: string | null
  newGamePublished: boolean | null
  runtimeShell: {
    title: string | null
    hostLine: string | null
    endsAtIso: string | null
  }
}

function cacheKey(slug: string): string {
  return slug.trim().toLowerCase()
}

const chromeBySlug = new Map<string, Record<string, string>>()
const headerBySlug = new Map<string, CachedGameHeaderState>()
const prefetchInflight = new Map<string, Promise<void>>()
const tabDataWarmStarted = new Set<string>()

/** Drop in-memory shell caches on logout / account switch. */
export function clearGameShellCaches(): void {
  chromeBySlug.clear()
  headerBySlug.clear()
  prefetchInflight.clear()
  tabDataWarmStarted.clear()
}

export function getCachedGameChromeVars(slug: string): Record<string, string> | null {
  const hit = chromeBySlug.get(cacheKey(slug))
  return hit ? { ...hit } : null
}

export function setCachedGameChromeVars(slug: string, vars: Record<string, string>): void {
  const k = cacheKey(slug)
  if (!k || !vars || typeof vars !== 'object') return
  chromeBySlug.set(k, { ...vars })
}

export function getCachedGameHeaderState(slug: string): CachedGameHeaderState | null {
  const hit = headerBySlug.get(cacheKey(slug))
  if (!hit) return null
  return {
    templateTitle: hit.templateTitle,
    templateHostLine: hit.templateHostLine,
    newGamePublished: hit.newGamePublished,
    runtimeShell: { ...hit.runtimeShell },
  }
}

/** Mirror `useGameChallengeHeader` ingest — keeps tab switches on the same slug instant. */
export function cacheGameHeaderFromCreateSettings(
  slug: string,
  d: CreateSettingsGetResponse,
): CachedGameHeaderState {
  const isTemplate = slugToVariant(slug) === 'template'
  let templateTitle: string | null = null
  let templateHostLine: string | null = null
  let newGamePublished: boolean | null = isTemplate ? false : null

  if (isTemplate) {
    newGamePublished = Boolean(d.settings?.setupComplete)
  }
  if (isTemplate && d.settings) {
    const name = d.settings.gameDisplayName.trim()
    templateTitle = name || null
    const hn = d.settings.hostDisplayName.trim()
    templateHostLine = hn ? `Hosted by ${hn}` : null
  }

  let runtimeShell: CachedGameHeaderState['runtimeShell'] = {
    title: null,
    hostLine: null,
    endsAtIso: null,
  }
  if (d.settings) {
    const t = d.settings.gameDisplayName.trim()
    const hn = d.settings.hostDisplayName.trim()
    const endsAtIso =
      typeof d.settings.endsAtIso === 'string' && d.settings.endsAtIso.length >= 10
        ? d.settings.endsAtIso
        : null
    runtimeShell = {
      title: t || null,
      hostLine: hn ? `Hosted by ${hn}` : null,
      endsAtIso,
    }
  }

  const state: CachedGameHeaderState = {
    templateTitle,
    templateHostLine,
    newGamePublished,
    runtimeShell,
  }
  headerBySlug.set(cacheKey(slug), state)
  return state
}

/** One light feed warm that actually seeds the session cache (no portfolio/perform storm). */
function prefetchGameFeedIntoCache(slug: string): void {
  void simvestFetch(`/api/games/${encodeURIComponent(slug)}/feed?limit=50`, { method: 'GET' })
    .then(async (r) => {
      const body = await r.json().catch(() => null)
      if (r.ok && body && Array.isArray(body.posts)) {
        writeCachedGameFeed(slug, body.posts as GameFeedPostRow[])
      }
    })
    .catch(() => {})
}

/** Warm chrome + header + feed cache + JS chunks (no Massive-heavy fan-out). */
export function prefetchGameShell(slug: string): void {
  const k = cacheKey(slug)
  if (!k) return
  warmGameTabChunk('activity')
  warmAllGameTabChunksIdle()
  if (!tabDataWarmStarted.has(k)) {
    tabDataWarmStarted.add(k)
    /* Delayed: perform charts + leaderboard sorts only (staggered inside those helpers). */
    window.setTimeout(() => {
      prefetchPerformCharts(slug)
      window.setTimeout(() => prefetchLeaderboardAllSorts(slug), 400)
    }, 900)
  }
  if (prefetchInflight.has(k)) return
  prefetchGameFeedIntoCache(slug)
  const job = Promise.all([
    fetchGameChrome(slug)
      .then((r) => setCachedGameChromeVars(slug, r.cssVars))
      .catch(() => {}),
    fetchCreateGameSettings(slug)
      .then((d) => cacheGameHeaderFromCreateSettings(slug, d))
      .catch(() => {}),
  ]).then(() => undefined)
  prefetchInflight.set(k, job)
  void job.finally(() => prefetchInflight.delete(k))
}
