export type FeedPost = {
  id: string
  /** Persisted game key — used when opening a stock so buys match the same ledger. */
  gameSlug: string
  author: string
  avatar: string
  gameName: string
  timestamp: string
  tradeTitle: string
  /** Exchange symbol for deep-linking to `/stock/:ticker` */
  tickerSymbol: string
  tickerImage: string
  changePct: string
  sharesBought: string
  orderTotal: string
  marketCap: string
  revenue: string
  rationale: string
}
