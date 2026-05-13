import { useCallback, useEffect, useRef, useState } from 'react'

function useShowDecorativeKeyboard(): boolean {
  const [v, setV] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setV(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return v
}
import { challengeAssets as a } from '../challenge/challengeAssets'
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
const OU_ACTIVITY =
  'https://www.figma.com/api/mcp/asset/040a89a6-e376-4ad6-84f3-a8648d63427e'

const KEY_TOP = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']
const KEY_MID = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']
const KEY_BOT = ['Z', 'X', 'C', 'V', 'B', 'N', 'M']

export type StockOrderReceivedSheetProps = {
  open: boolean
  trade: CompletedTradeSnapshot | null
  onFinished: (gameSlug: string) => void
}

export function StockOrderReceivedSheet({ open, trade, onFinished }: StockOrderReceivedSheetProps) {
  const [rationale, setRationale] = useState('')
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const showDecorativeKeyboard = useShowDecorativeKeyboard()

  useEffect(() => {
    if (!open) {
      setRationale('')
      setKeyboardOpen(false)
      setSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !keyboardOpen || !showDecorativeKeyboard) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (shellRef.current?.contains(t)) return
      if (taRef.current?.contains(t)) return
      const kb = (e.target as HTMLElement | null)?.closest?.('.ou-keyboard')
      if (kb) return
      setKeyboardOpen(false)
      taRef.current?.blur()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, keyboardOpen, showDecorativeKeyboard])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setKeyboardOpen(false)
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
            authorName: 'You',
            authorAvatar: a.composerAvatar,
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

  if (!open || !trade) return null

  return (
    <div className="ou-overlay" role="presentation">
      <div
        className={`ou-sheet${keyboardOpen && showDecorativeKeyboard ? ' ou-keyboardOpen' : ''}`}
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
            Order Received!
          </h2>
          <p className="ou-sub">
            Your order will be reflected in your portfolio for the {trade.gameTitle}
          </p>

          <div className="ou-rationaleHead">
            <img className="ou-bulb" src={OU_BULB_SM} alt="" width={23} height={26} />
            <span className="ou-rationaleLab">Share rationale for your post:</span>
          </div>

          <div className="ou-textShell" ref={shellRef}>
            <div className="ou-textBg" aria-hidden>
              <img src={OU_TEXTAREA_BG} alt="" />
            </div>
            <textarea
              ref={taRef}
              className="ou-textarea"
              placeholder="I bought Apple because I think their earnings call showed..."
              value={rationale}
              maxLength={2000}
              rows={4}
              onChange={(e) => setRationale(e.target.value)}
              onFocus={() => setKeyboardOpen(true)}
            />
          </div>

          <div className="ou-spacer" />
        </div>

        <div className="ou-footer">
          <img className="ou-activity" src={OU_ACTIVITY} alt="" aria-hidden />
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

        {keyboardOpen && showDecorativeKeyboard ? (
          <div className="ou-keyboard" aria-hidden>
            <div className="ou-keyRow">
              {KEY_TOP.map((k) => (
                <span key={k} className="ou-key">
                  {k}
                </span>
              ))}
            </div>
            <div className="ou-keyRow" style={{ paddingLeft: 16, paddingRight: 16 }}>
              {KEY_MID.map((k) => (
                <span key={k} className="ou-key">
                  {k}
                </span>
              ))}
            </div>
            <div className="ou-keyRow" style={{ paddingLeft: 4, paddingRight: 4, gap: 4 }}>
              <span className="ou-key ou-key--wide" aria-hidden>
                {' '}
              </span>
              {KEY_BOT.map((k) => (
                <span key={k} className="ou-key">
                  {k}
                </span>
              ))}
              <span className="ou-key ou-key--wide" aria-hidden>
                {' '}
              </span>
            </div>
            <div className="ou-keyRow">
              <span className="ou-key ou-key--wide">123</span>
              <span className="ou-key ou-key--space">space</span>
              <span className="ou-key ou-key--wide">return</span>
            </div>
            <div className="ou-keyboardTools">
              <span>Emoji</span>
              <span>Dictation</span>
            </div>
            <div className="ou-homeBar">
              <div className="ou-homeBarInner" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
