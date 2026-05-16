import { type ChangeEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { challengeAssets as a } from '../challenge/challengeAssets'
import type { JoinedGameForTrade } from './useJoinedGamesForTrade'
import type { TradeOrderDraft } from './tradeOrderTypes'
import { sanitizeTradeQtyInput } from './tradeQtyInput'
import { useStockPosition } from './useStockPosition'
import './stockBuySheet.css'

/** Matches server `DEFAULT_STARTING_CASH` before the first trade persists a ledger row. */
const STARTING_CASH_USD = 100_000

type QuantityMode = 'shares' | 'dollars'
type ActionMode = 'buy' | 'sell'

export type StockBuySheetProps = {
  open: boolean
  onClose: () => void
  displayTicker: string
  lastPrice: number | null
  lastPriceLabel: string
  defaultGameSlug?: string
  /** Live competitions the viewer is currently in — populates the dropdown. */
  games: JoinedGameForTrade[]
  /** True while `games` is being fetched; the dropdown shows a loading label. */
  gamesLoading?: boolean
  /** Notifies the parent when the user picks a different competition. */
  onGameSlugChange?: (gameSlug: string) => void
  /** When set on open (e.g. back from Review Order), hydrate fields after close-reset. */
  restoreDraft?: TradeOrderDraft | null
  onRestoreDraftConsumed?: () => void
  onReviewOrder?: (draft: TradeOrderDraft) => void
}

function formatUsdTotal(n: number): string {
  if (!Number.isFinite(n)) return '$---.--'
  const abs = Math.abs(n)
  if (abs > 0 && abs < 0.01) return `$${n.toExponential(2)}`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function truncateTitle(s: string, max = 17): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

/** Shares implied by a dollar notional ÷ market price (fractional allowed). */
function formatImpliedShares(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1e12) return n.toExponential(2)
  if (n < 1e-6) return n.toExponential(2)
  const rounded = Math.round(n * 1e8) / 1e8
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 8, minimumFractionDigits: 0 })
}

function resolveInitialGameSlug(
  defaultGameSlug: string | undefined,
  games: JoinedGameForTrade[],
): string {
  if (defaultGameSlug && defaultGameSlug.length > 0) return defaultGameSlug
  if (games.length > 0) return games[0]!.slug
  return ''
}

