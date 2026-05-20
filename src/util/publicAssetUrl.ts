/**
 * URL for files served from Vite `public/` (e.g. `legal/privacy-policy.txt`).
 * Correct with `base: '/'` (typical web deploy) and `base: './'` (Capacitor bundle).
 */
export function publicAssetUrl(pathFromPublicRoot: string): string {
  const trimmed = pathFromPublicRoot.replace(/^\/+/, '')
  const base = import.meta.env?.BASE_URL ?? '/'
  if (!base || base === '/') return `/${trimmed}`
  const sep = base.endsWith('/') ? '' : '/'
  return `${base}${sep}${trimmed}`
}
