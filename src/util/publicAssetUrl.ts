/**
 * URL for files in Vite `public/` (e.g. `figma-assets/challenge/arrow-back.svg`).
 * Web builds use `base: '/'` → `/figma-assets/...` (works on every route).
 * Capacitor uses `base: './'` → `./figma-assets/...` (WebView file bundle).
 */
export function publicAssetUrl(pathFromPublicRoot: string): string {
  const trimmed = pathFromPublicRoot.replace(/^\/+/, '')
  const base = import.meta.env?.BASE_URL ?? '/'
  if (base === '/' || base === '') return `/${trimmed}`
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${trimmed}`
}
