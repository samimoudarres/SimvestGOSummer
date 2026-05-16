import { useCallback, useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { GameFeedPostRow } from '../challenge/useGameFeed'
import { plainTextFromRichSegments } from './richSegmentsPlain'
import { registerSimvestWebPushIfPossible } from './registerSimvestWebPush'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { assets } from '../figmaAssets'
import { FeedPostToast } from './FeedPostToast'
import { openOsNotificationSettings } from '../util/openOsNotificationSettings'
import './feedPostOverflow.css'

function userIdsMatch(a: string, b: string): boolean {
  return a.trim() === b.trim()
}

function PenIcon() {
  return (
    <svg className="fp-menuGlyph" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
      />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="fp-menuGlyph" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"
      />
    </svg>
  )
}

type Props = {
  post: GameFeedPostRow
  gameSlug: string
  viewerUserId: string
  variant: 'game' | 'home'
  ellipsisSrc?: string
  onUpdated: () => void
}

export function FeedPostOverflowMenu({
  post,
  gameSlug,
  viewerUserId,
  variant,
  ellipsisSrc,
  onUpdated,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const kind = post.postKind === 'poll' ? 'poll' : post.postKind === 'text' ? 'text' : 'trade'
  const isOwn = userIdsMatch(post.userId, viewerUserId)
  const canEdit = isOwn && kind !== 'poll'
  const showOthersMenu = !isOwn

  if (isOwn && kind === 'poll') return null
  if (!canEdit && !showOthersMenu) return null

  const ell = ellipsisSrc ?? (variant === 'game' ? a.ellipsis : assets.ellipsis)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const openEdit = useCallback(() => {
    setMenuOpen(false)
    if (kind === 'text') {
      setDraft(plainTextFromRichSegments(post.richSegments) || post.rationale.trim())
    } else {
      setDraft(post.rationale.trim())
    }
    setEditing(true)
  }, [kind, post.rationale, post.richSegments])

  const saveEdit = useCallback(async () => {
    setBusy(true)
    try {
      const url = `/api/games/${encodeURIComponent(gameSlug)}/feed/posts/${encodeURIComponent(post.id)}`
      const body =
        kind === 'text'
          ? { plainText: draft }
          : { rationale: draft }
      const r = await simvestFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setToast(typeof j?.error === 'string' ? j.error : 'Could not save')
        return
      }
      setEditing(false)
      setToast('Post updated')
      window.setTimeout(() => setToast(null), 2200)
      onUpdated()
      window.dispatchEvent(new CustomEvent('simvest:activity-refresh', { detail: { gameSlug } }))
    } finally {
      setBusy(false)
    }
  }, [draft, gameSlug, kind, onUpdated, post.id])

  const onNotify = useCallback(async () => {
    setMenuOpen(false)
    setBusy(true)
    try {
      /* iOS only shows the system permission sheet if this runs before other awaits (user activation). */
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission()
      }

      const r = await simvestFetch('/api/me/activity/notify-authors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorUserId: post.userId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setToast(typeof j?.error === 'string' ? j.error : 'Could not save')
        return
      }
      const push = await registerSimvestWebPushIfPossible()
      if (push.ok) {
        setToast('You’ll get a notification on this device when they post.')
        window.setTimeout(() => setToast(null), 4200)
      } else if (push.reason === 'denied') {
        openOsNotificationSettings()
      } else if (push.reason === 'unsupported') {
        setToast(
          'You’re following their posts. Push alerts need a supported browser (Chrome, Edge, or Safari).',
        )
        window.setTimeout(() => setToast(null), 4200)
      } else {
        setToast(
          'You’re following their posts. We couldn’t enable push on this device — try again from Settings → Post notifications.',
        )
        window.setTimeout(() => setToast(null), 4200)
      }
      onUpdated()
    } finally {
      setBusy(false)
    }
  }, [onUpdated, post.userId])

  const wrapClass = variant === 'game' ? 'fp-feedMenuWrap fp-feedMenuWrap--game' : 'fp-feedMenuWrap fp-feedMenuWrap--home'
  const popClass = variant === 'game' ? 'fp-feedPostMenu fp-feedPostMenu--game' : 'fp-feedPostMenu fp-feedPostMenu--home'

  return (
    <>
      <div ref={wrapRef} className={wrapClass}>
        <button
          type="button"
          className={variant === 'game' ? 'gc-feedMenu' : 'sv-post__menu'}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Post options"
          disabled={busy}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <img src={ell} alt="" />
        </button>
        {menuOpen ? (
          <div className={popClass} role="menu" aria-label="Post actions">
            {canEdit ? (
              <button type="button" className="fp-feedPostMenuRow" role="menuitem" onClick={openEdit}>
                <PenIcon />
                <span className="fp-feedPostMenuLabel">Edit post</span>
              </button>
            ) : null}
            {showOthersMenu ? (
              <button type="button" className="fp-feedPostMenuRow" role="menuitem" onClick={() => void onNotify()}>
                <BellIcon />
                <span className="fp-feedPostMenuLabel">Notify me</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing ? (
        <div
          className="fp-editBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Edit post"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(false)
          }}
        >
          <div className="fp-editCard">
            <p className="fp-editTitle">Edit post</p>
            <textarea
              className="fp-editTextarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              maxLength={2000}
              aria-label="Post text"
            />
            <div className="fp-editActions">
              <button type="button" className="fp-editBtn fp-editBtn--ghost" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" className="fp-editBtn fp-editBtn--primary" disabled={busy} onClick={() => void saveEdit()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <FeedPostToast message={toast} /> : null}
    </>
  )
}
