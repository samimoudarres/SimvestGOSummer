import { Capacitor } from '@capacitor/core'

/** Baked at build time when set in `.env` / `.env.capacitor` (empty string if unset). */
function viteApiOriginFromEnv(): string {
  const raw = import.meta.env.VITE_API_ORIGIN
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/\/+$/, '')
}

/**
 * True when UI runs inside the Capacitor WebView (not desktop browser).
 * `sv-capacitor` is added on `<html>` in `main.tsx` before React mounts — reliable
 * even if `Capacitor.isNativePlatform()` is unavailable during early module init.
 */
export function isCapacitorShell(): boolean {
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('sv-capacitor')) return true
    const { protocol, hostname } = window.location
    if (hostname === 'localhost' && protocol === 'https:') return true
  }
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function capacitorPlatform(): 'android' | 'ios' | 'web' {
  try {
    const p = Capacitor.getPlatform()
    if (p === 'android' || p === 'ios') return p
  } catch {
    /* ignore */
  }
  return 'web'
}

/** Dev API on the host machine (Express `npm run dev:server`, port 3001). */
export function defaultNativeDevApiOrigin(): string {
  return capacitorPlatform() === 'ios' ? 'http://127.0.0.1:3001' : 'http://10.0.2.2:3001'
}

/** Map baked / env origins to the host address each native platform can reach. */
function normalizeOriginForNativePlatform(origin: string): string {
  if (!isCapacitorShell()) return origin.replace(/\/+$/, '')
  const platform = capacitorPlatform()
  try {
    const parsed = new URL(/^https?:\/\//i.test(origin) ? origin : `http://${origin}`)
    const h = parsed.hostname.toLowerCase()
    if (platform === 'android') {
      if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') parsed.hostname = '10.0.2.2'
    } else if (platform === 'ios') {
      if (h === '10.0.2.2') parsed.hostname = '127.0.0.1'
    }
    return parsed.origin.replace(/\/+$/, '')
  } catch {
    return origin.replace(/\/+$/, '')
  }
}

/**
 * Absolute API origin for `/api/*` when the UI is not same-origin with Express
 * (Capacitor WebView). Empty on desktop web with Vite proxy / same-host deploy.
 */
export function apiPublicOrigin(): string {
  const fromEnv = viteApiOriginFromEnv()
  if (fromEnv) return normalizeOriginForNativePlatform(fromEnv)
  if (isCapacitorShell()) return defaultNativeDevApiOrigin()
  return ''
}

/** Prepends `apiPublicOrigin()` when needed; never leaves `/api/...` relative on native. */
export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (!pathOrUrl.startsWith('/')) return pathOrUrl

  let origin = apiPublicOrigin()
  if (!origin && isCapacitorShell()) {
    origin = defaultNativeDevApiOrigin()
  }
  if (!origin) return pathOrUrl
  return `${origin}${pathOrUrl}`
}

/** Dev-only: catch common `VITE_API_ORIGIN` mistakes early in the console. */
export function logDevApiOriginMisconfiguration(): void {
  if (!import.meta.env.DEV) return
  const raw = import.meta.env.VITE_API_ORIGIN
  if (typeof raw !== 'string') return
  const t = raw.trim()
  if (!t) return
  if (/\/api\/?$/i.test(t)) {
    console.warn(
      '[simvest] VITE_API_ORIGIN must not end with /api — use the host origin only (e.g. https://app.example.com).',
    )
  }
}
