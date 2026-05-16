import { useEffect } from 'react'
import './tradeActionSheet.css'

export type TradeActionSheetProps = {
  open: boolean
  onClose: () => void
  onSell: () => void
  onBuy: () => void
}

/**
 * Native-style action sheet (iOS / Material) shown when the user taps TRADE on a stock they
 * already own. Two stacked options inside a rounded card (Sell on top, Buy below) and a
 * separate Cancel pill — matches the reference screenshot.
 */
export function TradeActionSheet({ open, onClose, onSell, onBuy }: TradeActionSheetProps) {
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

  if (!open) return null

  return (
    <div className="tas-overlay" role="presentation" onClick={onClose}>
      <div
        className="tas-stack"
        role="dialog"
        aria-modal="true"
        aria-label="Choose trade action"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tas-card">
          <button type="button" className="tas-row" onClick={onSell}>
            Sell
          </button>
          <div className="tas-rule" aria-hidden />
          <button type="button" className="tas-row" onClick={onBuy}>
            Buy
          </button>
        </div>
        <button type="button" className="tas-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
