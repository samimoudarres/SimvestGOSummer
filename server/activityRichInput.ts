import type { RichTextSegment } from './gameFeedService'
import { normalizeTicker } from './stockService'

const MAX_CAPTION_LEN = 2000

export function plainFromRichSegments(segments: RichTextSegment[]): string {
  return segments.map((s) => (s.type === 'text' ? s.text : s.label)).join('')
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

export function normalizeRichSegments(raw: unknown): RichTextSegment[] | null {
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

/**
 * Shared by create + edit: accepts structured `segments` and/or `plainText`
 * (plain becomes a single text segment when segments absent).
 */
export function parseActivityRichInput(input: {
  segments?: unknown
  plainText?: string
}): { ok: true; segments: RichTextSegment[] } | { ok: false; error: string } {
  let segments = normalizeRichSegments(input.segments)
  const plain = typeof input.plainText === 'string' ? input.plainText.replace(/\r\n/g, '\n').trim() : ''
  if (!segments && plain.length > 0) {
    segments = [{ type: 'text', text: plain }]
  }
  if (!segments || segments.length === 0) {
    return { ok: false, error: 'Write something for your post' }
  }
  const bodyLen = plainFromRichSegments(segments).length
  if (bodyLen > MAX_CAPTION_LEN) {
    return { ok: false, error: 'Post is too long (max 2000 characters)' }
  }
  return { ok: true, segments }
}
