import { isCapacitorShell } from '../config/apiPublicOrigin'

/**
 * URL for files in Vite `public/` (e.g. `figma-assets/challenge/arrow-back.svg`).
 * Web builds use `base: '/'` → `/figma-assets/...` (works on every route).
 * Capacitor uses `base: './'` but routes like `/g/:slug` must not resolve assets
 * relative to the current path (that 404s icons on game screens).
 */
export function publicAssetUrl(pathFromPublicRoot: string): string {
  const trimmed = pathFromPublicRoot.replace(/^\/+/, '')
  if (typeof window !== 'undefined' && isCapacitorShell()) {
    return `${window.location.origin}/${trimmed}`
  }
  const base = import.meta.env?.BASE_URL ?? '/'
  if (base === '/' || base === '') return `/${trimmed}`
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${trimmed}`
}
