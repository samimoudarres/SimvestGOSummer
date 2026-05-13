import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })
import cors from 'cors'
import { gameHostLine, gameTitle, slugToVariant } from '../src/challenge/gameMeta'
import { emptyPerformDashboard } from '../src/perform/performDummy'
import { sendBrandingIcon } from './branding'
import { massiveGet, MassiveApiError } from './massiveClient'
import {
  getFollowTickers,
  isFollowing,
  normalizeUserId,
  setFollowing,
} from './followsService'
import {
  getComposerContextForUser,
  resolvePostingGameSlugForUser,
} from './activityComposerService'
import { createActivityPost, type CreateActivityPostInput } from './activityPostService'
import { castPollVote, getPollTallies } from './feedPollVotesService'
import { hydrateGameFeedPosts } from './gameFeedHydration'
import {
  appendGameFeedPost,
  getFeedPostById,
  listPostsForGame,
  listRecentActivityPosts,
  updateFeedPostRationale,
} from './gameFeedService'
import { fetchHydratedHomeActivityForUser } from './homeActivityFeed'
import {
  fetchGameLeaderboardPayload,
  parseLeaderboardSort,
} from './gameLeaderboardService'
import { getGameDefinitionBySlug } from './gameDefinitionsStore'
import { canonicalGameSlugKey, normalizeGameSlugParam } from './gameSlugNormalize'
import { getGameChromeCssVarsForSlug, getHomeCardThemeForSlug } from './gameChromeService'
import {
  fetchPortfolioPayload,
  getPerformDashboard,
  saveHoldingsForGame,
} from './portfolioService'
import { deriveLegacyUserId, ensureUserProfilesBatch, upsertProfileFromTradeContext } from './userProfileService'
import { ensureGameJoinedAt, listGameSlugsJoinedByUser, listUserIdsJoinedGame } from './gameMembershipService'
import { buildJoinWelcomeDto } from './joinWelcomeService'
import {
  approveJoinRequest,
  countPendingForGame,
  createJoinRequestIfNeeded,
  listPendingJoinRequestsForHost,
  rejectJoinRequest,
} from './gameJoinRequestsService'
import {
  getRuntimeRules,
  upsertRuntimeRules,
  validateCreateSettingsInput,
  ensureJoinCodeOnRuntimeIfMissing,
} from './gameRuntimeRulesService'
import { validateBuyAgainstGameRules } from './gameTradeRulesService'
import { fetchPlayerGameProfile } from './profilePerformService'
import {
  buildPerformCompareChart,
  buildPlayerNetWorthChart,
  fetchPerformCompareCandidates,
  parsePerformChartRange,
} from './performCompareService'
import { applyTradeToUserLedger } from './userGameStateService'
import {
  getSetupProfileForUserGame,
  loadAllSetupProfilesByKey,
  saveSetupProfile,
  validateSetupProfileInput,
} from './userSetupProfileService'
import { fetchTradeBrowse, fetchTradeRecentRows, fetchTradeSearch, isTradeCategory } from './tradeService'
import {
  fetchStockBars,
  fetchStockBars1DayOrLastTwoSessions,
  fetchStockDetail,
  normalizeCryptoCompositeTicker,
  normalizeTicker,
  resolveMassiveTicker,
  type ChartRange,
} from './stockService'

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

function userIdFromHeader(req: express.Request): string | null {
  const raw = req.headers['x-simvest-user-id']
  const v = Array.isArray(raw) ? raw[0] : raw
  return normalizeUserId(typeof v === 'string' ? v : undefined)
}

function firstQueryString(req: express.Request, key: string): string | undefined {
  const v = req.query[key]
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    const s = v.find((x): x is string => typeof x === 'string')
    return s
  }
  return undefined
}

function userIdFromQuery(req: express.Request): string | null {
  const raw = firstQueryString(req, 'uid')?.trim() ?? ''
  return normalizeUserId(raw || undefined)
}

