import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { useGameChallengeHeader } from '../challenge/useGameChallengeHeader'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { GAME_SLUG, gameTitle, slugToVariant } from '../challenge/gameMeta'
import '../challenge/gameChallenge.css'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import type { ChartRange, StockDetailPayload } from './stockDetailTypes'
import { StockFinancialsChart } from './StockFinancialsChart'
import { StockPriceChart } from './StockPriceChart'
import { displayTickerLabel } from './displayTicker'
import type { StockLocationState } from './navigateToStock'
import { readActiveGameSlug, rememberActiveGameSlug } from '../user/activeGameSlug'
import { useStockBars } from './useStockBars'
import { useStockDetail } from './useStockDetail'
import { useFollowStatus } from './useFollowStatus'
import { StockBuySheet } from './StockBuySheet'
import { StockOrderReceivedSheet } from './StockOrderReceivedSheet'
import { StockReviewOrder } from './StockReviewOrder'
import { StockSellSheet } from './StockSellSheet'
import { StockSellReview } from './StockSellReview'
import { TradeActionSheet } from './TradeActionSheet'
import { useJoinedGamesForTrade, type JoinedGameForTrade } from './useJoinedGamesForTrade'
import { useStockPosition } from './useStockPosition'
import { postTradeComplete } from './completeGameTrade'
import type { CompletedTradeSnapshot, TradeOrderDraft } from './tradeOrderTypes'
import { ApiImage } from '../components/ApiImage'
import './stockDetail.css'

const ABOUT_PREVIEW = 280

