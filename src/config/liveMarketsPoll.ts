/**
 * Refetch Massive-backed quotes while mounted (detail header, chart, trade
 * browse/search, portfolio, …). Visible cadence stays live; hidden tabs use
 * `LIVE_MARKETS_POLL_HIDDEN_MS` via `visibilityAwareInterval`.
 */
export const LIVE_MARKETS_POLL_MS = 8_000

/** Background / hidden-document poll for live markets (and similar). */
export const LIVE_MARKETS_POLL_HIDDEN_MS = 60_000