/** Last resort if `req.query` omits `uid` but the raw URL still contains it (some proxies / parsers). */
function userIdFromRawUrl(req: express.Request): string | null {
  const raw = typeof req.originalUrl === 'string' ? req.originalUrl : ''
  const m = /[?&]uid=([^&]+)/.exec(raw)
  if (!m?.[1]) return null
  try {
    return normalizeUserId(decodeURIComponent(m[1]))
  } catch {
    return null
  }
}

/** Prefer explicit ?uid= — client sets it on games APIs; fixes proxies stripping or rewriting X-Simvest-User-Id */
function userIdFromReq(req: express.Request): string | null {
  const h = userIdFromHeader(req)
  const q = userIdFromQuery(req)
  const fromRaw = userIdFromRawUrl(req)
  return q ?? h ?? fromRaw
}

function bodyToActivityInput(b: Record<string, unknown>): CreateActivityPostInput {
  const legacy =
    typeof b.text === 'string' &&
    typeof b.kind !== 'string' &&
    !b.poll &&
    !b.segments &&
    !b.imageUrl
  if (legacy) {
    return { kind: 'text', plainText: String(b.text) }
  }
  const hasImage = typeof b.imageUrl === 'string' && b.imageUrl.trim().length > 0
  const kindRaw = String(b.kind ?? 'text').toLowerCase()
  const kind: 'text' | 'image' | 'poll' =
    b.kind === 'poll' || b.poll
      ? 'poll'
      : hasImage || kindRaw === 'image'
        ? 'image'
        : 'text'
  if (kind === 'poll') {
    const poll = b.poll && typeof b.poll === 'object' ? (b.poll as Record<string, unknown>) : {}
    return {
      kind: 'poll',
      poll: {
        question: typeof poll.question === 'string' ? poll.question : '',
        options: Array.isArray(poll.options) ? (poll.options as unknown[]).map((x) => String(x)) : [],
      },
    }
  }
  return {
    kind,
    segments: b.segments,
    plainText:
      typeof b.plainText === 'string'
        ? b.plainText
        : typeof b.caption === 'string'
          ? b.caption
          : typeof b.text === 'string'
            ? b.text
            : '',
    imageUrl: typeof b.imageUrl === 'string' ? b.imageUrl : undefined,
  }
}

function gameSlugParam(req: express.Request, res: express.Response): string | null {
  const raw = String(req.params.slug ?? '')
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const slug = normalizeGameSlugParam(decoded)
  if (!slug) {
    res.status(404).json({ error: 'Unknown game' })
    return null
  }
  return slug
}

async function postMeActivityHandler(req: express.Request, res: express.Response): Promise<void> {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  const b = req.body as Record<string, unknown>
  try {
    const hint =
      typeof b.gameSlug === 'string' && b.gameSlug.trim().length > 0
        ? normalizeGameSlugParam(b.gameSlug.trim())
        : ''
    if (hint) await ensureGameJoinedAt(uid, hint)
    const slug = await resolvePostingGameSlugForUser(uid, hint || undefined)
    if (!slug) {
      res.status(400).json({
        error: 'Open a game to post, or pick which challenge this belongs to.',
      })
      return
    }
    await ensureGameJoinedAt(uid, slug)
    const ctx = await getComposerContextForUser(uid, slug)
    if (!ctx) {
      res.status(500).json({ error: 'Could not load composer profile' })
      return
    }
    const input = bodyToActivityInput(b)
    const result = await createActivityPost(uid, slug, ctx.displayName, ctx.avatarUrl, input)
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: result.error })
      return
    }
    res.json({ ok: true, postId: result.post.id })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Activity post failed',
    })
  }
}

function formatEtTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'simvest-api' })
})

/** Resolve a six-digit join code to the welcome payload (player count is live from membership). */
app.get('/api/join/welcome', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : ''
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const payload = await buildJoinWelcomeDto(code)
    if (!payload) {
      res.status(404).json({ error: 'Unknown game code' })
      return
    }
    res.json(payload)
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Join welcome failed',
    })
  }
})

