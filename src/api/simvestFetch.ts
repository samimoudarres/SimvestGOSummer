import { getSimvestUserId } from '../user/simvestUserId'

/** Same rule as `normalizeUserId` on the API — must stay in sync. */
const VIEWER_ID_RE = /^[a-zA-Z0-9_.-]{8,128}$/

function viewerIdForGames(): string | null {
  const id = getSimvestUserId().trim()
  return VIEWER_ID_RE.test(id) ? id : null
}

/** Session-scoped endpoints that should receive `uid` when headers are stripped (same as `/api/games/*`). */
function withViewerQueryForSession(urlString: string): string {
  const id = viewerIdForGames()
  if (!id) return urlString
  const hits =
    urlString.includes('/api/games/') ||
    urlString.includes('/api/me/activity/') ||
    urlString.includes('/api/me/composer-context') ||
    urlString.includes('/api/me/following') ||
    urlString.includes('/api/me/games') ||
    urlString.includes('/api/join/')
  if (!hits) return urlString
  try {
    const absolute = urlString.startsWith('http')
    const u = absolute
      ? new URL(urlString)
      : new URL(urlString, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    if (u.searchParams.has('uid')) return urlString
    u.searchParams.set('uid', id)
    return absolute ? u.toString() : `${u.pathname}${u.search}${u.hash}`
  } catch {
    if (/[?&]uid=/.test(urlString)) return urlString
    const sep = urlString.includes('?') ? '&' : '?'
    return `${urlString}${sep}uid=${encodeURIComponent(id)}`
  }
}

function gamesGetCache(urlString: string, init?: RequestInit): RequestCache | undefined {
  const m = (init?.method ?? 'GET').toUpperCase()
  if (m !== 'GET') return init?.cache
  const privateNoStore =
    urlString.includes('/api/games/') ||
    urlString.includes('/api/me/activity/') ||
    urlString.includes('/api/me/composer-context') ||
    urlString.includes('/api/me/following') ||
    urlString.includes('/api/me/games') ||
    urlString.includes('/api/join/') ||
    urlString.includes('/api/stocks/')
  if (privateNoStore) return init?.cache ?? 'no-store'
  return init?.cache
}

/** Sets X-Simvest-User-Id and appends `uid` on `/api/games/*` so GETs still scope to the viewer if headers are dropped. */
export function simvestFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const id = viewerIdForGames()
  const headers = new Headers(init?.headers ?? undefined)
  if (id) {
    headers.set('X-Simvest-User-Id', id)
  }

  if (typeof input === 'string') {
    const url = withViewerQueryForSession(input)
    const cache = gamesGetCache(url, init)
    return fetch(url, { ...init, headers, ...(cache !== undefined ? { cache } : {}) })
  }
  if (input instanceof URL) {
    const url = withViewerQueryForSession(input.toString())
    const cache = gamesGetCache(url, init)
    return fetch(url, { ...init, headers, ...(cache !== undefined ? { cache } : {}) })
  }
  const url = withViewerQueryForSession(input.url)
  const cache = gamesGetCache(url, init)
  return fetch(new Request(url, input), {
    ...init,
    headers,
    ...(cache !== undefined ? { cache } : {}),
  })
}
