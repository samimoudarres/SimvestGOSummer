import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { tryCloseTopSheet } from '../lib/sheetBackStack'

let registered = false

/**
 * Map an HTTPS App Link / Universal Link (or custom scheme) onto an in-app path.
 * Join links: https://simvest-api.onrender.com/join?code=123456 → /join?code=123456
 */
export function inAppPathFromDeepLinkUrl(url: string): string | null {
  const raw = url.trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
    if (path.startsWith('/join')) return path
    /* Capacitor may pass capacitor://localhost/join?code=… after verification. */
    if (parsed.hostname === 'localhost' && path.startsWith('/join')) return path
  } catch {
    if (raw.startsWith('/join')) return raw
  }
  return null
}

function dispatchInAppNav(path: string): void {
  try {
    window.dispatchEvent(new CustomEvent('simvest-push-nav', { detail: { url: path } }))
  } catch {
    /* ignore */
  }
}

function handleDeepLinkUrl(url: string | undefined): void {
  if (!url) return
  const path = inAppPathFromDeepLinkUrl(url)
  if (path) dispatchInAppNav(path)
}

/**
 * Android hardware back → WebView history; when the stack cannot go back, exit the activity.
 * App Links / Universal Links → in-app join route (same bridge as push nav).
 * No-op on web.
 */
export function registerCapacitorNativeChromeListeners(): void {
  if (registered || typeof window === 'undefined') return
  if (!Capacitor.isNativePlatform()) return
  registered = true

  void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (tryCloseTopSheet()) return
    if (canGoBack) {
      window.history.back()
    } else {
      void CapacitorApp.exitApp()
    }
  })

  void CapacitorApp.addListener('resume', () => {
    try {
      window.dispatchEvent(new CustomEvent('simvest:native-app-resume'))
    } catch {
      /* ignore */
    }
  })

  void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    handleDeepLinkUrl(url)
  })

  void CapacitorApp.getLaunchUrl()
    .then((launch) => {
      handleDeepLinkUrl(launch?.url)
    })
    .catch(() => {
      /* ignore */
    })
}