app.get('/api/games/:slug/profile/setup', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  try {
    const setup = await getSetupProfileForUserGame(uid, slug)
    if (!setup) {
      res.json({ setup: null })
      return
    }
    res.json({
      setup: {
        userId: setup.userId,
        gameSlug: setup.gameSlug,
        firstName: setup.firstName,
        lastName: setup.lastName,
        username: setup.username,
        phone: setup.phone,
        email: setup.email,
        avatarUrl: setup.avatarUrl,
        updatedAtIso: setup.updatedAtIso,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Setup profile fetch failed' })
  }
})

app.post('/api/games/:slug/profile/setup', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const b = req.body as {
    firstName?: string
    lastName?: string
    username?: string
    phone?: string | null
    email?: string | null
    password?: string
    avatarUrl?: string
  }
  const input = {
    userId: uid,
    gameSlug: slug,
    firstName: typeof b.firstName === 'string' ? b.firstName : '',
    lastName: typeof b.lastName === 'string' ? b.lastName : '',
    username: typeof b.username === 'string' ? b.username : '',
    phone: typeof b.phone === 'string' ? b.phone : null,
    email: typeof b.email === 'string' ? b.email : null,
    password: typeof b.password === 'string' ? b.password : '',
    avatarUrl: typeof b.avatarUrl === 'string' ? b.avatarUrl : '',
  }
  const errors = validateSetupProfileInput(input)
  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation failed', errors })
    return
  }
  try {
    const setup = await saveSetupProfile(input)
    await upsertProfileFromTradeContext(uid, {
      displayName: `${setup.firstName} ${setup.lastName}`.trim(),
      avatarUrl: setup.avatarUrl,
    })
    const rules = await getRuntimeRules(slug)
    const isPrivate = rules?.visibility === 'private'
    const isHost = Boolean(rules?.hostUserId && rules.hostUserId === uid)

    if (isPrivate && !isHost) {
      await createJoinRequestIfNeeded({
        gameSlug: slug,
        userId: uid,
        displayName: `${setup.firstName} ${setup.lastName}`.trim(),
      })
      res.json({
        ok: true,
        pendingApproval: true,
        profile: {
          userId: uid,
          gameSlug: slug,
          displayName: `${setup.firstName} ${setup.lastName}`.trim(),
          username: setup.username,
          avatarUrl: setup.avatarUrl,
        },
      })
      return
    }

    await ensureGameJoinedAt(uid, slug)
    res.json({
      ok: true,
      pendingApproval: false,
      profile: {
        userId: uid,
        gameSlug: slug,
        displayName: `${setup.firstName} ${setup.lastName}`.trim(),
        username: setup.username,
        avatarUrl: setup.avatarUrl,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Profile setup save failed' })
  }
})

app.get('/api/games/:slug/game-chrome', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const cssVars = await getGameChromeCssVarsForSlug(slug)
    res.json({ cssVars })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Chrome failed' })
  }
})

app.get('/api/games/:slug/create-settings', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const rules = await getRuntimeRules(slug)
    if (!rules) {
      res.json({
        settings: null,
        isHost: false,
        pendingJoinCount: 0,
      })
      return
    }
    const isHost = rules.hostUserId === uid
    const pendingJoinCount = isHost ? await countPendingForGame(slug) : 0
    res.json({
      settings: rules,
      isHost,
      pendingJoinCount,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not load create settings' })
  }
})

app.put('/api/games/:slug/create-settings', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const parsed = validateCreateSettingsInput(req.body as Record<string, unknown>)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  try {
    const prev = await getRuntimeRules(slug)
    if (prev && prev.hostUserId && prev.hostUserId !== uid) {
      res.status(403).json({ error: 'Only the game host can change these settings.' })
      return
    }
    const saved = await upsertRuntimeRules(slug, parsed.value, uid)
    res.json({ ok: true, settings: saved })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Save failed'
    res.status(400).json({ error: msg })
  }
})

app.get('/api/games/:slug/join-requests', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const list = await listPendingJoinRequestsForHost(slug, uid)
    res.json({ requests: list })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List failed' })
  }
})

