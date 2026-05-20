/**
 * React Router `basename` from Vite `base`. Omit for `/` and `./` (Capacitor).
 */
export function reactRouterBasename(): string | undefined {
  const raw = import.meta.env?.BASE_URL ?? '/'
  if (raw === '/' || raw === './' || raw === '.') return undefined
  let path = raw.endsWith('/') ? raw.slice(0, -1) : raw
  if (!path.startsWith('/')) path = `/${path}`
  return path === '' ? undefined : path
}
