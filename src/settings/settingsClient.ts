/**
 * Client helpers for the Settings screens. Pairs with the `/api/me/account`
 * endpoints in `server/index.ts`. All requests go through `simvestFetch` so
 * the active viewer id is attached as `X-Simvest-User-Id` (and `uid` query).
 */

import { simvestFetch } from '../api/simvestFetch'

export type AccountContactKind = 'email' | 'phone'

export type AccountPublicView = {
  userId: string
  firstName: string
  lastName: string
  displayName: string
  avatarUrl: string
  contactKind: AccountContactKind
  contact: string
  createdAtIso: string
  updatedAtIso: string
}

export type AccountFieldError = {
  field:
    | 'firstName'
    | 'lastName'
    | 'displayName'
    | 'avatarUrl'
    | 'contact'
    | 'contactKind'
    | 'currentPassword'
    | 'newPassword'
  message: string
}

export type AccountApiError = {
  status: number
  message: string
  fields: AccountFieldError[]
}

async function parseError(resp: Response): Promise<AccountApiError> {
  let body: { error?: string; errors?: AccountFieldError[] } | null = null
  try {
    body = (await resp.json()) as { error?: string; errors?: AccountFieldError[] }
  } catch {
    body = null
  }
  return {
    status: resp.status,
    message: body?.error ?? 'Request failed',
    fields: Array.isArray(body?.errors) ? body!.errors : [],
  }
}

/* ------------------------------------------------------------------------- */
/* GET account                                                               */
/* ------------------------------------------------------------------------- */

export type FetchAccountResult =
  | { ok: true; account: AccountPublicView }
  | { ok: false; error: AccountApiError }

export async function fetchMyAccount(): Promise<FetchAccountResult> {
  const resp = await simvestFetch('/api/me/account', { method: 'GET' })
  if (!resp.ok) {
    return { ok: false, error: await parseError(resp) }
  }
  const body = (await resp.json()) as { account: AccountPublicView }
  return { ok: true, account: body.account }
}

/* ------------------------------------------------------------------------- */
/* PATCH profile                                                             */
/* ------------------------------------------------------------------------- */

export type UpdateProfileInput = {
  firstName?: string
  lastName?: string
  displayName?: string
  avatarUrl?: string
}

export async function updateProfile(input: UpdateProfileInput): Promise<FetchAccountResult> {
  const resp = await simvestFetch('/api/me/account/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) {
    return { ok: false, error: await parseError(resp) }
  }
  const body = (await resp.json()) as { account: AccountPublicView }
  return { ok: true, account: body.account }
}

/* ------------------------------------------------------------------------- */
/* PATCH contact                                                             */
/* ------------------------------------------------------------------------- */

export type UpdateContactInput = {
  contactKind: AccountContactKind
  contact: string
  currentPassword: string
}

export async function updateContact(input: UpdateContactInput): Promise<FetchAccountResult> {
  const resp = await simvestFetch('/api/me/account/contact', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) {
    return { ok: false, error: await parseError(resp) }
  }
  const body = (await resp.json()) as { account: AccountPublicView }
  return { ok: true, account: body.account }
}

/* ------------------------------------------------------------------------- */
/* PATCH password                                                            */
/* ------------------------------------------------------------------------- */

export type UpdatePasswordInput = {
  currentPassword: string
  newPassword: string
}

export type UpdatePasswordResult = { ok: true } | { ok: false; error: AccountApiError }

export async function updatePassword(input: UpdatePasswordInput): Promise<UpdatePasswordResult> {
  const resp = await simvestFetch('/api/me/account/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) {
    return { ok: false, error: await parseError(resp) }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------------- */
/* Validation mirrors (instant feedback before round-trip)                   */
/* ------------------------------------------------------------------------- */

export function digitsOnly(raw: string): string {
  return (raw ?? '').replace(/[^0-9]/g, '')
}

export function isValidEmail(raw: string): boolean {
  const trimmed = (raw ?? '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 120
}

export function isValidPhone(raw: string): boolean {
  const d = digitsOnly(raw)
  return d.length >= 7 && d.length <= 18
}

export function isValidPassword(raw: string): boolean {
  if (typeof raw !== 'string') return false
  if (raw.length < 5 || raw.length > 128) return false
  return /[A-Za-z]/.test(raw) && /\d/.test(raw)
}

export function formatContactForDisplay(account: AccountPublicView): string {
  if (account.contactKind === 'phone') {
    /* Render whatever the user originally typed — preserves +country code and
     * separators. Falls back to digits-only when the raw value is missing. */
    return account.contact || digitsOnly(account.contact)
  }
  return account.contact
}

/* ------------------------------------------------------------------------- */
/* Activity author notifications (feed “Notify me”)                          */
/* ------------------------------------------------------------------------- */

export type NotifyAuthorRow = {
  userId: string
  displayName: string
  avatarUrl: string
}

export async function fetchNotifyAuthors(): Promise<
  { ok: true; authors: NotifyAuthorRow[] } | { ok: false; message: string }
> {
  const resp = await simvestFetch('/api/me/activity/notify-authors')
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    return { ok: false, message: typeof body?.error === 'string' ? body.error : 'Request failed' }
  }
  const authors = Array.isArray(body?.authors) ? (body.authors as NotifyAuthorRow[]) : []
  return { ok: true, authors }
}

export async function removeNotifyAuthor(authorUserId: string): Promise<boolean> {
  const resp = await simvestFetch(`/api/me/activity/notify-authors/${encodeURIComponent(authorUserId)}`, {
    method: 'DELETE',
  })
  return resp.ok
}
