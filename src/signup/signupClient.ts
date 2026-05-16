/**
 * Tiny API + sessionStorage helpers for the multi-step signup flow.
 *
 * - Step 1 (`SignupNameScreen`) calls `startSignup({ firstName, lastName })`,
 *   gets a `draftId`, stashes it in sessionStorage (so a refresh between
 *   screens doesn't blow away the user's name) and navigates to step 2.
 * - Step 2 (`SignupCredentialsScreen`) reads the `draftId` from
 *   sessionStorage and calls `completeSignup({ ... })`. On success it clears
 *   the draft and returns the freshly-minted `userId` so the client can swap
 *   identity + flip the login flag.
 */

import { simvestFetch } from '../api/simvestFetch'

const DRAFT_ID_KEY = 'simvest-signup-draft-id-v1'
const DRAFT_FIRST_KEY = 'simvest-signup-first-name-v1'
const DRAFT_LAST_KEY = 'simvest-signup-last-name-v1'

export type SignupValidationError = {
  field: 'firstName' | 'lastName' | 'contact' | 'password' | 'contactKind' | string
  message: string
}

export type SignupStartResponse = {
  draftId: string
  expiresAt: string
}

export type SignupCompleteUser = {
  userId: string
  username: string
  displayName: string
  avatarUrl: string
  contactKind: 'email' | 'phone'
}

export type SignupErrorBody = {
  error?: string
  errors?: SignupValidationError[]
}

/* --------------------------------------------------------------------- */
/* sessionStorage helpers                                                 */
/* --------------------------------------------------------------------- */

export function saveDraftId(id: string, firstName: string, lastName: string): void {
  try {
    sessionStorage.setItem(DRAFT_ID_KEY, id)
    sessionStorage.setItem(DRAFT_FIRST_KEY, firstName)
    sessionStorage.setItem(DRAFT_LAST_KEY, lastName)
  } catch {
    /* sessionStorage blocked — flow still works for this tab via React Router state. */
  }
}

export function readDraftId(): string {
  try {
    return sessionStorage.getItem(DRAFT_ID_KEY) ?? ''
  } catch {
    return ''
  }
}

export function readDraftName(): { firstName: string; lastName: string } {
  try {
    return {
      firstName: sessionStorage.getItem(DRAFT_FIRST_KEY) ?? '',
      lastName: sessionStorage.getItem(DRAFT_LAST_KEY) ?? '',
    }
  } catch {
    return { firstName: '', lastName: '' }
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_ID_KEY)
    sessionStorage.removeItem(DRAFT_FIRST_KEY)
    sessionStorage.removeItem(DRAFT_LAST_KEY)
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------------- */
/* API calls                                                              */
/* --------------------------------------------------------------------- */

async function parseErrorBody(resp: Response): Promise<SignupErrorBody> {
  try {
    return (await resp.json()) as SignupErrorBody
  } catch {
    return {}
  }
}

export async function startSignup(
  firstName: string,
  lastName: string,
): Promise<
  | { ok: true; data: SignupStartResponse }
  | { ok: false; status: number; error: string; errors?: SignupValidationError[] }
> {
  const resp = await simvestFetch('/api/auth/signup/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName, lastName }),
  })
  if (!resp.ok) {
    const body = await parseErrorBody(resp)
    return {
      ok: false,
      status: resp.status,
      error: body.error ?? 'Could not save your name. Please try again.',
      errors: body.errors,
    }
  }
  const data = (await resp.json()) as SignupStartResponse
  return { ok: true, data }
}

export type CompleteSignupInput = {
  draftId: string
  contactKind: 'email' | 'phone'
  contact: string
  password: string
  /** Pre-auth browser id so server can merge anonymous rows into the new account. */
  previousViewerId?: string
}

export async function completeSignup(
  input: CompleteSignupInput,
): Promise<
  | { ok: true; user: SignupCompleteUser }
  | { ok: false; status: number; error: string; errors?: SignupValidationError[] }
> {
  const resp = await simvestFetch('/api/auth/signup/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) {
    const body = await parseErrorBody(resp)
    return {
      ok: false,
      status: resp.status,
      error: body.error ?? 'Could not create your account. Please try again.',
      errors: body.errors,
    }
  }
  const body = (await resp.json()) as { user: SignupCompleteUser }
  return { ok: true, user: body.user }
}

/* --------------------------------------------------------------------- */
/* Client-side validation (mirrors server rules for instant feedback)     */
/* --------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(raw: string): boolean {
  const trimmed = raw.trim()
  return EMAIL_RE.test(trimmed) && trimmed.length <= 120
}

export function digitsOnly(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, 18)
}

export function isValidPhone(raw: string): boolean {
  const d = digitsOnly(raw)
  return d.length >= 7 && d.length <= 18
}

/** Password: ≥5 chars, at least one letter AND at least one digit. */
export function isValidPassword(raw: string): boolean {
  if (typeof raw !== 'string') return false
  if (raw.length < 5 || raw.length > 128) return false
  return /[A-Za-z]/.test(raw) && /\d/.test(raw)
}
