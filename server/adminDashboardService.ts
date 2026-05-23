import { listAllJoinRequests, type GameJoinRequest } from './gameJoinRequestsService'
import { listAllFeedPostsForAdmin, type GameFeedPost } from './gameFeedService'
import { getMembershipCountsByGame } from './gameMembershipService'
import { listAllRuntimeRules } from './gameRuntimeRulesService'
import { listAllAccountsForAdmin, type AccountPublicView } from './userAccountService'

export type AdminOverview = {
  accountCount: number
  gameCount: number
  publicGameCount: number
  postCount: number
  membershipJoinCount: number
  pendingJoinRequestCount: number
}

export type AdminGameRow = {
  slug: string
  displayName: string
  visibility: string
  hostUserId: string | null
  hostDisplayName: string
  joinCode: string | null
  setupComplete: boolean
  startsAtIso: string
  endsAtIso: string | null
  playerCount: number
  updatedAtIso: string
}

export type AdminPostRow = {
  id: string
  gameSlug: string
  userId: string
  author: string
  postKind: string
  timestampIso: string
  tradeTitle: string
  tickerSymbol: string
  rationalePreview: string
  hasImage: boolean
}

export type AdminJoinRequestRow = {
  id: string
  gameSlug: string
  userId: string
  displayName: string
  status: GameJoinRequest['status']
  createdAtIso: string
  resolvedAtIso: string | null
}

export type AdminDashboardPayload = {
  generatedAtIso: string
  overview: AdminOverview
  accounts: AccountPublicView[]
  games: AdminGameRow[]
  posts: AdminPostRow[]
  joinRequests: AdminJoinRequestRow[]
}

const RATIONALE_PREVIEW_MAX = 160

function rationalePreview(post: GameFeedPost): string {
  const raw = (post.rationale ?? '').trim()
  if (!raw) return ''
  if (raw.length <= RATIONALE_PREVIEW_MAX) return raw
  return `${raw.slice(0, RATIONALE_PREVIEW_MAX)}…`
}

function toAdminPostRow(post: GameFeedPost): AdminPostRow {
  const attachment = post.attachmentImageUrl
  return {
    id: post.id,
    gameSlug: post.gameSlug,
    userId: post.userId,
    author: post.author,
    postKind: post.postKind ?? 'trade',
    timestampIso: post.timestampIso,
    tradeTitle: post.tradeTitle ?? '',
    tickerSymbol: post.tickerSymbol ?? '',
    rationalePreview: rationalePreview(post),
    hasImage: Boolean(attachment && attachment.length > 0),
  }
}

function toAdminJoinRow(row: GameJoinRequest): AdminJoinRequestRow {
  return {
    id: row.id,
    gameSlug: row.gameSlug,
    userId: row.userId,
    displayName: row.displayName,
    status: row.status,
    createdAtIso: row.createdAtIso,
    resolvedAtIso: row.resolvedAtIso ?? null,
  }
}

export async function buildAdminDashboard(): Promise<AdminDashboardPayload> {
  const [accounts, rules, posts, joinRequests, membershipByGame] = await Promise.all([
    listAllAccountsForAdmin(),
    listAllRuntimeRules(),
    listAllFeedPostsForAdmin(2000),
    listAllJoinRequests(),
    getMembershipCountsByGame(),
  ])

  const games: AdminGameRow[] = rules
    .map(({ slug, rules: r }) => ({
      slug,
      displayName: r.gameDisplayName,
      visibility: r.visibility,
      hostUserId: r.hostUserId,
      hostDisplayName: r.hostDisplayName,
      joinCode: r.joinCode,
      setupComplete: r.setupComplete,
      startsAtIso: r.startsAtIso,
      endsAtIso: r.endsAtIso,
      playerCount: membershipByGame[slug] ?? 0,
      updatedAtIso: r.updatedAtIso,
    }))
    .sort((a, b) => (a.updatedAtIso < b.updatedAtIso ? 1 : -1))

  const membershipJoinCount = Object.values(membershipByGame).reduce((sum, n) => sum + n, 0)
  const pendingJoinRequestCount = joinRequests.filter((r) => r.status === 'pending').length
  const publicGameCount = games.filter((g) => g.visibility === 'public').length

  return {
    generatedAtIso: new Date().toISOString(),
    overview: {
      accountCount: accounts.length,
      gameCount: games.length,
      publicGameCount,
      postCount: posts.length,
      membershipJoinCount,
      pendingJoinRequestCount,
    },
    accounts,
    games,
    posts: posts.map(toAdminPostRow),
    joinRequests: joinRequests.map(toAdminJoinRow),
  }
}
