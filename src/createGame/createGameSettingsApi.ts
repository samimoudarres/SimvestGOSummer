import { simvestFetch } from '../api/simvestFetch'
import type { CreateGameSettingsDto, CreateGameSettingsPutBody } from './createGameWizardTypes'

export type CreateSettingsGetResponse = {
  settings: CreateGameSettingsDto | null
  isHost: boolean
  pendingJoinCount: number
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
