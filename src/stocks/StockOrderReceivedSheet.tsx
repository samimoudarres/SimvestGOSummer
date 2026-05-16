import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { simvestFetch } from '../api/simvestFetch'
import { getSimvestUserId } from '../user/simvestUserId'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import type { CompletedTradeSnapshot } from './tradeOrderTypes'
import './stockOrderReceived.css'

const OU_CHECK =
  'https://www.figma.com/api/mcp/asset/5fd63e03-d440-4639-b346-9d86c67c0371'
const OU_TEXTAREA_BG =
  'https://www.figma.com/api/mcp/asset/8d3b9a7e-e232-439d-a87c-4f7d6a84570b'
const OU_BULB_SM =
  'https://www.figma.com/api/mcp/asset/50cc6b0f-1bbb-4d1c-a377-19f70e9e7920'

export type StockOrderReceivedSheetProps = {
  open: boolean
  trade: CompletedTradeSnapshot | null
  onFinished: (gameSlug: string) => void
}

export function StockOrderReceivedSheet({ open, trade, onFinished }: StockOrderReceivedSheetProps) {
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) {
      setRationale('')
      setSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        taRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const submit = useCallback(async () => {
    if (!trade || submitting) return
    setSubmitting(true)
    try {
      const slug = trade.draft.gameSlug
      /* Trade + ledger already saved at “Place Order”; optional PATCH rationale only */
      if (trade.postId) {
        const trimmed = rationale.trim()
        if (trimmed.length > 0) {
          const res = await simvestFetch(
            `/api/games/${encodeURIComponent(slug)}/feed/posts/${encodeURIComponent(trade.postId)}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rationale: trimmed }),
            },
          )
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            console.error(body?.error ?? res.status)
          }
        }
        rememberActiveGameSlug(slug)
        window.dispatchEvent(new CustomEvent('simvest:holdings-refresh', { detail: { gameSlug: slug } }))
        window.dispatchEvent(new CustomEvent('simvest:activity-refresh', { detail: { gameSlug: slug } }))
      } else {
        const res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/trades/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientUserId: getSimvestUserId(),
            ticker: trade.apiTicker,
            displayTicker: trade.displayTicker,
            action: trade.draft.action,
            quantityMode: trade.draft.quantityMode,
            shares: trade.shares,
            fillPrice: trade.fillPrice,
            orderTotal: trade.orderTotal,
            changePctLabel: trade.changePctLabel,
            marketCapLabel: trade.marketCapLabel,
            revenueLabel: trade.revenueLabel,
            rationale: rationale.trim(),
          }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          console.error(body?.error ?? res.status)
        } else {
          rememberActiveGameSlug(slug)
          window.dispatchEvent(new CustomEvent('simvest:holdings-refresh', { detail: { gameSlug: slug } }))
          window.dispatchEvent(new CustomEvent('simvest:activity-refresh', { detail: { gameSlug: slug } }))
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
      onFinished(trade.draft.gameSlug)
    }
  }, [trade, rationale, submitting, onFinished])

  const hasRationale = rationale.trim().length > 0

  const isSell = trade?.draft.action === 'sell'
  const realizedPositive = isSell && (trade?.realizedPnlDollars ?? 0) >= 0
  const realizedSummary = useMemo(() => {
    if (!trade || !isSell) return null
    const dollars = trade.realizedPnlDollars
    const pct = trade.realizedPnlPct
    if (dollars == null || !Number.isFinite(dollars) || pct == null || !Number.isFinite(pct)) return null
    const sign = dollars >= 0 ? '+' : '-'
    const usd = `$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
    return { dollars, pct, label: `${sign}${usd} (${pctStr})` }
  }, [trade, isSell])

  if (!open || !trade) return null

  const headerTitle = isSell ? 'Sale Received!' : 'Order Received!'
  const headerSub = isSell
    ? `Your sale was completed and your cash balance has been updated for the ${trade.gameTitle}.`
    : `Your order will be reflected in your portfolio for the ${trade.gameTitle}`
  const placeholder = isSell
    ? 'I sold Apple because the earnings call signaled slowing iPhone demand…'
    : 'I bought Apple because I think their earnings call showed...'

  return (
    <div className="ou-overlay" role="presentation">
      <div
        className="ou-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ou-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ou-scroll">
          <div className="ou-checkWrap">
            <img className="ou-checkImg" src={OU_CHECK} alt="" width={86} height={86} />
          </div>
          <h2 className="ou-title" id="ou-title">
            {headerTitle}
          </h2>
          <p className="ou-sub">{headerSub}</p>

          {isSell && realizedSummary ? (
            <div
              className={`ou-sellSummary${realizedPositive ? ' ou-sellSummary--up' : ' ou-sellSummary--down'}`}
              role="status"
            >
              <div className="ou-sellSummaryRow">
                <span className="ou-sellSummaryLab">Sold</span>
                <span className="ou-sellSummaryVal">
                  {trade.shares.toLocaleString('en-US', { maximumFractionDigits: 6 })} {trade.displayTicker} @{' '}
                  ${trade.fillPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="ou-sellSummaryRow">
                <span className="ou-sellSummaryLab">Proceeds</span>
                <span className="ou-sellSummaryVal">
                  ${trade.orderTotal.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="ou-sellSummaryRow ou-sellSummaryRow--realized">
                <span className="ou-sellSummaryLab">Realized {realizedPositive ? 'gain' : 'loss'}</span>
                <span className="ou-sellSummaryVal">{realizedSummary.label}</span>
              </div>
            </div>
          ) : null}

          <div className="ou-rationaleHead">
            <img className="ou-bulb" src={OU_BULB_SM} alt="" width={23} height={26} />
            <span className="ou-rationaleLab">Share rationale for your post:</span>
          </div>

          <div className="ou-textShell">
            <div className="ou-textBg" aria-hidden>
              <img src={OU_TEXTAREA_BG} alt="" />
            </div>
            <textarea
              ref={taRef}
              className="ou-textarea"
              placeholder={placeholder}
              value={rationale}
              maxLength={2000}
              rows={4}
              inputMode="text"
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="on"
              spellCheck
              onChange={(e) => setRationale(e.target.value)}
            />
          </div>

          <div className="ou-spacer" />
        </div>

        <div className="ou-footer">
          <div className="ou-pillGhost" aria-hidden />
          <button
            type="button"
            className={hasRationale ? 'ou-shareBtn' : 'ou-dashBtn'}
            disabled={submitting}
            onClick={() => void submit()}
          >
            <span className={hasRationale ? 'ou-shareBtnInner' : 'ou-dashBtnInner'}>
              {hasRationale ? 'Share' : 'Back to Dashboard'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
