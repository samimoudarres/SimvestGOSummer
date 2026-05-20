import { isCapacitorShell, resolveApiUrl } from './apiPublicOrigin'
import { publicAssetUrl } from '../util/publicAssetUrl'

export { isCapacitorShell }

/**
 * Use for `<img src>` when the server returns root-relative **`/api/...`** URLs.
 * In Capacitor (`VITE_API_ORIGIN` set), plain `/api/...` would resolve against the
 * WebView origin and fail. Static **`/figma-assets/...`** paths are rewritten for
 * `base: './'` native bundles via `publicAssetUrl`.
 */
export function apiAssetSrc(url: string | null | undefined): string {
  if (url == null || url === '') return ''
  const t = url.trim()
  if (/^https?:\/\//i.test(t) || t.startsWith('data:') || t.startsWith('blob:')) return t
  if (t.startsWith('/api/')) return resolveApiUrl(t)
  if (t.startsWith('/')) return publicAssetUrl(t.replace(/^\/+/, ''))
  return t
}
