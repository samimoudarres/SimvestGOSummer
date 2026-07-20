import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true })

function requireMassiveAtBoot(): boolean {
  return (
    process.env.NODE_ENV === 'production' || process.env.SIMVEST_REQUIRE_MASSIVE === '1'
  )
}

function isMassiveConfigured(): boolean {
  return Boolean(process.env.MASSIVE_API_KEY?.trim())
}

if (!isMassiveConfigured()) {
  if (requireMassiveAtBoot()) {
    console.error(
      '[simvest] Refusing to boot: production / SIMVEST_REQUIRE_MASSIVE=1 requires MASSIVE_API_KEY. Live stock prices, sparklines, and logos will not work. See .env.example.',
    )
    process.exit(1)
  }
  console.warn(
    '[simvest] MASSIVE_API_KEY is missing in .env — live stock prices, sparklines, and logos will not load. See .env.example.',
  )
}
import cors from 'cors'
import { gameHostLine, gameTitle, slugToVariant } from '../src/challenge/gameMeta'
import { sanitizeLoadScreenEmoji } from '../src/game/loadScreenEmoji.ts'
import { emptyPerformDashboard } from '../src/perform/performDummy'
import { ensureDataDirReady, getDataDir, dataFilePath } from './dataDir.ts'
import { isAdminConfigured, requireAdminAuth } from './adminAuth.ts'
import { buildAdminDashboard } from './adminDashboardService.ts'
import { sendBrandingIcon } from './branding'
import { isPrivacyPolicyReady, registerLegalPages } from './legalPages.ts'
import { registerAppLinksWellKnown } from './appLinksWellKnown.ts'
import { readMediaFile, compactImageUrlForApi } from './mediaDataUrlStore.ts'
import { readTtlCache, writeTtlCache, clearTtlCachePrefix } from './ttlCache.ts'
import {
  storageBackendLabel,
  hasSupabaseServiceRole,
  getDatabaseUrl,
} from './db/backend.ts'
import { pingDatabase } from './db/client.ts'
import { backfillNormalizedHotPathFromJsonDocs } from './db/normalizedHotPath.ts'
import { mutateDataJsonStore } from './db/persistedJson.ts'
import {
  createSession,
  invalidateAllSessionsForUser,
  invalidateSession,
  resolveSessionUserId,
} from './sessionService.ts'
import { fetchServerMarkPrice, resolveTradeFillPrice } from './tradeMarkPrice.ts'
import { getSupabaseAdmin } from './db/supabaseAdmin.ts'
import { massiveGet, MassiveApiError } from './massiveClient'
import {
  getAllFollowTickersForUser,
  getFollowTickersForGame,
  isFollowingForGame,
  normalizeUserId,
  setFollowingForGame,
} from './followsService'
import {
  getComposerContextForUser,
  resolvePostingGameSlugForUser,
} from './activityComposerService'
import {
  addAuthorNotifyPreference,
  listWatchedAuthorIdsForViewer,
  removeAuthorNotifyPreference,
} from './activityAuthorNotifyService'
import { createActivityPost, type CreateActivityPostInput } from './activityPostService'
import { plainFromRichSegments, parseActivityRichInput } from './activityRichInput'
import { castPollVote, getPollTallies } from './feedPollVotesService'
import { hydrateGameFeedPosts } from './gameFeedHydration'
import {
  appendGameFeedPost,
  getFeedPostById,
  listPostsForGame,
  listRecentActivityPosts,
  updateFeedPostRichBody,
  updateFeedPostRationale,
} from './gameFeedService'
import {
  addPostComment,
  hydratePostLikers,
  listHydratedComments,
  listPostLikeUserIds,
  toggleCommentLike,
  togglePostLike,
} from './feedPostSocialService'
import { fetchHydratedHomeActivityForUser } from './homeActivityFeed'
import {
  bumpFinishedGameHomeView,
  getFinishedGameHomeViewCount,
  shouldShowFinishedGameOnHome,
} from './finishedGameHomeViewsService'
import { listPublicCatalogItems } from './publicGamesCatalogService'
import { buildSuggestedGames } from './suggestedGamesService'
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
import {
  deriveLegacyUserId,
  ensureUserProfilesBatch,
  getUserPublicProfile,
  upsertProfileFromTradeContext,
} from './userProfileService'
import { savePushSubscriptionForViewer } from './pushSubscriptionService'
import { getVapidPublicKey, initVapidKeys } from './vapidKeysService'
import { saveNativePushTokenForViewer } from './nativePushTokenService'
import { isNativePushConfigured } from './fcmSendService'
import { pushNotifyPostCommented, pushNotifyPostLiked } from './socialPushHooks'
import { notifyHostMemberJoined, resolveHostUserId } from './notificationEvents'
import { startStockMoveAlertScanner } from './stockMoveAlertScanner'
import {
  ensureGameJoinedAt,
  getGameJoinedAtIso,
  reconcileMembershipFile,
} from './gameMembershipService'
import { listParticipantIdsForGame } from './gameParticipantIds'
import { buildJoinWelcomeDto } from './joinWelcomeService'
import { ensureGameAccess } from './gameAccessService'
import {
  changeGameDuration,
  endGameNow,
  listActiveGamePlayers,
  removeUserFromGame,
  resetGameScopedStoresForRepublish,
} from './gameLifecycleService'
import {
  archivePublishedNewSlotBeforeRepublish,
  prepareNewSlotForHostDraft,
} from './gameSlugMigrationService'
import {
  approveJoinRequest,
  countPendingForGame,
  createJoinRequestIfNeeded,
  listAllPendingJoinRequestsForHost,
  listPendingJoinRequestsForHost,
  rejectJoinRequest,
  viewerIdsMatch,
} from './gameJoinRequestsService'
import {
  getRuntimeRules,
  joinCodeFromHttpQuery,
  listAllRuntimeRules,
  normalizeSixDigitJoinCode,
  upsertRuntimeRules,
  validateCreateSettingsInput,
  ensureJoinCodeOnRuntimeIfMissing,
  buildFreshNewTemplateDraftForViewer,
  shouldResetStoresForNewSlugPublish,
} from './gameRuntimeRulesService'
import { resolveProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'
import {
  validateBuyAgainstGameRules,
  validateTradeTimingAgainstGameRules,
  validateGameOpenForFeedMutations,
} from './gameTradeRulesService'
import { fetchPlayerGameProfile } from './profilePerformService'
import {
  buildPerformCompareChart,
  buildPlayerNetWorthChart,
  fetchPerformCompareCandidates,
  parsePerformChartRange,
} from './performCompareService'
import { applyTradeToUserLedger, getTradeIdempotencyResponse, normalizeClientTradeId, rememberTradeIdempotencyResponse } from './userGameStateService'
import { listParticipationSlugsForUser } from './userParticipationSlugs'
import {
  GAME_SETUP_DEFAULT_AVATAR_URL,
  gameProfileAvatarUrl,
  gameProfileDisplayLabel,
  getSetupProfileForUserGame,
  loadAllSetupProfilesByKey,
  saveSetupProfile,
  validateSetupProfileInput,
} from './userSetupProfileService'
import { verifyLoginCredentials } from './authService'
import {
  createUserAccount,
  getAccountByUserId,
  toAccountPublicView,
  updateAccountContact,
  updateAccountPassword,
  updateAccountProfile,
  validateFullNameInput,
  type AccountContactKind,
} from './userAccountService'
import { deleteSimvestAccount } from './accountDeletionService'
import { consumeNameDraft, createNameDraft } from './signupDraftService'
import { mergeAnonymousViewerIntoAccount } from './viewerIdMergeService'
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

/** Comma-separated allowlist; Capacitor / same-origin / no-Origin requests still pass. */
function buildCorsOriginAllowlist(): Set<string> {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'capacitor://localhost',
    'ionic://localhost',
    'https://localhost',
    'http://localhost',
  ]
  const fromEnv = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return new Set([...defaults, ...fromEnv])
}

const corsAllowlist = buildCorsOriginAllowlist()

