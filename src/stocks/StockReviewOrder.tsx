import { useEffect, useMemo } from 'react'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { StockBrandingImage } from '../components/StockBrandingImage'
import type { JoinedGameForTrade } from './useJoinedGamesForTrade'
import type { TradeOrderDraft } from './tradeOrderTypes'
import './stockReviewOrder.css'

export type StockReviewOrderProps = {
  open: boolean
  onClose: () => void
  onPlaceOrder?: (draft: TradeOrderDraft) => void
  draft: TradeOrderDraft | null
  displayTicker: string
  companyName: string
  iconUrl: string
  /** Live last trade price from Massive (via /api/stocks/:ticker). */
  lastPrice: number | null
  /** Live competitions the viewer is in — used to resolve the game's display title. */
  games: JoinedGameForTrade[]
  /** Shown when Place Order fails (network, rules, server). */
  placementError?: string | null
  /** Disables Place Order and shows loading label while the complete request runs. */
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

export function StockReviewOrder({
  open,
  onClose,
  onPlaceOrder,
  draft,
  displayTicker,
  companyName,
  iconUrl,
  lastPrice,
  games,
  placementError,
  placementBusy = false,
}: StockReviewOrderProps) {
  const parsedAmount = useMemo(() => {
    if (!draft) return null
    const t = draft.rawAmount.trim()
    if (!t || t === '.') return null
    const n = parseFloat(t)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [draft])

  const totalUsd = useMemo(() => {
    if (lastPrice == null || lastPrice <= 0 || parsedAmount == null || !draft) return null
    if (draft.quantityMode === 'shares') return parsedAmount * lastPrice
    return parsedAmount
  }, [draft, lastPrice, parsedAmount])

  const headline = useMemo(() => {
    if (!draft || totalUsd == null || !Number.isFinite(totalUsd)) return ''
    const usd = formatUsd(totalUsd)
    if (draft.action === 'buy') {
      if (draft.quantityMode === 'dollars') return `Buying ${usd} at market`
      if (parsedAmount != null) return `Buying ${formatQtyShares(parsedAmount)} shares at market`
      return ''
    }
    if (draft.quantityMode === 'dollars') return `Selling ${usd} at market`
    if (parsedAmount != null) return `Selling ${formatQtyShares(parsedAmount)} shares at market`
    return ''
  }, [draft, parsedAmount, totalUsd])

  const gameTitle = useMemo(() => {
    if (!draft) return ''
    const g = games.find((x) => x.slug === draft.gameSlug)
    return g?.title ?? draft.gameSlug
  }, [draft, games])

  const qtyDisplay = useMemo(() => {
    if (!draft || parsedAmount == null) return '—'
    if (draft.quantityMode === 'dollars') return formatUsd(parsedAmount)
    return formatQtyShares(parsedAmount)
  }, [draft, parsedAmount])

  const orderValueLabel = useMemo(() => {
    if (totalUsd == null || !Number.isFinite(totalUsd)) return '$---.--'
    return formatUsd(totalUsd)
  }, [totalUsd])

  const canPlace = totalUsd != null && Number.isFinite(totalUsd) && parsedAmount != null && lastPrice != null && lastPrice > 0

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

  const actionWord = draft.action === 'buy' ? 'Buy' : 'Sell'
  const qtyTypeWord = draft.quantityMode === 'dollars' ? 'Dollars' : 'Shares'

  return (
    <div className="rv-overlay" role="presentation" onClick={onClose}>
      <div
        className="rv-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rv-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rv-topBar">
          <button type="button" className="rv-back" aria-label="Back" onClick={onClose}>
            <img src={a.back} alt="" />
          </button>
          <h2 className="rv-title" id="rv-sheet-title">
            Review Order
          </h2>
          <span className="rv-topSpacer" aria-hidden />
        </div>
        <div className="rv-rule" aria-hidden />

        <div className="rv-scroll">
          <div className="rv-heroCard">
            <StockBrandingImage className="rv-logo" src={iconUrl} alt="" width={72} height={72} />
            <p className="rv-coName">{companyName}</p>
            <p className="rv-tickerHuge">{displayTicker}</p>
            <p
              className={`rv-headline${draft.action === 'buy' ? ' rv-headline--buy' : ' rv-headline--sell'}`}
              aria-live="polite"
            >
              {headline || '—'}
            </p>
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
                <span className="rv-rowVal">{actionWord}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Quantity Type</span>
                <span className="rv-rowVal">{qtyTypeWord}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Quantity</span>
                <span className="rv-rowVal">{qtyDisplay}</span>
              </div>
              <div className="rv-row">
                <span className="rv-rowLab">Order Value</span>
                <span className="rv-rowVal">{orderValueLabel}</span>
              </div>
            </div>
          </div>

          <div className="rv-footerBand">
            <div className="rv-totalRow">
              <span className="rv-totalLab">Total Value</span>
              <span className="rv-totalVal">{orderValueLabel}</span>
            </div>
            <div className="rv-placeRow">
              <button
                type="button"
                className="rv-placeBtn"
                disabled={!canPlace || placementBusy}
                onClick={() => {
                  if (!canPlace || placementBusy || !draft) return
                  onPlaceOrder?.(draft)
                }}
              >
                <span className="rv-placeBtnInner">{placementBusy ? 'Placing order…' : 'Place Order'}</span>
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
