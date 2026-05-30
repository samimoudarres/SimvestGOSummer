import type { GameFeedPost } from './gameFeedService'
import { notifyGameFeedPost } from './notificationEvents'

/** When a feed row is persisted, notify game members (and author-watch subscribers). */
export async function onNewFeedPost(post: GameFeedPost): Promise<void> {
  await notifyGameFeedPost(post)
}