app.use(
  cors({
    origin(origin, cb) {
      /* Native WebViews and same-origin fetches often omit Origin. */
      if (!origin) {
        cb(null, true)
        return
      }
      if (corsAllowlist.has(origin)) {
        cb(null, true)
        return
      }
      /* Capacitor Android may send https://localhost or file:// variants. */
      if (
        origin.startsWith('capacitor://') ||
        origin.startsWith('ionic://') ||
        origin === 'null'
      ) {
        cb(null, true)
        return
      }
      cb(null, false)
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '22mb' }))

declare global {
  namespace Express {
    interface Request {
      /** Set by session middleware when Authorization Bearer was present. */
      simvestBearerPresent?: boolean
      /** Resolved user id from a valid Bearer session (null if bearer invalid). */
      simvestSessionUserId?: string | null
    }
  }
}

/**
 * Legacy `X-Simvest-User-Id` / `?uid=` is allowed only in non-production, or when
 * `ALLOW_LEGACY_USER_HEADER=1` (local scripts / emergency). Production requires Bearer.
 */
function allowLegacyUserHeader(): boolean {
  if (process.env.ALLOW_LEGACY_USER_HEADER === '1') return true
  return process.env.NODE_ENV !== 'production'
}

function extractBearerToken(req: express.Request): string | null {
  const raw = req.headers.authorization
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string') return null
  const m = /^Bearer\s+(\S+)/i.exec(v.trim())
  return m?.[1]?.trim() || null
}

/** Resolve Bearer → userId before route handlers (so `userIdFromReq` stays sync). */
app.use((req, _res, next) => {
  const token = extractBearerToken(req)
  if (!token) {
    next()
    return
  }
  req.simvestBearerPresent = true
  void resolveSessionUserId(token)
    .then((uid) => {
      req.simvestSessionUserId = uid
      next()
    })
    .catch((err) => {
      console.warn('[simvest] session resolve failed:', err instanceof Error ? err.message : err)
      req.simvestSessionUserId = null
      next()
    })
})

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

/**
 * Resolve viewer id: valid Bearer session wins (never trust a forged header when
 * a Bearer was sent). Without Bearer, legacy header/query only if allowed.
 */
function userIdFromReq(req: express.Request): string | null {
  if (req.simvestBearerPresent) {
    return normalizeUserId(req.simvestSessionUserId ?? undefined)
  }
  if (!allowLegacyUserHeader()) return null
  const h = userIdFromHeader(req)
  const q = userIdFromQuery(req)
  const fromRaw = userIdFromRawUrl(req)
  return h ?? q ?? fromRaw
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

async function resolveHostDisplayNameForGame(gameSlug: string, hostUserId: string | null): Promise<string> {
  if (!hostUserId) return ''
  const setup = await getSetupProfileForUserGame(hostUserId, gameSlug)
  const setupName = setup ? `${setup.firstName} ${setup.lastName}`.trim() : ''
  if (setupName) return setupName

  const profile = await getUserPublicProfile(hostUserId)
  const profileName = profile?.displayName?.trim() ?? ''
  return profileName === 'You' ? '' : profileName
}

async function requireGameAccessForResponse(
  res: express.Response,
  gameSlug: string,
  userId: string | null,
  opts: { autoJoinPublic?: boolean; autoJoinHost?: boolean } = {},
): Promise<boolean> {
  /* Default `autoJoinPublic` to `false`: simply reading a public game (a
   * leaderboard, a stock chart, a feed peek) must NEVER silently write a
   * membership row. The only paths that create membership are the explicit
   * join flow (`/api/games/:slug/profile/setup` -> `ensureGameJoinedAt`)
   * and host auto-join (host opens their own game). This keeps the
   * "Your Games" stack and home activity feed honest: a user only appears
   * in a game they actually joined.
   *
   * Host auto-join stays enabled so a host who finishes the create-game
   * wizard immediately becomes a member of their own game without an extra
   * step. */
  const access = await ensureGameAccess({
    gameSlug,
    userId,
    autoJoinPublic: opts.autoJoinPublic ?? false,
    autoJoinHost: opts.autoJoinHost ?? true,
  })
  if (access.ok) return true
  res.status(access.status).json({ error: access.error })
  return false
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
    if (hint && !(await requireGameAccessForResponse(res, hint, uid))) return
    const slug = await resolvePostingGameSlugForUser(uid, hint || undefined)
    if (!slug) {
      res.status(400).json({
        error: 'Open a game to post, or pick which challenge this belongs to.',
      })
      return
    }
    if (!(await requireGameAccessForResponse(res, slug, uid))) return
    const postClosed = await validateGameOpenForFeedMutations(slug)
    if (postClosed) {
      res.status(403).json({ error: postClosed })
      return
    }
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
    clearTtlCachePrefix(`feed:${slug}`)
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

registerLegalPages(app)
registerAppLinksWellKnown(app)

app.get('/api/media/:fileName', async (req, res) => {
  const fileName = typeof req.params.fileName === 'string' ? req.params.fileName : ''
  const hit = await readMediaFile(fileName)
  if (!hit) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.type(hit.contentType)
  res.send(hit.buf)
})

app.get('/api/health', async (_req, res) => {
  const backend = storageBackendLabel()
  const requireDb =
    process.env.NODE_ENV === 'production' || process.env.SIMVEST_REQUIRE_DB === '1'
  const requireMassive = requireMassiveAtBoot()
  const massiveConfigured = isMassiveConfigured()
  let dbOk = true
  if (backend === 'supabase') {
    if (getDatabaseUrl()) {
      dbOk = await pingDatabase()
    } else if (hasSupabaseServiceRole()) {
      const admin = getSupabaseAdmin()
      if (!admin) dbOk = false
      else {
        const { error } = await admin.from('json_documents').select('name').limit(1)
        dbOk = !error || error.code === 'PGRST116'
        /* empty table is ok; missing table surfaces as error */
        if (error && /relation|does not exist|schema cache/i.test(error.message)) dbOk = false
        else if (error && error.code !== 'PGRST116') {
          /* PGRST116 = no rows; other errors may still mean table exists */
          dbOk = error.code === '42P01' ? false : !/Could not find the table/i.test(error.message)
        }
      }
    } else {
      dbOk = false
    }
  } else if (requireDb) {
    dbOk = false
  }
  const storageOk = !requireDb || (backend === 'supabase' && dbOk)
  const massiveOk = !requireMassive || massiveConfigured
  const ok = storageOk && massiveOk
  res.status(ok ? 200 : 503).json({
    ok,
    service: 'simvest-api',
    dataDir: getDataDir(),
    persistentData: Boolean(process.env.SIMVEST_DATA_DIR?.trim()),
    legal: { privacyPolicy: isPrivacyPolicyReady() },
    massive: { configured: massiveConfigured, requireMassive, ok: massiveOk },
    storage: { backend, ok: dbOk, requireDb },
    auth: {
      legacyUserHeader: allowLegacyUserHeader(),
    },
  })
})

/** Admin dashboard — not linked from the player app. */
app.get('/api/admin/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ configured: isAdminConfigured() })
})

app.get('/api/admin/dashboard', requireAdminAuth, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    res.json(await buildAdminDashboard())
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Admin dashboard failed',
    })
  }
})

