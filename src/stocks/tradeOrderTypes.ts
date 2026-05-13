/** Draft carried from Standard Buy → Review Order (and back). */
export type TradeOrderDraft = {
  quantityMode: 'shares' | 'dollars'
  action: 'buy' | 'sell'
  gameSlug: string
  rawAmount: string
}

/** Snapshot after Review → Order Received + API complete. */
export type CompletedTradeSnapshot = {
  draft: TradeOrderDraft
  apiTicker: string
  displayTicker: string
  companyName: string
  shares: number
  fillPrice: number
  orderTotal: number
  changePctLabel: string
  marketCapLabel: string
  revenueLabel: string
  gameTitle: string
  /** Set when trade was persisted at Place Order — sheet only PATCHes rationale after. */
  postId?: string
}
