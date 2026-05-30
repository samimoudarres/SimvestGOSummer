import type { GameFeedPost } from './gameFeedService'
import { listUserIdsJoinedGame } from './gameMembershipService'
import { listViewerIdsWatchingAuthor } from './activityAuthorNotifyService'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { viewerIdsMatch } from './gameJoinRequestsService'
import { normalizeUserId } from './followsService'
import { sendPushToUser, sendPushToUsers, type PushPayload } from './pushDeliveryService'
import {
  clipNotificationText,
  formatSignedPct,
  gameFeedPath,
  joinRequestsPath,
  leaderboardPath,
  resolveGameDisplayName,
  stockDetailPath,
} from './notificationHelpers'
import { ordinalEnglish } from './gameLeaderboardService.ts'

function excludeAuthor<T extends string>(ids: string[], authorId: string): string[] {
  const a = normalizeUserId(authorId) ?? authorId
  return ids.filter((id) => {
    const n = normalizeUserId(id) ?? id
    return !viewerIdsMatch(n, a)
  })
}

function postPreview(post: GameFeedPost): string {
  if (post.postKind === 'trade') {
    const sym = post.tickerSymbol?.trim()
    const title = post.tradeTitle?.trim()
    if (title) return clipNotificationText(title, 90)
    if (sym) return `${sym} trade`
    return 'New trade'
  }
  if (post.postKind === 'poll') {
    const q = post.poll?.question?.trim()
    return q ? clipNotificationText(q, 90) : 'New poll'
  }
  const rat = post.rationale?.trim()
  if (rat) return clipNotificationText(rat, 90)
  return 'New post'
}

function postTitleLine(post: GameFeedPost): string {
  const author = post.author?.trim() || 'Someone'
  if (post.postKind === 'trade') return `${author} traded`
  if (post.postKind === 'poll') return `${author} posted a poll`
  return `${author} posted`
}

/** New feed activity — all game members + optional author-watch subscribers. */
export async function notifyGameFeedPost(post: GameFeedPost): Promise<void> {
  const slug = typeof post.gameSlug === 'string' ? post.gameSlug.trim() : ''
  const authorRaw = typeof post.userId === 'string' ? post.userId.trim() : ''
  if (!slug || authorRaw.length < 8) return

  const gameName = await resolveGameDisplayName(slug)
  const payload: PushPayload = {
    title: `${gameName}`,
    body: `${postTitleLine(post)} — ${postPreview(post)}`,
    url: gameFeedPath(slug),
    tag: `feed-${slug}`,
  }

  const members = excludeAuthor(await listUserIdsJoinedGame(slug), authorRaw)
  const watchers =
    authorRaw.length >= 8 ? excludeAuthor(await listViewerIdsWatchingAuthor(authorRaw), authorRaw) : []
  const recipients = [...members, ...watchers]
  await sendPushToUsers(recipients, payload)
}

export async function notifyPostLiked(input: {
  gameSlug: string
  postAuthorUserId: string
  likerDisplayName: string
  postPreview: string
}): Promise<void> {
  const author = input.postAuthorUserId.trim()
  if (author.length < 8) return
  const gameName = await resolveGameDisplayName(input.gameSlug)
  const liker = input.likerDisplayName.trim() || 'Someone'
  await sendPushToUser(author, {
    title: `${gameName}`,
    body: `${liker} liked your post — ${clipNotificationText(input.postPreview, 80)}`,
    url: gameFeedPath(input.gameSlug),
    tag: `like-${input.gameSlug}`,
  })
}

export async function notifyPostCommented(input: {
  gameSlug: string
  postAuthorUserId: string
  commenterDisplayName: string
  commentText: string
  postPreview: string
}): Promise<void> {
  const author = input.postAuthorUserId.trim()
  if (author.length < 8) return
  const gameName = await resolveGameDisplayName(input.gameSlug)
  const who = input.commenterDisplayName.trim() || 'Someone'
  const snippet = clipNotificationText(input.commentText, 70)
  await sendPushToUser(author, {
    title: `${gameName}`,
    body: `${who} commented: “${snippet}” — ${clipNotificationText(input.postPreview, 50)}`,
    url: gameFeedPath(input.gameSlug),
    tag: `comment-${input.gameSlug}`,
  })
}

