import { randomUUID } from 'node:crypto'
import type { GameFeedPost, RichTextSegment } from './gameFeedService'
import { appendGameFeedPost } from './gameFeedService'
import { normalizeGameSlugParam } from './gameSlugNormalize'
import { normalizeTicker } from './stockService'

const MAX_CAPTION_LEN = 2000
const MAX_IMAGE_DATA_URL = 2_000_000
const MAX_POLL_Q = 300
const MAX_POLL_OPT = 120

function plainFromSegments(segments: RichTextSegment[]): string {
  return segments.map((s) => (s.type === 'text' ? s.text : s.label)).join('')
}

function normalizeSegments(raw: unknown): RichTextSegment[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: RichTextSegment[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    if (o.type === 'text' && typeof o.text === 'string') {
      const t = o.text.replace(/\r\n/g, '\n')
      out.push({ type: 'text', text: t })
    } else if (o.type === 'ticker' && typeof o.symbol === 'string') {
      const sym = normalizeTicker(o.symbol.trim())
      if (!sym) continue
      const label =
        typeof o.label === 'string' && o.label.trim().length > 0 ? o.label.trim().slice(0, 24) : sym
      out.push({ type: 'ticker', symbol: sym, label })
    }
  }
  if (out.length === 0) return null
  const merged = mergeAdjacentText(out)
  return merged.length > 0 ? merged : null
}

function mergeAdjacentText(segments: RichTextSegment[]): RichTextSegment[] {
  const merged: RichTextSegment[] = []
  for (const s of segments) {
    const prev = merged[merged.length - 1]
    if (s.type === 'text' && prev?.type === 'text') {
      prev.text += s.text
    } else {
      merged.push(s)
    }
  }
  return merged
}

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

  let segments = normalizeSegments(input.segments)
  const plain = typeof input.plainText === 'string' ? input.plainText.trim() : ''
  if (!segments && plain.length > 0) {
    segments = [{ type: 'text', text: plain }]
  }
  if (!segments || segments.length === 0) {
    if (input.kind === 'image' && typeof input.imageUrl === 'string' && validateImageUrl(input.imageUrl)) {
      segments = [{ type: 'text', text: '' }]
    } else {
      return { ok: false, error: 'Write something to post', status: 400 }
    }
  }

  const bodyLen = plainFromSegments(segments).length
  if (bodyLen > MAX_CAPTION_LEN) {
    return { ok: false, error: 'Post is too long (max 2000 characters)', status: 400 }
  }

  let imageUrl: string | undefined
  if (input.kind === 'image' || (typeof input.imageUrl === 'string' && input.imageUrl.trim())) {
    const raw = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : ''
    if (!raw) return { ok: false, error: 'Choose an image to post', status: 400 }
    if (!validateImageUrl(raw)) return { ok: false, error: 'Invalid image', status: 400 }
    if (raw.startsWith('data:image/') && raw.length > MAX_IMAGE_DATA_URL) {
      return { ok: false, error: 'Image is too large', status: 400 }
    }
    imageUrl = raw
  }

  const rationale = plainFromSegments(segments).trim() || (imageUrl ? ' ' : '')

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
