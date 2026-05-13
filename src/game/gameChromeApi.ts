import { simvestFetch } from '../api/simvestFetch'

export type GameChromePayload = {
  cssVars: Record<string, string>
}

export async function fetchGameChrome(gameSlug: string): Promise<GameChromePayload> {
  const res = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/game-chrome`)
  if (!res.ok) {
    throw new Error((await res.text()) || 'Could not load game theme')
  }
  return (await res.json()) as GameChromePayload
}
