import { type ChangeEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { challengeAssets as a } from '../challenge/challengeAssets'
import type { JoinedGameForTrade } from './useJoinedGamesForTrade'
import type { TradeOrderDraft } from './tradeOrderTypes'
import { sanitizeTradeQtyInput } from './tradeQtyInput'
import './stockBuySheet.css'
import './stockSellSheet.css'

type QuantityMode = 'shares' | 'dollars'

export type StockSellSheetProps = {
  open: boolean
  onClose: () => void
  displayTicker: string
  lastPrice: number | null
  lastPriceLabel: string
  defaultGameSlug: string
  /** Total shares the player currently owns of this ticker in the SELECTED game. */
  ownedShares: number
  /** Average entry price per share (cost basis ÷ owned shares) for the SELECTED game. */
  avgCost: number
  /** Live competitions the viewer is currently in — populates the dropdown. */
  games: JoinedGameForTrade[]
  /** True while `games` is being fetched; the dropdown shows a loading label. */
  gamesLoading?: boolean
  /** Notifies the parent so it can refetch ownedShares/avgCost for the new game. */
  onGameSlugChange?: (gameSlug: string) => void
  restoreDraft?: TradeOrderDraft | null
  onRestoreDraftConsumed?: () => void
  onReviewSale?: (draft: TradeOrderDraft) => void
}

function formatUsdTotal(n: number): string {
  if (!Number.isFinite(n)) return '$---.--'
  const abs = Math.abs(n)
  if (abs > 0 && abs < 0.01) return `$${n.toExponential(2)}`
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatShares(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  const rounded = Math.round(n * 1e8) / 1e8
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 8, minimumFractionDigits: 0 })
}