/** Resolve a six-digit join code to the welcome payload (player count is live from membership). */
app.get('/api/join/welcome', async (req, res) => {
  const code = joinCodeFromHttpQuery(req.query.code)
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const payload = await buildJoinWelcomeDto(code ?? '')
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

/* Per-IP / per-user rate limiting — keeps password probing and Massive proxy
 * abuse cheap to block but lets honest users retry without friction.
 *
 * Buckets persist in `auth-rate-limits.json` so multi-instance deploys share
 * limits (best-effort; still works in-process when DB is off).
 *
 *   - `login`: tighter (10/min). Brute-force resistance is the only goal.
 *   - `signup`: looser (40/min). Legit signup is a one-shot per user, so
 *     this is really just a guardrail against abusive scripts seeding huge
 *     volumes of fake accounts.
 *   - `accountWrite`: 20/min for password / profile mutations.
 *   - `trade`: 30/min per user (or IP) for trade completes.
 *   - `marketRead`: 120/min for stock quote / bars / browse / search GETs. */
type RateBucketName = 'login' | 'signup' | 'accountWrite' | 'trade' | 'marketRead'
type RateAttemptWindow = { windowStart: number; count: number }
type RateLimitsFile = {
  buckets: Record<RateBucketName, Record<string, RateAttemptWindow>>
}

const RATE_LIMITS_PATH = dataFilePath('auth-rate-limits.json')
const RATE_WINDOW_MS = 60_000
const RATE_MAX_PER_WINDOW: Record<RateBucketName, number> = {
  login: 10,
  signup: 40,
  accountWrite: 20,
  trade: 30,
  marketRead: 120,
}

function emptyRateLimits(): RateLimitsFile {
  return {
    buckets: { login: {}, signup: {}, accountWrite: {}, trade: {}, marketRead: {} },
  }
}

function requestIpKey(req: express.Request): string {
  const fwd = req.headers['x-forwarded-for']
  const fwdStr = Array.isArray(fwd) ? fwd[0] : fwd
  if (typeof fwdStr === 'string' && fwdStr.length > 0) return fwdStr.split(',')[0]!.trim()
  return req.ip || req.socket.remoteAddress || 'unknown'
}

/** Prefer authenticated user id; fall back to IP for anonymous / pre-auth clients. */
function rateLimitSubjectKey(req: express.Request): string {
  const uid = userIdFromReq(req)
  if (uid) return `u:${uid}`
  return `ip:${requestIpKey(req)}`
}

async function rateLimitHit(bucket: RateBucketName, ipKey: string): Promise<boolean> {
  /* marketRead is hit on every browse/search/bars poll — durable JSON RMW was write amplification. */
  if (bucket === 'marketRead') {
    return rateLimitHitMemory(bucket, ipKey)
  }
  const now = Date.now()
  let hit = false
  await mutateDataJsonStore(RATE_LIMITS_PATH, emptyRateLimits(), (cur) => {
    const buckets = cur.buckets ?? emptyRateLimits().buckets
    const map = { ...(buckets[bucket] ?? {}) }
    /* Prune stale IPs for this bucket. */
    for (const [ip, win] of Object.entries(map)) {
      if (now - win.windowStart > RATE_WINDOW_MS * 5) delete map[ip]
    }
    const existing = map[ipKey]
    if (!existing || now - existing.windowStart > RATE_WINDOW_MS) {
      map[ipKey] = { windowStart: now, count: 1 }
      hit = false
    } else {
      const nextCount = existing.count + 1
      map[ipKey] = { windowStart: existing.windowStart, count: nextCount }
      hit = nextCount > RATE_MAX_PER_WINDOW[bucket]
    }
    return { buckets: { ...buckets, [bucket]: map } }
  })
  return hit
}

/** In-process rate limit (single API instance). Used for high-frequency market reads. */
const marketReadMemoryWindows = new Map<string, RateAttemptWindow>()

function rateLimitHitMemory(bucket: 'marketRead', ipKey: string): boolean {
  const now = Date.now()
  const max = RATE_MAX_PER_WINDOW[bucket]
  if (marketReadMemoryWindows.size > 4000) {
    for (const [k, win] of marketReadMemoryWindows) {
      if (now - win.windowStart > RATE_WINDOW_MS * 5) marketReadMemoryWindows.delete(k)
    }
  }
  const existing = marketReadMemoryWindows.get(ipKey)
  if (!existing || now - existing.windowStart > RATE_WINDOW_MS) {
    marketReadMemoryWindows.set(ipKey, { windowStart: now, count: 1 })
    return false
  }
  const nextCount = existing.count + 1
  marketReadMemoryWindows.set(ipKey, { windowStart: existing.windowStart, count: nextCount })
  return nextCount > max
}

/** Backwards-compatible alias — `/api/auth/login` still calls this. */
async function loginRateLimitHit(ipKey: string): Promise<boolean> {
  return rateLimitHit('login', ipKey)
}

async function respondIfRateLimited(
  req: express.Request,
  res: express.Response,
  bucket: 'trade' | 'marketRead',
): Promise<boolean> {
  if (!(await rateLimitHit(bucket, rateLimitSubjectKey(req)))) return false
  const msg =
    bucket === 'trade'
      ? 'Too many trade requests. Please wait a minute and try again.'
      : 'Too many market data requests. Please wait a minute and try again.'
  res.status(429).json({ error: msg })
  return true
}

/**
 * Sign in to an existing Simvest account.
 *
 * Body: `{ usernameOrEmail: string; password: string }`
 *
 * Returns `{ user: { userId, username, displayName, avatarUrl } }` on success
 * so the client can swap its local `simvest-user-id-v1` to the real account
 * id immediately and the next `/api/me/*` call hydrates the user's data.
 *
 * On any miss — unknown identifier OR wrong password — we return a single
 * generic 401 error message so an attacker can't tell whether the username
 * exists. The matching `/api/auth/login` shape is intentional: this is the
 * only login surface; create-account remains the per-game join setup flow.
 */
app.post('/api/auth/login', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const ipKey = requestIpKey(req)
  if (await loginRateLimitHit(ipKey)) {
    res.status(429).json({ error: 'Too many login attempts. Please wait a minute and try again.' })
    return
  }

  const body = (req.body ?? {}) as {
    usernameOrEmail?: unknown
    password?: unknown
    previousViewerId?: unknown
  }
  const identifier = typeof body.usernameOrEmail === 'string' ? body.usernameOrEmail : ''
  const password = typeof body.password === 'string' ? body.password : ''

  try {
    const result = await verifyLoginCredentials(identifier, password)
    if (result.ok) {
      try {
        await mergeAnonymousViewerIntoAccount(body.previousViewerId, result.user.userId)
      } catch (err) {
        console.error('[viewerIdMerge] login merge failed:', err)
      }
      const session = await createSession(result.user.userId)
      res.json({
        token: session.token,
        sessionToken: session.token,
        expiresAt: session.expiresAtIso,
        user: {
          userId: result.user.userId,
          username: result.user.username,
          displayName: result.user.displayName,
          avatarUrl: result.user.avatarUrl,
        },
      })
      return
    }
    /* Collapse all soft-fail reasons to one user-visible message — never leak
     * whether the identifier exists. `missing-*` is still rendered the same
     * way to keep server responses uniform; the client form blocks empty
     * submits, so we only get here for actual mismatches. */
    res.status(401).json({ error: 'Username or password is incorrect' })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed' })
  }
})

/**
 * Begin a multi-step signup. Persists the user's full name on the server so
 * the client can post just `{ draftId, contact, password }` on step 2 without
 * having to round-trip the name back. Returns an opaque `draftId` + its
 * expiry. The draft is single-use and self-purges after 30 minutes.
 */
app.post('/api/auth/signup/start', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const ipKey = requestIpKey(req)
  if (await rateLimitHit('signup', ipKey)) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' })
    return
  }

  const body = (req.body ?? {}) as { firstName?: unknown; lastName?: unknown }
  const firstName = typeof body.firstName === 'string' ? body.firstName : ''
  const lastName = typeof body.lastName === 'string' ? body.lastName : ''

  const errors = validateFullNameInput(firstName, lastName)
  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation failed', errors })
    return
  }

  try {
    const draft = await createNameDraft(firstName, lastName)
    res.json({
      draftId: draft.draftId,
      expiresAt: new Date(draft.expiresAt).toISOString(),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Signup start failed' })
  }
})

/**
 * Finish signup. Consumes the draft (single-use), validates contact +
 * password, writes a new account row, and returns the canonical `userId` so
 * the client can immediately swap to it and call `/api/me/*` as the new user.
 *
 * - Password rule: ≥5 chars AND must contain at least one letter AND at least
 *   one digit. Enforced in `validateSignupCompleteInput`.
 * - Contact uniqueness is enforced per `contactKind`; duplicates 409 the
 *   request with a "try logging in" message.
 */
