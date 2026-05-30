import type { GameFeedPost } from './gameFeedService'
import { getFeedPostById } from './gameFeedService'
import { hydratePostLikers } from './feedPostSocialService'
import { notifyPostCommented, notifyPostLiked } from './notificationEvents'

function postPreviewFromRow(post: GameFeedPost): string {
  if (post.postKind === 'trade') return post.tradeTitle?.trim() || post.tickerSymbol?.trim() || 'your trade'
  if (post.postKind === 'poll') return post.poll?.question?.trim() || 'your poll'
  return post.rationale?.trim() || 'your post'
}

export async function pushNotifyPostLiked(
  gameSlug: string,
  postId: string,
  likerUserId: string,
  liked: boolean,
): Promise<void> {
  if (!liked) return
  const post = await getFeedPostById(postId)
  if (!post) return
  const author = typeof post.userId === 'string' ? post.userId.trim() : ''
  if (author.length < 8 || author === likerUserId.trim()) return
  const [liker] = await hydratePostLikers(gameSlug, [likerUserId])
  queueMicrotask(() => {
    void notifyPostLiked({
      gameSlug,
      postAuthorUserId: author,
      likerDisplayName: liker?.displayName ?? 'Someone',
      postPreview: postPreviewFromRow(post),
    }).catch(() => {})
  })
}

export async function pushNotifyPostCommented(
  gameSlug: string,
  postId: string,
  commenterUserId: string,
  commentText: string,
): Promise<void> {
  const post = await getFeedPostById(postId)
  if (!post) return
  const author = typeof post.userId === 'string' ? post.userId.trim() : ''
  if (author.length < 8 || author === commenterUserId.trim()) return
  const [commenter] = await hydratePostLikers(gameSlug, [commenterUserId])
  queueMicrotask(() => {
    void notifyPostCommented({
      gameSlug,
      postAuthorUserId: author,
      commenterDisplayName: commenter?.displayName ?? 'Someone',
      commentText,
      postPreview: postPreviewFromRow(post),
    }).catch(() => {})
  })
}
