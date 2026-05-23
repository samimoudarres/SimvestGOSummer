import { resolveApiUrl } from '../config/apiPublicOrigin'
import { getSimvestUserId } from '../user/simvestUserId'

const FETCH_TIMEOUT_MS = 30_000

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const userSignal = init?.signal
  if (userSignal) {
    if (userSignal.aborted) controller.abort()
    else userSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return fetch(url, { ...init, signal: controller.signal }).finally(() => window.clearTimeout(timer))
}

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
    urlString.includes('/api/me/account') ||
    urlString.includes('/api/me/activity/') ||
    urlString.includes('/api/me/composer-context') ||
    urlString.includes('/api/me/following') ||
    urlString.includes('/api/me/games') ||
    urlString.includes('/api/me/host/') ||
    urlString.includes('/api/join/') ||
    urlString.includes('/api/games/public') ||
    urlString.includes('/api/games/suggested')
  if (!hits) return urlString
  try {
    const absolute = urlString.startsWith('http')
    const u = absolute
      ? new URL(urlString)
      : new URL(urlString, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    /* Always overwrite `uid` — a bookmarked or stale query must not override
     * the current viewer after login/logout (the API prefers
     * `X-Simvest-User-Id` when both are present). */
    u.searchParams.set('uid', id)
    return absolute ? u.toString() : `${u.pathname}${u.search}${u.hash}`
  } catch {
    return appendOrReplaceUidInSearch(urlString, id)
  }
}

/** Fallback when `URL` fails — still replaces any existing `uid` so it cannot go stale. */
function appendOrReplaceUidInSearch(urlString: string, id: string): string {
  const qIdx = urlString.indexOf('?')
  const path = qIdx >= 0 ? urlString.slice(0, qIdx) : urlString
  const query = qIdx >= 0 ? urlString.slice(qIdx + 1) : ''
  const params = new URLSearchParams(query)
  params.set('uid', id)
  const out = params.toString()
  return out ? `${path}?${out}` : `${path}?uid=${encodeURIComponent(id)}`
}

function gamesGetCache(urlString: string, init?: RequestInit): RequestCache | undefined {
  const m = (init?.method ?? 'GET').toUpperCase()
  if (m !== 'GET') return init?.cache
  const privateNoStore =
    urlString.includes('/api/games/') ||
    urlString.includes('/api/me/account') ||
    urlString.includes('/api/me/activity/') ||
    urlString.includes('/api/me/composer-context') ||
    urlString.includes('/api/me/following') ||
    urlString.includes('/api/me/games') ||
    urlString.includes('/api/me/host/') ||
    urlString.includes('/api/join/') ||
    urlString.includes('/api/games/public') ||
    urlString.includes('/api/games/suggested') ||
    urlString.includes('/api/stocks/')
  if (privateNoStore) return init?.cache ?? 'no-store'
  return init?.cache
}

function finalizeApiUrl(resolved: string): string {
  return withViewerQueryForSession(resolved)
}

/** Sets X-Simvest-User-Id and appends `uid` on `/api/games/*` so GETs still scope to the viewer if headers are dropped. */
export function simvestFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const id = viewerIdForGames()
  const headers = new Headers(init?.headers ?? undefined)
  if (id) {
    headers.set('X-Simvest-User-Id', id)
  }

  if (typeof input === 'string') {
    const url = finalizeApiUrl(resolveApiUrl(input))
    const cache = gamesGetCache(url, init)
    return fetchWithTimeout(url, { ...init, headers, ...(cache !== undefined ? { cache } : {}) })
  }
  if (input instanceof URL) {
    const url = finalizeApiUrl(resolveApiUrl(input.toString()))
    const cache = gamesGetCache(url, init)
    return fetchWithTimeout(url, { ...init, headers, ...(cache !== undefined ? { cache } : {}) })
  }
  const url = finalizeApiUrl(resolveApiUrl(input.url))
  const cache = gamesGetCache(url, init)
  return fetchWithTimeout(url, {
    ...init,
    headers,
    ...(cache !== undefined ? { cache } : {}),
  })
}
