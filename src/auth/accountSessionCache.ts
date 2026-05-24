import type { AccountPublicView } from '../settings/settingsClient'

const CACHE_KEY = 'simvest-account-cache-v1'

export function readCachedAccount(): AccountPublicView | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AccountPublicView
    if (!parsed?.userId || typeof parsed.userId !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeCachedAccount(account: AccountPublicView): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(account))
  } catch {
    /* quota or private mode */
  }
}

/** Prime avatar/name after login before `/api/me/account` returns. */
export function mergeCachedAccountFromLogin(partial: {
  userId: string
  displayName?: string
  avatarUrl?: string
}): void {
  const prev = readCachedAccount()
  const now = new Date().toISOString()
  writeCachedAccount({
    userId: partial.userId,
    firstName: prev?.firstName ?? '',
    lastName: prev?.lastName ?? '',
    displayName: partial.displayName?.trim() || prev?.displayName || 'Player',
    avatarUrl: partial.avatarUrl?.trim() || prev?.avatarUrl || '',
    contactKind: prev?.contactKind ?? 'email',
    contact: prev?.contact ?? '',
    createdAtIso: prev?.createdAtIso ?? now,
    updatedAtIso: now,
  })
}

export function clearCachedAccount(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}