function truncateTitle(s: string, max = 17): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export function StockSellSheet({
  open,
  onClose,
  displayTicker,
  lastPrice,
  lastPriceLabel,
  defaultGameSlug,
  ownedShares,
  avgCost,
  games,
  gamesLoading = false,
  onGameSlugChange,
  restoreDraft,
  onRestoreDraftConsumed,
  onReviewSale,
}: StockSellSheetProps) {
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('shares')
  const [gameSlug, setGameSlug] = useState(() => defaultGameSlug)
  const [rawAmount, setRawAmount] = useState('')
  const [ddOpen, setDdOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true
      if (restoreDraft) {
        setQuantityMode(restoreDraft.quantityMode)
        setGameSlug(restoreDraft.gameSlug)
        setRawAmount(restoreDraft.rawAmount)
        onRestoreDraftConsumed?.()
      } else {
        setQuantityMode('shares')
        setGameSlug(defaultGameSlug)
        setRawAmount('')
      }
      setDdOpen(false)
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false
      setRawAmount('')
      setQuantityMode('shares')
      setGameSlug(defaultGameSlug)
      setDdOpen(false)
    }
  }, [open, restoreDraft, defaultGameSlug, onRestoreDraftConsumed])

  /* If the live games list resolves after the sheet opens and the current
   * selection isn't a competition the viewer is actually in, fall back to
   * defaultGameSlug (when valid) or the first available game. Keeps the
   * dropdown honest — no orphaned/stale competitions. */
  useEffect(() => {
    if (!open) return
    if (games.length === 0) return
    if (games.some((g) => g.slug === gameSlug)) return
    const next = games.some((g) => g.slug === defaultGameSlug) ? defaultGameSlug : games[0]!.slug
    setGameSlug(next)
    onGameSlugChange?.(next)
  }, [open, games, gameSlug, defaultGameSlug, onGameSlugChange])

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

  const parsedAmount = useMemo(() => {
    const t = rawAmount.trim()
    if (!t || t === '.') return null
    const n = parseFloat(t)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [rawAmount])

  /** Live market value of the requested order — proceeds the user would receive at fill. */
  const proceedsUsd = useMemo(() => {
    if (lastPrice == null || lastPrice <= 0 || parsedAmount == null) return null
    if (quantityMode === 'shares') return parsedAmount * lastPrice
    return parsedAmount
  }, [lastPrice, parsedAmount, quantityMode])

  const sharesRequested = useMemo(() => {
    if (parsedAmount == null) return null
    if (quantityMode === 'shares') return parsedAmount
    if (lastPrice == null || lastPrice <= 0) return null
    return parsedAmount / lastPrice
  }, [parsedAmount, quantityMode, lastPrice])

  const positionMarketValue = useMemo(() => {
    if (lastPrice == null || lastPrice <= 0) return null
    return ownedShares * lastPrice
  }, [lastPrice, ownedShares])

  const exceedsPosition = useMemo(() => {
    if (sharesRequested == null) return false
    return sharesRequested > ownedShares + 1e-8
  }, [sharesRequested, ownedShares])

  const proceedsLabel = proceedsUsd != null ? formatUsdTotal(proceedsUsd) : '$---.--'

  /** Live realized P&L preview — shown under the proceeds row so the seller knows the impact. */
  const realized = useMemo(() => {
    if (sharesRequested == null || avgCost <= 0 || lastPrice == null || lastPrice <= 0) return null
    const dollars = sharesRequested * (lastPrice - avgCost)
    const basis = sharesRequested * avgCost
    const pct = basis > 0 ? (dollars / basis) * 100 : 0
    return { dollars, pct }
  }, [sharesRequested, avgCost, lastPrice])

  const canReview =
    parsedAmount != null &&
    lastPrice != null &&
    lastPrice > 0 &&
    sharesRequested != null &&
    sharesRequested > 0 &&
    !exceedsPosition &&
    ownedShares > 0 &&
    gameSlug.length > 0 &&
    games.some((g) => g.slug === gameSlug)

  const handleQtyChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setRawAmount(sanitizeTradeQtyInput(e.target.value))
  }, [])

  const sellAll = useCallback(() => {
    if (ownedShares <= 0) return
    setQuantityMode('shares')
    const rounded = Math.round(ownedShares * 1e8) / 1e8
    setRawAmount(rounded.toString())
  }, [ownedShares])

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

  if (!open) return null

  return (
    <div className="bu-overlay" role="presentation" onClick={onClose}>
      <div
        className="bu-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ss-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bu-sheetInner">
          <div className="bu-topBar">
            <button type="button" className="bu-back" aria-label="Close" onClick={onClose}>
              <img src={a.back} alt="" />
            </button>
            <h2 className="bu-title" id="ss-sheet-title">
              Sell {displayTicker}
            </h2>
          </div>

          <p className="bu-available ss-position">
            Position: {formatShares(ownedShares)} shares
            {positionMarketValue != null ? <> · {formatUsdTotal(positionMarketValue)} at market</> : null}
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
              <label className="bu-qtyInputWrap" htmlFor="ss-stock-qty-input">
                <input
                  id="ss-stock-qty-input"
                  className="bu-qtyInput"
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={placeholder}
                  value={rawAmount}
                  aria-label={quantityMode === 'shares' ? 'Share quantity to sell' : 'Dollar amount to sell'}
                  onChange={handleQtyChange}
                />
                <div className="bu-qtyLine" aria-hidden />
              </label>
            </div>
          </div>

          <div className="bu-row">
            <span className="bu-rowLab">Quick</span>
            <div className="bu-rowRight ss-quickRow">
              <button
                type="button"
                className="ss-sellAllBtn"
                onClick={sellAll}
                disabled={ownedShares <= 0}
              >
                Sell All ({formatShares(ownedShares)})
              </button>
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
            <span className="bu-rowLab">Avg Cost</span>
            <span className="bu-rowVal">{avgCost > 0 ? formatUsdTotal(avgCost) : '—'}</span>
          </div>

          <div className="bu-row">
            <span className="bu-rowLab">Est. Proceeds</span>
            <span className="bu-rowVal">{proceedsLabel}</span>
          </div>

          {realized != null ? (
            <p
              className={`ss-realizedPreview ${realized.dollars >= 0 ? 'ss-realizedPreview--up' : 'ss-realizedPreview--down'}`}
              aria-live="polite"
            >
              Est. {realized.dollars >= 0 ? 'gain' : 'loss'}: {realized.dollars >= 0 ? '+' : '-'}
              {formatUsdTotal(Math.abs(realized.dollars))} ({realized.pct >= 0 ? '+' : ''}
              {realized.pct.toFixed(2)}%)
            </p>
          ) : null}

          {exceedsPosition ? (
            <p className="bu-caution">
              You only own {formatShares(ownedShares)} shares — choose Sell All or lower the amount.
            </p>
          ) : null}

          <div className="bu-reviewWrap">
            <button
              type="button"
              className="bu-reviewBtn"
              disabled={!canReview}
              onClick={() => {
                if (!canReview) return
                onReviewSale?.({
                  quantityMode,
                  action: 'sell',
                  gameSlug,
                  rawAmount,
                })
              }}
            >
              <span className="bu-reviewGradient">Review Sale</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
