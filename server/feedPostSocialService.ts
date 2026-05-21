import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dataFilePath, ensureParentDirForFile } from './dataDir.ts'
import { normalizeUserId } from './followsService'
import { canonicalGameSlugKey } from './gameSlugNormalize'
import { getFeedPostById } from './gameFeedService'
import { ensureUserProfilesBatch } from './userProfileService'
import { loadAllSetupProfilesByKey } from './userSetupProfileService'
import { resolveProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'

const STORE_PATH = dataFilePath('feed-post-social.json')

export type FeedSocialCommentDoc = {
  id: string
  userId: string
  text: string
  createdAtIso: string
  /** Reply thread — references another comment on the same post. */
  parentId: string | null
}

type SocialStoreFile = {
  postLikes: Record<string, string[]>
  comments: Record<string, FeedSocialCommentDoc[]>
  commentLikes: Record<string, string[]>
}

let mutex = Promise.resolve()

function runSocialMutation<T>(fn: () => Promise<T>): Promise<T> {
  const p = mutex.then(fn)
  mutex = p.then(
    () => undefined,
    () => undefined,
  )
  return p
}

async function readStoreUnlocked(): Promise<SocialStoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    const o = JSON.parse(raw) as SocialStoreFile
    return {
      postLikes: o.postLikes && typeof o.postLikes === 'object' ? o.postLikes : {},
      comments: o.comments && typeof o.comments === 'object' ? o.comments : {},
      commentLikes: o.commentLikes && typeof o.commentLikes === 'object' ? o.commentLikes : {},
    }
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? (e as NodeJS.ErrnoException).code : ''
    if (code === 'ENOENT') {
      const initial: SocialStoreFile = { postLikes: {}, comments: {}, commentLikes: {} }
      await ensureParentDirForFile(STORE_PATH)
      await fs.writeFile(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8')
      return initial
    }
    throw e instanceof Error ? e : new Error('feed-post-social read failed')
  }
}

async function readStore(): Promise<SocialStoreFile> {
  return runSocialMutation(readStoreUnlocked)
}

export function socialPostKey(gameSlug: string, postId: string): string {
  const s = canonicalGameSlugKey(gameSlug)
  const id = typeof postId === 'string' ? postId.trim() : ''
  if (!s || !id) return ''
  return `${s}:::${id}`
}

function commentLikeKey(postKey: string, commentId: string): string {
  return `${postKey}:::${commentId}`
}

function uidMatches(a: string, b: string): boolean {
  const na = normalizeUserId(a.trim()) ?? a.trim()
  const nb = normalizeUserId(b.trim()) ?? b.trim()
  return na === nb || a.trim() === b.trim()
}

export async function batchSocialSummaries(
  entries: { slug: string; postId: string }[],
  viewerUserId: string | null,
): Promise<Map<string, { likeCount: number; likedByViewer: boolean; commentCount: number }>> {
  const viewerRaw = viewerUserId?.trim() && viewerUserId.trim().length >= 8 ? viewerUserId.trim() : null
  const viewerNorm = viewerRaw ? normalizeUserId(viewerRaw) ?? viewerRaw : null
  const store = await readStore()
  const out = new Map<string, { likeCount: number; likedByViewer: boolean; commentCount: number }>()
  for (const { slug, postId } of entries) {
    const key = socialPostKey(slug, postId)
    if (!key) continue
    const likes = store.postLikes[key] ?? []
    const likedByViewer = viewerNorm
      ? likes.some((id) => uidMatches(id, viewerNorm) || uidMatches(id, viewerRaw!))
      : false
    const comments = store.comments[key] ?? []
    out.set(key, {
      likeCount: likes.length,
      likedByViewer,
      commentCount: comments.length,
    })
  }
  return out
}

export async function togglePostLike(
  gameSlug: string,
  postId: string,
  actorUserId: string,
): Promise<{ liked: boolean; likeCount: number } | { error: string }> {
  const uid = normalizeUserId(actorUserId.trim()) ?? actorUserId.trim()
  if (!uid || uid.length < 8) return { error: 'Invalid viewer' }
  const postKey = socialPostKey(gameSlug, postId)
  if (!postKey) return { error: 'Invalid post' }

  const post = await getFeedPostById(postId)
  if (!post || canonicalGameSlugKey(post.gameSlug) !== canonicalGameSlugKey(gameSlug)) {
    return { error: 'Post not found' }
  }

  return runSocialMutation(async () => {
    const store = await readStoreUnlocked()
    const cur = [...(store.postLikes[postKey] ?? [])]
    const set = new Set(cur)
    const had = [...set].some((id) => uidMatches(id, uid))
    if (had) {
      store.postLikes[postKey] = [...set].filter((id) => !uidMatches(id, uid))
    } else {
      set.add(uid)
      store.postLikes[postKey] = [...set]
    }
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
    const next = store.postLikes[postKey] ?? []
    return { liked: !had, likeCount: next.length }
  })
}

export async function listPostLikeUserIds(gameSlug: string, postId: string): Promise<string[]> {
  const postKey = socialPostKey(gameSlug, postId)
  if (!postKey) return []
  const store = await readStore()
  return [...(store.postLikes[postKey] ?? [])]
}

export type HydratedPostLiker = { userId: string; displayName: string; avatarUrl: string }

