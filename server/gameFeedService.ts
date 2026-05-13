import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { normalizeUserId } from './followsService'
import { canonicalGameSlugKey, normalizeGameSlugParam } from './gameSlugNormalize'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FEED_PATH = path.join(__dirname, 'data', 'game-feed.json')

/** Serialize read–modify–write on `game-feed.json` so concurrent posts/trades cannot drop rows. */
let feedFileMutex = Promise.resolve()

function runFeedMutation<T>(fn: () => Promise<T>): Promise<T> {
  const p = feedFileMutex.then(fn)
  feedFileMutex = p.then(
    () => undefined,
    () => undefined,
  )
  return p
}

export type GameFeedPostKind = 'trade' | 'text' | 'poll'

export type RichTextSegment =
  | { type: 'text'; text: string }
  | { type: 'ticker'; symbol: string; label: string }

export type GameFeedPost = {
  id: string
  userId: string
  gameSlug: string
  /** Defaults to trade when omitted (legacy rows). */
  postKind?: GameFeedPostKind
  author: string
  avatar: string
  timestampIso: string
  tradeTitle: string
  tickerSymbol: string
  tickerImage: string
  changePct: string
  sharesBought: string
  orderTotal: string
  marketCap: string
  revenue: string
  rationale: string
  purchasePrice?: number
  side?: 'buy' | 'sell'
  /** Inline tagged stocks + line breaks for text/image posts */
  richSegments?: RichTextSegment[]
  /** Optional image (typically data URL) attached to a text-style post */
  attachmentImageUrl?: string
  /** Poll posts */
  pollQuestion?: string
  pollOptions?: { id: string; label: string }[]
}

type FeedFile = { posts: GameFeedPost[] }

const SEED_POSTS: GameFeedPost[] = [
  {
    id: 'seed-jack',
    userId: 'demo-jack-rs',
    gameSlug: 'nov-2024-stock-challenge',
    author: 'Jack Roberts',
    avatar: '/figma-assets/user-jack.png',
    timestampIso: '2024-11-25T20:53:00.000Z',
    tradeTitle: "I'm buying AAPL",
    tickerSymbol: 'AAPL',
    tickerImage: '/api/stocks/AAPL/branding-icon',
    changePct: '1.36%',
    sharesBought: '12',
    orderTotal: '$2,794.44',
    marketCap: '$3.83T',
    revenue: '$391.04B',
    rationale: 'I think Apple stock will sky rocket once they release the new iPhone',
  },
  {
    id: 'seed-miley',
    userId: 'demo-miley-sm',
    gameSlug: 'nov-2024-stock-challenge',
    author: 'Miley Schmidt',
    avatar: '/figma-assets/user-miley.png',
    timestampIso: '2024-11-25T20:21:00.000Z',
    tradeTitle: "I'm buying NVDA",
    tickerSymbol: 'NVDA',
    tickerImage: '/api/stocks/NVDA/branding-icon',
    changePct: '4.91%',
    sharesBought: '2.54',
    orderTotal: '$2,794.44',
    marketCap: '$3.19T',
    revenue: '$35.08B',
    rationale: 'The entire AI industry relies on NVIDIA to supply',
  },
]

async function readFile(): Promise<FeedFile> {
  try {
    const raw = JSON.parse(await fs.readFile(FEED_PATH, 'utf8')) as FeedFile
    if (raw && Array.isArray(raw.posts)) return raw
  } catch {
    /* missing */
  }
  const initial: FeedFile = { posts: [...SEED_POSTS] }
  await fs.mkdir(path.dirname(FEED_PATH), { recursive: true })
  await fs.writeFile(FEED_PATH, JSON.stringify(initial, null, 2), 'utf8')
  return initial
}

export async function listPostsForGame(gameSlug: string): Promise<GameFeedPost[]> {
  const want = canonicalGameSlugKey(gameSlug)
  if (!want) return []
  const { posts } = await readFile()
  return posts
    .filter((p) => canonicalGameSlugKey(p.gameSlug) === want)
    .sort((a, b) => (a.timestampIso < b.timestampIso ? 1 : -1))
}

/** Home / global activity — newest first. */
export async function listRecentActivityPosts(limit = 48): Promise<GameFeedPost[]> {
  const { posts } = await readFile()
  return [...posts].sort((a, b) => (a.timestampIso < b.timestampIso ? 1 : -1)).slice(0, Math.max(1, limit))
}

export async function appendGameFeedPost(post: Omit<GameFeedPost, 'id'> & { id?: string }): Promise<GameFeedPost> {
  return runFeedMutation(async () => {
    const file = await readFile()
    const gameSlug = normalizeGameSlugParam(post.gameSlug)
    const full: GameFeedPost = {
      ...post,
      gameSlug,
      postKind: post.postKind ?? 'trade',
      id: post.id ?? randomUUID(),
    }
    file.posts.unshift(full)
    await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    return full
  })
}

/** Game slugs where this user already has a persisted feed row (join/ledger sync can lag behind). */
export async function listGameSlugsWhereUserHasFeedPosts(userId: string): Promise<string[]> {
  if (!userId || userId.length < 8) return []
  const want = normalizeUserId(userId.trim()) ?? userId.trim()
  const { posts } = await readFile()
  const slugs = new Set<string>()
  for (const p of posts) {
    const rawUid = typeof p.userId === 'string' ? p.userId.trim() : ''
    const uidNorm = normalizeUserId(rawUid)
    const match = (uidNorm && uidNorm === want) || rawUid === want
    if (!match) continue
    const s = canonicalGameSlugKey(p.gameSlug)
    if (s) slugs.add(s)
  }
  return [...slugs].sort((a, b) => a.localeCompare(b))
}

export async function getFeedPostById(postId: string): Promise<GameFeedPost | null> {
  if (!postId) return null
  const { posts } = await readFile()
  return posts.find((p) => p.id === postId) ?? null
}

/** Update rationale on an existing post (e.g. after “Share” on order-received). */
export async function updateFeedPostRationale(
  postId: string,
  userId: string,
  rationale: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!postId || !userId) return { ok: false, error: 'Invalid post or user' }
  return runFeedMutation(async () => {
    const file = await readFile()
    const i = file.posts.findIndex((p) => p.id === postId)
    if (i < 0) return { ok: false, error: 'Post not found' }
    if (file.posts[i]!.userId !== userId) return { ok: false, error: 'Not your post' }
    file.posts[i] = { ...file.posts[i]!, rationale: rationale.slice(0, 2000) }
    await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    return { ok: true }
  })
}
