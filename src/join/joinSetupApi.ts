import { simvestFetch } from '../api/simvestFetch'
import type {
  JoinSetupDraftInput,
  JoinSetupFieldError,
  JoinSetupProfileRecord,
  JoinSetupSaveResponse,
} from './joinSetupTypes'

export async function fetchExistingJoinSetup(
  gameSlug: string,
): Promise<JoinSetupProfileRecord | null> {
  const res = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/profile/setup`)
  if (!res.ok) {
    throw new Error((await res.text()) || 'Could not load profile setup')
  }
  const body = (await res.json()) as { setup?: JoinSetupProfileRecord | null }
  return body.setup ?? null
}

export async function saveJoinSetupProfile(
  gameSlug: string,
  input: JoinSetupDraftInput,
): Promise<{ ok: true; data: JoinSetupSaveResponse } | { ok: false; message: string; errors: JoinSetupFieldError[] }> {
  const res = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/profile/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      password: input.password,
      avatarUrl: input.avatarUrl,
    }),
  })
  if (res.ok) {
    const data = (await res.json()) as JoinSetupSaveResponse
    return { ok: true, data }
  }
  let msg = 'Could not save your profile'
  let errors: JoinSetupFieldError[] = []
  try {
    const b = (await res.json()) as { error?: string; errors?: JoinSetupFieldError[] }
    if (typeof b.error === 'string' && b.error.trim()) msg = b.error
    if (Array.isArray(b.errors)) errors = b.errors
  } catch {
    /* ignore */
  }
  return { ok: false, message: msg, errors }
}