app.post('/api/auth/signup/complete', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const ipKey = requestIpKey(req)
  if (await rateLimitHit('signup', ipKey)) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' })
    return
  }

  const body = (req.body ?? {}) as {
    draftId?: unknown
    contactKind?: unknown
    contact?: unknown
    password?: unknown
    previousViewerId?: unknown
  }
  const draftId = typeof body.draftId === 'string' ? body.draftId : ''
  const contactKind =
    body.contactKind === 'email' || body.contactKind === 'phone'
      ? (body.contactKind as AccountContactKind)
      : null
  const contact = typeof body.contact === 'string' ? body.contact : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!contactKind) {
    res.status(400).json({
      error: 'Validation failed',
      errors: [{ field: 'contactKind', message: 'Pick email or phone' }],
    })
    return
  }

  const draft = await consumeNameDraft(draftId)
  if (!draft) {
    res.status(410).json({
      error:
        'Your signup session expired. Please go back to the start and enter your name again.',
    })
    return
  }

  try {
    const result = await createUserAccount({
      firstName: draft.firstName,
      lastName: draft.lastName,
      contactKind,
      contact,
      password,
    })
    if (!result.ok) {
      /* Conflict on duplicate contact, 400 otherwise. */
      const isDup = result.errors.some((e) =>
        /already exists/i.test(e.message),
      )
      res.status(isDup ? 409 : 400).json({ error: 'Validation failed', errors: result.errors })
      return
    }
    const account = result.account
    try {
      await mergeAnonymousViewerIntoAccount(body.previousViewerId, account.userId)
    } catch (err) {
      console.error('[viewerIdMerge] signup merge failed:', err)
    }
    const session = await createSession(account.userId)
    res.json({
      token: session.token,
      sessionToken: session.token,
      expiresAt: session.expiresAtIso,
      user: {
        userId: account.userId,
        username: account.contact,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        contactKind: account.contactKind,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Signup failed' })
  }
})

/**
 * Invalidate the current Bearer session (logout). Always 200 when body/token
 * is processed — client clears local state regardless.
 */
app.post('/api/auth/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const token = extractBearerToken(req)
  if (token) {
    try {
      await invalidateSession(token)
    } catch (err) {
      console.warn('[simvest] logout invalidate failed:', err instanceof Error ? err.message : err)
    }
  }
  res.json({ ok: true })
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
    useDefaultGameAvatar?: boolean
  }

  /**
   * The join-setup form now only collects what's truly game-specific:
   * `username` and `avatarUrl`. Everything else (firstName, lastName, contact)
   * is auto-derived from the caller's identity so we don't ask them for the
   * same data twice. Precedence:
   *   1. Explicit body value (legacy callers, or future "edit your name"
   *      surfaces that re-collect everything).
   *   2. Caller's account row in `user-accounts.json` (the normal post-signup
   *      path).
   *   3. The caller's existing setup row for THIS game (in case they're
   *      updating photo/username and a previous setup row already had them).
   *   4. Any other existing setup row owned by this user — handles the
   *      legacy case where someone joined a game before accounts existed and
   *      is now joining a second game without an account.
   */
  const bodyFirst = typeof b.firstName === 'string' ? b.firstName : ''
  const bodyLast = typeof b.lastName === 'string' ? b.lastName : ''
  const bodyEmail = typeof b.email === 'string' ? b.email : null
  const bodyPhone = typeof b.phone === 'string' ? b.phone : null

  const account = await getAccountByUserId(uid)
  const existingForGame = await getSetupProfileForUserGame(uid, slug)

  let legacyFallback: { firstName: string; lastName: string; email: string | null; phone: string | null } | null = null
  if (!account && (!bodyFirst || !bodyLast || (!bodyEmail && !bodyPhone))) {
    /* Look for the freshest setup row for this user across all games — used
     * as a last resort when both the body and the account store are silent. */
    const all = await loadAllSetupProfilesByKey()
    let best: { row: typeof existingForGame; updatedAtIso: string } | null = null
    for (const row of all.values()) {
      if (row.userId !== uid) continue
      const stamp = row.updatedAtIso ?? ''
      if (!best || stamp > best.updatedAtIso) best = { row, updatedAtIso: stamp }
    }
    if (best?.row) {
      legacyFallback = {
        firstName: best.row.firstName,
        lastName: best.row.lastName,
        email: best.row.email,
        phone: best.row.phone,
      }
    }
  }

  const firstName =
    bodyFirst ||
    account?.firstName ||
    existingForGame?.firstName ||
    legacyFallback?.firstName ||
    ''
  const lastName =
    bodyLast ||
    account?.lastName ||
    existingForGame?.lastName ||
    legacyFallback?.lastName ||
    ''

  const accountEmail = account?.contactKind === 'email' ? account.contact : null
  const accountPhone = account?.contactKind === 'phone' ? account.contact : null
  const email = bodyEmail ?? accountEmail ?? existingForGame?.email ?? legacyFallback?.email ?? null
  const phone = bodyPhone ?? accountPhone ?? existingForGame?.phone ?? legacyFallback?.phone ?? null

  /* If the form sent a username/avatar we use it; otherwise fall back to the
   * existing setup row so a re-save without those fields doesn't blank them. */
  const username =
    (typeof b.username === 'string' && b.username.trim() ? b.username : existingForGame?.username) ?? ''
  const useDefaultGameAvatar = b.useDefaultGameAvatar === true
  const bodyAvatar = typeof b.avatarUrl === 'string' ? b.avatarUrl.trim() : ''

  let avatarUrl: string
  if (useDefaultGameAvatar) {
    avatarUrl = GAME_SETUP_DEFAULT_AVATAR_URL
  } else if (bodyAvatar) {
    avatarUrl = bodyAvatar
  } else {
    avatarUrl = (existingForGame?.avatarUrl ?? '').trim()
  }

  const input = {
    userId: uid,
    gameSlug: slug,
    firstName,
    lastName,
    username,
    phone,
    email,
    password: typeof b.password === 'string' ? b.password : '',
    /* If we're not re-collecting a password, preserve the existing hash so
     * legacy login still works for that row. (Account-based login is the
     * primary path; this is just belt-and-suspenders for users with no
     * account yet.) */
    passwordHash: existingForGame?.passwordHash,
    avatarUrl,
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
    const isHost = Boolean(rules?.hostUserId && viewerIdsMatch(rules.hostUserId, uid))

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

    const priorJoin = await getGameJoinedAtIso(uid, slug)
    const joinedAt = await ensureGameJoinedAt(uid, slug)
    const hostId = await resolveHostUserId(slug)
    const memberName = `${setup.firstName} ${setup.lastName}`.trim()
    if (!priorJoin && joinedAt && hostId && !viewerIdsMatch(hostId, uid)) {
      queueMicrotask(() => {
        void notifyHostMemberJoined({
          gameSlug: slug,
          hostUserId: hostId,
          memberDisplayName: memberName || 'A player',
        }).catch(() => {})
      })
    }
    res.json({
      ok: true,
      pendingApproval: false,
      profile: {
        userId: uid,
        gameSlug: slug,
        displayName: memberName,
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
    /* While the shared `new` row is an unpublished draft owned by someone else,
     * non-hosts must not see that host's working title/settings — give a fresh
     * template for another creator. Once `setupComplete`, the same slug is a
     * live published game (join code, real title); joiners must see real rules. */
    if (slug === 'new' && rules.hostUserId && rules.hostUserId !== uid && !rules.setupComplete) {
      const resolvedHostName = await resolveHostDisplayNameForGame(slug, uid)
      const draft = buildFreshNewTemplateDraftForViewer(uid, resolvedHostName)
      res.json({
        settings: {
          ...draft,
          hostDisplayName: resolvedHostName || draft.hostDisplayName,
        },
        isHost: true,
        pendingJoinCount: 0,
      })
      return
    }
    const isHost = viewerIdsMatch(rules.hostUserId, uid)
    const pendingJoinCount = isHost ? await countPendingForGame(slug) : 0
    const resolvedHostName = await resolveHostDisplayNameForGame(slug, rules.hostUserId)
    res.json({
      settings: {
        ...rules,
        hostDisplayName: resolvedHostName || rules.hostDisplayName,
      },
      isHost,
      pendingJoinCount,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not load create settings' })
  }
})

/** Archive a live publish on `new` and seed a blank draft before the create wizard edits. */
app.post('/api/games/new/begin-draft', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const hostName = await resolveHostDisplayNameForGame('new', uid)
    const archivedSlug = await prepareNewSlotForHostDraft(uid, hostName)
    res.json({ ok: true, archivedSlug })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not begin draft' })
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
      if (slug !== 'new') {
        res.status(403).json({ error: 'Only the game host can change these settings.' })
        return
      }
    }
    const shouldResetStores = shouldResetStoresForNewSlugPublish(slug, {
      setupComplete: parsed.value.setupComplete === true,
      forceNewGameInstance: parsed.value.forceNewGameInstance,
      prev,
      editorUserId: uid,
    })
    if (shouldResetStores && slug === 'new') {
      await archivePublishedNewSlotBeforeRepublish()
    }
    if (shouldResetStores) {
      await resetGameScopedStoresForRepublish(slug)
    }
    const saved = await upsertRuntimeRules(slug, parsed.value, uid)
    if (shouldResetStores) {
      await ensureGameJoinedAt(uid, slug)
    }
    res.json({ ok: true, settings: saved })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Save failed'
    res.status(400).json({ error: msg })
  }
})

/** All pending join requests for games this viewer hosts (home inbox / notifications). */
app.get('/api/me/host/join-requests', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const requests = await listAllPendingJoinRequestsForHost(uid)
    res.json({ requests })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'List failed' })
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

app.get('/api/games/:slug/players', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const rules = await getRuntimeRules(slug)
  if (!rules || !rules.hostUserId || rules.hostUserId !== uid) {
    res.status(403).json({ error: 'Only the game host can view the player list.' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const players = await listActiveGamePlayers(slug)
    res.json({ players })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Players failed' })
  }
})

app.post('/api/games/:slug/end', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const result = await endGameNow(slug, uid)
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.json({ ok: true, endsAtIso: result.endsAtIso })
})

app.put('/api/games/:slug/duration', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const body = (req.body ?? {}) as Record<string, unknown>
  const presetRaw = typeof body.durationPreset === 'string' ? body.durationPreset.trim() : ''
  const preset = (['1d', '1w', '1m', '1y', 'custom'] as const).find((p) => p === presetRaw)
  if (!preset) {
    res.status(400).json({ error: 'Pick a duration (1d, 1w, 1m, 1y, or custom).' })
    return
  }
  const customRaw = typeof body.customEndsOn === 'string' ? body.customEndsOn.trim() : ''
  const customEndsOn = preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(customRaw) ? customRaw : null
  if (preset === 'custom' && !customEndsOn) {
    res.status(400).json({ error: 'Custom duration needs a YYYY-MM-DD end date.' })
    return
  }
  const result = await changeGameDuration({
    gameSlug: slug,
    hostUserId: uid,
    durationPreset: preset,
    customEndsOn,
  })
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }
  res.json({ ok: true, endsAtIso: result.endsAtIso })
})

