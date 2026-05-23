import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchGameChrome } from './gameChromeApi'
import { getCachedGameChromeVars, setCachedGameChromeVars } from './gameShellCache'

const FALLBACK_GAME_CHROME: Record<string, string> = {
  '--sv-chrome-h1': '#099ae3',
  '--sv-chrome-h2': '#05557d',
  '--sv-chrome-h3': '#07406a',
  '--sv-chrome-bar1': '#099ae3',
  '--sv-chrome-bar2': '#05557d',
  '--sv-chrome-bar3': '#07406a',
  '--sv-chrome-accent-a': '#099ae3',
  '--sv-chrome-accent-b': '#05557d',
}

/** Apply server-resolved palette variables to game shell roots (see `gameChallenge.css`). */
export function useGameChromeCssVars(gameSlug: string | null | undefined): CSSProperties {
  const slug = gameSlug?.trim() || null
  const [vars, setVars] = useState<Record<string, string> | null>(() =>
    slug ? getCachedGameChromeVars(slug) : null,
  )

  useEffect(() => {
    if (!slug) {
      setVars(null)
      return
    }
    const cached = getCachedGameChromeVars(slug)
    if (cached) setVars(cached)

    let cancelled = false
    void (async () => {
      try {
        const { cssVars } = await fetchGameChrome(slug)
        if (!cancelled) {
          setCachedGameChromeVars(slug, cssVars)
          setVars(cssVars)
        }
      } catch {
        if (!cancelled && !getCachedGameChromeVars(slug)) setVars(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  return useMemo(() => {
    const merged = slug ? { ...FALLBACK_GAME_CHROME, ...(vars ?? {}) } : {}
    const out: CSSProperties = {}
    for (const [k, v] of Object.entries(merged)) {
      ;(out as Record<string, string>)[k] = v
    }
    return out
  }, [slug, vars])
}
