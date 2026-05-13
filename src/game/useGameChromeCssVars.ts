import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchGameChrome } from './gameChromeApi'

/** Apply server-resolved palette variables to game shell roots (see `gameChallenge.css`). */
export function useGameChromeCssVars(gameSlug: string | null | undefined): CSSProperties {
  const slug = gameSlug?.trim() || null
  const [vars, setVars] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    if (!slug) {
      setVars(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { cssVars } = await fetchGameChrome(slug)
        if (!cancelled) setVars(cssVars)
      } catch {
        if (!cancelled) setVars(null)
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