app.post('/api/games/:slug/kick', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const rules = await getRuntimeRules(slug)
  if (!rules || !rules.hostUserId || rules.hostUserId !== uid) {
    res.status(403).json({ error: 'Only the game host can remove players.' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  const targetRaw = typeof body.userId === 'string' ? body.userId.trim() : ''
  const target = normalizeUserId(targetRaw) ?? targetRaw
  if (!target || target.length < 8) {
    res.status(400).json({ error: 'Invalid player id.' })
    return
  }
  if (target === uid) {
    res.status(400).json({ error: 'You cannot remove yourself. Use End game instead.' })
    return
  }
  try {
    const summary = await removeUserFromGame(target, slug)
    res.json({ ok: true, summary })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Kick failed' })
  }
})

app.post('/api/games/:slug/leave', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const rules = await getRuntimeRules(slug)
  if (rules?.hostUserId === uid) {
    res.status(400).json({ error: 'You are the host. Use End game to close this challenge.' })
    return
  }
  try {
    const summary = await removeUserFromGame(uid, slug)
    res.json({ ok: true, summary })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Leave failed' })
  }
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

/* ------------------------------------------------------------------------- */
/* Account read + settings mutations                                         */
/* ------------------------------------------------------------------------- */

/**
 * Return the current viewer's account so the settings screen can hydrate
 * name / contact / display name / avatar. Responds 404 when the viewer id
 * has no `user-accounts.json` row (legacy guest sessions) so the client can
 * gracefully prompt the user to sign up.
 */
app.get('/api/me/account', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const account = await getAccountByUserId(uid)
    if (!account) {
      res.status(404).json({ error: 'No Simvest account for this session.' })
      return
    }
    res.json({ account: toAccountPublicView(account) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Account read failed' })
  }
})

/**
 * Patch mutable profile fields (names, display name, avatar). Mirrors
 * `displayName` and `avatarUrl` to the public profile store so they show up
 * on activity posts, the leaderboard, etc. without a manual re-render.
 */
app.patch('/api/me/account/profile', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')

  const body = (req.body ?? {}) as Record<string, unknown>
  const firstName = typeof body.firstName === 'string' ? body.firstName : undefined
  const lastName = typeof body.lastName === 'string' ? body.lastName : undefined
  const displayName = typeof body.displayName === 'string' ? body.displayName : undefined
  const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl : undefined

  try {
    const result = await updateAccountProfile(uid, { firstName, lastName, displayName, avatarUrl })
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: 'Validation failed', errors: result.errors })
      return
    }
    /* Mirror to user-profiles so activity feed / leaderboard / composer all
     * pick up the new display name + avatar immediately. */
    await upsertProfileFromTradeContext(uid, {
      displayName: result.account.displayName,
      avatarUrl: result.account.avatarUrl,
    })
    res.json({ account: toAccountPublicView(result.account) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Profile update failed' })
  }
})

/**
 * Replace the login contact (email OR phone). Requires the current password —
 * same security gate as a password change. Rate-limited on `accountWrite`.
 */
app.patch('/api/me/account/contact', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')

  const ipKey = requestIpKey(req)
  if (await rateLimitHit('accountWrite', ipKey)) {
    res.status(429).json({ error: 'Too many account updates. Please wait a minute and try again.' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const contactKind: AccountContactKind | null =
    body.contactKind === 'email' || body.contactKind === 'phone'
      ? (body.contactKind as AccountContactKind)
      : null
  const contact = typeof body.contact === 'string' ? body.contact : ''
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''

  if (!contactKind) {
    res.status(400).json({
      error: 'Validation failed',
      errors: [{ field: 'contactKind', message: 'Pick email or phone' }],
    })
    return
  }

  try {
    const result = await updateAccountContact(uid, { contactKind, contact, currentPassword })
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: 'Validation failed', errors: result.errors })
      return
    }
    res.json({ account: toAccountPublicView(result.account) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Contact update failed' })
  }
})

/**
 * Replace the account password. Verifies the current password first; new
 * password must satisfy the same strength rule as signup. Rate-limited on
 * `accountWrite`.
 */
app.patch('/api/me/account/password', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')

  const ipKey = requestIpKey(req)
  if (await rateLimitHit('accountWrite', ipKey)) {
    res.status(429).json({ error: 'Too many account updates. Please wait a minute and try again.' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  try {
    const result = await updateAccountPassword(uid, { currentPassword, newPassword })
    if (!result.ok) {
      res.status(result.status ?? 400).json({ error: 'Validation failed', errors: result.errors })
      return
    }
    try {
      await invalidateAllSessionsForUser(uid)
    } catch (err) {
      console.warn('[simvest] session invalidate after password change failed:', err)
    }
    /* Mint a fresh session so this device stays signed in. */
    const session = await createSession(uid)
    res.json({ ok: true, token: session.token, sessionToken: session.token, expiresAt: session.expiresAtIso })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Password update failed' })
  }
})

/** Permanently delete the viewer's account and associated data (App Store 5.1.1(v)). */
app.delete('/api/me/account', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')

  const ipKey = requestIpKey(req)
  if (await rateLimitHit('accountWrite', ipKey)) {
    res.status(429).json({ error: 'Too many account updates. Please wait a minute and try again.' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''

  try {
    const result = await deleteSimvestAccount(uid, currentPassword)
    if (!result.ok) {
      res.status(result.status).json({
        error: result.message ?? 'Account deletion failed',
        errors: result.errors,
      })
      return
    }
    try {
      await invalidateAllSessionsForUser(uid)
    } catch (err) {
      console.warn('[simvest] session invalidate after account delete failed:', err)
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Account deletion failed' })
  }
})

/**
 * Suggestions for the home-screen empty state. Returns up to three live public
 * games per request (see `SUGGESTED_PAGE_SIZE` in `suggestedGamesService`), plus
 * `totalEligible` so the client can offer rotation via `?offset=` (stride 3).
 *
 * Auth is optional — without a `uid` we still return suggestions (just without
 * the "exclude games you already joined" filter), which is useful during the
 * signup-screen → home transition before localStorage settles.
 */
app.get('/api/games/suggested', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const uid = userIdFromReq(req)
  const offsetRaw = firstQueryString(req, 'offset')
  const parsed = offsetRaw !== undefined ? Number.parseInt(offsetRaw, 10) : 0
  const offset = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
  try {
    const payload = await buildSuggestedGames(uid, offset)
    res.json(payload)
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Suggested games failed',
    })
  }
})

/** Full list of live public games (browse from Join screen), sorted by popularity. */
app.get('/api/games/public', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const uid = userIdFromReq(req)
  try {
    const games = await listPublicCatalogItems(uid)
    res.json({ games, total: games.length })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Public games failed',
    })
  }
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
  const recordFinishedReopens =
    String(req.query.recordFinishedReopens ?? '').trim() === '1' ||
    String(req.headers['x-simvest-record-finished-reopens'] ?? '').trim() === '1'
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const slugs = await listParticipationSlugsForUser(uid)
    const games: {
      slug: string
      title: string
      subtitle: string
      cardTheme: Awaited<ReturnType<typeof getHomeCardThemeForSlug>>
      /** Host’s load-screen decor (one grapheme); from runtime rules per slug. */
      loadScreenEmoji: string
      status: 'live' | 'finished'
      endsAtIso: string | null
      isHost: boolean
      pendingJoinRequestCount: number
      sortRecencyMs: number
    }[] = []
    for (const slug of slugs) {
      const rules = await getRuntimeRules(slug)
      const joinedAtIso = await getGameJoinedAtIso(uid, slug)
      let sortRecencyMs = 0
      for (const iso of [rules?.startsAtIso, rules?.updatedAtIso, joinedAtIso]) {
        if (typeof iso !== 'string' || iso.length < 10) continue
        const t = Date.parse(iso)
        if (Number.isFinite(t) && t > sortRecencyMs) sortRecencyMs = t
      }
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
      const resolvedHostName = rules ? await resolveHostDisplayNameForGame(slug, rules.hostUserId) : ''
      const subtitle =
        ((resolvedHostName || rules?.hostDisplayName?.trim())
          ? `Hosted by ${(resolvedHostName || rules?.hostDisplayName?.trim())}`
          : null) ||
        (def?.welcomeTagline && def.welcomeTagline.trim()) ||
        (slug === 'nov-2024-stock-challenge' || slug === 'new' ? gameHostLine(variant) : 'Tap to open')
      const cardTheme = await getHomeCardThemeForSlug(slug)
      const endsAtIso =
        typeof rules?.endsAtIso === 'string' && rules.endsAtIso.length >= 10 ? rules.endsAtIso : null
      const endMs = endsAtIso ? new Date(endsAtIso).getTime() : NaN
      const status: 'live' | 'finished' =
        Number.isFinite(endMs) && Date.now() > endMs ? 'finished' : 'live'
      const loadScreenEmoji = sanitizeLoadScreenEmoji(rules?.loadScreenEmoji ?? '🍁')
      const isHost = viewerIdsMatch(rules?.hostUserId, uid)
      const pendingJoinRequestCount =
        isHost && rules?.visibility === 'private' ? await countPendingForGame(slug) : 0

      if (status === 'finished') {
        let viewCount = await getFinishedGameHomeViewCount(uid, slug)
        if (recordFinishedReopens) {
          viewCount = await bumpFinishedGameHomeView(uid, slug)
        }
        if (!shouldShowFinishedGameOnHome(viewCount)) {
          continue
        }
      }

      games.push({
        slug,
        title,
        subtitle,
        cardTheme,
        loadScreenEmoji,
        status,
        endsAtIso,
        isHost,
        pendingJoinRequestCount,
        sortRecencyMs,
      })
    }
    games.sort((a, b) => {
      if (b.sortRecencyMs !== a.sortRecencyMs) return b.sortRecencyMs - a.sortRecencyMs
      return a.slug.localeCompare(b.slug)
    })
    res.json({
      games: games.map(({ sortRecencyMs: _sortRecencyMs, ...row }) => row),
    })
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
    const tickers = await getAllFollowTickersForUser(uid)
    res.json({ tickers })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Follow list failed' })
  }
})

app.get('/api/games/:slug/me/following', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const tickers = await getFollowTickersForGame(uid, slug)
    res.json({ tickers })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Follow list failed' })
  }
})

