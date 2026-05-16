import { randomUUID } from 'node:crypto'
import type { GameFeedPost } from './gameFeedService'
import { appendGameFeedPost } from './gameFeedService'
import { plainFromRichSegments, parseActivityRichInput } from './activityRichInput'
import { normalizeGameSlugParam } from './gameSlugNormalize'

const MAX_CAPTION_LEN = 2000
const MAX_IMAGE_DATA_URL = 2_000_000
const MAX_POLL_Q = 300
const MAX_POLL_OPT = 120

export type CreateActivityPostInput = {
  kind: 'text' | 'poll' | 'image'
  segments?: unknown
  /** Plain caption when no structured segments (legacy / simple) */
  plainText?: string
  imageUrl?: string
  poll?: { question?: string; options?: string[] }
}

export type CreateActivityPostResult =
  | { ok: true; post: GameFeedPost }
  | { ok: false; error: string; status?: number }

function validateImageUrl(u: string): boolean {
  const t = u.trim()
  return (
    t.startsWith('data:image/') ||
    t.startsWith('/') ||
    t.startsWith('http://') ||
    t.startsWith('https://')
  )
}

export async function createActivityPost(
  userId: string,
  gameSlug: string,
  author: string,
  avatar: string,
  input: CreateActivityPostInput,
): Promise<CreateActivityPostResult> {
  const slug = normalizeGameSlugParam(gameSlug)
  if (!slug) return { ok: false, error: 'Invalid game', status: 400 }

  if (input.kind === 'poll') {
    const q = typeof input.poll?.question === 'string' ? input.poll.question.trim() : ''
    if (q.length < 1) return { ok: false, error: 'Poll question is required', status: 400 }
    if (q.length > MAX_POLL_Q) return { ok: false, error: 'Poll question is too long', status: 400 }
    const rawOpts = Array.isArray(input.poll?.options) ? input.poll!.options! : []
    const labels = rawOpts
      .map((x) => (typeof x === 'string' ? x.trim().slice(0, MAX_POLL_OPT) : ''))
      .filter((s) => s.length > 0)
    if (labels.length < 2) return { ok: false, error: 'Add at least two poll options', status: 400 }
    if (labels.length > 6) return { ok: false, error: 'Poll can have at most 6 options', status: 400 }
    const pollOptions = labels.map((label) => ({ id: randomUUID(), label }))
    const post = await appendGameFeedPost({
      postKind: 'poll',
      userId,
      gameSlug: slug,
      author,
      avatar,
      timestampIso: new Date().toISOString(),
      tradeTitle: '',
      tickerSymbol: '',
      tickerImage: '',
      changePct: '—',
      sharesBought: '—',
      orderTotal: '—',
      marketCap: '—',
      revenue: '—',
      rationale: q,
      pollQuestion: q,
      pollOptions,
    })
    return { ok: true, post }
  }

  let segments: import('./gameFeedService').RichTextSegment[] | null = null
  const wantsImage =
    input.kind === 'image' || (typeof input.imageUrl === 'string' && input.imageUrl.trim().length > 0)

  if (wantsImage) {
    const raw = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : ''
    if (!raw) return { ok: false, error: 'Choose an image to post', status: 400 }
    if (!validateImageUrl(raw)) return { ok: false, error: 'Invalid image', status: 400 }
    if (raw.startsWith('data:image/') && raw.length > MAX_IMAGE_DATA_URL) {
      return { ok: false, error: 'Image is too large', status: 400 }
    }
    const parsed = parseActivityRichInput({ segments: input.segments, plainText: input.plainText })
    if (parsed.ok) segments = parsed.segments
    else segments = [{ type: 'text', text: '' }]
  } else {
    const parsed = parseActivityRichInput({ segments: input.segments, plainText: input.plainText })
    if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 }
    segments = parsed.segments
  }

  if (!segments || segments.length === 0) {
    return { ok: false, error: 'Write something to post', status: 400 }
  }

  let imageUrl: string | undefined
  if (wantsImage) {
    imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : undefined
  }

  const rationale = plainFromRichSegments(segments).trim() || (imageUrl ? ' ' : '')

  const post = await appendGameFeedPost({
    postKind: 'text',
    userId,
    gameSlug: slug,
    author,
    avatar,
    timestampIso: new Date().toISOString(),
    tradeTitle: '',
    tickerSymbol: '',
    tickerImage: '',
    changePct: '—',
    sharesBought: '—',
    orderTotal: '—',
    marketCap: '—',
    revenue: '—',
    rationale: rationale.length > 0 ? rationale.slice(0, MAX_CAPTION_LEN) : ' ',
    richSegments: segments,
    ...(imageUrl ? { attachmentImageUrl: imageUrl } : {}),
  })
  return { ok: true, post }
}
