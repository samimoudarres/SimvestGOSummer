/**
 * Hydrate persisted feed rows with Massive snapshot prices (“since purchase” %),
 * shared by per-game feeds and multi-game home activity.
 */

import { gameTitle, slugToVariant } from '../src/challenge/gameMeta'
import { normalizeUserId } from './followsService'
import { massiveGet } from './massiveClient'
import type { GameFeedPost, RichTextSegment } from './gameFeedService'
import { normalizeGameSlugParam } from './gameSlugNormalize'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { normalizeTicker } from './stockService'
import { deriveLegacyUserId } from './userProfileService'
import { ensureUserProfilesBatch } from './userProfileService'
import { getPollVoteFromMap, loadAllPollVotes, tallyPollFromMap } from './feedPollVotesService'
import { loadAllSetupProfilesByKey } from './userSetupProfileService'

type SnapshotTicker = {
  day?: { c?: number }
  prevDay?: { c?: number }
  lastTrade?: { p?: number }
  lastQuote?: { p?: number; P?: number }
  min?: { c?: number }
  todaysChangePerc?: number
}

export type HydratedPollOption = { id: string; label: string; count: number }

export type HydratedFeedApiPost = {
  id: string
  userId: string
  gameSlug: string
  postKind: 'trade' | 'text' | 'poll'
  author: string
  avatar: string
  gameName: string
  postedAtIso: string
  timestamp: string
  tradeTitle: string
  tickerSymbol: string
  tickerImage: string
  changePct: string
  sharesBought: string
  orderTotal: string
  marketCap: string
  revenue: string
  rationale: string
  richSegments?: RichTextSegment[]
  attachmentImageUrl?: string | null
  poll?: {
    question: string
    options: HydratedPollOption[]
    myVoteId: string | null
  } | null
}

type SnapshotPayload = {
  ticker?: SnapshotTicker
}