function parseTradeAmount(raw: string): number | null {
  const t = raw.trim()
  if (!t || t === '.') return null
  const n = parseFloat(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

function pickKeyStatValue(rows: { label: string; value: string }[], re: RegExp): string {
  const hit = rows.find((r) => re.test(r.label))
  return hit?.value ?? '—'
}

function buildCompletedTradeSnapshot(
  draft: TradeOrderDraft,
  detail: StockDetailPayload,
  /** When snapshot last price is missing, use last chart close (same source users see on the chart). */
  fillPriceOverride: number | null | undefined,
  /** Resolved competition title from the live `/api/me/games` list. */
  resolvedGameTitle: string,
): CompletedTradeSnapshot | null {
  const lpRaw = fillPriceOverride != null && Number.isFinite(fillPriceOverride) && fillPriceOverride > 0
    ? fillPriceOverride
    : detail.lastPrice
  const lp = lpRaw != null && Number.isFinite(lpRaw) && lpRaw > 0 ? lpRaw : null
  if (lp == null) return null
  const amt = parseTradeAmount(draft.rawAmount)
  if (amt == null) return null
  let shares: number
  let orderTotal: number
  if (draft.quantityMode === 'shares') {
    shares = amt
    orderTotal = amt * lp
  } else {
    orderTotal = amt
    shares = amt / lp
  }
  const statRows = [...detail.keyStatsPage1, ...detail.keyStatsPage2]
  const marketCapLabel = pickKeyStatValue(statRows, /market.*cap|cap.*market|mkt cap/i)
  const revenueLabel = pickKeyStatValue(statRows, /revenue/i)
  return {
    draft,
    apiTicker: detail.ticker,
    displayTicker: displayTickerLabel(detail.ticker),
    companyName: detail.name,
    shares,
    fillPrice: lp,
    orderTotal,
    changePctLabel: detail.changeTodayLabel,
    marketCapLabel,
    revenueLabel,
    gameTitle: resolvedGameTitle,
    iconUrl: detail.iconUrl,
  }
}

/** Lookup helper — returns the real title for `slug` from the live list, falling
 * back to the static `gameMeta` mapping for unknown / legacy slugs so the Order
 * Received sheet never shows a raw slug. */
function resolveGameTitle(slug: string, games: JoinedGameForTrade[]): string {
  const hit = games.find((g) => g.slug === slug)
  if (hit && hit.title.trim().length > 0) return hit.title
  return gameTitle(slugToVariant(slug))
}

export function StockDetailScreen() {
  const { ticker: rawTicker } = useParams<{ ticker: string }>()
  const ticker = rawTicker ? decodeURIComponent(rawTicker).toUpperCase() : ''
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as StockLocationState
  const effectiveGameSlug = useMemo(
    () => state.gameSlug ?? readActiveGameSlug() ?? GAME_SLUG.nov2024,
    [state.gameSlug],
  )

  const chromeStyle = useGameChromeCssVars(effectiveGameSlug)
  const gameShell = useGameChallengeHeader(effectiveGameSlug)

  const { data, status, error } = useStockDetail(ticker || undefined)
  const { following, toggle } = useFollowStatus(ticker || undefined, effectiveGameSlug || undefined)
  const [range, setRange] = useState<ChartRange>('1D')
  const { bars, status: barStatus, error: barErr } = useStockBars(ticker || undefined, range)
  const effectiveLastPrice = useMemo(() => {
    const lp = data?.lastPrice
    if (lp != null && Number.isFinite(lp) && lp > 0) return lp
    if (bars.length) {
      const c = bars[bars.length - 1]?.c
      if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c
    }
    return null
  }, [data?.lastPrice, bars])
  const [statsPage, setStatsPage] = useState(0)
  const [finMode, setFinMode] = useState<'annual' | 'quarterly'>('annual')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [pendingRestoreDraft, setPendingRestoreDraft] = useState<TradeOrderDraft | null>(null)
  const [activeOrderDraft, setActiveOrderDraft] = useState<TradeOrderDraft | null>(null)
  const [orderReceivedOpen, setOrderReceivedOpen] = useState(false)
  const [completedTrade, setCompletedTrade] = useState<CompletedTradeSnapshot | null>(null)
  const [placeOrderError, setPlaceOrderError] = useState<string | null>(null)
  const [placeOrderBusy, setPlaceOrderBusy] = useState(false)
  // Sync ref so a double-click can't slip past the busy state before React re-renders.
  const placeOrderInFlightRef = useRef(false)

  /* Sell flow — separate state so back/forth between sell/review never collides with the buy flow. */
  const [tradeActionOpen, setTradeActionOpen] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)
  const [sellReviewOpen, setSellReviewOpen] = useState(false)
  const [pendingSellRestoreDraft, setPendingSellRestoreDraft] = useState<TradeOrderDraft | null>(null)
  const [activeSellDraft, setActiveSellDraft] = useState<TradeOrderDraft | null>(null)
  const [placeSaleError, setPlaceSaleError] = useState<string | null>(null)
  const [placeSaleBusy, setPlaceSaleBusy] = useState(false)
  const placeSaleInFlightRef = useRef(false)

  const apiTickerForLookup = data?.ticker ?? (ticker || undefined)
  const { position, reload: reloadPosition } = useStockPosition(effectiveGameSlug, apiTickerForLookup)
  const ownedShares = position?.shares ?? 0
  const avgCost = position?.avgCost ?? 0
  const hasPosition = ownedShares > 1e-8

  /* Live list of competitions the viewer is in — drives the buy/sell dropdowns.
   * Fetched whenever any trade-related surface is open so the list is always
   * fresh; the back-end (`/api/me/games`) is the source of truth per player. */
  const tradeSurfaceOpen =
    buyOpen || reviewOpen || tradeActionOpen || sellOpen || sellReviewOpen
  const { games: joinedGames, status: joinedGamesStatus } = useJoinedGamesForTrade(tradeSurfaceOpen)
  const joinedGamesLoading = joinedGamesStatus === 'loading'

  /* Always include the current game first so the dropdown is never empty during
   * the initial fetch, even on a fresh navigation. Deduplicates by slug. */
  const tradeGames = useMemo<JoinedGameForTrade[]>(() => {
    const merged: JoinedGameForTrade[] = []
    const seen = new Set<string>()
    if (effectiveGameSlug) {
      merged.push({ slug: effectiveGameSlug, title: resolveGameTitle(effectiveGameSlug, joinedGames) })
      seen.add(effectiveGameSlug)
    }
    for (const g of joinedGames) {
      if (seen.has(g.slug)) continue
      merged.push(g)
      seen.add(g.slug)
    }
    return merged
  }, [effectiveGameSlug, joinedGames])

  /* Mirror the sell sheet's dropdown selection so we can fetch ownedShares /
   * avgCost for the GAME THE USER ACTUALLY PICKED — not just the screen's game.
   * Reset when the sell flow closes so the secondary fetch goes idle. */
  const [sellSheetGameSlug, setSellSheetGameSlug] = useState<string | null>(null)
  useEffect(() => {
    if (sellOpen || sellReviewOpen) {
      setSellSheetGameSlug((prev) => prev ?? effectiveGameSlug)
    } else {
      setSellSheetGameSlug(null)
    }
  }, [sellOpen, sellReviewOpen, effectiveGameSlug])

  const sellPositionGameSlug =
    sellSheetGameSlug && sellSheetGameSlug !== effectiveGameSlug ? sellSheetGameSlug : undefined
  const { position: sellSheetPositionRaw } = useStockPosition(
    sellPositionGameSlug,
    sellPositionGameSlug ? apiTickerForLookup : undefined,
  )
  const sellSheetOwnedShares = sellPositionGameSlug
    ? sellSheetPositionRaw?.shares ?? 0
    : ownedShares
  const sellSheetAvgCost = sellPositionGameSlug
    ? sellSheetPositionRaw?.avgCost ?? 0
    : avgCost

  const challengeTitle =
    state.challengeTitle ?? gameTitle(slugToVariant(effectiveGameSlug)).toUpperCase()

  const handleReviewOrder = useCallback((d: TradeOrderDraft) => {
    setActiveOrderDraft(d)
    setBuyOpen(false)
    setReviewOpen(true)
    setPlaceOrderError(null)
  }, [])

  const handleRestoreDraftConsumed = useCallback(() => {
    setPendingRestoreDraft(null)
  }, [])

  const handleExitReview = useCallback(() => {
    setPendingRestoreDraft(activeOrderDraft)
    setReviewOpen(false)
    setBuyOpen(true)
    setPlaceOrderError(null)
    setPlaceOrderBusy(false)
  }, [activeOrderDraft])

  const handlePlaceOrderFromReview = useCallback(
    async (draft: TradeOrderDraft) => {
      if (placeOrderInFlightRef.current) return
      if (!data) {
        setPlaceOrderError('Stock data is not ready yet. Please wait and try again.')
        return
      }
      const snap = buildCompletedTradeSnapshot(
        draft,
        data,
        effectiveLastPrice,
        resolveGameTitle(draft.gameSlug, joinedGames),
      )
      if (!snap) {
        setPlaceOrderError('Could not price this order. Wait for a live quote, then try again.')
        return
      }
      placeOrderInFlightRef.current = true
      setPlaceOrderError(null)
      setPlaceOrderBusy(true)
      try {
        const result = await postTradeComplete(snap, '')
        if (result.ok === false) {
          setPlaceOrderError(result.error)
          return
        }
        rememberActiveGameSlug(snap.draft.gameSlug)
        window.dispatchEvent(
          new CustomEvent('simvest:holdings-refresh', { detail: { gameSlug: snap.draft.gameSlug } }),
        )
        window.dispatchEvent(
          new CustomEvent('simvest:activity-refresh', { detail: { gameSlug: snap.draft.gameSlug } }),
        )
        setCompletedTrade({ ...snap, postId: result.postId })
        setActiveOrderDraft(null)
        setPendingRestoreDraft(null)
        setPlaceOrderError(null)
        setReviewOpen(false)
        setOrderReceivedOpen(true)
      } catch (err) {
        setPlaceOrderError(
          err instanceof Error ? err.message : 'Something went wrong. Check your connection and try again.',
        )
      } finally {
        placeOrderInFlightRef.current = false
        setPlaceOrderBusy(false)
      }
    },
    [data, effectiveLastPrice, joinedGames],
  )

  const handleTradeFlowFinished = useCallback(
    (gameSlug: string) => {
      setOrderReceivedOpen(false)
      setCompletedTrade(null)
      reloadPosition()
      navigate(`/g/${gameSlug}`)
    },
    [navigate, reloadPosition],
  )

  /* --- Sell flow handlers (mirror of buy flow above) --- */

  const openTradeMenu = useCallback(() => {
    setTradeActionOpen(true)
  }, [])

  const handleActionSheetSell = useCallback(() => {
    setTradeActionOpen(false)
    setPendingSellRestoreDraft(null)
    setSellOpen(true)
  }, [])

  const handleActionSheetBuy = useCallback(() => {
    setTradeActionOpen(false)
    setPendingRestoreDraft(null)
    setBuyOpen(true)
  }, [])

  const handleReviewSale = useCallback((d: TradeOrderDraft) => {
    setActiveSellDraft(d)
    setSellOpen(false)
    setSellReviewOpen(true)
    setPlaceSaleError(null)
  }, [])

  const handleSellRestoreDraftConsumed = useCallback(() => {
    setPendingSellRestoreDraft(null)
  }, [])

  const handleExitSellReview = useCallback(() => {
    setPendingSellRestoreDraft(activeSellDraft)
    setSellReviewOpen(false)
    setSellOpen(true)
    setPlaceSaleError(null)
    setPlaceSaleBusy(false)
  }, [activeSellDraft])

  const handleConfirmSale = useCallback(
    async (draft: TradeOrderDraft) => {
      if (placeSaleInFlightRef.current) return
      if (!data) {
        setPlaceSaleError('Stock data is not ready yet. Please wait and try again.')
        return
      }
      const snap = buildCompletedTradeSnapshot(
        draft,
        data,
        effectiveLastPrice,
        resolveGameTitle(draft.gameSlug, joinedGames),
      )
      if (!snap) {
        setPlaceSaleError('Could not price this sale. Wait for a live quote, then try again.')
        return
      }
      /* Use the live ownedShares for the SELECTED game (sellSheetOwnedShares
       * follows the dropdown), not just the screen's game. Prevents the
       * "you don't own that" guard from being wrong when the user switched
       * competitions mid-flow. */
      const ownedForSelected =
        draft.gameSlug === effectiveGameSlug ? ownedShares : sellSheetOwnedShares
      if (snap.shares > ownedForSelected + 1e-8) {
        setPlaceSaleError(`You only own ${ownedForSelected} shares of ${snap.displayTicker} in that competition.`)
        return
      }
      placeSaleInFlightRef.current = true
      setPlaceSaleError(null)
      setPlaceSaleBusy(true)
      try {
        const result = await postTradeComplete(snap, '')
        if (result.ok === false) {
          setPlaceSaleError(result.error)
          return
        }
        rememberActiveGameSlug(snap.draft.gameSlug)
        window.dispatchEvent(
          new CustomEvent('simvest:holdings-refresh', { detail: { gameSlug: snap.draft.gameSlug } }),
        )
        window.dispatchEvent(
          new CustomEvent('simvest:activity-refresh', { detail: { gameSlug: snap.draft.gameSlug } }),
        )
        // Use the backend's authoritative FIFO cost basis when present (covers split lots).
        const fallbackCostBasis = avgCost > 0 ? snap.shares * avgCost : null
        const costBasisExact =
          typeof result.costBasis === 'number' && Number.isFinite(result.costBasis) && result.costBasis > 0
            ? result.costBasis
            : fallbackCostBasis
        const realizedPnlDollars =
          typeof result.realizedPnlDollars === 'number' && Number.isFinite(result.realizedPnlDollars)
            ? result.realizedPnlDollars
            : costBasisExact != null
              ? snap.orderTotal - costBasisExact
              : null
        const realizedPnlPct =
          typeof result.realizedPnlPct === 'number' && Number.isFinite(result.realizedPnlPct)
            ? result.realizedPnlPct
            : costBasisExact != null && costBasisExact > 0
              ? ((snap.orderTotal - costBasisExact) / costBasisExact) * 100
              : null
        setCompletedTrade({
          ...snap,
          postId: result.postId,
          ...(costBasisExact != null ? { costBasis: costBasisExact } : {}),
          ...(realizedPnlDollars != null ? { realizedPnlDollars } : {}),
          ...(realizedPnlPct != null ? { realizedPnlPct } : {}),
        })
        setActiveSellDraft(null)
        setPendingSellRestoreDraft(null)
        setPlaceSaleError(null)
        setSellReviewOpen(false)
        setOrderReceivedOpen(true)
      } catch (err) {
        setPlaceSaleError(
          err instanceof Error ? err.message : 'Something went wrong. Check your connection and try again.',
        )
      } finally {
        placeSaleInFlightRef.current = false
        setPlaceSaleBusy(false)
      }
    },
    [data, effectiveLastPrice, ownedShares, avgCost, joinedGames, sellSheetOwnedShares, effectiveGameSlug],
  )

  const goBack = useCallback(() => {
    if (state.returnPath) {
      navigate(state.returnPath)
      return
    }
    navigate(`/g/${effectiveGameSlug}`)
  }, [navigate, effectiveGameSlug, state.returnPath])

  const aboutText = data?.description ?? ''
  const aboutShort = useMemo(() => {
    if (aboutOpen || aboutText.length <= ABOUT_PREVIEW) return aboutText
    return `${aboutText.slice(0, ABOUT_PREVIEW).trim()}…`
  }, [aboutText, aboutOpen])

  const statsRows = statsPage === 0 ? data?.keyStatsPage1 ?? [] : data?.keyStatsPage2 ?? []

  const navTab = state.navTab ?? 'perform'

  if (!ticker) {
    return (
      <div className="sd-root" style={chromeStyle}>
        <div className="sd-phone">
          <p className="sd-err">Missing ticker.</p>
        </div>
      </div>
    )
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="sd-root" style={chromeStyle}>
        <div className="sd-phone">
          <header className="sd-headerBand">
            <button type="button" className="sd-back" aria-label="Back" onClick={goBack}>
              <img src={a.back} alt="" />
            </button>
            <button
              type="button"
              className="sd-menu"
              aria-label="Stocks you follow"
              onClick={() => {
                navigate(`/g/${effectiveGameSlug}/following`)
              }}
            >
              <img src={a.ellipsisHeader} alt="" />
            </button>
            <h1 className="sd-challengeTitle">{challengeTitle}</h1>
          </header>
          <div className="sd-phoneBody">
            <div className="sd-scroll">
              <p className="sd-load">Loading {ticker}…</p>
            </div>
            <ChallengeBottomNav gameSlug={effectiveGameSlug} active={navTab} tradeLocked={gameShell.gameHasEnded} />
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error' || !data) {
    return (
      <div className="sd-root" style={chromeStyle}>
        <div className="sd-phone">
          <header className="sd-headerBand">
            <button type="button" className="sd-back" aria-label="Back" onClick={goBack}>
              <img src={a.back} alt="" />
            </button>
            <button
              type="button"
              className="sd-menu"
              aria-label="Stocks you follow"
              onClick={() => {
                navigate(`/g/${effectiveGameSlug}/following`)
              }}
            >
              <img src={a.ellipsisHeader} alt="" />
            </button>
            <h1 className="sd-challengeTitle">{challengeTitle}</h1>
          </header>
          <div className="sd-phoneBody">
            <div className="sd-scroll">
              <p className="sd-err">{error ?? 'Could not load this symbol.'}</p>
            </div>
            <ChallengeBottomNav gameSlug={effectiveGameSlug} active={navTab} tradeLocked={gameShell.gameHasEnded} />
          </div>
        </div>
      </div>
    )
  }

  const ch = data.changeTodayPct
  const chClass =
    ch == null ? '' : ch >= 0 ? ' sd-change--up' : ' sd-change--down'

  return (
    <div className="sd-root" style={chromeStyle}>
      <div className="sd-phone">
        <header className="sd-headerBand">
          <button type="button" className="sd-back" aria-label="Back" onClick={goBack}>
            <img src={a.back} alt="" />
          </button>
          <button
            type="button"
            className="sd-menu"
            aria-label="Stocks you follow"
            onClick={() => {
              navigate(`/g/${effectiveGameSlug}/following`)
            }}
          >
            <img src={a.ellipsisHeader} alt="" />
          </button>
          <h1 className="sd-challengeTitle">{challengeTitle}</h1>
        </header>

        <div className="sd-phoneBody">
        <div className="sd-scroll">
          <div className="sd-hero">
            <ApiImage className="sd-heroIcon" src={data.iconUrl} alt="" width={52} height={52} />
            <div className="sd-heroText">
              <p className="sd-ticker">{displayTickerLabel(data.ticker)}</p>
              <p className="sd-coName">{data.name}</p>
            </div>
          </div>

          <div className="sd-priceRow">
            <span className="sd-lastPrice">{data.lastPriceLabel}</span>
            <span className={`sd-change${chClass}`}>{data.changeTodayLabel}</span>
          </div>

          <StockPriceChart
            bars={bars}
            range={range}
            onRangeChange={setRange}
            loading={barStatus === 'loading'}
            error={barErr}
          />

          <div className="sd-actionRow">
            <button
              type="button"
              className={`sd-actionFollow${following ? ' sd-actionFollow--on' : ''}`}
              onClick={() => void toggle()}
              aria-pressed={following}
            >
              {following ? (
                <>
                  <span className="sd-actionFollowFollowingText">Following</span>
                  <svg className="sd-actionFollowCheck" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </>
              ) : (
                <span className="sd-actionFollowGradient">Follow</span>
              )}
            </button>
            <button
              type="button"
              className="sd-actionBuy"
              onClick={() => {
                if (hasPosition) {
                  openTradeMenu()
                } else {
                  setPendingRestoreDraft(null)
                  setBuyOpen(true)
                }
              }}
            >
              {hasPosition ? 'TRADE' : 'BUY'}
            </button>
          </div>

          <section className="sd-about">
            <h2 className="sd-aboutTitle">About</h2>
            <p className="sd-aboutBody">{aboutShort}</p>
            {aboutText.length > ABOUT_PREVIEW ? (
              <button type="button" className="sd-readMore" onClick={() => setAboutOpen((v) => !v)}>
                {aboutOpen ? 'Show less' : 'Read More'}
              </button>
            ) : null}
            <div className="sd-grid2">
              <div>
                <div className="sd-kvLab">CEO</div>
                <div className="sd-kvVal">{data.about.ceo}</div>
              </div>
              <div>
                <div className="sd-kvLab">Founded</div>
                <div className="sd-kvVal">{data.about.founded}</div>
              </div>
              <div>
                <div className="sd-kvLab">Employees</div>
                <div className="sd-kvVal">{data.about.employees}</div>
              </div>
              <div>
                <div className="sd-kvLab">Headquarters</div>
                <div className="sd-kvVal">{data.about.headquarters}</div>
              </div>
            </div>
          </section>

          <section className="sd-statCard" aria-label="Key statistics">
            <h2 className="sd-statTitle">Key Stats</h2>
            {statsRows.map((row) => (
              <div key={row.label} className="sd-statRow">
                <span className="sd-statLab">{row.label}</span>
                <span className="sd-statVal">{row.value}</span>
              </div>
            ))}
            <div className="sd-dots">
              <button
                type="button"
                className={`sd-dotBtn${statsPage === 0 ? ' sd-dotBtn--on' : ''}`}
                aria-label="Key stats page 1"
                aria-current={statsPage === 0}
                onClick={() => setStatsPage(0)}
              />
              <button
                type="button"
                className={`sd-dotBtn${statsPage === 1 ? ' sd-dotBtn--on' : ''}`}
                aria-label="Key stats page 2"
                aria-current={statsPage === 1}
                onClick={() => setStatsPage(1)}
              />
            </div>
          </section>

          <StockFinancialsChart
            mode={finMode}
            onModeChange={setFinMode}
            annual={data.financialsAnnual}
            quarterly={data.financialsQuarterly}
            epsAnnual={data.financialsEpsAnnual ?? []}
            epsQuarterly={data.financialsEpsQuarterly ?? []}
          />

          <p className="sd-meta">Market data from Massive. Updated {new Date(data.updatedAt).toLocaleString()}</p>
        </div>

        <ChallengeBottomNav gameSlug={effectiveGameSlug} active={navTab} tradeLocked={gameShell.gameHasEnded} />
        </div>

        <StockBuySheet
          open={buyOpen}
          onClose={() => setBuyOpen(false)}
          displayTicker={displayTickerLabel(data.ticker)}
          lastPrice={effectiveLastPrice}
          lastPriceLabel={data.lastPriceLabel}
          defaultGameSlug={effectiveGameSlug}
          games={tradeGames}
          gamesLoading={joinedGamesLoading}
          restoreDraft={pendingRestoreDraft}
          onRestoreDraftConsumed={handleRestoreDraftConsumed}
          onReviewOrder={handleReviewOrder}
        />

        <StockReviewOrder
          open={reviewOpen}
          onClose={handleExitReview}
          onPlaceOrder={handlePlaceOrderFromReview}
          draft={activeOrderDraft}
          displayTicker={displayTickerLabel(data.ticker)}
          companyName={data.name}
          iconUrl={data.iconUrl}
          lastPrice={effectiveLastPrice}
          games={tradeGames}
          placementError={placeOrderError}
          placementBusy={placeOrderBusy}
        />

        <StockOrderReceivedSheet
          open={orderReceivedOpen}
          trade={completedTrade}
          onFinished={handleTradeFlowFinished}
        />

        <TradeActionSheet
          open={tradeActionOpen}
          onClose={() => setTradeActionOpen(false)}
          onSell={handleActionSheetSell}
          onBuy={handleActionSheetBuy}
        />

        <StockSellSheet
          open={sellOpen}
          onClose={() => setSellOpen(false)}
          displayTicker={displayTickerLabel(data.ticker)}
          lastPrice={effectiveLastPrice}
          lastPriceLabel={data.lastPriceLabel}
          defaultGameSlug={effectiveGameSlug}
          ownedShares={sellSheetOwnedShares}
          avgCost={sellSheetAvgCost}
          games={tradeGames}
          gamesLoading={joinedGamesLoading}
          onGameSlugChange={setSellSheetGameSlug}
          restoreDraft={pendingSellRestoreDraft}
          onRestoreDraftConsumed={handleSellRestoreDraftConsumed}
          onReviewSale={handleReviewSale}
        />

        <StockSellReview
          open={sellReviewOpen}
          onClose={handleExitSellReview}
          onConfirmSale={handleConfirmSale}
          draft={activeSellDraft}
          displayTicker={displayTickerLabel(data.ticker)}
          companyName={data.name}
          iconUrl={data.iconUrl}
          lastPrice={effectiveLastPrice}
          avgCost={sellSheetAvgCost}
          ownedShares={sellSheetOwnedShares}
          games={tradeGames}
          placementError={placeSaleError}
          placementBusy={placeSaleBusy}
        />
      </div>
    </div>
  )
}
