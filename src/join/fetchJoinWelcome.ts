import { simvestFetch } from '../api/simvestFetch'
import type { JoinWelcomePayload } from './joinWelcomeTypes'

export async function fetchJoinWelcome(code: string): Promise<JoinWelcomePayload | null> {
  const trimmed = code.trim()
  if (!/^\d{6}$/.test(trimmed)) return null
  const url = `/api/join/welcome?code=${encodeURIComponent(trimmed)}`
  const res = await simvestFetch(url)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error((await res.text()) || `Join welcome failed (${res.status})`)
  }
  return (await res.json()) as JoinWelcomePayload
}
