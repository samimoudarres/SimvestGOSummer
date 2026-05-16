import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { postActivity } from '../api/activityPostApi'
import { simvestFetch } from '../api/simvestFetch'
import { resolveProfileAvatarUrl } from '../user/resolveProfileAvatarUrl'
import { ApiImage } from '../components/ApiImage'
import { composerHasVisibleContent, plainCharCount } from './richPostDom'
import { RichPostEditor, type RichPostEditorHandle, resetRichEditor } from './RichPostEditor'
import './activityComposerRich.css'

type TradeRow = { symbol: string; companyName: string; logoUrl?: string }

const MAX_CHARS = 2000
const MAX_IMAGE = 2_000_000

type Props = {
  gameSlug: string
  onPosted: () => void
  shellClassName: string
  avatarUrl: string
  onAvatarClick: () => void
  /** Pill row + post button layout: "game" matches gc-composer, "home" matches sv-composer */
  layout: 'game' | 'home'
  imageIcon: string
  pollIcon: string
  investIcon: string
}

export function ActivityComposerRich({
  gameSlug,
  onPosted,
  shellClassName,
  avatarUrl,
  onAvatarClick,
  layout,
  imageIcon,
  pollIcon,
  investIcon,
}: Props) {
  const editorRef = useRef<RichPostEditorHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [editorTick, setEditorTick] = useState(0)
  const bumpEditor = useCallback(() => setEditorTick((n) => n + 1), [])

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)

  const [pollOpen, setPollOpen] = useState(false)
  const [pollQ, setPollQ] = useState('')
  const [pollOpts, setPollOpts] = useState<string[]>(['', ''])
  const [pollBusy, setPollBusy] = useState(false)

  const [tagOpen, setTagOpen] = useState(false)
  const [tagQ, setTagQ] = useState('')
  const [tagRows, setTagRows] = useState<TradeRow[]>([])
  const [tagLoading, setTagLoading] = useState(false)
  /** Caret in the editor captured before focus moves to the tag search field */
  const tagInsertRangeRef = useRef<Range | null>(null)

  const captureTagInsertCaret = useCallback(() => {
    const el = editorRef.current?.getEditorElement()
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount < 1) {
      tagInsertRangeRef.current = null
      return
    }
    const r = sel.getRangeAt(0)
    if (el.contains(r.commonAncestorContainer)) {
      try {
        tagInsertRangeRef.current = r.cloneRange()
      } catch {
        tagInsertRangeRef.current = null
      }
    } else {
      tagInsertRangeRef.current = null
    }
  }, [])

  const resetEditor = useCallback(() => {
    resetRichEditor(editorRef.current?.getEditorElement() ?? null, [{ type: 'text', text: '' }])
    bumpEditor()
  }, [bumpEditor])

  const clearAll = useCallback(() => {
    resetEditor()
    setImageDataUrl(null)
    setErr(null)
  }, [resetEditor])

  const submitMain = useCallback(async () => {
    const segs = editorRef.current?.getSegments() ?? [{ type: 'text', text: '' }]
    const n = plainCharCount(segs)
    if (n > MAX_CHARS) {
      setErr(`Post is too long (max ${MAX_CHARS} characters).`)
      return
    }
    if (!imageDataUrl && !composerHasVisibleContent(segs)) {
      setErr('Write something, add an image, or use Poll.')
      return
    }
    setBusy(true)
    setErr(null)
    const body =
      imageDataUrl != null
        ? ({
            gameSlug,
            kind: 'image' as const,
            imageUrl: imageDataUrl,
            segments: n > 0 ? segs : undefined,
          } as const)
        : ({ gameSlug, kind: 'text' as const, segments: segs } as const)
    const res = await postActivity(body)
    setBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    clearAll()
    window.dispatchEvent(new CustomEvent('simvest:activity-refresh', { detail: { gameSlug } }))
    onPosted()
  }, [gameSlug, imageDataUrl, clearAll, onPosted])

  const submitPoll = useCallback(async () => {
    const q = pollQ.trim()
    const opts = pollOpts.map((o) => o.trim()).filter((o) => o.length > 0)
    if (q.length < 1) {
      setErr('Enter a poll question.')
      return
    }
    if (opts.length < 2) {
      setErr('Add at least two options.')
      return
    }
    setPollBusy(true)
    setErr(null)
    const res = await postActivity({ gameSlug, kind: 'poll', poll: { question: q, options: opts } })
    setPollBusy(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    setPollOpen(false)
    setPollQ('')
    setPollOpts(['', ''])
    clearAll()
    window.dispatchEvent(new CustomEvent('simvest:activity-refresh', { detail: { gameSlug } }))
    onPosted()
  }, [gameSlug, pollQ, pollOpts, clearAll, onPosted])

  useEffect(() => {
    if (!tagOpen) return
    const q = tagQ.trim()
    if (q.length < 1) {
      setTagRows([])
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      setTagLoading(true)
      void simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/trade/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json().catch(() => ({ rows: [] })))
        .then((body) => {
          if (cancelled) return
          const rows = Array.isArray(body?.rows) ? (body.rows as TradeRow[]) : []
          setTagRows(rows.slice(0, 8))
        })
        .catch(() => {
          if (!cancelled) setTagRows([])
        })
        .finally(() => {
          if (!cancelled) setTagLoading(false)
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [tagOpen, tagQ, gameSlug])

  const onPickImage = () => {
    fileRef.current?.click()
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) {
      setErr('Please choose an image file.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : ''
      if (data.length > MAX_IMAGE) {
        setErr('Image is too large.')
        return
      }
      setImageDataUrl(data)
      setErr(null)
    }
    reader.readAsDataURL(f)
  }

  const insertTag = (symbol: string, label: string) => {
    const hint = tagInsertRangeRef.current
    tagInsertRangeRef.current = null
    editorRef.current?.insertTicker(symbol, label, hint)
    setTagOpen(false)
    setTagQ('')
    setTagRows([])
    editorRef.current?.focus()
  }

  const showPost = useMemo(() => {
    const segs = editorRef.current?.getSegments() ?? [{ type: 'text', text: '' }]
    return imageDataUrl != null || composerHasVisibleContent(segs)
  }, [editorTick, imageDataUrl])

  const postBtnClass = layout === 'game' ? 'gc-composerPost' : 'sv-composer__post'
  const pillWrapClass =
    layout === 'game' ? `gc-composerActions${busy ? ' gc-composerActions--dim' : ''}` : 'sv-composer__actions'

  return (
    <section className={shellClassName} aria-label="Create post">
      <input
        ref={fileRef}
        type="file"
        className="ac-hiddenFile"
        accept="image/*"
        aria-hidden
        tabIndex={-1}
        onChange={onFile}
      />
      <button type="button" className={layout === 'game' ? 'gc-composerAvatarBtn' : 'sv-composer__avatarBtn'} onClick={onAvatarClick}>
        <img className={layout === 'game' ? 'gc-composerAvatar' : 'sv-composer__avatar'} src={resolveProfileAvatarUrl(avatarUrl)} alt="" />
      </button>
      <div className={layout === 'game' ? 'gc-composerEditorMount' : 'sv-composer__editorMount'}>
        <RichPostEditor
          ref={editorRef}
          className="richPostEditor"
          placeholder="Share something…"
          minHeight={layout === 'game' ? 44 : 48}
          onEdit={bumpEditor}
        />
        {imageDataUrl ? (
          <div className="ac-imgPreview">
            <img src={imageDataUrl} alt="" />
            <button type="button" className="ac-imgRemove" onClick={() => setImageDataUrl(null)}>
              Remove image
            </button>
          </div>
        ) : null}
        {tagOpen ? (
          <div className="ac-tagPopover">
            <input
              className="ac-tagSearch"
              placeholder="Search company or ticker…"
              value={tagQ}
              onChange={(e) => setTagQ(e.target.value)}
              autoFocus
            />
            {tagLoading ? <p className="ac-tagLoading">Searching…</p> : null}
            {!tagLoading && tagRows.map((r) => (
              <button
                key={r.symbol}
                type="button"
                className="ac-tagRow"
                onClick={() =>
                  insertTag(r.symbol, (r.companyName || r.symbol).trim().slice(0, 24))
                }
              >
                {r.logoUrl ? <ApiImage src={r.logoUrl} alt="" /> : <span className="ac-tagRowPh" />}
                <span className="ac-tagRowMeta">
                  <p className="ac-tagSym">{r.symbol}</p>
                  <p className="ac-tagCo">{r.companyName}</p>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {showPost ? (
        <button type="button" className={postBtnClass} disabled={busy} onClick={() => void submitMain()}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      ) : null}
      {err ? <p className={layout === 'game' ? 'gc-composerErr' : 'sv-composer__err'}>{err}</p> : null}

      <div className={pillWrapClass}>
        <button
          type="button"
          className={layout === 'game' ? 'gc-pillBtn' : 'sv-composer__pill'}
          disabled={busy || pollOpen}
          onClick={onPickImage}
        >
          <img src={imageIcon} alt="" />
          Image
        </button>
        <button
          type="button"
          className={layout === 'game' ? 'gc-pillBtn' : 'sv-composer__pill'}
          disabled={busy || pollOpen}
          onClick={() => {
            setPollOpen(true)
            setErr(null)
          }}
        >
          <img src={pollIcon} alt="" />
          Poll
        </button>
        <button
          type="button"
          className={layout === 'game' ? 'gc-pillBtn gc-pillBtn--wide' : 'sv-composer__pill sv-composer__pill--wide'}
          disabled={busy || pollOpen}
          onPointerDownCapture={(e) => {
            if (e.button !== 0) return
            if (!tagOpen) captureTagInsertCaret()
          }}
          onClick={() => {
            setErr(null)
            setTagOpen((wasOpen) => {
              if (wasOpen) {
                tagInsertRangeRef.current = null
                queueMicrotask(() => editorRef.current?.focus())
              }
              return !wasOpen
            })
            setTagQ('')
            setTagRows([])
          }}
        >
          <img src={investIcon} alt="" />
          Tag Investment
        </button>
      </div>

      {pollOpen ? (
        <div
          className="ac-pollModalOverlay"
          role="dialog"
          aria-modal
          aria-labelledby="ac-poll-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPollOpen(false)
          }}
        >
          <div className="ac-pollModal" onMouseDown={(e) => e.stopPropagation()}>
            <h3 id="ac-poll-title">New poll</h3>
            <input
              className="ac-pollField"
              placeholder="Your question…"
              value={pollQ}
              onChange={(e) => setPollQ(e.target.value)}
            />
            {pollOpts.map((o, i) => (
              <input
                key={i}
                className="ac-pollField"
                placeholder={`Option ${i + 1}`}
                value={o}
                onChange={(e) => {
                  const next = [...pollOpts]
                  next[i] = e.target.value
                  setPollOpts(next)
                }}
              />
            ))}
            {pollOpts.length < 6 ? (
              <button
                type="button"
                className="ac-addOpt"
                onClick={() => setPollOpts((p) => [...p, ''])}
              >
                + Add option
              </button>
            ) : null}
            <div className="ac-pollActions">
              <button type="button" className="ac-btnGhost" onClick={() => setPollOpen(false)}>
                Cancel
              </button>
              <button type="button" className="ac-btnPrimary" disabled={pollBusy} onClick={() => void submitPoll()}>
                {pollBusy ? 'Posting…' : 'Post poll'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
