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

/**
 * Load `game-feed.json` from disk — call ONLY inside `runFeedMutation`, or via `readFeedStore`
 * which queues behind the same mutex as writers.
 *
 * Important: reads that run *while another request is writing* can see truncated JSON.
 * Previously any parse failure fell through to “seed demo posts + write”, which **wiped the
 * real feed on disk** and made users’ games vanish from home (feed backs participation slugs).
 * We only auto-create the seed file when the file is missing (`ENOENT`). Other failures throw.
 */
async function readFeedFileUnlocked(): Promise<FeedFile> {
  try {
    const raw = await fs.readFile(FEED_PATH, 'utf8')
    const parsed = JSON.parse(raw) as FeedFile
    if (parsed && Array.isArray(parsed.posts)) return parsed
    throw new Error('game-feed.json: missing posts array')
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? (e as NodeJS.ErrnoException).code : ''
    if (code === 'ENOENT') {
      const initial: FeedFile = { posts: [...SEED_POSTS] }
      await fs.mkdir(path.dirname(FEED_PATH), { recursive: true })
      await fs.writeFile(FEED_PATH, JSON.stringify(initial, null, 2), 'utf8')
      return initial
    }
    throw e instanceof Error ? e : new Error('game-feed.json read failed')
  }
}

/** Public reads — must use the same queue as mutations so we never parse mid-write garbage. */
async function readFeedStore(): Promise<FeedFile> {
  return runFeedMutation(readFeedFileUnlocked)
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
  /** Sum of (shares × avgEntryPrice) for the FIFO lots unwound on a sell. Undefined for buys. */
  costBasis?: number
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

export async function listPostsForGame(gameSlug: string): Promise<GameFeedPost[]> {
  const want = canonicalGameSlugKey(gameSlug)
  if (!want) return []
  const { posts } = await readFeedStore()
  return posts
    .filter((p) => canonicalGameSlugKey(p.gameSlug) === want)
    .sort((a, b) => (a.timestampIso < b.timestampIso ? 1 : -1))
}

/** Remove every persisted feed row for a game (e.g. clearing the shared `new` slot on publish). */
export async function deleteAllFeedPostsForGame(gameSlug: string): Promise<number> {
  const want = canonicalGameSlugKey(gameSlug)
  if (!want) return 0
  return runFeedMutation(async () => {
    const file = await readFeedFileUnlocked()
    const before = file.posts.length
    file.posts = file.posts.filter((p) => canonicalGameSlugKey(p.gameSlug) !== want)
    const removed = before - file.posts.length
    if (removed > 0) {
      await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    }
    return removed
  })
}

/** Home / global activity — newest first. */
export async function listRecentActivityPosts(limit = 48): Promise<GameFeedPost[]> {
  const { posts } = await readFeedStore()
  return [...posts].sort((a, b) => (a.timestampIso < b.timestampIso ? 1 : -1)).slice(0, Math.max(1, limit))
}

export async function appendGameFeedPost(post: Omit<GameFeedPost, 'id'> & { id?: string }): Promise<GameFeedPost> {
  return runFeedMutation(async () => {
    const file = await readFeedFileUnlocked()
    const gameSlug = normalizeGameSlugParam(post.gameSlug)
    const full: GameFeedPost = {
      ...post,
      gameSlug,
      postKind: post.postKind ?? 'trade',
      id: post.id ?? randomUUID(),
    }
    file.posts.unshift(full)
    await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    queueMicrotask(() => {
      void import('./activityPostFanout')
        .then((m) => m.onNewFeedPost(full))
        .catch(() => {})
    })
    return full
  })
}

/** Game slugs where this user already has a persisted feed row (join/ledger sync can lag behind). */
export async function listGameSlugsWhereUserHasFeedPosts(userId: string): Promise<string[]> {
  if (!userId || userId.length < 8) return []
  const want = normalizeUserId(userId.trim()) ?? userId.trim()
  const { posts } = await readFeedStore()
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

/** Point all feed rows at `fromSlug` to `toSlug` (archive before wiping the shared `new` slot). */
export async function renameGameSlugInFeedPosts(fromSlug: string, toSlug: string): Promise<number> {
  const wantFrom = canonicalGameSlugKey(fromSlug)
  const wantTo = canonicalGameSlugKey(toSlug)
  if (!wantFrom || !wantTo || wantFrom === wantTo) return 0
  return runFeedMutation(async () => {
    const file = await readFeedFileUnlocked()
    let n = 0
    for (let i = 0; i < file.posts.length; i++) {
      const row = file.posts[i]!
      if (canonicalGameSlugKey(row.gameSlug) !== wantFrom) continue
      file.posts[i] = { ...row, gameSlug: toSlug }
      n += 1
    }
    if (n > 0) {
      await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    }
    return n
  })
}

/** Rewrite feed author ids after login/signup so activity stays under the canonical account. */
export async function mergeFeedPostsViewerId(fromUserId: string, toUserId: string): Promise<number> {
  if (!fromUserId || !toUserId || fromUserId.length < 8 || toUserId.length < 8 || fromUserId === toUserId) return 0
  return runFeedMutation(async () => {
    const file = await readFeedFileUnlocked()
    let n = 0
    for (let i = 0; i < file.posts.length; i++) {
      const row = file.posts[i]!
      if (!feedAuthorMatches(row.userId, fromUserId)) continue
      file.posts[i] = { ...row, userId: toUserId }
      n++
    }
    if (n > 0) {
      await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    }
    return n
  })
}

/**
 * `userId:::canonicalSlug` for every feed author row — used at startup so
 * membership reconcile does not drop join rows for players who posted or
 * traded visibility before acquiring a setup-profile key.
 */
export async function allFeedAuthorMembershipKeys(): Promise<Set<string>> {
  const { posts } = await readFeedStore()
  const out = new Set<string>()
  for (const p of posts) {
    const raw = typeof p.userId === 'string' ? p.userId.trim() : ''
    if (raw.length < 8) continue
    const uid = normalizeUserId(raw) ?? raw
    const rawSlug = typeof p.gameSlug === 'string' ? p.gameSlug.trim() : ''
    const canon = canonicalGameSlugKey(p.gameSlug)
    for (const s of new Set([rawSlug, canon].filter((x): x is string => Boolean(x)))) {
      out.add(`${uid}:::${s}`)
    }
  }
  return out
}

export async function getFeedPostById(postId: string): Promise<GameFeedPost | null> {
  if (!postId) return null
  const { posts } = await readFeedStore()
  return posts.find((p) => p.id === postId) ?? null
}

function feedAuthorMatches(rowUserId: string, actorId: string): boolean {
  const a = rowUserId.trim()
  const b = actorId.trim()
  if (a === b) return true
  const na = normalizeUserId(a)
  const nb = normalizeUserId(b)
  return Boolean(na && nb && na === nb)
}

/** Remove every feed post by a single user inside one game (used when they leave / are kicked). */
export async function deleteFeedPostsByUserInGame(userId: string, gameSlug: string): Promise<number> {
  if (!userId || !gameSlug) return 0
  const want = canonicalGameSlugKey(gameSlug)
  if (!want) return 0
  const wantUidNorm = normalizeUserId(userId.trim())
  return runFeedMutation(async () => {
    const file = await readFeedFileUnlocked()
    const before = file.posts.length
    file.posts = file.posts.filter((p) => {
      const slugMatch = canonicalGameSlugKey(p.gameSlug) === want
      const uid = typeof p.userId === 'string' ? p.userId.trim() : ''
      const uidNorm = normalizeUserId(uid)
      const userMatch = (wantUidNorm && uidNorm === wantUidNorm) || uid === userId.trim()
      return !(slugMatch && userMatch)
    })
    const removed = before - file.posts.length
    if (removed > 0) {
      await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    }
    return removed
  })
}

/** Update rationale on an existing post (e.g. after “Share” on order-received). */
export async function updateFeedPostRationale(
  postId: string,
  userId: string,
  rationale: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!postId || !userId) return { ok: false, error: 'Invalid post or user' }
  return runFeedMutation(async () => {
    const file = await readFeedFileUnlocked()
    const i = file.posts.findIndex((p) => p.id === postId)
    if (i < 0) return { ok: false, error: 'Post not found' }
    if (!feedAuthorMatches(file.posts[i]!.userId, userId)) return { ok: false, error: 'Not your post' }
    file.posts[i] = { ...file.posts[i]!, rationale: rationale.slice(0, 2000) }
    await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    return { ok: true }
  })
}

/** Update caption / rich text on the viewer's own text-style post (keeps image URL). */
export async function updateFeedPostRichBody(
  postId: string,
  userId: string,
  segments: RichTextSegment[],
  rationale: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!postId || !userId) return { ok: false, error: 'Invalid post or user' }
  const rationaleTrim = rationale.trim().slice(0, 2000)
  return runFeedMutation(async () => {
    const file = await readFeedFileUnlocked()
    const i = file.posts.findIndex((p) => p.id === postId)
    if (i < 0) return { ok: false, error: 'Post not found' }
    const row = file.posts[i]!
    if (!feedAuthorMatches(row.userId, userId)) return { ok: false, error: 'Not your post' }
    const kind = row.postKind ?? 'trade'
    if (kind !== 'text') return { ok: false, error: 'Only text posts can be edited here' }
    file.posts[i] = {
      ...row,
      richSegments: segments,
      rationale: rationaleTrim.length > 0 ? rationaleTrim : ' ',
    }
    await fs.writeFile(FEED_PATH, JSON.stringify(file, null, 2), 'utf8')
    return { ok: true }
  })
}
