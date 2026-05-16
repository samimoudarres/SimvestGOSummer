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
  /* Only the truly game-specific fields are sent on the wire — the server
   * fills in the rest from the caller's account record. */
  const res = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/profile/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      avatarUrl: input.useDefaultGameAvatar ? '' : input.avatarUrl,
      useDefaultGameAvatar: Boolean(input.useDefaultGameAvatar),
    }),
  })
  if (res.ok) {
    const data = (await res.json()) as JoinSetupSaveResponse
    return { ok: true, data }
  }
  let msg =
    res.status === 413
      ? 'Photo payload too large for the server — try a smaller image or slightly lower camera quality.'
      : 'Could not save your profile'
  let errors: JoinSetupFieldError[] = []
  try {
    const b = (await res.json()) as { error?: string; errors?: JoinSetupFieldError[] }
    if (Array.isArray(b.errors)) errors = b.errors
    const avatarErr = errors.find((e) => e.field === 'avatarUrl')
    const usernameErr = errors.find((e) => e.field === 'username')
    if (avatarErr?.message) msg = avatarErr.message
    else if (usernameErr?.message) msg = usernameErr.message
    else if (errors.length > 0 && errors[0]?.message) msg = errors[0].message
    else if (typeof b.error === 'string' && b.error.trim()) msg = b.error
  } catch {
    /* ignore */
  }
  return { ok: false, message: msg, errors }
}

