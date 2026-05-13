import { postActivity } from './activityPostApi'

export type PostTextActivityResult =
  | { ok: true }
  | { ok: false; error: string }

/** Legacy plain-text post helper — prefers the unified activity post API. */
export async function postTextActivity(input: {
  text: string
  gameSlug?: string
}): Promise<PostTextActivityResult> {
  return postActivity({
    kind: 'text',
    plainText: input.text.trim(),
    ...(input.gameSlug?.trim() ? { gameSlug: input.gameSlug.trim() } : {}),
  })
}
