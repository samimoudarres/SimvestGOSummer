import { useEffect } from 'react'

/**
 * While mounted, mirrors keyboard occlusion into a CSS var (join profile / trade sheets).
 * Clears the var on unmount.
 */
export function useKeyboardInsetCssVar(cssVar = '--sv-kb-offset', enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return

    const syncKb = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop ?? 0))
      document.documentElement.style.setProperty(cssVar, `${Math.round(inset)}px`)
    }
    syncKb()
    vv.addEventListener('resize', syncKb)
    vv.addEventListener('scroll', syncKb)
    return () => {
      vv.removeEventListener('resize', syncKb)
      vv.removeEventListener('scroll', syncKb)
      document.documentElement.style.removeProperty(cssVar)
    }
  }, [cssVar, enabled])
}
