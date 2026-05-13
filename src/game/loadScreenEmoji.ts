/** Single decorative emoji for join / theme preview (first user-selected grapheme). */

const DEFAULT_LOAD_SCREEN_EMOJI = '🍁'

/** Pull the first extended grapheme cluster from user input (iOS emoji keyboard friendly). */
export function firstGraphemeFromString(raw: string): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return DEFAULT_LOAD_SCREEN_EMOJI
  try {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
    for (const { segment } of seg.segment(t)) {
      const s = segment.trim()
      if (s) return s.length > 32 ? s.slice(0, 32) : s
    }
  } catch {
    const f = t.codePointAt(0)
    if (f === undefined) return DEFAULT_LOAD_SCREEN_EMOJI
    return t.length > 32 ? t.slice(0, 32) : t
  }
  return DEFAULT_LOAD_SCREEN_EMOJI
}

export function sanitizeLoadScreenEmoji(raw: string): string {
  return firstGraphemeFromString(raw)
}

export { DEFAULT_LOAD_SCREEN_EMOJI }
