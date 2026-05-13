import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
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
import { postTradeComplete } from './completeGameTrade'
import type { CompletedTradeSnapshot, TradeOrderDraft } from './tradeOrderTypes'
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
  fillPriceOverride?: number | null,
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
    gameTitle: gameTitle(slugToVariant(draft.gameSlug)),
  }
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

  const { data, status, error } = useStockDetail(ticker || undefined)
  const { following, toggle } = useFollowStatus(ticker || undefined)
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
      if (!data) {
        setPlaceOrderError('Stock data is not ready yet. Please wait and try again.')
        return
      }
      const snap = buildCompletedTradeSnapshot(draft, data, effectiveLastPrice)
      if (!snap) {
        setPlaceOrderError('Could not price this order. Wait for a live quote, then try again.')
        return
      }
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
        setPlaceOrderBusy(false)
      }
    },
    [data, effectiveLastPrice],
  )

  const handleTradeFlowFinished = useCallback(
    (gameSlug: string) => {
      setOrderReceivedOpen(false)
      setCompletedTrade(null)
      navigate(`/g/${gameSlug}`)
    },
    [navigate],
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
            <ChallengeBottomNav gameSlug={effectiveGameSlug} active={navTab} />
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
            <ChallengeBottomNav gameSlug={effectiveGameSlug} active={navTab} />
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
            <img className="sd-heroIcon" src={data.iconUrl} alt="" width={52} height={52} />
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
                setPendingRestoreDraft(null)
                setBuyOpen(true)
              }}
            >
              BUY
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

        <ChallengeBottomNav gameSlug={effectiveGameSlug} active={navTab} />
        </div>

        <StockBuySheet
          open={buyOpen}
          onClose={() => setBuyOpen(false)}
          displayTicker={displayTickerLabel(data.ticker)}
          lastPrice={effectiveLastPrice}
          lastPriceLabel={data.lastPriceLabel}
          defaultGameSlug={effectiveGameSlug}
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
          placementError={placeOrderError}
          placementBusy={placeOrderBusy}
        />

        <StockOrderReceivedSheet
          open={orderReceivedOpen}
          trade={completedTrade}
          onFinished={handleTradeFlowFinished}
        />
      </div>
    </div>
  )
}
