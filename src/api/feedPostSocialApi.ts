import { simvestFetch } from './simvestFetch'

export type FeedPostLikerRow = {
  userId: string
  displayName: string
  avatarUrl: string
}

export type FeedCommentRow = {
  id: string
  userId: string
  author: string
  avatar: string
  text: string
  createdAtIso: string
  parentId: string | null
  likeCount: number
  likedByViewer: boolean
}

export async function toggleFeedPostLike(
  gameSlug: string,
  postId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const r = await simvestFetch(
    `/api/games/${encodeURIComponent(gameSlug)}/feed/posts/${encodeURIComponent(postId)}/social/like`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  )
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Could not update like')
  return {
    likeCount: typeof body.likeCount === 'number' ? body.likeCount : 0,
    liked: body.liked === true,
  }
}

export async function fetchFeedPostLikers(gameSlug: string, postId: string): Promise<FeedPostLikerRow[]> {
  const r = await simvestFetch(
    `/api/games/${encodeURIComponent(gameSlug)}/feed/posts/${encodeURIComponent(postId)}/social/likes`,
  )
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Could not load likes')
  const users = body.users
  return Array.isArray(users) ? (users as FeedPostLikerRow[]) : []
}

export async function fetchFeedPostComments(gameSlug: string, postId: string): Promise<FeedCommentRow[]> {
  const r = await simvestFetch(
    `/api/games/${encodeURIComponent(gameSlug)}/feed/posts/${encodeURIComponent(postId)}/social/comments`,
  )
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Could not load comments')
  const comments = body.comments
  return Array.isArray(comments) ? (comments as FeedCommentRow[]) : []
}

export async function postFeedComment(
  gameSlug: string,
  postId: string,
  text: string,
  parentId: string | null,
): Promise<void> {
  const r = await simvestFetch(
    `/api/games/${encodeURIComponent(gameSlug)}/feed/posts/${encodeURIComponent(postId)}/social/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, parentId }),
    },
  )
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Could not post comment')
}

export async function toggleFeedCommentLike(
  gameSlug: string,
  postId: string,
  commentId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const r = await simvestFetch(
    `/api/games/${encodeURIComponent(gameSlug)}/feed/posts/${encodeURIComponent(postId)}/social/comments/${encodeURIComponent(commentId)}/like`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  )
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Could not update comment like')
  return {
    liked: body.liked === true,
    likeCount: typeof body.likeCount === 'number' ? body.likeCount : 0,
  }
}
