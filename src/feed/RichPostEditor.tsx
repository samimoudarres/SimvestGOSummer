import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { domToSegments, insertTickerAtCaret, segmentsToHtml } from './richPostDom'
import type { RichTextSegment } from './richTextTypes'

export type RichPostEditorHandle = {
  getSegments: () => RichTextSegment[]
  insertTicker: (symbol: string, label: string, rangeHint?: Range | null) => void
  focus: () => void
  getEditorElement: () => HTMLDivElement | null
}

type Props = {
  className?: string
  placeholder?: string
  minHeight?: number
  onEdit?: () => void
}

export const RichPostEditor = forwardRef<RichPostEditorHandle, Props>(function RichPostEditor(
  { className, placeholder, minHeight = 44, onEdit },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null)
  const lastHtml = useRef('')

  useImperativeHandle(
    ref,
    () => ({
      getSegments: () => {
        if (!divRef.current) return [{ type: 'text', text: '' }]
        return domToSegments(divRef.current)
      },
      insertTicker: (symbol: string, label: string, rangeHint?: Range | null) => {
        insertTickerAtCaret(divRef.current, symbol, label, rangeHint)
        onEdit?.()
      },
      focus: () => {
        divRef.current?.focus()
      },
      getEditorElement: () => divRef.current,
    }),
    [onEdit],
  )

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    const empty = '<br />'
    if (!el.innerHTML || el.innerHTML === '<br>') {
      el.innerHTML = empty
      lastHtml.current = empty
    }
  }, [])

  const onInput = () => {
    const el = divRef.current
    if (!el) return
    if (!el.textContent?.trim() && el.querySelectorAll('.feedTicker').length === 0) {
      el.innerHTML = '<br />'
    }
    lastHtml.current = el.innerHTML
    onEdit?.()
  }

  return (
    <div
      ref={divRef}
      className={`richPostEditor ${className ?? ''}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder ?? ''}
      style={{ minHeight }}
      onInput={onInput}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          document.execCommand('insertLineBreak')
        }
      }}
    />
  )
})

/** Sync editor HTML from segments (e.g. after reset). */
export function resetRichEditor(el: HTMLDivElement | null, segments: RichTextSegment[]): void {
  if (!el) return
  const html = segmentsToHtml(segments.length ? segments : [{ type: 'text', text: '' }])
  el.innerHTML = html.length > 0 ? html : '<br />'
}
