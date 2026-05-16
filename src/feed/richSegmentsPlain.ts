import type { RichTextSegment } from './richTextTypes'

export function plainTextFromRichSegments(segments?: RichTextSegment[] | null): string {
  if (!segments?.length) return ''
  return segments.map((s) => (s.type === 'text' ? s.text : s.label)).join('')
}
