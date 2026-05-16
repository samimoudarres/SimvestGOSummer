import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameFeedPostRow } from '../challenge/useGameFeed'
import {
  fetchFeedPostComments,
  fetchFeedPostLikers,
  postFeedComment,
  toggleFeedCommentLike,
  toggleFeedPostLike,
  type FeedCommentRow,
} from '../api/feedPostSocialApi'
import { apiAssetSrc } from '../config/apiAssetSrc'
import { formatFeedPostShareText } from './formatFeedPostShare'
import './feedPostSocial.css'

const defaultSocial = { likeCount: 0, likedByViewer: false, commentCount: 0 }

function fmtShortTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function ThumbIcon({ filled }: { filled: boolean }) {
  const sz = { width: 16, height: 16 } as const
  if (filled) {
    return (
      <svg className="fps-icon" viewBox="0 0 24 24" aria-hidden {...sz}>
        <path
          fill="currentColor"
          d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
        />
      </svg>
    )
  }
  return (
    <svg className="fps-icon" viewBox="0 0 24 24" aria-hidden {...sz}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
      />
    </svg>
  )
}

function CommentBubbleIcon() {
  return (
    <svg className="fps-icon" width={16} height={16} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg className="fps-icon" width={16} height={16} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
      />
    </svg>
  )
}

function CommentBranch({
  flat,
  parentId,
  depth,
  interactionsLocked,
  onReply,
  onToggleCommentLike,
}: {
  flat: FeedCommentRow[]
  parentId: string | null
  depth: number
  interactionsLocked: boolean
  onReply: (id: string, author: string) => void
  onToggleCommentLike: (id: string) => void
}) {
  const children = useMemo(() => {
    const rows = flat.filter((c) => (c.parentId ?? null) === parentId)
    rows.sort((a, b) => (a.createdAtIso < b.createdAtIso ? -1 : 1))
    return rows
  }, [flat, parentId])

  return (
    <>
      {children.map((c) => (
        <div key={c.id} className="fps-comment" style={{ marginLeft: depth === 0 ? 0 : Math.min(depth * 14, 56) }}>
          <div className="fps-commentTop">
            <img className="fps-commentAvatar" src={apiAssetSrc(c.avatar)} alt="" />
            <div className="fps-commentMain">
              <div className="fps-commentMeta">
                <p className="fps-commentAuthor">{c.author}</p>
                <span className="fps-commentTime">{fmtShortTime(c.createdAtIso)}</span>
              </div>
              <p className="fps-commentText">{c.text}</p>
              <div className="fps-commentActions">
                <button
                  type="button"
                  className="fps-miniBtn"
                  disabled={interactionsLocked}
                  onClick={() => onReply(c.id, c.author)}
                >
                  Reply
                </button>
                <div className="fps-commentLikeCluster">
                  <button
                    type="button"
                    className={`fps-miniBtn${c.likedByViewer ? ' fps-likeBtn--on' : ''}`}
                    aria-pressed={c.likedByViewer}
                    disabled={interactionsLocked}
                    onClick={() => onToggleCommentLike(c.id)}
                  >
                    <ThumbIcon filled={c.likedByViewer} />
                  </button>
                  <span className="fps-commentTime">{c.likeCount}</span>
                </div>
              </div>
            </div>
          </div>
          <CommentBranch
            flat={flat}
            parentId={c.id}
            depth={depth + 1}
            interactionsLocked={interactionsLocked}
            onReply={onReply}
            onToggleCommentLike={onToggleCommentLike}
          />
        </div>
      ))}
    </>
  )
}

export type FeedPostSocialBarProps = {
  post: GameFeedPostRow
  gameSlug: string
  variant: 'game' | 'home'
  interactionsLocked?: boolean
  onCountsDirty?: () => void
}

