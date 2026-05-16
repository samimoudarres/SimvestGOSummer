import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchGameChrome } from './gameChromeApi'
import { getCachedGameChromeVars, setCachedGameChromeVars } from './gameShellCache'

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
    if (!vars) return {}
    const out: CSSProperties = {}
    for (const [k, v] of Object.entries(vars)) {
      ;(out as Record<string, string>)[k] = v
    }
    return out
  }, [vars])
}