app.post('/api/games/:slug/join-requests/:requestId/approve', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const requestId = decodeURIComponent(String(req.params.requestId ?? ''))
  const r = await approveJoinRequest(requestId, uid)
  if (!r.ok) {
    res.status(r.error.includes('not found') ? 404 : 403).json({ error: r.error })
    return
  }
  res.json({ ok: true })
})

app.post('/api/games/:slug/join-requests/:requestId/reject', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const requestId = decodeURIComponent(String(req.params.requestId ?? ''))
  const r = await rejectJoinRequest(requestId, uid)
  if (!r.ok) {
    res.status(r.error.includes('not found') ? 404 : 403).json({ error: r.error })
    return
  }
  res.json({ ok: true })
})

/** Client sends stable id from localStorage (`X-Simvest-User-Id`) to scope follows per device/user. */
app.get('/api/me/games', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const slugs = await listGameSlugsJoinedByUser(uid)
    const games: {
      slug: string
      title: string
      subtitle: string
      cardTheme: Awaited<ReturnType<typeof getHomeCardThemeForSlug>>
    }[] = []
    for (const slug of slugs) {
      const rules = await getRuntimeRules(slug)
      const def = await getGameDefinitionBySlug(slug)
      const variant = slugToVariant(slug)
      const title =
        (rules?.gameDisplayName && rules.gameDisplayName.trim()) ||
        (def?.displayTitle && def.displayTitle.trim()) ||
        (slug === 'nov-2024-stock-challenge'
          ? gameTitle('nov2024')
          : slug === 'new'
            ? gameTitle('template')
            : slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
      const subtitle =
        (rules?.hostDisplayName && rules.hostDisplayName.trim()
          ? `Hosted by ${rules.hostDisplayName.trim()}`
          : null) ||
        (def?.welcomeTagline && def.welcomeTagline.trim()) ||
        (slug === 'nov-2024-stock-challenge' || slug === 'new' ? gameHostLine(variant) : 'Tap to open')
      const cardTheme = await getHomeCardThemeForSlug(slug)
      games.push({ slug, title, subtitle, cardTheme })
    }
    res.json({ games })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'My games failed',
    })
  }
})

app.get('/api/me/following', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  try {
    const tickers = await getFollowTickers(uid)
    res.json({ tickers })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Follow list failed' })
  }
})

app.get('/api/me/following/:ticker', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  const t = resolveMassiveTicker(decodeURIComponent(String(req.params.ticker ?? '')))
  if (!t) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }
  try {
    const following = await isFollowing(uid, t)
    res.json({ following })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Follow status failed' })
  }
})

app.put('/api/me/following/:ticker', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  const t = resolveMassiveTicker(decodeURIComponent(String(req.params.ticker ?? '')))
  const following = Boolean((req.body as { following?: boolean })?.following)
  if (!t) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }
  try {
    const result = await setFollowing(uid, t, following)
    if (!result.ok) {
      res.status(400).json({ error: 'Invalid ticker' })
      return
    }
    res.json({ following: result.following })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Follow update failed' })
  }
})

app.get('/api/me/activity/feed', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const posts = await fetchHydratedHomeActivityForUser(uid)
    res.json({ posts })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Home activity failed',
    })
  }
})

app.get('/api/me/composer-context', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const hint = typeof req.query.gameSlug === 'string' ? req.query.gameSlug : undefined
    const ctx = await getComposerContextForUser(uid, hint)
    if (!ctx) {
      res.status(404).json({
        error: 'No active game yet — join or create a challenge first.',
      })
      return
    }
    res.json(ctx)
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Composer context failed',
    })
  }
})

app.post('/api/me/activity/post', postMeActivityHandler)
app.post('/api/me/activity/text-post', postMeActivityHandler)