export async function notifyHostJoinRequest(input: {
  gameSlug: string
  hostUserId: string
  requesterDisplayName: string
}): Promise<void> {
  const host = input.hostUserId.trim()
  if (host.length < 8) return
  const gameName = await resolveGameDisplayName(input.gameSlug)
  const who = input.requesterDisplayName.trim() || 'A player'
  await sendPushToUser(host, {
    title: `${gameName}`,
    body: `${who} requested to join — tap to approve or deny`,
    url: joinRequestsPath(input.gameSlug),
    tag: `join-req-${input.gameSlug}`,
  })
}

export async function notifyHostMemberJoined(input: {
  gameSlug: string
  hostUserId: string
  memberDisplayName: string
}): Promise<void> {
  const host = input.hostUserId.trim()
  if (host.length < 8) return
  const gameName = await resolveGameDisplayName(input.gameSlug)
  const who = input.memberDisplayName.trim() || 'A player'
  await sendPushToUser(host, {
    title: `${gameName}`,
    body: `${who} joined your game`,
    url: gameFeedPath(input.gameSlug),
    tag: `joined-${input.gameSlug}`,
  })
}

export async function notifyStockHoldingMove(input: {
  userId: string
  gameSlug: string
  ticker: string
  tickerLabel: string
  changePct: number
  window: 'day' | 'week'
}): Promise<void> {
  const uid = input.userId.trim()
  if (uid.length < 8) return
  const gameName = await resolveGameDisplayName(input.gameSlug)
  const sym = input.tickerLabel.trim() || input.ticker
  const pct = formatSignedPct(input.changePct)
  const windowLabel = input.window === 'week' ? 'this week' : 'today'
  const dir = input.changePct >= 0 ? 'up' : 'down'
  await sendPushToUser(uid, {
    title: `${sym} in ${gameName}`,
    body: `Your holding is ${dir} ${pct} ${windowLabel}`,
    url: stockDetailPath(input.ticker),
    tag: `hold-${input.ticker}-${input.window}`,
  })
}

export async function notifyStockWatchMove(input: {
  userId: string
  ticker: string
  tickerLabel: string
  changePct: number
  window: 'day' | 'week'
}): Promise<void> {
  const uid = input.userId.trim()
  if (uid.length < 8) return
  const sym = input.tickerLabel.trim() || input.ticker
  const pct = formatSignedPct(input.changePct)
  const windowLabel = input.window === 'week' ? 'over the past week' : 'today'
  const dir = input.changePct >= 0 ? 'up' : 'down'
  await sendPushToUser(uid, {
    title: sym,
    body: `${sym} is ${dir} ${pct} ${windowLabel} (watchlist)`,
    url: stockDetailPath(input.ticker),
    tag: `watch-${input.ticker}-${input.window}`,
  })
}

/** Player climbed more than 3 spots on the Overall Return leaderboard — all game members. */
export async function notifyLeaderboardBigJump(input: {
  gameSlug: string
  playerUserId: string
  playerDisplayName: string
  previousRank: number
  newRank: number
  totalPlayers: number
  recipientUserIds: string[]
}): Promise<void> {
  const slug = input.gameSlug.trim()
  if (!slug) return
  const spots = input.previousRank - input.newRank
  if (spots <= 3) return
  const gameName = await resolveGameDisplayName(slug)
  const who = input.playerDisplayName.trim() || 'A player'
  const rankLabel = ordinalEnglish(input.newRank)
  await sendPushToUsers(input.recipientUserIds, {
    title: `${gameName} leaderboard`,
    body: `${who} jumped ${spots} spots to ${rankLabel} place (Overall Return)`,
    url: leaderboardPath(slug),
    tag: `lb-jump-${slug}-${input.playerUserId}`,
  })
}

/** Player reached 1st, 2nd, or 3rd on the Overall Return leaderboard. */
export async function notifyLeaderboardPodium(input: {
  userId: string
  gameSlug: string
  rank: number
  totalPlayers: number
}): Promise<void> {
  const uid = input.userId.trim()
  const rank = Math.floor(input.rank)
  if (uid.length < 8 || rank < 1 || rank > 3) return
  const gameName = await resolveGameDisplayName(input.gameSlug)
  const rankLabel = ordinalEnglish(rank)
  await sendPushToUser(uid, {
    title: `${gameName} leaderboard`,
    body: `You're now in ${rankLabel} place (Overall Return) — out of ${input.totalPlayers} players`,
    url: leaderboardPath(input.gameSlug),
    tag: `lb-podium-${input.gameSlug}-${rank}`,
  })
}

export async function resolveHostUserId(gameSlug: string): Promise<string | null> {
  const rules = await getRuntimeRules(gameSlug)
  const host = rules?.hostUserId?.trim()
  return host && host.length >= 8 ? host : null
}