export function StockBuySheet({
  open,
  onClose,
  displayTicker,
  lastPrice,
  lastPriceLabel,
  defaultGameSlug,
  games,
  gamesLoading = false,
  onGameSlugChange,
  restoreDraft,
  onRestoreDraftConsumed,
  onReviewOrder,
}: StockBuySheetProps) {
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('shares')
  const [action, setAction] = useState<ActionMode>('buy')
  const [gameSlug, setGameSlug] = useState(() => resolveInitialGameSlug(defaultGameSlug, games))
  const [rawAmount, setRawAmount] = useState('')
  const [ddOpen, setDdOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true
      if (restoreDraft) {
        setQuantityMode(restoreDraft.quantityMode)
        setAction(restoreDraft.action)
        setGameSlug(restoreDraft.gameSlug)
        setRawAmount(restoreDraft.rawAmount)
        onRestoreDraftConsumed?.()
      } else {
        setQuantityMode('shares')
        setAction('buy')
        setGameSlug(resolveInitialGameSlug(defaultGameSlug, games))
        setRawAmount('')
      }
      setDdOpen(false)
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false
      setRawAmount('')
      setQuantityMode('shares')
      setAction('buy')
      setGameSlug(resolveInitialGameSlug(defaultGameSlug, games))
      setDdOpen(false)
    }
  }, [open, restoreDraft, defaultGameSlug, games, onRestoreDraftConsumed])

  /* If the live list of games loads after the sheet opens and the current
   * selection isn't a real game the user is in, snap to the first valid game
   * so the dropdown never shows a stale or non-existent competition. */
  useEffect(() => {
    if (!open) return
    if (games.length === 0) return
    if (games.some((g) => g.slug === gameSlug)) return
    setGameSlug(games[0]!.slug)
  }, [open, games, gameSlug])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!ddOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!ddRef.current?.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [ddOpen])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const { position: ledgerPosition } = useStockPosition(
    open && gameSlug.length > 0 ? gameSlug : undefined,
    open ? displayTicker : undefined,
  )

  const availableToTradeUsd = useMemo(() => {
    if (ledgerPosition && Number.isFinite(ledgerPosition.cashAvailable)) {
      return Math.max(0, ledgerPosition.cashAvailable)
    }
    return STARTING_CASH_USD
  }, [ledgerPosition])

  const parsedAmount = useMemo(() => {
    const t = rawAmount.trim()
    if (!t || t === '.') return null
    const n = parseFloat(t)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [rawAmount])

  const totalNumber = useMemo(() => {
    if (lastPrice == null || lastPrice <= 0 || parsedAmount == null) return null
    if (quantityMode === 'shares') {
      return parsedAmount * lastPrice
    }
    return parsedAmount
  }, [lastPrice, parsedAmount, quantityMode])

  const exceedsBuyingPower =
    action === 'buy' &&
    totalNumber != null &&
    Number.isFinite(totalNumber) &&
    totalNumber > availableToTradeUsd + 1e-9

  const totalLabel = useMemo(() => {
    if (totalNumber == null || !Number.isFinite(totalNumber)) return '$---.--'
    return formatUsdTotal(totalNumber)
  }, [totalNumber])

  const impliedSharesFromDollars = useMemo(() => {
    if (quantityMode !== 'dollars' || parsedAmount == null || lastPrice == null || lastPrice <= 0) return null
    return parsedAmount / lastPrice
  }, [quantityMode, parsedAmount, lastPrice])

  const canReview =
    parsedAmount != null &&
    lastPrice != null &&
    lastPrice > 0 &&
    !exceedsBuyingPower &&
    gameSlug.length > 0 &&
    games.some((g) => g.slug === gameSlug) &&
    (quantityMode === 'shares' || quantityMode === 'dollars')

  const handleQtyChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setRawAmount(sanitizeTradeQtyInput(e.target.value))
  }, [])

  const selectedGameTitle = useMemo(() => {
    const hit = games.find((g) => g.slug === gameSlug)
    if (hit) return hit.title
    if (gamesLoading) return 'Loading…'
    if (gameSlug) return gameSlug
    return 'No active games'
  }, [games, gameSlug, gamesLoading])

  const handlePickGame = useCallback(
    (slug: string) => {
      setGameSlug(slug)
      setDdOpen(false)
      onGameSlugChange?.(slug)
    },
    [onGameSlugChange],
  )

  const placeholder = quantityMode === 'shares' ? 'Enter Shares' : 'Enter Dollars'

  const titleLead = action === 'buy' ? 'Buy' : 'Sell'

  if (!open) return null

  return (
    <div className="bu-overlay" role="presentation" onClick={onClose}>
      <div
        className="bu-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bu-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bu-sheetInner">
          <div className="bu-topBar">
            <button type="button" className="bu-back" aria-label="Close" onClick={onClose}>
              <img src={a.back} alt="" />
            </button>
            <h2 className="bu-title" id="bu-sheet-title">
              {titleLead} {displayTicker}
            </h2>
          </div>

          <p className="bu-available">
            ${availableToTradeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            Available to Trade
          </p>

          <div className="bu-row">
            <span className="bu-rowLab">Quantity</span>
            <div className="bu-rowRight">
              <div className="bu-segTrack">
                <div className={`bu-segThumb${quantityMode === 'dollars' ? ' bu-segThumb--right' : ''}`} aria-hidden />
                <div className="bu-segBtns">
                  <button
                    type="button"
                    className={`bu-segBtn${quantityMode === 'shares' ? ' bu-segBtn--lit' : ''}`}
                    onClick={() => {
                      setQuantityMode('shares')
                      setRawAmount('')
                    }}
                  >
                    Shares
                  </button>
                  <button
                    type="button"
                    className={`bu-segBtn${quantityMode === 'dollars' ? ' bu-segBtn--lit' : ''}`}
                    onClick={() => {
                      setQuantityMode('dollars')
                      setRawAmount('')
                    }}
                  >
                    Dollars
                  </button>
                </div>
              </div>
              <label className="bu-qtyInputWrap" htmlFor="bu-stock-qty-input">
                <input
                  id="bu-stock-qty-input"
                  className="bu-qtyInput"
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={placeholder}
                  value={rawAmount}
                  aria-label={quantityMode === 'shares' ? 'Share quantity' : 'Dollar amount'}
                  onChange={handleQtyChange}
                />
                <div className="bu-qtyLine" aria-hidden />
              </label>
            </div>
          </div>

          <div className="bu-row">
            <span className="bu-rowLab">Action</span>
            <div className="bu-rowRight">
              <div className="bu-segTrack bu-segTrack--action">
                <div className={`bu-segThumb${action === 'sell' ? ' bu-segThumb--right' : ''}`} aria-hidden />
                <div className="bu-segBtns">
                  <button
                    type="button"
                    className={`bu-segBtn${action === 'buy' ? ' bu-segBtn--lit' : ''}`}
                    onClick={() => setAction('buy')}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    className={`bu-segBtn${action === 'sell' ? ' bu-segBtn--lit' : ''}`}
                    onClick={() => setAction('sell')}
                  >
                    Sell
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bu-row">
            <span className="bu-rowLab">Competition</span>
            <div className="bu-rowRight">
              <div className="bu-ddWrap" ref={ddRef}>
                <button
                  type="button"
                  className="bu-ddBtn"
                  aria-expanded={ddOpen}
                  disabled={games.length === 0}
                  onClick={() => setDdOpen((v) => !v)}
                >
                  <span className="bu-ddBtnText">{truncateTitle(selectedGameTitle)}</span>
                  <img className="bu-ddChev" src={a.chevronDown} alt="" />
                </button>
                {ddOpen && games.length > 0 ? (
                  <div className="bu-ddMenu" role="listbox">
                    {games.map((g) => (
                      <button
                        key={g.slug}
                        type="button"
                        role="option"
                        aria-selected={g.slug === gameSlug}
                        className={`bu-ddItem${g.slug === gameSlug ? ' bu-ddItem--on' : ''}`}
                        onClick={() => handlePickGame(g.slug)}
                      >
                        {g.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="bu-row">
            <span className="bu-rowLab">Market Price</span>
            <span className="bu-rowVal">{lastPrice != null ? lastPriceLabel : '—'}</span>
          </div>

          <div className="bu-row">
            <span className="bu-rowLab">Total Cost</span>
            <span className="bu-rowVal">{totalLabel}</span>
          </div>

          {quantityMode === 'dollars' && impliedSharesFromDollars != null ? (
            <p className="bu-impliedShares" aria-live="polite">
              ≈ {formatImpliedShares(impliedSharesFromDollars)} shares at this market price
            </p>
          ) : null}

          {exceedsBuyingPower ? (
            <p className="bu-caution">Total exceeds your available cash for this game.</p>
          ) : null}

          <div className="bu-reviewWrap">
            <button
              type="button"
              className="bu-reviewBtn"
              disabled={!canReview}
              onClick={() => {
                if (!canReview) return
                onReviewOrder?.({
                  quantityMode,
                  action,
                  gameSlug,
                  rawAmount,
                })
              }}
            >
              <span className="bu-reviewGradient">Review Order</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