app.get('/api/activity/posts', async (_req, res) => {
  try {
    const rows = await hydrateGameFeedPosts(await listRecentActivityPosts(48))
    res.json({
      posts: rows,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Activity failed' })
  }
})

/** Join code + title for invite QR / share links (definitions + published runtime games). */
app.get('/api/games/:slug/invite', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  res.setHeader('Cache-Control', 'public, max-age=30')
  try {
    const def = await getGameDefinitionBySlug(slug)
    if (def) {
      res.json({
        slug: def.slug,
        joinCode: def.joinCode,
        displayTitle: def.displayTitle,
      })
      return
    }
    const rt = await getRuntimeRules(slug)
    if (rt?.setupComplete) {
      const withCode = rt.joinCode && /^\d{6}$/.test(rt.joinCode) ? rt : await ensureJoinCodeOnRuntimeIfMissing(slug)
      if (withCode?.joinCode && /^\d{6}$/.test(withCode.joinCode)) {
        res.json({
          slug,
          joinCode: withCode.joinCode,
          displayTitle: withCode.gameDisplayName.trim() || slug,
        })
        return
      }
    }
    res.status(404).json({ error: 'Unknown game' })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Invite lookup failed',
    })
  }
})

app.get('/api/games/:slug/members-preview', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  res.setHeader('Cache-Control', 'private, max-age=15')
  try {
    const ids = await listUserIdsJoinedGame(slug)
    const total = ids.length
    const slice = ids.slice(0, 8)
    const profileMap = await ensureUserProfilesBatch(slice)
    const setups = await loadAllSetupProfilesByKey()
    const members = slice.map((userId) => {
      const setup = setups.get(`${userId}:::${slug}`)
      const prof = profileMap.get(userId)
      const displayName = setup
        ? `${setup.firstName} ${setup.lastName}`.trim()
        : (prof?.displayName ?? 'Player')
      const avatarUrl = setup?.avatarUrl ?? prof?.avatarUrl ?? ''
      return { userId, displayName, avatarUrl }
    })
    res.json({ totalPlayers: total, members })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Members preview failed',
    })
  }
})

app.get('/api/games/:slug/feed', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const feedViewer = userIdFromReq(req)
  if (feedViewer) await ensureGameJoinedAt(feedViewer, slug)
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const feedPosts = await listPostsForGame(slug)
    const rows = await hydrateGameFeedPosts(feedPosts, { viewerUserId: feedViewer })
    res.json({ posts: rows })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Feed failed' })
  }
})

app.post('/api/games/:slug/feed/posts/:postId/poll/vote', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const postId = decodeURIComponent(String(req.params.postId ?? ''))
  const optionId =
    typeof (req.body as { optionId?: string })?.optionId === 'string'
      ? (req.body as { optionId: string }).optionId.trim()
      : ''
  if (!postId || !optionId) {
    res.status(400).json({ error: 'Missing poll or option' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const post = await getFeedPostById(postId)
    if (!post || canonicalGameSlugKey(post.gameSlug) !== canonicalGameSlugKey(slug) || post.postKind !== 'poll' || !post.pollOptions?.length) {
      res.status(404).json({ error: 'Poll not found' })
      return
    }
    const valid = new Set(post.pollOptions.map((o) => o.id))
    const r = await castPollVote(postId, uid, optionId, valid)
    if (!r.ok) {
      const msg = 'error' in r ? r.error : 'Vote failed'
      res.status(msg.includes('already') ? 409 : 400).json({ error: msg })
      return
    }
    const tallies = await getPollTallies(
      postId,
      post.pollOptions.map((o) => o.id),
    )
    res.json({ ok: true, myVote: optionId, tallies })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Vote failed',
    })
  }
})

