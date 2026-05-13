import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { GAME_OPTIONS } from '../challenge/gameMeta'
import type { TradeOrderDraft } from './tradeOrderTypes'
import './stockBuySheet.css'

/** Demo buying power until portfolio cash is wired (matches Figma helper text). */
const AVAILABLE_TO_TRADE_USD = 31930

type QuantityMode = 'shares' | 'dollars'
type ActionMode = 'buy' | 'sell'

export type StockBuySheetProps = {
  open: boolean
  onClose: () => void
  displayTicker: string
  lastPrice: number | null
  lastPriceLabel: string
  defaultGameSlug?: string
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

const KEYPAD_SUBS: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
}

export function StockBuySheet({
  open,
  onClose,
  displayTicker,
  lastPrice,
  lastPriceLabel,
  defaultGameSlug,
  restoreDraft,
  onRestoreDraftConsumed,
  onReviewOrder,
}: StockBuySheetProps) {
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('shares')
  const [action, setAction] = useState<ActionMode>('buy')
  const [gameSlug, setGameSlug] = useState(() => defaultGameSlug ?? GAME_OPTIONS[0]!.slug)
  const [rawAmount, setRawAmount] = useState('')
  const [ddOpen, setDdOpen] = useState(false)
  const [keypadOpen, setKeypadOpen] = useState(false)
  const ddRef = useRef<HTMLDivElement>(null)
  const qtyRef = useRef<HTMLLabelElement>(null)
  const keypadRef = useRef<HTMLDivElement>(null)
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
        setGameSlug(defaultGameSlug ?? GAME_OPTIONS[0]!.slug)
        setRawAmount('')
      }
      setDdOpen(false)
      setKeypadOpen(false)
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false
      setRawAmount('')
      setQuantityMode('shares')
      setAction('buy')
      setGameSlug(defaultGameSlug ?? GAME_OPTIONS[0]!.slug)
      setDdOpen(false)
      setKeypadOpen(false)
    }
  }, [open, restoreDraft, defaultGameSlug, onRestoreDraftConsumed])

  /* Tap outside quantity field + keypad dismisses keypad (mobile-keyboard-like). */
  useEffect(() => {
    if (!open || !keypadOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (qtyRef.current?.contains(t)) return
      if (keypadRef.current?.contains(t)) return
      setKeypadOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, keypadOpen])

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
    totalNumber > AVAILABLE_TO_TRADE_USD

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
    (quantityMode === 'shares' || quantityMode === 'dollars')

  const appendDigit = useCallback((d: string) => {
    setRawAmount((prev) => {
      if (prev === '0' && d !== '.') return d
      if (d === '.' && prev.includes('.')) return prev
      const next = prev + d
      if (next.replace('.', '').length > 12) return prev
      return next
    })
  }, [])

  const backspace = useCallback(() => {
    setRawAmount((prev) => prev.slice(0, -1))
  }, [])

  const selectedGame = GAME_OPTIONS.find((g) => g.slug === gameSlug) ?? GAME_OPTIONS[0]!

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
            ${AVAILABLE_TO_TRADE_USD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
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
                      setKeypadOpen(false)
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
                      setKeypadOpen(false)
                    }}
                  >
                    Dollars
                  </button>
                </div>
              </div>
              <label
                ref={qtyRef}
                className={`bu-qtyInputWrap${keypadOpen ? ' bu-qtyInputWrap--focus' : ''}`}
                htmlFor="bu-stock-qty-input"
                onClick={() => setKeypadOpen(true)}
              >
                <input
                  id="bu-stock-qty-input"
                  className="bu-qtyInput"
                  type="text"
                  inputMode="decimal"
                  readOnly
                  placeholder={placeholder}
                  value={rawAmount}
                  aria-expanded={keypadOpen}
                  aria-label={quantityMode === 'shares' ? 'Share quantity' : 'Dollar amount'}
                  onFocus={() => setKeypadOpen(true)}
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
                <button type="button" className="bu-ddBtn" aria-expanded={ddOpen} onClick={() => setDdOpen((v) => !v)}>
                  <span className="bu-ddBtnText">{truncateTitle(selectedGame.title)}</span>
                  <img className="bu-ddChev" src={a.chevronDown} alt="" />
                </button>
                {ddOpen ? (
                  <div className="bu-ddMenu" role="listbox">
                    {GAME_OPTIONS.map((g) => (
                      <button
                        key={g.slug}
                        type="button"
                        role="option"
                        aria-selected={g.slug === gameSlug}
                        className={`bu-ddItem${g.slug === gameSlug ? ' bu-ddItem--on' : ''}`}
                        onClick={() => {
                          setGameSlug(g.slug)
                          setDdOpen(false)
                        }}
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
            <p className="bu-caution">Total exceeds available cash for this demo.</p>
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

        {keypadOpen ? (
          <div ref={keypadRef}>
            <NumericKeypad onDigit={appendDigit} onBackspace={backspace} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function NumericKeypad({
  onDigit,
  onBackspace,
}: {
  onDigit: (d: string) => void
  onBackspace: () => void
}) {
  const rows: string[][] = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'del'],
  ]

  return (
    <div className="bu-keypad">
      {rows.map((row, ri) => (
        <div key={ri} className="bu-keyRow">
          {row.map((k) =>
            k === 'del' ? (
              <button key={k} type="button" className="bu-key bu-keyDel" aria-label="Delete" onClick={onBackspace}>
                <span className="bu-keyDelGlyph" aria-hidden>
                  ⌫
                </span>
              </button>
            ) : (
              <button key={k} type="button" className="bu-key" onClick={() => onDigit(k)}>
                <span className="bu-keyMain">{k}</span>
                {KEYPAD_SUBS[k] ? <span className="bu-keySub">{KEYPAD_SUBS[k]}</span> : null}
              </button>
            ),
          )}
        </div>
      ))}
    </div>
  )
}
