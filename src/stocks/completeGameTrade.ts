import { simvestFetch } from '../api/simvestFetch'
import { getSimvestUserId } from '../user/simvestUserId'
import type { CompletedTradeSnapshot } from './tradeOrderTypes'

export type TradeCompleteResult =
  | {
      ok: true
      postId: string
      costBasis?: number
      realizedPnlDollars?: number
      realizedPnlPct?: number
    }
  | { ok: false; error: string }

/** Persists ledger + activity when user confirms an order (Place Order). */
export async function postTradeComplete(
  trade: CompletedTradeSnapshot,
  rationale: string,
): Promise<TradeCompleteResult> {
  const slug = trade.draft.gameSlug
  let res: Response
  try {
    res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/trades/complete`, {
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
        rationale: rationale.trim().slice(0, 2000),
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return { ok: false, error: msg || 'Could not reach server' }
  }
  const body = (await res.json().catch(() => ({}))) as {
    postId?: string
    error?: string
    costBasis?: number
    realizedPnlDollars?: number
    realizedPnlPct?: number
  }
  if (!res.ok) {
    return { ok: false, error: typeof body.error === 'string' ? body.error : 'Trade failed' }
  }
  if (typeof body.postId !== 'string' || body.postId.length < 1) {
    return { ok: false, error: 'Missing post id' }
  }
  return {
    ok: true,
    postId: body.postId,
    ...(typeof body.costBasis === 'number' && Number.isFinite(body.costBasis)
      ? { costBasis: body.costBasis }
      : {}),
    ...(typeof body.realizedPnlDollars === 'number' && Number.isFinite(body.realizedPnlDollars)
      ? { realizedPnlDollars: body.realizedPnlDollars }
      : {}),
    ...(typeof body.realizedPnlPct === 'number' && Number.isFinite(body.realizedPnlPct)
      ? { realizedPnlPct: body.realizedPnlPct }
      : {}),
  }
}
