import { Capacitor } from '@capacitor/core'

/**
 * When the app runs inside Capacitor, `fetch('/api/…')` resolves against the WebView origin
 * (`https://localhost`), not your Express server — API paths must use an absolute origin.
 *
 * - **Web / Vite dev:** leave `VITE_API_ORIGIN` unset; requests stay same-origin (or proxied).
 * - **Native release:** set `VITE_API_ORIGIN` (see `.env.capacitor.example`).
 * - **Emulator / Simulator dev:** if unset, use host defaults so `npm run dev:server` works.
 */
function nativeDevApiOriginFallback(): string {
  if (typeof window === 'undefined') return ''
  try {
    if (!Capacitor.isNativePlatform()) return ''
    const platform = Capacitor.getPlatform()
    /* Android emulator → host machine. Physical device: set VITE_API_ORIGIN to http://<PC-LAN-IP>:3001 */
    if (platform === 'android') return 'http://10.0.2.2:3001'
    /* iOS Simulator → Mac. Physical device: set VITE_API_ORIGIN to http://<Mac-LAN-IP>:3001 */
    if (platform === 'ios') return 'http://127.0.0.1:3001'
  } catch {
    /* Not running under Capacitor */
  }
  return ''
}

/**
 * Desktop web often sets `VITE_API_ORIGIN=http://localhost:3001` — that works in the browser.
 * On Android (emulator or device), `localhost` is the phone/emulator itself, not your PC.
 * Rewrite loopback hosts to the emulator bridge unless already overridden.
 */
function normalizeOriginForCapacitorAndroid(origin: string): string {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return origin
    const parsed = new URL(/^https?:\/\//i.test(origin) ? origin : `http://${origin}`)
    const h = parsed.hostname.toLowerCase()
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') {
      parsed.hostname = '10.0.2.2'
      return parsed.origin.replace(/\/+$/, '')
    }
  } catch {
    /* ignore */
  }
  return origin.replace(/\/+$/, '')
}

/**
 * Production API URL when the UI is **not** same-origin with `/api` (e.g. Capacitor WebView).
 *
 * Example (HTTPS in prod): `VITE_API_ORIGIN=https://simvest.example.com`
 */
export function apiPublicOrigin(): string {
  const raw = import.meta.env.VITE_API_ORIGIN
  if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim().replace(/\/+$/, '')
    return normalizeOriginForCapacitorAndroid(trimmed)
  }
  return nativeDevApiOriginFallback().replace(/\/+$/, '')
}

/** Prepends `apiPublicOrigin()` when non-empty and `pathOrUrl` is a root-relative `'/…'` path. */
export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const origin = apiPublicOrigin()
  if (!origin || !pathOrUrl.startsWith('/')) return pathOrUrl
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
