import type { RichTextSegment } from './richTextTypes'

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escAttr(s: string): string {
  return escHtml(s).replace(/'/g, '&#39;')
}

export function mergeAdjacentTextSegs(segments: RichTextSegment[]): RichTextSegment[] {
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

export function segmentsToHtml(segments: RichTextSegment[]): string {
  return segments
    .map((s) => {
      if (s.type === 'text') {
        return escHtml(s.text).split('\n').join('<br />')
      }
      return `<span class="feedTicker" data-symbol="${escAttr(s.symbol)}" contenteditable="false">${escHtml(s.label)}</span>`
    })
    .join('')
}

export function domToSegments(root: HTMLElement): RichTextSegment[] {
  const out: RichTextSegment[] = []
  let textBuf = ''
  const flush = () => {
    if (textBuf.length > 0) {
      out.push({ type: 'text', text: textBuf })
      textBuf = ''
    }
  }
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textBuf += (node.textContent ?? '').replace(/\u200b/g, '')
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName
      if (tag === 'BR') {
        textBuf += '\n'
      } else if (el.classList.contains('feedTicker')) {
        flush()
        const sym = (el.dataset.symbol ?? '').trim()
        if (sym) {
          const label = (el.textContent ?? sym).trim() || sym
          out.push({ type: 'ticker', symbol: sym, label })
        }
      } else {
        for (const c of Array.from(el.childNodes)) walk(c)
      }
    }
  }
  walk(root)
  flush()
  return mergeAdjacentTextSegs(out.length > 0 ? out : [{ type: 'text', text: '' }])
}

export function plainCharCount(segments: RichTextSegment[]): number {
  return segments.map((s) => (s.type === 'text' ? s.text.length : s.label.length)).reduce((a, b) => a + b, 0)
}

/** True if the composer has a ticker or any non-whitespace text (ignores lone newlines from empty &lt;br&gt;). */
export function composerHasVisibleContent(segments: RichTextSegment[]): boolean {
  for (const s of segments) {
    if (s.type === 'ticker') return true
    if (s.type === 'text') {
      const t = s.text.replace(/\u200b/g, '').replace(/\n/g, '').trim()
      if (t.length > 0) return true
    }
  }
  return false
}

function rangeAtEditorEnd(editor: HTMLElement): Range {
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  return range
}

/**
 * Insert an inline ticker at the current selection, or at `rangeHint` if it is still inside the editor.
 * Falls back to the end of the editor if the range is missing or invalid.
 */
export function insertTickerAtCaret(
  editor: HTMLElement | null,
  symbol: string,
  label: string,
  rangeHint?: Range | null,
): void {
  if (!editor) return
  editor.focus()
  const sel = window.getSelection()
  if (!sel) return

  let range: Range
  if (rangeHint && editor.contains(rangeHint.commonAncestorContainer)) {
    try {
      range = rangeHint.cloneRange()
    } catch {
      range = rangeAtEditorEnd(editor)
    }
  } else if (sel.rangeCount > 0) {
    range = sel.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) {
      range = rangeAtEditorEnd(editor)
    }
  } else {
    range = rangeAtEditorEnd(editor)
  }

  try {
    range.deleteContents()
    const span = document.createElement('span')
    span.className = 'feedTicker'
    span.contentEditable = 'false'
    span.dataset.symbol = symbol
    span.textContent = label
    range.insertNode(span)
    const spacer = document.createTextNode('\u200b')
    range.setStartAfter(span)
    range.insertNode(spacer)
    range.setStartAfter(spacer)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  } catch {
    const fallback = rangeAtEditorEnd(editor)
    try {
      fallback.deleteContents()
      const span = document.createElement('span')
      span.className = 'feedTicker'
      span.contentEditable = 'false'
      span.dataset.symbol = symbol
      span.textContent = label
      fallback.insertNode(span)
      const spacer = document.createTextNode('\u200b')
      fallback.setStartAfter(span)
      fallback.insertNode(spacer)
      fallback.setStartAfter(spacer)
      fallback.collapse(true)
      sel.removeAllRanges()
      sel.addRange(fallback)
    } catch {
      /* ignore */
    }
  }
}
