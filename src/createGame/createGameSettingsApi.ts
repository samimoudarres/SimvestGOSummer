import { simvestFetch } from '../api/simvestFetch'
import type { CreateGameSettingsDto, CreateGameSettingsPutBody } from './createGameWizardTypes'

export type CreateSettingsGetResponse = {
  settings: CreateGameSettingsDto | null
  isHost: boolean
  pendingJoinCount: number
}

/** Move a live publish off `new` and seed a blank draft before the create wizard edits. */
export async function beginNewGameDraft(): Promise<{ archivedSlug: string | null }> {
  const res = await simvestFetch('/api/games/new/begin-draft', { method: 'POST' })
  if (!res.ok) {
    throw new Error((await res.text()) || 'Could not start a new game draft')
  }
  const j = (await res.json()) as { archivedSlug?: unknown }
  const archivedSlug = typeof j.archivedSlug === 'string' && j.archivedSlug.trim() ? j.archivedSlug.trim() : null
  return { archivedSlug }
}

export async function fetchCreateGameSettings(gameSlug: string): Promise<CreateSettingsGetResponse> {
  const res = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/create-settings`)
  if (!res.ok) {
    throw new Error((await res.text()) || 'Could not load game settings')
  }
  return (await res.json()) as CreateSettingsGetResponse
}

export async function putCreateGameSettings(
  gameSlug: string,
  body: CreateGameSettingsPutBody,
): Promise<{ settings: CreateGameSettingsDto }> {
  const res = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/create-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = 'Could not save settings'
    try {
      const j = (await res.json()) as { error?: string }
      if (typeof j.error === 'string' && j.error.trim()) msg = j.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return (await res.json()) as { settings: CreateGameSettingsDto }
}