app.get('/api/games/:slug/me/following/:ticker', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  const t = resolveMassiveTicker(decodeURIComponent(String(req.params.ticker ?? '')))
  if (!t) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }
  try {
    const following = await isFollowingForGame(uid, slug, t)
    res.json({ following })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Follow status failed' })
  }
})

app.put('/api/games/:slug/me/following/:ticker', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing or invalid X-Simvest-User-Id header' })
    return
  }
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  const t = resolveMassiveTicker(decodeURIComponent(String(req.params.ticker ?? '')))
  const following = Boolean((req.body as { following?: boolean })?.following)
  if (!t) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }
  try {
    const result = await setFollowingForGame(uid, slug, t, following)
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
    const limitQ = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
    const beforeIso = typeof req.query.before === 'string' ? req.query.before : undefined
    const { posts, nextBeforeIso } = await fetchHydratedHomeActivityForUser(uid, {
      limit: limitQ,
      beforeIso,
    })
    res.json({ posts, nextBeforeIso })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Home activity failed',
    })
  }
})

app.get('/api/me/activity/notify-authors', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const ids = await listWatchedAuthorIdsForViewer(uid)
    const authors = await Promise.all(
      ids.map(async (id) => {
        const p = await getUserPublicProfile(id)
        return {
          userId: id,
          displayName: p?.displayName ?? id.slice(0, 8),
          avatarUrl: p?.avatarUrl ?? '/figma-assets/blank-avatar.svg',
        }
      }),
    )
    res.json({ authorUserIds: ids, authors })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load preferences' })
  }
})

app.post('/api/me/activity/notify-authors', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const authorUserId = typeof (req.body as { authorUserId?: string })?.authorUserId === 'string'
    ? (req.body as { authorUserId: string }).authorUserId.trim()
    : ''
  if (authorUserId.length < 8) {
    res.status(400).json({ error: 'Invalid author' })
    return
  }
  try {
    await addAuthorNotifyPreference(uid, authorUserId)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not save preference' })
  }
})

app.delete('/api/me/activity/notify-authors/:authorId', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const authorId = decodeURIComponent(String(req.params.authorId ?? '')).trim()
  if (authorId.length < 8) {
    res.status(400).json({ error: 'Invalid author' })
    return
  }
  try {
    await removeAuthorNotifyPreference(uid, authorId)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not update preference' })
  }
})

app.get('/api/me/push/vapid-public', (_req, res) => {
  const publicKey = getVapidPublicKey()
  res.setHeader('Cache-Control', 'private, no-store')
  res.json({ publicKey })
})

