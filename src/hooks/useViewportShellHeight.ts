import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'

function readViewportHeight(): number {
  if (typeof window === 'undefined') return 874
  return Math.round(window.visualViewport?.height ?? window.innerHeight)
}

/** Live WebView height (Capacitor / mobile browser chrome). */
export function useViewportShellHeight(): number {
  const [height, setHeight] = useState(readViewportHeight)

  useEffect(() => {
    const sync = () => setHeight(readViewportHeight())
    sync()
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      window.visualViewport?.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])

  return height
}

export function isNativeAppShell(): boolean {
  return Capacitor.isNativePlatform()
}