export function fmtPctSigned(n: number): string {
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`
}

function pickLivePrice(s: SnapshotTicker | undefined): number | null {
  if (!s) return null
  const p = s.lastTrade?.p ?? s.lastQuote?.p ?? s.lastQuote?.P ?? s.min?.c ?? s.day?.c ?? s.prevDay?.c
  return typeof p === 'number' && Number.isFinite(p) ? p : null
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

async function fetchLivePriceMap(uniqueTickers: string[]): Promise<
  Map<string, { price: number | null; todaysChangePerc: number | null }>
> {
  const liveMap = new Map<string, { price: number | null; todaysChangePerc: number | null }>()
  await Promise.all(
    uniqueTickers.map(async (sym) => {
      const snapPath = sym.startsWith('X:')
        ? `/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(sym)}`
        : `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(sym)}`
      try {
        const snap = await massiveGet<SnapshotPayload>(snapPath)
        liveMap.set(sym, {
          price: pickLivePrice(snap?.ticker),
          todaysChangePerc:
            snap?.ticker?.todaysChangePerc != null && Number.isFinite(snap.ticker.todaysChangePerc)
              ? snap.ticker.todaysChangePerc
              : null,
        })
      } catch {
        liveMap.set(sym, { price: null, todaysChangePerc: null })
      }
    }),
  )
  return liveMap
}

export async function hydrateGameFeedPosts(
  feedPosts: GameFeedPost[],
  opts?: { viewerUserId?: string | null },
): Promise<HydratedFeedApiPost[]> {
  const uniqueTickers = [...new Set(feedPosts.map((p) => normalizeTicker(p.tickerSymbol)).filter(Boolean))] as string[]
  const liveMap = await fetchLivePriceMap(uniqueTickers)
  const userIds = feedPosts
    .map((p) => normalizeUserId(typeof p.userId === 'string' ? p.userId.trim() : '') ?? deriveLegacyUserId(p.author || 'player'))
    .filter((id) => id.length >= 8)
  const profileMap = await ensureUserProfilesBatch([...new Set(userIds)])
  const setupByKey = await loadAllSetupProfilesByKey()

  const slugSet = [...new Set(feedPosts.map((p) => normalizeGameSlugParam(p.gameSlug ?? '')).filter(Boolean))]
  const runtimeTitles = new Map<string, string>()
  await Promise.all(
    slugSet.map(async (sl) => {
      const r = await getRuntimeRules(sl)
      const t = r?.gameDisplayName?.trim()
      if (t) runtimeTitles.set(sl, t)
    }),
  )

  const viewer = opts?.viewerUserId?.trim() && opts.viewerUserId.trim().length >= 8 ? opts.viewerUserId.trim() : null
  const pollVotesMap = await loadAllPollVotes()

  return feedPosts.map((p) => {
    const kind: 'trade' | 'text' | 'poll' =
      p.postKind === 'poll' ? 'poll' : p.postKind === 'text' ? 'text' : 'trade'
    const sym = normalizeTicker(p.tickerSymbol) ?? p.tickerSymbol
    const live = kind === 'trade' ? liveMap.get(sym) : undefined
    const livePx = live?.price ?? null
    let changePct = p.changePct
    if (
      kind === 'trade' &&
      p.purchasePrice != null &&
      Number.isFinite(p.purchasePrice) &&
      p.purchasePrice > 0 &&
      livePx != null
    ) {
      const raw =
        p.side === 'sell'
          ? ((p.purchasePrice - livePx) / p.purchasePrice) * 100
          : ((livePx - p.purchasePrice) / p.purchasePrice) * 100
      changePct = fmtPctSigned(raw)
    } else if (kind === 'trade' && changePct === '—' && live?.todaysChangePerc != null) {
      changePct = fmtPctSigned(live.todaysChangePerc)
    }

    const userId =
      normalizeUserId(typeof p.userId === 'string' ? p.userId.trim() : '') ??
      deriveLegacyUserId(p.author || 'player')

    const slug = normalizeGameSlugParam(p.gameSlug ?? '')

    const profile = profileMap.get(userId)
    const setup = setupByKey.get(`${userId}:::${slug}`)
    const author = setup ? `${setup.firstName} ${setup.lastName}`.trim() : (profile?.displayName ?? p.author)
    const avatar = setup?.avatarUrl || profile?.avatarUrl || p.avatar

    let pollPayload: HydratedFeedApiPost['poll'] = null
    if (kind === 'poll' && p.pollQuestion && Array.isArray(p.pollOptions) && p.pollOptions.length >= 2) {
      const ids = p.pollOptions.map((o) => o.id)
      const tallies = tallyPollFromMap(pollVotesMap, p.id, ids)
      const myVoteId = viewer ? getPollVoteFromMap(pollVotesMap, p.id, viewer) : null
      pollPayload = {
        question: p.pollQuestion,
        options: p.pollOptions.map((o) => ({
          id: o.id,
          label: o.label,
          count: tallies[o.id] ?? 0,
        })),
        myVoteId,
      }
    }

    const richSegments =
      kind === 'text' && Array.isArray(p.richSegments) && p.richSegments.length > 0
        ? p.richSegments
        : undefined
    const attachmentImageUrl =
      kind === 'text' && typeof p.attachmentImageUrl === 'string' && p.attachmentImageUrl.trim().length > 0
        ? p.attachmentImageUrl.trim()
        : null

    const gameName =
      (slug && runtimeTitles.get(slug)) ||
      (slug ? gameTitle(slugToVariant(slug)) : 'Game')

    return {
      id: p.id,
      userId,
      gameSlug: slug,
      postKind: kind,
      author,
      avatar,
      gameName,
      postedAtIso: p.timestampIso,
      timestamp: formatEtTimestamp(p.timestampIso),
      tradeTitle: p.tradeTitle,
      tickerSymbol: p.tickerSymbol,
      tickerImage: p.tickerImage,
      changePct,
      sharesBought: p.sharesBought,
      orderTotal: p.orderTotal,
      marketCap: p.marketCap,
      revenue: p.revenue,
      rationale: p.rationale,
      ...(richSegments ? { richSegments } : {}),
      ...(attachmentImageUrl ? { attachmentImageUrl } : {}),
      ...(pollPayload ? { poll: pollPayload } : {}),
    }
  })
}
