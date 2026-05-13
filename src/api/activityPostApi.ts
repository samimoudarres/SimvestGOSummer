import type { RichTextSegment } from '../feed/richTextTypes'
import { simvestFetch } from './simvestFetch'

export type PostActivityBody =
  | {
      gameSlug?: string
      kind: 'text'
      segments?: RichTextSegment[]
      plainText?: string
      imageUrl?: string
    }
  | {
      gameSlug?: string
      kind: 'image'
      imageUrl: string
      segments?: RichTextSegment[]
      plainText?: string
    }
  | {
      gameSlug?: string
      kind: 'poll'
      poll: { question: string; options: string[] }
    }

export type PostActivityResult = { ok: true } | { ok: false; error: string }

export async function postActivity(body: PostActivityBody): Promise<PostActivityResult> {
  try {
    const res = await simvestFetch('/api/me/activity/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: typeof j?.error === 'string' ? j.error : `Request failed (${res.status})` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}
