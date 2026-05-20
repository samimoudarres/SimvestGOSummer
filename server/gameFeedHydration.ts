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
import { normalizeTicker, normalizeCryptoSnapshotShape, unwrapCryptoSnapshotBody } from './stockService'
import { pickStockMarkPrice, pickUsEquityFrozenChangePct } from './usEquityMarkPrice'
import { deriveLegacyUserId } from './userProfileService'
import { ensureUserProfilesBatch } from './userProfileService'
import { getPollVoteFromMap, loadAllPollVotes, tallyPollFromMap } from './feedPollVotesService'
import { loadAllSetupProfilesByKey } from './userSetupProfileService'
import { resolveProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'
import { batchSocialSummaries, socialPostKey } from './feedPostSocialService'

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
  /** Trade rows only: tells the UI whether to render Buy or Sell labels and P&L. */
  side?: 'buy' | 'sell'
  /** Trade rows only: fill price at the time of the trade. */
  purchasePrice?: number
  /** Sell rows only: cost basis of the FIFO lots unwound — used for realized P&L. */
  costBasis?: number
  richSegments?: RichTextSegment[]
  attachmentImageUrl?: string | null
  poll?: {
    question: string
    options: HydratedPollOption[]
    myVoteId: string | null
  } | null
  social: {
    likeCount: number
    likedByViewer: boolean
    commentCount: number
  }
  /** True when the game's scheduled end has passed — feed mutations (poll, edit, social) are blocked server-side. */
  feedInteractionsLocked: boolean
}

type SnapshotPayload = {
  ticker?: SnapshotTicker
}