export async function hydratePostLikers(gameSlug: string, postIdsUserIds: string[]): Promise<HydratedPostLiker[]> {
  const slug = canonicalGameSlugKey(gameSlug)
  if (!slug) return []
  const ids = [...new Set(postIdsUserIds.map((x) => normalizeUserId(x.trim()) ?? x.trim()).filter((x) => x.length >= 8))]
  if (!ids.length) return []
  const profileMap = await ensureUserProfilesBatch(ids)
  const setups = await loadAllSetupProfilesByKey()
  return ids.map((userId) => {
    const setup = setups.get(`${userId}:::${slug}`)
    const prof = profileMap.get(userId)
    const displayName = setup
      ? `${setup.firstName} ${setup.lastName}`.trim()
      : (prof?.displayName ?? 'Player')
    const avatarUrl = resolveProfileAvatarUrl(setup?.avatarUrl ?? prof?.avatarUrl ?? '')
    return { userId, displayName, avatarUrl }
  })
}

export async function addPostComment(
  gameSlug: string,
  postId: string,
  actorUserId: string,
  textRaw: string,
  parentId: string | null,
): Promise<{ ok: true; comment: FeedSocialCommentDoc } | { error: string }> {
  const uid = normalizeUserId(actorUserId.trim()) ?? actorUserId.trim()
  if (!uid || uid.length < 8) return { error: 'Invalid viewer' }
  const text = textRaw.trim().slice(0, 2000)
  if (!text) return { error: 'Comment cannot be empty' }

  const postKey = socialPostKey(gameSlug, postId)
  if (!postKey) return { error: 'Invalid post' }

  const post = await getFeedPostById(postId)
  if (!post || canonicalGameSlugKey(post.gameSlug) !== canonicalGameSlugKey(gameSlug)) {
    return { error: 'Post not found' }
  }

  return runSocialMutation(async () => {
    const store = await readStoreUnlocked()
    const list = [...(store.comments[postKey] ?? [])]
    if (parentId?.trim()) {
      const pid = parentId.trim()
      if (!list.some((c) => c.id === pid)) return { error: 'Parent comment not found' }
    }
    const comment: FeedSocialCommentDoc = {
      id: randomUUID(),
      userId: uid,
      text,
      createdAtIso: new Date().toISOString(),
      parentId: parentId?.trim() ? parentId.trim() : null,
    }
    list.push(comment)
    store.comments[postKey] = list
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
    return { ok: true, comment }
  })
}

export type HydratedFeedComment = {
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

export async function listHydratedComments(
  gameSlug: string,
  postId: string,
  viewerUserId: string | null,
): Promise<HydratedFeedComment[]> {
  const postKey = socialPostKey(gameSlug, postId)
  if (!postKey) return []
  const slug = canonicalGameSlugKey(gameSlug)
  if (!slug) return []

  const store = await readStore()
  const rows = [...(store.comments[postKey] ?? [])]
  const viewerRaw =
    viewerUserId?.trim() && viewerUserId.trim().length >= 8 ? viewerUserId.trim() : null
  const viewerNorm = viewerRaw ? normalizeUserId(viewerRaw) ?? viewerRaw : null

  const userIds = [...new Set(rows.map((r) => normalizeUserId(r.userId.trim()) ?? r.userId.trim()))]
  const profileMap = await ensureUserProfilesBatch(userIds)
  const setups = await loadAllSetupProfilesByKey()

  rows.sort((a, b) => (a.createdAtIso < b.createdAtIso ? -1 : 1))

  return rows.map((c) => {
    const uid = normalizeUserId(c.userId.trim()) ?? c.userId.trim()
    const setup = setups.get(`${uid}:::${slug}`)
    const prof = profileMap.get(uid)
    const author = setup ? `${setup.firstName} ${setup.lastName}`.trim() : (prof?.displayName ?? 'Player')
    const avatar = resolveProfileAvatarUrl(setup?.avatarUrl ?? prof?.avatarUrl ?? '')
    const lkKey = commentLikeKey(postKey, c.id)
    const likesArr = store.commentLikes[lkKey] ?? []
    const likedByViewer = viewerNorm
      ? likesArr.some((id) => uidMatches(id, viewerNorm) || uidMatches(id, viewerRaw!))
      : false
    return {
      id: c.id,
      userId: uid,
      author,
      avatar,
      text: c.text,
      createdAtIso: c.createdAtIso,
      parentId: c.parentId,
      likeCount: likesArr.length,
      likedByViewer,
    }
  })
}

export async function toggleCommentLike(
  gameSlug: string,
  postId: string,
  commentId: string,
  actorUserId: string,
): Promise<{ liked: boolean; likeCount: number } | { error: string }> {
  const uid = normalizeUserId(actorUserId.trim()) ?? actorUserId.trim()
  if (!uid || uid.length < 8) return { error: 'Invalid viewer' }
  const postKey = socialPostKey(gameSlug, postId)
  if (!postKey) return { error: 'Invalid post' }
  const cid = commentId.trim()
  if (!cid) return { error: 'Invalid comment' }

  const post = await getFeedPostById(postId)
  if (!post || canonicalGameSlugKey(post.gameSlug) !== canonicalGameSlugKey(gameSlug)) {
    return { error: 'Post not found' }
  }

  return runSocialMutation(async () => {
    const store = await readStoreUnlocked()
    const comments = store.comments[postKey] ?? []
    if (!comments.some((c) => c.id === cid)) return { error: 'Comment not found' }

    const lkKey = commentLikeKey(postKey, cid)
    const cur = [...(store.commentLikes[lkKey] ?? [])]
    const set = new Set(cur)
    const had = [...set].some((id) => uidMatches(id, uid))
    if (had) {
      store.commentLikes[lkKey] = [...set].filter((id) => !uidMatches(id, uid))
    } else {
      set.add(uid)
      store.commentLikes[lkKey] = [...set]
    }
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
    const next = store.commentLikes[lkKey] ?? []
    return { liked: !had, likeCount: next.length }
  })
}