app.post('/api/games/:slug/trades/complete', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const b = req.body as {
    clientUserId?: string
    ticker?: string
    displayTicker?: string
    action?: string
    quantityMode?: string
    shares?: number
    fillPrice?: number
    orderTotal?: number
    changePctLabel?: string
    marketCapLabel?: string
    revenueLabel?: string
    rationale?: string
    authorName?: string
    authorAvatar?: string
  }

  const headerUid = userIdFromHeader(req)
  const queryUid = userIdFromQuery(req)
  const bodyUid = normalizeUserId(
    typeof b.clientUserId === 'string' && b.clientUserId.trim().length > 0
      ? b.clientUserId.trim()
      : undefined,
  )

  if (headerUid && bodyUid && headerUid !== bodyUid) {
    res.status(401).json({ error: 'Viewer id mismatch' })
    return
  }
  const uid = headerUid ?? queryUid ?? bodyUid
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (header X-Simvest-User-Id or body clientUserId)',
    })
    return
  }

  const rawT = String(b.ticker ?? '')
  const t = normalizeCryptoCompositeTicker(rawT) ?? normalizeTicker(rawT)
  if (!t) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }
  const action = b.action === 'sell' ? 'sell' : 'buy'
  const shares = Number(b.shares)
  const fillPrice = Number(b.fillPrice)
  const orderTotal = Number(b.orderTotal)
  if (!Number.isFinite(shares) || shares <= 0) {
    res.status(400).json({ error: 'Invalid shares' })
    return
  }
  if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
    res.status(400).json({ error: 'Invalid fill price' })
    return
  }
  if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
    res.status(400).json({ error: 'Invalid order total' })
    return
  }

  if (action === 'buy') {
    const ruleErr = await validateBuyAgainstGameRules(slug, rawT)
    if (ruleErr) {
      res.status(400).json({ error: ruleErr })
      return
    }
  }

  const nowIso = new Date().toISOString()
  const led = await applyTradeToUserLedger({
    userId: uid,
    gameSlug: slug,
    ticker: t,
    side: action,
    shares,
    fillPrice,
    orderTotal,
    boughtAtIso: nowIso,
  })
  if (!led.ok) {
    res.status(400).json({ error: led.error })
    return
  }

  await ensureGameJoinedAt(uid, slug)

  const symLabel = String(b.displayTicker ?? t).toUpperCase()
  const tradeTitle = action === 'buy' ? `I'm buying ${symLabel}` : `I'm selling ${symLabel}`
  const rationale = typeof b.rationale === 'string' ? b.rationale.trim().slice(0, 2000) : ''
  await upsertProfileFromTradeContext(uid, {
    displayName: (typeof b.authorName === 'string' && b.authorName.trim()) || undefined,
    avatarUrl:
      typeof b.authorAvatar === 'string' && b.authorAvatar.startsWith('/')
        ? b.authorAvatar
        : typeof b.authorAvatar === 'string' && b.authorAvatar.startsWith('http')
          ? b.authorAvatar
          : undefined,
  })
  const liveProfile = await fetchPlayerGameProfile(slug, uid)

  const post = await appendGameFeedPost({
    postKind: 'trade',
    userId: uid,
    gameSlug: slug,
    author: liveProfile?.profile.displayName ?? 'You',
    avatar: liveProfile?.profile.avatarUrl ?? '/figma-assets/challenge/composer-avatar.png',
    timestampIso: nowIso,
    tradeTitle,
    tickerSymbol: symLabel,
    tickerImage: `/api/stocks/${encodeURIComponent(t)}/branding-icon`,
    changePct: typeof b.changePctLabel === 'string' && b.changePctLabel.trim() ? b.changePctLabel.trim() : '—',
    sharesBought: shares.toLocaleString('en-US', { maximumFractionDigits: 6 }),
    orderTotal: `$${orderTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    marketCap: typeof b.marketCapLabel === 'string' && b.marketCapLabel.trim() ? b.marketCapLabel.trim() : '—',
    revenue: typeof b.revenueLabel === 'string' && b.revenueLabel.trim() ? b.revenueLabel.trim() : '—',
    rationale,
    purchasePrice: fillPrice,
    side: action,
  })

  res.json({ ok: true, postId: post.id })
})

/** Optional: add rationale to the activity post created when the trade was placed. */
app.patch('/api/games/:slug/feed/posts/:postId', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const postId = decodeURIComponent(String(req.params.postId ?? ''))
  const rationale =
    typeof (req.body as { rationale?: string })?.rationale === 'string'
      ? (req.body as { rationale: string }).rationale.trim().slice(0, 2000)
      : ''
  const result = await updateFeedPostRationale(postId, uid, rationale)
  if (!result.ok) {
    res.status(result.error === 'Post not found' ? 404 : 403).json({ error: result.error })
    return
  }
  res.json({ ok: true })
})

app.get('/api/games/:slug/users/:userId/profile', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const rawId = decodeURIComponent(String(req.params.userId ?? ''))
  try {
    const payload = await fetchPlayerGameProfile(slug, rawId)
    if (!payload) {
      res.status(404).json({ error: 'Could not build profile' })
      return
    }
    res.json(payload)
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Profile failed',
    })
  }
})

app.get('/api/games/:slug/users/:userId/net-worth-chart', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const rawId = decodeURIComponent(String(req.params.userId ?? ''))
  const userIdRaw = rawId.trim()
  const userId = /^[a-zA-Z0-9_.-]{8,128}$/.test(userIdRaw)
    ? userIdRaw
    : deriveLegacyUserId(userIdRaw)
  const range = parsePerformChartRange(firstQueryString(req, 'range')?.trim())
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (!userId || userId.length < 8) {
      res.status(400).json({ error: 'Invalid user id' })
      return
    }
    const payload = await buildPlayerNetWorthChart(slug, userId, range)
    if (!payload) {
      res.status(404).json({ error: 'Chart unavailable' })
      return
    }
    res.json(payload)
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Net worth chart failed',
    })
  }
})

app.get('/api/games/:slug/leaderboard', async (req, res) => {
  const slugResolved = gameSlugParam(req, res)
  if (!slugResolved) return
  const uid = userIdFromReq(req)
  if (uid) await ensureGameJoinedAt(uid, slugResolved)
  const sortParam =
    typeof req.query.sort === 'string' && req.query.sort.trim().length > 0
      ? req.query.sort
      : undefined
  const sort = parseLeaderboardSort(sortParam)
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const payload = await fetchGameLeaderboardPayload(slugResolved, sort)
    res.json(payload)
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Leaderboard failed',
    })
  }
})

app.get('/api/games/:slug/perform', async (req, res) => {
  const slugResolved = gameSlugParam(req, res)
  if (!slugResolved) return
  const uid = userIdFromReq(req)
  if (uid) await ensureGameJoinedAt(uid, slugResolved)
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    res.json(await getPerformDashboard(slugResolved, uid))
  } catch {
    res.json(emptyPerformDashboard(slugResolved))
  }
})

app.get('/api/games/:slug/perform/compare/candidates', async (req, res) => {
  const slugResolved = gameSlugParam(req, res)
  if (!slugResolved) return
  const uid = userIdFromReq(req)
  if (uid) await ensureGameJoinedAt(uid, slugResolved)
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    res.json(await fetchPerformCompareCandidates(slugResolved, uid))
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Compare candidates failed',
    })
  }
})

app.get('/api/games/:slug/perform/compare', async (req, res) => {
  const slugResolved = gameSlugParam(req, res)
  if (!slugResolved) return
  const uid = userIdFromReq(req)
  if (uid) await ensureGameJoinedAt(uid, slugResolved)
  res.setHeader('Cache-Control', 'private, no-store')
  const range = parsePerformChartRange(firstQueryString(req, 'range')?.trim())
  const withRaw = firstQueryString(req, 'with') ?? ''
  try {
    res.json(await buildPerformCompareChart(slugResolved, uid, range, withRaw))
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Compare chart failed',
    })
  }
})

app.get('/api/games/:slug/portfolio', async (req, res) => {
  const slugResolved = gameSlugParam(req, res)
  if (!slugResolved) return
  const uid = userIdFromReq(req)
  if (uid) await ensureGameJoinedAt(uid, slugResolved)
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const payload = await fetchPortfolioPayload(slugResolved, uid)
    res.json(payload)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Portfolio failed' })
  }
})

app.get('/api/games/:slug/trade/browse', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  const raw = String(req.query.category ?? 'popular').toLowerCase()
  const category = isTradeCategory(raw) ? raw : 'popular'
  try {
    const payload = await fetchTradeBrowse(category)
    res.json(payload)
  } catch (err) {
    if (err instanceof MassiveApiError) {
      res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: err.message,
      })
      return
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Trade browse failed' })
  }
})

/** Query `recents` = comma-separated tickers (each URI-encoded if needed). Query `q` = search text. */
app.get('/api/games/:slug/trade/search', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  void req.params.slug
  const recentsRaw = String(req.query.recents ?? '').trim()
  if (recentsRaw.length > 0) {
    const symbols = recentsRaw
      .split(',')
      .map((s) => {
        const t = s.trim()
        try {
          return decodeURIComponent(t)
        } catch {
          return t
        }
      })
      .filter(Boolean)
      .slice(0, 24)
    try {
      const rows = await fetchTradeRecentRows(symbols)
      res.json({ rows })
    } catch (err) {
      if (err instanceof MassiveApiError) {
        res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
          error: err.message,
        })
        return
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Recent rows failed' })
    }
    return
  }

  const q = String(req.query.q ?? '').trim()
  if (q.length < 1) {
    res.json({ rows: [] })
    return
  }
  try {
    const rows = await fetchTradeSearch(q)
    res.json({ rows })
  } catch (err) {
    if (err instanceof MassiveApiError) {
      res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: err.message,
      })
      return
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Trade search failed' })
  }
})

app.put('/api/games/:slug/portfolio/holdings', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const body = req.body as { holdings?: { ticker: string; shares: number; avgCost: number }[] }
  if (!Array.isArray(body?.holdings)) {
    res.status(400).json({ error: 'Expected JSON body { holdings: [{ ticker, shares, avgCost }] }' })
    return
  }
  const cleaned = body.holdings
    .map((h) => ({
      ticker: String(h.ticker ?? '').toUpperCase(),
      shares: Number(h.shares),
      avgCost: Number(h.avgCost),
    }))
    .filter((h) => normalizeTicker(h.ticker) && Number.isFinite(h.shares) && h.shares > 0 && Number.isFinite(h.avgCost))
  try {
    await saveHoldingsForGame(slug, cleaned)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Save failed' })
  }
})

const chartRanges: ChartRange[] = ['1D', '5D', '1M', '3M', '1Y', '5Y']

app.get('/api/stocks/:ticker/branding-icon', (req, res) => {
  void sendBrandingIcon(String(req.params.ticker ?? ''), res)
})

app.get('/api/stocks/:ticker', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  const t = resolveMassiveTicker(String(req.params.ticker ?? ''))
  if (!t) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }
  try {
    const detail = await fetchStockDetail(t)
    res.json(detail)
  } catch (err) {
    if (err instanceof MassiveApiError) {
      res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: err.message,
      })
      return
    }
    const msg = err instanceof Error ? err.message : 'Stock fetch failed'
    res.status(404).json({ error: msg })
  }
})

app.get('/api/stocks/:ticker/bars', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  const t = resolveMassiveTicker(String(req.params.ticker ?? ''))
  const range = String(req.query.range ?? '1Y').toUpperCase()
  const r = (range === '1D' ? '1D' : range === '5D' ? '5D' : range === '1M' ? '1M' : range === '3M' ? '3M' : range === '5Y' ? '5Y' : '1Y') as ChartRange
  if (!t || !chartRanges.includes(r)) {
    res.status(400).json({ error: 'Invalid ticker or range' })
    return
  }
  try {
    const bars =
      r === '1D' ? await fetchStockBars1DayOrLastTwoSessions(t) : await fetchStockBars(t, r)
    res.json({ ticker: t, range: r, bars })
  } catch (err) {
    if (err instanceof MassiveApiError) {
      res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: err.message,
      })
      return
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Bars fetch failed' })
  }
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`Simvest API listening on http://localhost:${port}`)
})
