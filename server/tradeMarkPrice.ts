/**
 * Server-authoritative fill prices for `POST …/trades/complete`.
 *
 * Slip band: ±1% of the server mark. Client `fillPrice` is accepted only when
 * inside that band; otherwise the server mark is used. `orderTotal` is always
 * recomputed as `shares * fillPrice` (no fees).
 */
import { massiveGet } from './massiveClient'
import {
  normalizeCryptoCompositeTicker,
  normalizeTicker,
  pickTickerSnapshotPrice,
} from './stockService'
import { pickStockMarkPrice, type SnapshotTickerLike } from './usEquityMarkPrice'

/** Max relative deviation of client fill vs server mark before we override. */
export const TRADE_FILL_SLIP_BAND = 0.01 // ±1%

function unwrapCryptoInner(raw: unknown): SnapshotTickerLike | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (o.ticker && typeof o.ticker === 'object') return o.ticker as SnapshotTickerLike
  const r = o.results
  if (r && typeof r === 'object' && 'ticker' in (r as object)) {
    return (r as { ticker?: SnapshotTickerLike }).ticker
  }
  return undefined
}

/** Live mark/last for one symbol via Massive snapshot (same sources as portfolio). */
export async function fetchServerMarkPrice(tickerRaw: string): Promise<number | null> {
  const raw = String(tickerRaw ?? '').trim()
  const sym = normalizeCryptoCompositeTicker(raw) ?? normalizeTicker(raw)
  if (!sym) return null

  const snapPath = sym.startsWith('X:')
    ? `/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(sym)}`
    : `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(sym)}`

  try {
    const body = await massiveGet<Record<string, unknown>>(snapPath)
    const tickerObj: SnapshotTickerLike | undefined = sym.startsWith('X:')
      ? unwrapCryptoInner(body) ?? (body?.ticker as SnapshotTickerLike | undefined)
      : (body?.ticker as SnapshotTickerLike | undefined)

    const mark =
      pickStockMarkPrice(sym, tickerObj) ??
      pickTickerSnapshotPrice(tickerObj as never) ??
      null
    return mark != null && Number.isFinite(mark) && mark > 0 ? mark : null
  } catch {
    return null
  }
}

export type ResolvedTradeFill = {
  fillPrice: number
  orderTotal: number
  serverMark: number
  /** True when client price was within band and used; false when server mark used. */
  usedClientPrice: boolean
}

/**
 * Resolve honest fill: prefer client price if within ±TRADE_FILL_SLIP_BAND of mark.
 */
export function resolveTradeFillPrice(opts: {
  shares: number
  serverMark: number
  clientFillPrice?: number | null
}): ResolvedTradeFill {
  const mark = opts.serverMark
  const shares = opts.shares
  const client = opts.clientFillPrice
  let fillPrice = mark
  let usedClientPrice = false

  if (
    typeof client === 'number' &&
    Number.isFinite(client) &&
    client > 0 &&
    mark > 0
  ) {
    const band = mark * TRADE_FILL_SLIP_BAND
    if (Math.abs(client - mark) <= band + 1e-12) {
      fillPrice = client
      usedClientPrice = true
    }
  }

  const orderTotal = shares * fillPrice
  return { fillPrice, orderTotal, serverMark: mark, usedClientPrice }
}