export function fmtPctSigned(n: number): string {
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}%`
}

function pickLivePrice(sym: string, s: SnapshotTicker | undefined, atMs: number): number | null {
  return pickStockMarkPrice(sym, s, atMs)
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

type BatchSnapResponse = { tickers?: unknown[] }

function flattenSnapRow(row: unknown): { sym: string | null; ticker: SnapshotTicker } {
  if (!row || typeof row !== 'object') return { sym: null, ticker: {} }
  const o = row as Record<string, unknown>
  const inner = o.ticker
  if (inner && typeof inner === 'object') {
    const n = inner as Record<string, unknown>
    const sym =
      typeof n.ticker === 'string'
        ? n.ticker
        : typeof o.ticker === 'string'
          ? o.ticker
          : null
    return { sym, ticker: { ...(o as object), ...(n as object) } as SnapshotTicker }
  }
  const sym = typeof o.ticker === 'string' ? o.ticker : null
  return { sym, ticker: o as SnapshotTicker }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * One Massive batch call per market (stocks/crypto) — replaces an O(N) per-ticker fan-out
 * that was the dominant cost of feed hydration. Falls back to per-ticker fetch only for
 * symbols missing from the batch response (e.g. delisted or unsupported on the batch path).
 */
async function fetchLivePriceMap(uniqueTickers: string[]): Promise<
  Map<string, { price: number | null; todaysChangePerc: number | null }>
> {
  const liveMap = new Map<string, { price: number | null; todaysChangePerc: number | null }>()
  const stockSyms = uniqueTickers.filter((s) => !s.startsWith('X:'))
  const cryptoSyms = uniqueTickers.filter((s) => s.startsWith('X:'))

  const atMs = Date.now()
  const ingest = (sym: string, t: SnapshotTicker | null | undefined): void => {
    const norm = normalizeCryptoSnapshotShape(t as never) ?? t ?? undefined
    let pct: number | null = null
    if (!sym.startsWith('X:')) {
      pct = pickUsEquityFrozenChangePct(sym, norm, atMs)
    }
    if (pct == null && norm?.todaysChangePerc != null && Number.isFinite(norm.todaysChangePerc)) {
      pct = norm.todaysChangePerc
    }
    if ((pct == null || !Number.isFinite(pct)) && norm) {
      const price = pickLivePrice(sym, norm, atMs)
      const prev = norm.prevDay?.c
      if (price != null && prev != null && prev !== 0) {
        pct = ((price - prev) / prev) * 100
      } else {
        const open = norm.day?.o
        if (price != null && open != null && open !== 0) {
          pct = ((price - open) / open) * 100
        }
      }
    }
    liveMap.set(sym, {
      price: pickLivePrice(sym, norm, atMs),
      todaysChangePerc: pct != null && Number.isFinite(pct) ? pct : null,
    })
  }

  await Promise.all([
    (async () => {
      for (const chunk of chunkArray(stockSyms, 25)) {
        if (!chunk.length) continue
        try {
          const q = chunk.map((c) => encodeURIComponent(c)).join(',')
          const data = await massiveGet<BatchSnapResponse>(
            `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${q}`,
          )
          for (const raw of data?.tickers ?? []) {
            const { sym, ticker } = flattenSnapRow(raw)
            if (sym && chunk.includes(sym)) ingest(sym, ticker)
          }
        } catch {
          /* per-ticker fallback below fills the gaps */
        }
      }
    })(),
    (async () => {
      for (const chunk of chunkArray(cryptoSyms, 12)) {
        if (!chunk.length) continue
        try {
          const q = chunk.map((c) => encodeURIComponent(c)).join(',')
          const data = await massiveGet<BatchSnapResponse>(
            `/v2/snapshot/locale/global/markets/crypto/tickers?tickers=${q}`,
          )
          // Crypto rows sometimes return the symbol without the `X:` prefix — match both.
          const wantSet = new Set(chunk)
          const unprefixedToFull = new Map(chunk.map((s) => [s.replace(/^X:/, ''), s]))
          for (const raw of data?.tickers ?? []) {
            const { sym, ticker } = flattenSnapRow(raw)
            if (!sym) continue
            const upper = sym.toUpperCase()
            const matched = wantSet.has(upper)
              ? upper
              : unprefixedToFull.get(upper.replace(/^X:/, '')) ?? null
            if (matched) ingest(matched, ticker)
          }
        } catch {
          /* per-ticker fallback below fills the gaps */
        }
      }
    })(),
  ])

  const missing = uniqueTickers.filter((s) => !liveMap.has(s))
  if (missing.length > 0) {
    await Promise.all(
      missing.map(async (sym) => {
        const snapPath = sym.startsWith('X:')
          ? `/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(sym)}`
          : `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(sym)}`
        try {
          const raw = await massiveGet<unknown>(snapPath)
          if (sym.startsWith('X:')) {
            const inner = unwrapCryptoSnapshotBody(raw)
            const { ticker: flatT } = flattenSnapRow(raw)
            const merged = inner ? ({ ...(flatT ?? {}), ...inner } as SnapshotTicker) : flatT
            const norm = normalizeCryptoSnapshotShape(merged as never) ?? merged
            ingest(sym, norm)
          } else {
            const snap = raw as SnapshotPayload
            ingest(sym, snap?.ticker ?? null)
          }
        } catch {
          liveMap.set(sym, { price: null, todaysChangePerc: null })
        }
      }),
    )
  }
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
  const feedLockedSlugs = new Set<string>()
  await Promise.all(
    slugSet.map(async (sl) => {
      const r = await getRuntimeRules(sl)
      const t = r?.gameDisplayName?.trim()
      if (t) runtimeTitles.set(sl, t)
      if (r?.endsAtIso) {
        const endsMs = new Date(r.endsAtIso).getTime()
        if (Number.isFinite(endsMs) && Date.now() > endsMs) feedLockedSlugs.add(sl)
      }
    }),
  )

  const viewer = opts?.viewerUserId?.trim() && opts.viewerUserId.trim().length >= 8 ? opts.viewerUserId.trim() : null
  const pollVotesMap = await loadAllPollVotes()

  const socialMap = await batchSocialSummaries(
    feedPosts.map((p) => ({
      slug: normalizeGameSlugParam(p.gameSlug ?? ''),
      postId: p.id,
    })),
    viewer,
  )

  return feedPosts.map((p) => {
    const kind: 'trade' | 'text' | 'poll' =
      p.postKind === 'poll' ? 'poll' : p.postKind === 'text' ? 'text' : 'trade'
    const sym = normalizeTicker(p.tickerSymbol) ?? p.tickerSymbol
    const live = kind === 'trade' ? liveMap.get(sym) : undefined
    const livePx = live?.price ?? null
    let changePct = p.changePct
    if (
      kind === 'trade' &&
      p.side === 'sell' &&
      typeof p.costBasis === 'number' &&
      Number.isFinite(p.costBasis) &&
      p.costBasis > 0
    ) {
      // For sells we surface realized P&L (proceeds vs FIFO cost basis) — that is the
      // most relevant figure right after a sale, replacing the live "since sale" drift.
      const proceedsStr = typeof p.orderTotal === 'string' ? p.orderTotal : ''
      const proceeds = parseFloat(proceedsStr.replace(/[^0-9.\-]/g, ''))
      if (Number.isFinite(proceeds)) {
        const raw = ((proceeds - p.costBasis) / p.costBasis) * 100
        changePct = fmtPctSigned(raw)
      }
    } else if (
      kind === 'trade' &&
      p.side !== 'sell' &&
      p.purchasePrice != null &&
      Number.isFinite(p.purchasePrice) &&
      p.purchasePrice > 0 &&
      livePx != null
    ) {
      // `livePx` is a stable session close when the US market is closed (see pickStockMarkPrice).
      const raw = ((livePx - p.purchasePrice) / p.purchasePrice) * 100
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
    const avatar = resolveProfileAvatarUrl(setup?.avatarUrl || profile?.avatarUrl || p.avatar)

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

    const sKey = socialPostKey(slug, p.id)
    const social =
      (sKey && socialMap.get(sKey)) ?? { likeCount: 0, likedByViewer: false, commentCount: 0 }

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
      ...(kind === 'trade' && (p.side === 'buy' || p.side === 'sell') ? { side: p.side } : {}),
      ...(kind === 'trade' && typeof p.purchasePrice === 'number' && Number.isFinite(p.purchasePrice)
        ? { purchasePrice: p.purchasePrice }
        : {}),
      ...(kind === 'trade' && typeof p.costBasis === 'number' && Number.isFinite(p.costBasis)
        ? { costBasis: p.costBasis }
        : {}),
      ...(richSegments ? { richSegments } : {}),
      ...(attachmentImageUrl ? { attachmentImageUrl } : {}),
      ...(pollPayload ? { poll: pollPayload } : {}),
      social,
      feedInteractionsLocked: slug ? feedLockedSlugs.has(slug) : false,
    }
  })
}