app.post('/api/me/push/subscribe', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const sub = (req.body ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (typeof sub.endpoint !== 'string' || !sub.endpoint.trim()) {
    res.status(400).json({ error: 'Invalid subscription' })
    return
  }
  try {
    await savePushSubscriptionForViewer(uid, {
      endpoint: sub.endpoint.trim(),
      keys: {
        p256dh: typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh : undefined,
        auth: typeof sub.keys?.auth === 'string' ? sub.keys.auth : undefined,
      },
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not save subscription' })
  }
})

app.get('/api/me/push/native-status', (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.json({ configured: isNativePushConfigured() })
})

/** FCM/APNs device token from Capacitor `@capacitor/push-notifications`. */
app.post('/api/me/push/native-token', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const body = (req.body ?? {}) as { token?: string; platform?: string }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const platform = body.platform === 'ios' ? 'ios' : 'android'
  if (token.length < 16) {
    res.status(400).json({ error: 'Invalid device token' })
    return
  }
  try {
    await saveNativePushTokenForViewer(uid, { token, platform })
    res.json({ ok: true, configured: isNativePushConfigured() })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not save token' })
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
    // Prefer live runtime rules whenever the host has published — especially for the shared
    // `new` slot, which also exists as a static template in game-definitions.json with a
    // placeholder join code that must not override the unique issued code.
    const rt = await getRuntimeRules(slug)
    if (rt?.setupComplete) {
      const existing = normalizeSixDigitJoinCode(rt.joinCode)
      const withCode = existing ? rt : await ensureJoinCodeOnRuntimeIfMissing(slug)
      const outCode = normalizeSixDigitJoinCode(withCode?.joinCode)
      if (withCode && outCode) {
        res.json({
          slug,
          joinCode: outCode,
          displayTitle: withCode.gameDisplayName.trim() || slug,
        })
        return
      }
    }
    const def = await getGameDefinitionBySlug(slug)
    if (def) {
      res.json({
        slug: def.slug,
        joinCode: def.joinCode,
        displayTitle: def.displayTitle,
      })
      return
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
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const ids = await listParticipantIdsForGame(slug)
    const total = ids.length
    const slice = ids.slice(0, 8)
    const profileMap = await ensureUserProfilesBatch(slice)
    const setups = await loadAllSetupProfilesByKey()
    const members = await Promise.all(
      slice.map(async (userId) => {
        const setup = setups.get(`${userId}:::${slug}`)
        const prof = profileMap.get(userId)
        const gameLabel = gameProfileDisplayLabel(setup)
        const displayName = gameLabel ?? prof?.displayName?.trim() ?? 'Player'
        const avatarUrl = await compactImageUrlForApi(
          resolveProfileAvatarUrl(
            gameProfileAvatarUrl(setup, prof?.avatarUrl) || prof?.avatarUrl || '',
          ),
          '/figma-assets/blank-avatar.svg',
        )
        return { userId, displayName, avatarUrl }
      }),
    )
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
  if (!(await requireGameAccessForResponse(res, slug, feedViewer))) return
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const limitQ = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
    const beforeIso = typeof req.query.before === 'string' ? req.query.before : undefined
    const cacheKey = `feed:${slug}:${feedViewer ?? ''}:${limitQ ?? ''}:${beforeIso ?? ''}`
    const cached = readTtlCache<{ posts: unknown; nextBeforeIso?: string | null }>(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }
    const { posts: feedPosts, nextBeforeIso } = await listPostsForGame(slug, {
      limit: limitQ,
      beforeIso,
    })
    const rows = await hydrateGameFeedPosts(feedPosts, {
      viewerUserId: feedViewer,
      /* Feed must stay light — Massive live quotes belong on Trade/Portfolio, not every Activity open. */
      skipLiveQuotes: true,
    })
    const body = { posts: rows, nextBeforeIso }
    writeTtlCache(cacheKey, body, 8_000)
    res.json(body)
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
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  const voteClosed = await validateGameOpenForFeedMutations(slug)
  if (voteClosed) {
    res.status(403).json({ error: voteClosed })
    return
  }
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

app.post('/api/games/:slug/feed/posts/:postId/social/like', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  const socialClosed = await validateGameOpenForFeedMutations(slug)
  if (socialClosed) {
    res.status(403).json({ error: socialClosed })
    return
  }
  const postId = decodeURIComponent(String(req.params.postId ?? ''))
  if (!postId) {
    res.status(400).json({ error: 'Missing post' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const r = await togglePostLike(slug, postId, uid)
    if ('error' in r) {
      res.status(404).json({ error: r.error })
      return
    }
    if (r.liked) {
      void pushNotifyPostLiked(slug, postId, uid, true).catch(() => {})
    }
    res.json(r)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Like failed' })
  }
})

app.get('/api/games/:slug/feed/posts/:postId/social/likes', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  const postId = decodeURIComponent(String(req.params.postId ?? ''))
  if (!postId) {
    res.status(400).json({ error: 'Missing post' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const post = await getFeedPostById(postId)
    if (!post || canonicalGameSlugKey(post.gameSlug) !== canonicalGameSlugKey(slug)) {
      res.status(404).json({ error: 'Post not found' })
      return
    }
    const ids = await listPostLikeUserIds(slug, postId)
    const users = await hydratePostLikers(slug, ids)
    res.json({ users })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load likes' })
  }
})

app.get('/api/games/:slug/feed/posts/:postId/social/comments', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  const postId = decodeURIComponent(String(req.params.postId ?? ''))
  if (!postId) {
    res.status(400).json({ error: 'Missing post' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const post = await getFeedPostById(postId)
    if (!post || canonicalGameSlugKey(post.gameSlug) !== canonicalGameSlugKey(slug)) {
      res.status(404).json({ error: 'Post not found' })
      return
    }
    const comments = await listHydratedComments(slug, postId, uid)
    res.json({ comments })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load comments' })
  }
})

app.post('/api/games/:slug/feed/posts/:postId/social/comments', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  const socialClosed = await validateGameOpenForFeedMutations(slug)
  if (socialClosed) {
    res.status(403).json({ error: socialClosed })
    return
  }
  const postId = decodeURIComponent(String(req.params.postId ?? ''))
  const body = req.body as { text?: string; parentId?: string | null }
  const text = typeof body?.text === 'string' ? body.text : ''
  const parentRaw = body?.parentId
  const parentId =
    typeof parentRaw === 'string' && parentRaw.trim().length > 0 ? parentRaw.trim() : null
  if (!postId) {
    res.status(400).json({ error: 'Missing post' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const r = await addPostComment(slug, postId, uid, text, parentId)
    if ('error' in r) {
      res.status(400).json({ error: r.error })
      return
    }
    void pushNotifyPostCommented(slug, postId, uid, text).catch(() => {})
    res.json({ ok: true, comment: r.comment })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Comment failed' })
  }
})

app.post('/api/games/:slug/feed/posts/:postId/social/comments/:commentId/like', async (req, res) => {
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: 'Missing viewer id (X-Simvest-User-Id header or ?uid= query)',
    })
    return
  }
  const slug = gameSlugParam(req, res)
  if (!slug) return
  if (!(await requireGameAccessForResponse(res, slug, uid))) return
  const socialClosed = await validateGameOpenForFeedMutations(slug)
  if (socialClosed) {
    res.status(403).json({ error: socialClosed })
    return
  }
  const postId = decodeURIComponent(String(req.params.postId ?? ''))
  const commentId = decodeURIComponent(String(req.params.commentId ?? ''))
  if (!postId || !commentId) {
    res.status(400).json({ error: 'Missing post or comment' })
    return
  }
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const r = await toggleCommentLike(slug, postId, commentId, uid)
    if ('error' in r) {
      res.status(404).json({ error: r.error })
      return
    }
    res.json(r)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Comment like failed' })
  }
})

app.post('/api/games/:slug/trades/complete', async (req, res) => {
  if (await respondIfRateLimited(req, res, 'trade')) return
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const b = req.body as {
    clientUserId?: string
    clientTradeId?: string
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
  const bodyUid = normalizeUserId(
    typeof b.clientUserId === 'string' && b.clientUserId.trim().length > 0
      ? b.clientUserId.trim()
      : undefined,
  )

  /* Session-resolved id is authoritative. Reject forged header/body mismatches
   * only when legacy header auth is in play (dev). */
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({
      error: req.simvestBearerPresent
        ? 'Invalid or expired session'
        : 'Missing authentication (Authorization Bearer token required)',
    })
    return
  }
  if (req.simvestBearerPresent) {
    if (bodyUid && bodyUid !== uid) {
      res.status(401).json({ error: 'Viewer id mismatch' })
      return
    }
  } else if (headerUid && bodyUid && headerUid !== bodyUid) {
    res.status(401).json({ error: 'Viewer id mismatch' })
    return
  }
  if (!(await requireGameAccessForResponse(res, slug, uid))) return

  const idemHeader =
    typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined
  const clientTradeId =
    normalizeClientTradeId(b.clientTradeId) ?? normalizeClientTradeId(idemHeader)
  if (clientTradeId) {
    const prior = await getTradeIdempotencyResponse(uid, slug, clientTradeId)
    if (prior && typeof prior === 'object') {
      res.json({ ...(prior as Record<string, unknown>), duplicate: true })
      return
    }
  }

  const rawT = String(b.ticker ?? '')
  const t = normalizeCryptoCompositeTicker(rawT) ?? normalizeTicker(rawT)
  if (!t) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }
  const action = b.action === 'sell' ? 'sell' : 'buy'
  const shares = Number(b.shares)
  if (!Number.isFinite(shares) || shares <= 0) {
    res.status(400).json({ error: 'Invalid shares' })
    return
  }

  const clientFill =
    typeof b.fillPrice === 'number' && Number.isFinite(b.fillPrice) && b.fillPrice > 0
      ? Number(b.fillPrice)
      : null

  const serverMark = await fetchServerMarkPrice(t)
  if (serverMark == null || !(serverMark > 0)) {
    res.status(503).json({ error: 'Could not fetch a live mark price for this symbol. Try again.' })
    return
  }

  const resolved = resolveTradeFillPrice({
    shares,
    serverMark,
    clientFillPrice: clientFill,
  })
  const fillPrice = resolved.fillPrice
  const orderTotal = resolved.orderTotal

  if (action === 'buy') {
    const timingErr = await validateTradeTimingAgainstGameRules(slug)
    if (timingErr) {
      res.status(400).json({ error: timingErr })
      return
    }
    const ruleErr = await validateBuyAgainstGameRules(slug, rawT, uid)
    if (ruleErr) {
      res.status(400).json({ error: ruleErr })
      return
    }
  } else {
    const timingErr = await validateTradeTimingAgainstGameRules(slug)
    if (timingErr) {
      res.status(400).json({ error: timingErr })
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

  const symLabel = String(b.displayTicker ?? t).toUpperCase()
  const tradeTitle = action === 'buy' ? `I'm buying ${symLabel}` : `I'm selling ${symLabel}`
  const rationale = typeof b.rationale === 'string' ? b.rationale.trim().slice(0, 2000) : ''
  /** Do not trust client `authorAvatar` / `authorName` — they were Figma placeholders and could overwrite real account data. */
  await upsertProfileFromTradeContext(uid, {})
  const liveProfile = await fetchPlayerGameProfile(slug, uid)

  const unwoundCostBasis = action === 'sell' && 'unwoundCostBasis' in led ? led.unwoundCostBasis : undefined

  const post = await appendGameFeedPost({
    postKind: 'trade',
    userId: uid,
    gameSlug: slug,
    author: liveProfile?.profile.displayName ?? 'You',
    avatar: resolveProfileAvatarUrl(liveProfile?.profile.avatarUrl),
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
    ...(typeof unwoundCostBasis === 'number' && Number.isFinite(unwoundCostBasis)
      ? { costBasis: unwoundCostBasis }
      : {}),
  })

  queueMicrotask(() => {
    void import('./leaderboardRankNotifyService')
      .then((m) => m.checkLeaderboardRankAlerts(slug))
      .catch(() => {})
  })

  const sellExtras =
    action === 'sell' &&
    typeof unwoundCostBasis === 'number' &&
    Number.isFinite(unwoundCostBasis) &&
    unwoundCostBasis > 0
      ? {
          costBasis: unwoundCostBasis,
          realizedPnlDollars: orderTotal - unwoundCostBasis,
          realizedPnlPct: ((orderTotal - unwoundCostBasis) / unwoundCostBasis) * 100,
        }
      : {}

  const successBody = {
    ok: true as const,
    postId: post.id,
    fillPrice,
    orderTotal,
    serverMark,
    usedClientPrice: resolved.usedClientPrice,
    ...sellExtras,
  }
  if (clientTradeId) {
    try {
      await rememberTradeIdempotencyResponse(uid, slug, clientTradeId, successBody)
    } catch {
      /* non-fatal — trade already applied */
    }
  }
  clearTtlCachePrefix(`feed:${slug}`)
  clearTtlCachePrefix(`lb:${slug}`)
  clearTtlCachePrefix(`lb-metrics:${slug}`)
  clearTtlCachePrefix(`perform:${slug}:`)
  clearTtlCachePrefix(`portfolio:${slug}:`)
  res.json(successBody)
})

/**
 * Lightweight ownership read for the stock detail screen — used to flip the BUY button to TRADE
 * and to power the sell sheet (max sellable shares + value at market).
 */
app.get('/api/games/:slug/stocks/:ticker/position', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  if (!(await requireGameAccessForResponse(res, slug, uid))) return

  const rawT = String(req.params.ticker ?? '')
  const t = normalizeCryptoCompositeTicker(rawT) ?? normalizeTicker(rawT)
  if (!t) {
    res.status(400).json({ error: 'Invalid ticker' })
    return
  }

  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const { getUserLedger, getUserLots } = await import('./userGameStateService')
    const ledger = await getUserLedger(uid, slug)
    const lots = await getUserLots(uid, slug)
    const symLots = lots.filter((l) => normalizeTicker(l.ticker) === t)
    const shares = symLots.reduce((s, l) => s + l.shares, 0)
    const costBasis = symLots.reduce((s, l) => s + l.shares * l.entryPrice, 0)
    const avgCost = shares > 1e-9 ? costBasis / shares : 0
    res.json({
      gameSlug: slug,
      ticker: t,
      shares,
      avgCost,
      costBasis,
      cashAvailable: Number.isFinite(ledger.cash) ? ledger.cash : 0,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Position lookup failed' })
  }
})

/** Update activity post body (text) or trade rationale — author only. */
app.patch('/api/games/:slug/feed/posts/:postId', async (req, res) => {
  const slug = gameSlugParam(req, res)
  if (!slug) return
  const uid = userIdFromReq(req)
  if (!uid) {
    res.status(401).json({ error: 'Missing viewer id' })
    return
  }
  const editClosed = await validateGameOpenForFeedMutations(slug)
  if (editClosed) {
    res.status(403).json({ error: editClosed })
    return
  }
  const postId = decodeURIComponent(String(req.params.postId ?? ''))
  const post = await getFeedPostById(postId)
  if (!post || canonicalGameSlugKey(post.gameSlug) !== canonicalGameSlugKey(slug)) {
    res.status(404).json({ error: 'Post not found' })
    return
  }
  const kind = post.postKind ?? 'trade'
  if (kind === 'poll') {
    res.status(400).json({ error: 'Polls cannot be edited' })
    return
  }

  const body = req.body as { rationale?: string; plainText?: string; segments?: unknown }
  const hasRichPatch = body.segments !== undefined || typeof body.plainText === 'string'

  if (kind === 'text' && hasRichPatch) {
    let parsed = parseActivityRichInput({ segments: body.segments, plainText: body.plainText })
    if (
      !parsed.ok &&
      post.attachmentImageUrl &&
      !body.segments &&
      typeof body.plainText === 'string' &&
      body.plainText.trim() === ''
    ) {
      parsed = { ok: true, segments: [{ type: 'text', text: '' }] }
    }
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }
    const rationale = plainFromRichSegments(parsed.segments).trim() || (post.attachmentImageUrl ? ' ' : '')
    const result = await updateFeedPostRichBody(postId, uid, parsed.segments, rationale)
    if (!result.ok) {
      res.status(result.error === 'Post not found' ? 404 : 403).json({ error: result.error })
      return
    }
    res.json({ ok: true })
    return
  }

  const rationale =
    typeof body.rationale === 'string' ? body.rationale.trim().slice(0, 2000) : ''
  if (!hasRichPatch && typeof body.rationale !== 'string') {
    res.status(400).json({ error: 'Nothing to update' })
    return
  }
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
  if (!(await requireGameAccessForResponse(res, slug, userIdFromReq(req)))) return
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
  if (!(await requireGameAccessForResponse(res, slug, userIdFromReq(req)))) return
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
  if (!(await requireGameAccessForResponse(res, slugResolved, uid))) return
  const sortParam =
    typeof req.query.sort === 'string' && req.query.sort.trim().length > 0
      ? req.query.sort
      : undefined
  const sort = parseLeaderboardSort(sortParam)
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const cacheKey = `lb:${slugResolved}:${sort}`
    const cached = readTtlCache<unknown>(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }
    const payload = await fetchGameLeaderboardPayload(slugResolved, sort)
    /* 30s — matches shared metrics TTL; sort switches stay cheap after first build. */
    writeTtlCache(cacheKey, payload, 30_000)
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
  if (!(await requireGameAccessForResponse(res, slugResolved, uid))) return
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const cacheKey = `perform:${slugResolved}:${uid ?? ''}`
    const cached = readTtlCache<unknown>(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }
    const payload = await getPerformDashboard(slugResolved, uid)
    writeTtlCache(cacheKey, payload, 8_000)
    res.json(payload)
  } catch {
    res.json(emptyPerformDashboard(slugResolved))
  }
})

app.get('/api/games/:slug/perform/compare/candidates', async (req, res) => {
  const slugResolved = gameSlugParam(req, res)
  if (!slugResolved) return
  const uid = userIdFromReq(req)
  if (!(await requireGameAccessForResponse(res, slugResolved, uid))) return
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
  if (!(await requireGameAccessForResponse(res, slugResolved, uid))) return
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
  if (!(await requireGameAccessForResponse(res, slugResolved, uid))) return
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  try {
    const cacheKey = `portfolio:${slugResolved}:${uid ?? ''}`
    const cached = readTtlCache<unknown>(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }
    const payload = await fetchPortfolioPayload(slugResolved, uid)
    writeTtlCache(cacheKey, payload, 8_000)
    res.json(payload)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Portfolio failed' })
  }
})

app.get('/api/games/:slug/trade/browse', async (req, res) => {
  if (await respondIfRateLimited(req, res, 'marketRead')) return
  const slug = gameSlugParam(req, res)
  if (!slug) return
  if (!(await requireGameAccessForResponse(res, slug, userIdFromReq(req)))) return
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  const raw = String(req.query.category ?? 'popular').toLowerCase()
  const category = isTradeCategory(raw) ? raw : 'popular'
  try {
    const uid = userIdFromReq(req)
    const payload = await fetchTradeBrowse(slug, uid, category)
    /* Browse/search lists are for discovery; `validateBuyAgainstGameRules` still blocks
     * disallowed buys (e.g. crypto in a stocks-only game). Filtering rows here hid entire
     * categories (empty crypto tab) and confused the trade UI. */
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
  if (await respondIfRateLimited(req, res, 'marketRead')) return
  const slug = gameSlugParam(req, res)
  if (!slug) return
  if (!(await requireGameAccessForResponse(res, slug, userIdFromReq(req)))) return
  res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
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

app.put('/api/games/:slug/portfolio/holdings', requireAdminAuth, async (req, res) => {
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
  if (await respondIfRateLimited(req, res, 'marketRead')) return
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
  if (await respondIfRateLimited(req, res, 'marketRead')) return
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

const distDir = path.join(__dirname, '..', 'dist')
const simvestServeDist =
  process.env.SIMVEST_SERVE_DIST === '1' || process.env.SIMVEST_SERVE_DIST === 'true'

if (simvestServeDist) {
  if (!fs.existsSync(distDir)) {
    console.warn(
      `[simvest] SIMVEST_SERVE_DIST is enabled but ${distDir} does not exist (run npm run build first).`,
    )
  } else {
    console.log(`[simvest] Serving SPA + static assets from ${distDir}`)
    app.use(express.static(distDir, { index: false }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next()
        return
      }
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/legal') ||
        req.path.startsWith('/.well-known') ||
        req.path === '/apple-app-site-association'
      ) {
        next()
        return
      }
      res.sendFile(path.join(distDir, 'index.html'), (err) => {
        if (err) next(err)
      })
    })
  }
}

/**
 * Boot-time housekeeping: drop orphaned membership rows whose game slug no longer
 * exists in runtime rules (safe cleanup only — never strips players from live games).
 */
async function runStartupReconciles(): Promise<void> {
  try {
    const rules = await listAllRuntimeRules()
    const hostsByGameSlug = new Map<string, string | null>()
    for (const { slug, rules: r } of rules) {
      hostsByGameSlug.set(slug, r.hostUserId)
    }
    const result = await reconcileMembershipFile({
      hostsByGameSlug,
    })
    if (result.removed > 0) {
      console.log(
        `[startup] membership reconcile dropped ${result.removed} orphaned row(s); kept ${result.kept}.`,
      )
    }
  } catch (err) {
    console.warn(
      '[startup] membership reconcile skipped:',
      err instanceof Error ? err.message : err,
    )
  }

  if (getDatabaseUrl()) {
    try {
      const bf = await backfillNormalizedHotPathFromJsonDocs()
      if (bf && (bf.ledgers > 0 || (bf.feedWasEmpty && bf.posts > 0))) {
        console.log(
          `[startup] normalized hot-path backfill: ${bf.ledgers} ledger(s), ${bf.posts} feed post(s).`,
        )
      }
    } catch (err) {
      console.warn(
        '[startup] normalized hot-path backfill skipped:',
        err instanceof Error ? err.message : err,
      )
    }
  }
}

const port = Number(process.env.PORT ?? 3001)
const host = process.env.SIMVEST_LISTEN_HOST?.trim() || '0.0.0.0'

function requireDbAtBoot(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.SIMVEST_REQUIRE_DB === '1'
}

function warnIfMultiInstanceForbidden(): void {
  const webConc = Number(process.env.WEB_CONCURRENCY ?? '1')
  if (Number.isFinite(webConc) && webConc > 1) {
    console.warn(
      `[simvest] WEB_CONCURRENCY=${webConc} — multi-worker mode is forbidden until Redis quote cache exists. Keep a single Node process (see docs/LAUNCH_TOPOLOGY.md).`,
    )
  }
  if (process.env.SIMVEST_ALLOW_MULTI_INSTANCE === '1') {
    console.warn(
      '[simvest] SIMVEST_ALLOW_MULTI_INSTANCE=1 is set — still keep Render numInstances=1 until shared quotes are ready.',
    )
  }
}

void ensureDataDirReady()
  .then(async () => {
    if (requireDbAtBoot() && !getDatabaseUrl()) {
      console.error(
        '[simvest] Refusing to boot: production / SIMVEST_REQUIRE_DB=1 requires DATABASE_URL (Postgres). REST-only Supabase (SUPABASE_URL + SERVICE_ROLE_KEY without DATABASE_URL) does not provide advisory locks. See docs/LAUNCH_TOPOLOGY.md.',
      )
      process.exit(1)
    }
    if (requireDbAtBoot() && getDatabaseUrl()) {
      const ok = await pingDatabase()
      if (!ok) {
        console.error('[simvest] Refusing to boot: DATABASE_URL is set but Postgres ping failed.')
        process.exit(1)
      }
    }
    warnIfMultiInstanceForbidden()
    app.listen(port, host, () => {
      console.log(`Simvest API listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (bound ${host})`)
      if (allowLegacyUserHeader()) {
        console.warn(
          '[simvest] Legacy X-Simvest-User-Id auth is enabled (dev or ALLOW_LEGACY_USER_HEADER=1). Production should rely on Bearer sessions.',
        )
      }
      void runStartupReconciles()
      void initVapidKeys().catch((err) => {
        console.warn(
          '[simvest] Web Push init skipped:',
          err instanceof Error ? err.message : err,
        )
      })
      startStockMoveAlertScanner()
      if (!isNativePushConfigured()) {
        console.warn(
          '[simvest] Native push (FCM) is not configured — set FIREBASE_SERVICE_ACCOUNT_JSON on the server for iOS/Android alerts when the app is closed.',
        )
      }
    })
  })
  .catch((err) => {
    console.error('[simvest] Failed to initialize data directory:', err)
    process.exit(1)
  })