export function FeedPostSocialBar({
  post,
  gameSlug,
  variant: _variant,
  interactionsLocked = false,
  onCountsDirty,
}: FeedPostSocialBarProps) {
  const sg = post.gameSlug?.trim() || gameSlug
  const baseSocial = post.social ?? defaultSocial
  const [social, setSocial] = useState(baseSocial)
  const [likesOpen, setLikesOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [likers, setLikers] = useState<{ userId: string; displayName: string; avatarUrl: string }[]>([])
  const [likersErr, setLikersErr] = useState<string | null>(null)
  const [comments, setComments] = useState<FeedCommentRow[]>([])
  const [commentsErr, setCommentsErr] = useState<string | null>(null)
  const [compose, setCompose] = useState('')
  const [composeBusy, setComposeBusy] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [likeBusy, setLikeBusy] = useState(false)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    setSocial(post.social ?? defaultSocial)
  }, [post.id, post.social?.likeCount, post.social?.commentCount, post.social?.likedByViewer])

  useEffect(() => {
    if (!likesOpen) return
    let cancelled = false
    setLikersErr(null)
    void (async () => {
      try {
        const rows = await fetchFeedPostLikers(sg, post.id)
        if (!cancelled) setLikers(rows)
      } catch (e) {
        if (!cancelled) setLikersErr(e instanceof Error ? e.message : 'Could not load likes')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [likesOpen, sg, post.id])

  const reloadComments = useCallback(async () => {
    setCommentsErr(null)
    try {
      const rows = await fetchFeedPostComments(sg, post.id)
      setComments(rows)
    } catch (e) {
      setCommentsErr(e instanceof Error ? e.message : 'Could not load comments')
    }
  }, [sg, post.id])

  useEffect(() => {
    if (!commentsOpen) return
    void reloadComments()
    const id = window.setInterval(() => void reloadComments(), 8000)
    return () => window.clearInterval(id)
  }, [commentsOpen, reloadComments])

  useEffect(() => {
    if (!likesOpen && !commentsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLikesOpen(false)
        setCommentsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [likesOpen, commentsOpen])

  useEffect(() => {
    if (!likesOpen && !commentsOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [likesOpen, commentsOpen])

  const flashToast = useCallback((msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setShareToast(msg)
    toastTimer.current = window.setTimeout(() => {
      setShareToast(null)
      toastTimer.current = null
    }, 2600)
  }, [])

  const onLikePost = useCallback(async () => {
    if (interactionsLocked || likeBusy) return
    setLikeBusy(true)
    try {
      const res = await toggleFeedPostLike(sg, post.id)
      setSocial((s) => ({
        ...s,
        likedByViewer: res.liked,
        likeCount: res.likeCount,
      }))
      onCountsDirty?.()
    } catch (e) {
      flashToast(e instanceof Error ? e.message : 'Could not update like')
    } finally {
      setLikeBusy(false)
    }
  }, [flashToast, interactionsLocked, likeBusy, onCountsDirty, post.id, sg])

  const onShare = useCallback(async () => {
    const text = formatFeedPostShareText(post)
    try {
      await navigator.clipboard.writeText(text)
      flashToast('Copied post to clipboard')
    } catch {
      flashToast('Could not copy — try again')
    }
  }, [flashToast, post])

  const submitComment = useCallback(async () => {
    const t = compose.trim()
    if (!t || composeBusy || interactionsLocked) return
    setComposeBusy(true)
    try {
      await postFeedComment(sg, post.id, t, replyTo?.id ?? null)
      setCompose('')
      setReplyTo(null)
      await reloadComments()
      setSocial((s) => ({ ...s, commentCount: s.commentCount + 1 }))
      onCountsDirty?.()
    } catch (e) {
      flashToast(e instanceof Error ? e.message : 'Could not post comment')
    } finally {
      setComposeBusy(false)
    }
  }, [compose, composeBusy, flashToast, interactionsLocked, onCountsDirty, post.id, reloadComments, replyTo, sg])

  const onToggleCommentLike = useCallback(
    async (commentId: string) => {
      if (interactionsLocked) return
      try {
        const res = await toggleFeedCommentLike(sg, post.id, commentId)
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, likedByViewer: res.liked, likeCount: res.likeCount } : c,
          ),
        )
      } catch (e) {
        flashToast(e instanceof Error ? e.message : 'Could not update comment')
      }
    },
    [flashToast, interactionsLocked, post.id, sg],
  )

  const rowClass = 'fps-row'

  const portalTarget = typeof document !== 'undefined' ? document.body : null

  const sheets = portalTarget ? (
    <>
      {likesOpen ? (
        createPortal(
          <div
            className="fps-shade"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setLikesOpen(false)
            }}
          >
            <div className="fps-sheet" role="dialog" aria-labelledby="fps-likes-title">
              <div className="fps-sheetGrab" aria-hidden />
              <div className="fps-sheetHead">
                <h2 className="fps-sheetTitle" id="fps-likes-title">
                  Likes
                </h2>
                <button type="button" className="fps-sheetClose" onClick={() => setLikesOpen(false)}>
                  Done
                </button>
              </div>
              <div className="fps-sheetBody">
                {likersErr ? <p className="fps-emptyHint">{likersErr}</p> : null}
                {!likersErr && likers.length === 0 ? (
                  <p className="fps-emptyHint">No likes yet.</p>
                ) : null}
                {!likersErr
                  ? likers.map((u) => (
                      <div key={u.userId} className="fps-liker">
                        <img className="fps-likerAvatar" src={apiAssetSrc(u.avatarUrl)} alt="" />
                        <p className="fps-likerName">{u.displayName}</p>
                      </div>
                    ))
                  : null}
              </div>
            </div>
          </div>,
          portalTarget,
        )
      ) : null}
      {commentsOpen ? (
        createPortal(
          <div
            className="fps-shade"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCommentsOpen(false)
            }}
          >
            <div className="fps-sheet" role="dialog" aria-labelledby="fps-comments-title">
              <div className="fps-sheetGrab" aria-hidden />
              <div className="fps-sheetHead">
                <h2 className="fps-sheetTitle" id="fps-comments-title">
                  Comments
                </h2>
                <button type="button" className="fps-sheetClose" onClick={() => setCommentsOpen(false)}>
                  Done
                </button>
              </div>
              <div className="fps-sheetBody">
                {commentsErr ? <p className="fps-emptyHint">{commentsErr}</p> : null}
                {!commentsErr && comments.length === 0 ? (
                  <p className="fps-emptyHint">Be the first to leave a comment.</p>
                ) : null}
                {!commentsErr && comments.length > 0 ? (
                  <CommentBranch
                    flat={comments}
                    parentId={null}
                    depth={0}
                    interactionsLocked={Boolean(interactionsLocked)}
                    onReply={(id, author) => setReplyTo({ id, author })}
                    onToggleCommentLike={onToggleCommentLike}
                  />
                ) : null}
              </div>
              {interactionsLocked ? (
                <div className="fps-composeBar">
                  <p className="fps-emptyHint" style={{ margin: 0 }}>
                    This challenge has ended — comments are closed.
                  </p>
                </div>
              ) : (
                <div className="fps-composeBar">
                  {replyTo ? (
                    <div className="fps-replyBanner">
                      Replying to <strong>{replyTo.author}</strong>{' '}
                      <button type="button" className="fps-miniBtn" onClick={() => setReplyTo(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  <div className="fps-composeInner">
                    <textarea
                      className="fps-composeInput"
                      rows={2}
                      placeholder="Write a comment…"
                      value={compose}
                      maxLength={2000}
                      onChange={(e) => setCompose(e.target.value)}
                    />
                    <button
                      type="button"
                      className="fps-composePost"
                      disabled={composeBusy || !compose.trim()}
                      onClick={() => void submitComment()}
                    >
                      Post
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          portalTarget,
        )
      ) : null}
      {shareToast ? createPortal(<div className="fps-toast">{shareToast}</div>, portalTarget) : null}
    </>
  ) : null

  return (
    <>
      <div className={rowClass}>
        <div className="fps-cluster">
          <button
            type="button"
            className={`fps-btn fps-likeBtn${social.likedByViewer ? ' fps-likeBtn--on' : ''}`}
            aria-label={social.likedByViewer ? 'Unlike post' : 'Like post'}
            aria-pressed={social.likedByViewer}
            disabled={interactionsLocked || likeBusy}
            onClick={() => void onLikePost()}
          >
            <ThumbIcon filled={social.likedByViewer} />
          </button>
          <button type="button" className="fps-countTap" aria-label="See who liked this post" onClick={() => setLikesOpen(true)}>
            {social.likeCount}
          </button>
        </div>

        <button
          type="button"
          className="fps-btn"
          aria-label="Comments"
          onClick={() => {
            setCommentsOpen(true)
            setReplyTo(null)
          }}
        >
          <CommentBubbleIcon />
          <span>{social.commentCount}</span>
        </button>

        <button type="button" className="fps-btn" aria-label="Share post" onClick={() => void onShare()}>
          <ShareIcon />
          <span>Share</span>
        </button>
      </div>
      {sheets}
    </>
  )
}
