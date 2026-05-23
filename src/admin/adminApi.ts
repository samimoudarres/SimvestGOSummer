import { resolveApiUrl } from '../config/apiPublicOrigin'

const SESSION_KEY = 'simvest-admin-secret'
const HEADER = 'X-Simvest-Admin-Secret'

export function getStoredAdminSecret(): string | null {
  try {
    const s = sessionStorage.getItem(SESSION_KEY)?.trim()
    return s && s.length > 0 ? s : null
  } catch {
    return null
  }
}

export function storeAdminSecret(secret: string): void {
  sessionStorage.setItem(SESSION_KEY, secret.trim())
}

export function clearAdminSecret(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

async function adminFetch(path: string, secret: string, init?: RequestInit): Promise<Response> {
  const url = resolveApiUrl(path)
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      [HEADER]: secret,
    },
    cache: 'no-store',
  })
}

export async function fetchAdminStatus(): Promise<{ configured: boolean }> {
  const res = await fetch(resolveApiUrl('/api/admin/status'), { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not reach admin status')
  return (await res.json()) as { configured: boolean }
}

export type AdminDashboardPayload = {
  generatedAtIso: string
  overview: {
    accountCount: number
    gameCount: number
    publicGameCount: number
    postCount: number
    membershipJoinCount: number
    pendingJoinRequestCount: number
  }
  accounts: Array<{
    userId: string
    firstName: string
    lastName: string
    displayName: string
    avatarUrl: string
    contactKind: string
    contact: string
    createdAtIso: string
    updatedAtIso: string
  }>
  games: Array<{
    slug: string
    displayName: string
    visibility: string
    hostUserId: string | null
    hostDisplayName: string
    joinCode: string | null
    setupComplete: boolean
    startsAtIso: string
    endsAtIso: string | null
    playerCount: number
    updatedAtIso: string
  }>
  posts: Array<{
    id: string
    gameSlug: string
    userId: string
    author: string
    postKind: string
    timestampIso: string
    tradeTitle: string
    tickerSymbol: string
    rationalePreview: string
    hasImage: boolean
  }>
  joinRequests: Array<{
    id: string
    gameSlug: string
    userId: string
    displayName: string
    status: string
    createdAtIso: string
    resolvedAtIso: string | null
  }>
}

export async function fetchAdminDashboard(
  secret: string,
): Promise<
  | { ok: true; data: AdminDashboardPayload }
  | { ok: false; status: number; message: string }
> {
  const res = await adminFetch('/api/admin/dashboard', secret)
  if (res.status === 401) {
    return { ok: false, status: 401, message: 'Wrong admin password.' }
  }
  if (res.status === 503) {
    return {
      ok: false,
      status: 503,
      message: 'Admin is not configured on this API (SIMVEST_ADMIN_SECRET).',
    }
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return {
      ok: false,
      status: res.status,
      message: body?.error ?? `Request failed (${res.status})`,
    }
  }
  return { ok: true, data: (await res.json()) as AdminDashboardPayload }
}
