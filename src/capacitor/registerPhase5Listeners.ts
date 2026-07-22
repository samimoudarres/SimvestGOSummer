import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { tryCloseTopSheet } from '../lib/sheetBackStack'
import { apiPublicOrigin } from '../config/apiPublicOrigin'

let registered = false

const ALLOWED_PATH_PREFIXES = [
  '/join',
  '/g/',
  '/stock/',
  '/settings',
  '/login',
  '/signup',
  '/create-game',
  '/admin',
] as const

function isAllowedInAppPath(pathWithQuery: string): boolean {
  const pathOnly = pathWithQuery.split(/[?#]/)[0] || '/'
  if (pathOnly === '/' || pathOnly === '') return true
  return ALLOWED_PATH_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(p))
}

function allowedDeepLinkHosts(): Set<string> {
  const hosts = new Set<string>(['localhost', '127.0.0.1'])
  try {
    const origin = apiPublicOrigin()
    if (origin) hosts.add(new URL(origin).hostname.toLowerCase())
  } catch {
    /* ignore */
  }
  /* Known production API host (App Links / Universal Links). */
  hosts.add('simvest-api.onrender.com')
  return hosts
}

/**
 * Map an HTTPS App Link / Universal Link (or custom scheme) onto an in-app path.
 * Join: https://simvest-api.onrender.com/join?code=123456 → /join?code=123456
 * Also allows /g/…, /stock/…, /settings, auth, create-game when host is trusted.
 */
export function inAppPathFromDeepLinkUrl(url: string): string | null {
  const raw = url.trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
    if (!isAllowedInAppPath(path)) return null

    const host = parsed.hostname.toLowerCase()
    const trusted = allowedDeepLinkHosts()
    /* capacitor://localhost/… after verification, or https App Links. */
    if (host === 'localhost' || trusted.has(host)) return path
    if (parsed.protocol === 'capacitor:' || parsed.protocol === 'simvest:') return path
  } catch {
    if (raw.startsWith('/') && isAllowedInAppPath(raw)) return raw
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
 * Android hardware back → close sheet, else WebView history; exit at root.
 * App Links / Universal Links → in-app routes (same bridge as push nav).
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
