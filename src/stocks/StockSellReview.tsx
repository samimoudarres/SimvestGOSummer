import { useEffect, useMemo } from 'react'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { ApiImage } from '../components/ApiImage'
import type { JoinedGameForTrade } from './useJoinedGamesForTrade'
import type { TradeOrderDraft } from './tradeOrderTypes'
import './stockReviewOrder.css'
import './stockSellReview.css'

export type StockSellReviewProps = {
  open: boolean
  onClose: () => void
  onConfirmSale?: (draft: TradeOrderDraft) => void
  draft: TradeOrderDraft | null
  displayTicker: string
  companyName: string
  iconUrl: string
  /** Live last trade price from Massive (via /api/stocks/:ticker). */
  lastPrice: number | null
  /** Average entry price across the player's existing lots — used to project realized P&L. */
  avgCost: number
  ownedShares: number
  /** Live competitions the viewer is in — used to resolve the game's display title. */
  games: JoinedGameForTrade[]
  placementError?: string | null
  placementBusy?: boolean
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '$---.--'
  const abs = Math.abs(n)
  if (abs > 0 && abs < 0.01) return `$${n.toExponential(2)}`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function truncateTitle(s: string, max = 17): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function formatQtyShares(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  const rounded = Math.round(n * 1e8) / 1e8
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 8, minimumFractionDigits: 0 })
}

export function StockSellReview({
  open,
  onClose,
  onConfirmSale,
  draft,
  displayTicker,
  companyName,
  iconUrl,
  lastPrice,
  avgCost,
  ownedShares,
  games,
  placementError,
  placementBusy = false,
}: StockSellReviewProps) {
  const parsedAmount = useMemo(() => {
    if (!draft) return null
    const t = draft.rawAmount.trim()
    if (!t || t === '.') return null
    const n = parseFloat(t)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [draft])

  const sharesRequested = useMemo(() => {
    if (!draft || parsedAmount == null) return null
    if (draft.quantityMode === 'shares') return parsedAmount
    if (lastPrice == null || lastPrice <= 0) return null
    return parsedAmount / lastPrice
  }, [draft, parsedAmount, lastPrice])

  const proceedsUsd = useMemo(() => {
    if (lastPrice == null || lastPrice <= 0 || parsedAmount == null || !draft) return null
    if (draft.quantityMode === 'shares') return parsedAmount * lastPrice
    return parsedAmount
  }, [draft, lastPrice, parsedAmount])

  const realized = useMemo(() => {
    if (sharesRequested == null || avgCost <= 0 || lastPrice == null || lastPrice <= 0) return null
    const dollars = sharesRequested * (lastPrice - avgCost)
    const basis = sharesRequested * avgCost
    const pct = basis > 0 ? (dollars / basis) * 100 : 0
    return { dollars, pct, basis }
  }, [sharesRequested, avgCost, lastPrice])

  const headline = useMemo(() => {
    if (!draft || sharesRequested == null) return ''
    return `Selling ${formatQtyShares(sharesRequested)} shares at market`
  }, [draft, sharesRequested])

  const gameTitle = useMemo(() => {
    if (!draft) return ''
    const g = games.find((x) => x.slug === draft.gameSlug)
    return g?.title ?? draft.gameSlug
  }, [draft, games])

  const proceedsLabel = proceedsUsd != null ? formatUsd(proceedsUsd) : '$---.--'
  const sharesLabel = sharesRequested != null ? formatQtyShares(sharesRequested) : '—'
  const sellingAll = sharesRequested != null && Math.abs(sharesRequested - ownedShares) < 1e-6

  const canPlace =
    proceedsUsd != null &&
    Number.isFinite(proceedsUsd) &&
    sharesRequested != null &&
    sharesRequested > 0 &&
    sharesRequested <= ownedShares + 1e-8 &&
    lastPrice != null &&
    lastPrice > 0

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !draft) return null

  const qtyTypeWord = draft.quantityMode === 'dollars' ? 'Dollars' : 'Shares'

  return (
    <div className="rv-overlay" role="presentation" onClick={onClose}>
      <div
        className="rv-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssr-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rv-topBar">
          <button type="button" className="rv-back" aria-label="Back" onClick={onClose}>
            <img src={a.back} alt="" />
          </button>
          <h2 className="rv-title" id="ssr-sheet-title">
            Review Sale
          </h2>
          <span className="rv-topSpacer" aria-hidden />
        </div>
        <div className="rv-rule" aria-hidden />

        <div className="rv-scroll">
          <div className="rv-heroCard">
            <ApiImage className="rv-logo" src={iconUrl} alt="" width={72} height={72} />
            <p className="rv-coName">{companyName}</p>
            <p className="rv-tickerHuge">{displayTicker}</p>
            <p className="rv-headline rv-headline--sell" aria-live="polite">
              {headline || '—'}
            </p>
            {sellingAll ? <p className="ssr-allBadge">Selling your entire position</p> : null}
          </div>

          <div className="rv-detailsCard">
            <div className="rv-rows">
              <div className="rv-row">
                <span className="rv-rowLab">Game</span>
                <span className="rv-rowVal">{truncateTitle(gameTitle)}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Symbol</span>
                <span className="rv-rowVal">{displayTicker}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Action</span>
                <span className="rv-rowVal">Sell</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Quantity Type</span>
                <span className="rv-rowVal">{qtyTypeWord}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Shares to Sell</span>
                <span className="rv-rowVal">{sharesLabel}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Sell Price</span>
                <span className="rv-rowVal">{lastPrice != null ? formatUsd(lastPrice) : '—'}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Avg Cost</span>
                <span className="rv-rowVal">{avgCost > 0 ? formatUsd(avgCost) : '—'}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Est. Proceeds</span>
                <span className="rv-rowVal">{proceedsLabel}</span>
              </div>
              {realized != null ? (
                <div className="rv-row">
                  <span className="rv-rowLab">Est. Realized {realized.dollars >= 0 ? 'Gain' : 'Loss'}</span>
                  <span
                    className={`rv-rowVal ${realized.dollars >= 0 ? 'ssr-gain' : 'ssr-loss'}`}
                  >
                    {realized.dollars >= 0 ? '+' : '-'}
                    {formatUsd(Math.abs(realized.dollars))} ({realized.pct >= 0 ? '+' : ''}
                    {realized.pct.toFixed(2)}%)
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rv-footerBand">
            <div className="rv-totalRow">
              <span className="rv-totalLab">Estimated Cash Returned</span>
              <span className="rv-totalVal">{proceedsLabel}</span>
            </div>
            <div className="rv-placeRow">
              <button
                type="button"
                className="rv-placeBtn"
                disabled={!canPlace || placementBusy}
                onClick={() => {
                  if (!canPlace || placementBusy || !draft) return
                  onConfirmSale?.(draft)
                }}
              >
                <span className="rv-placeBtnInner">{placementBusy ? 'Confirming sale…' : 'Confirm Sale'}</span>
              </button>
            </div>
            {placementError ? (
              <p className="rv-placeErr" role="alert">
                {placementError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
