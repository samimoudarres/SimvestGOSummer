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
  /** Branding icon for Order Received (defaults to `/api/stocks/:ticker/branding-icon`). */
  iconUrl?: string
  /** Sells only: total cost basis (shares × avgEntryPrice) of the FIFO lots unwound. */
  costBasis?: number
  /** Sells only: realized P&L = orderTotal − costBasis. */
  realizedPnlDollars?: number
  /** Sells only: realized P&L percent vs cost basis. */
  realizedPnlPct?: number
  /** Set when trade was persisted at Place Order — sheet only PATCHes rationale after. */
  postId?: string
}
