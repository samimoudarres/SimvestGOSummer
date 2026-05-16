import { normalizeCryptoCompositeTicker, normalizeTicker } from './stockService'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { isSymbolInTradeCategory, type TradeBrowseRow } from './tradeService'

function normalizedSymbol(raw: string): string | null {
  const t = normalizeCryptoCompositeTicker(raw) ?? normalizeTicker(raw)
  return t && t.length > 0 ? t : null
}

function isCryptoSymbol(sym: string): boolean {
  return sym.startsWith('X:')
}

/**
 * Buys only — sells always allowed so players can exit positions.
 * Returns null when allowed, or an error message for the client.
 */
export async function validateBuyAgainstGameRules(
  gameSlug: string,
  tickerRaw: string,
  viewerUserId: string | null,
): Promise<string | null> {
  const rules = await getRuntimeRules(gameSlug)
  if (!rules) return null
  const sym = normalizedSymbol(tickerRaw)
  if (!sym) return 'Invalid ticker'

  switch (rules.assetsMode) {
    case 'all':
      return null
    case 'stocks_only':
      if (isCryptoSymbol(sym)) {
        return 'This game only allows stock and ETF trades — crypto is disabled.'
      }
      return null
    case 'crypto_only':
      if (!isCryptoSymbol(sym)) {
        return 'This game is crypto-only. Pick a crypto pair to buy.'
      }
      return null
    case 'category': {
      const cat = rules.assetsCategory
      if (!cat) return null
      const ok = await isSymbolInTradeCategory(sym, cat, { gameSlug, userId: viewerUserId })
      if (!ok) {
        return `This game only allows buys in the “${cat}” category right now. You can still browse any symbol, but purchases are limited to that set.`
      }
      return null
    }
    default:
      return null
  }
}

export async function validateTradeTimingAgainstGameRules(gameSlug: string): Promise<string | null> {
  const rules = await getRuntimeRules(gameSlug)
  if (!rules) return null
  const now = Date.now()
  const startsAt = new Date(rules.startsAtIso).getTime()
  if (Number.isFinite(startsAt) && now < startsAt) {
    return 'This game has not started yet. Trades open when the game begins.'
  }
  if (rules.endsAtIso) {
    const endsAt = new Date(rules.endsAtIso).getTime()
    if (Number.isFinite(endsAt) && now > endsAt) {
      return 'This game has ended, so new trades are closed.'
    }
  }
  return null
}

/** Blocks feed posts, poll votes, and edits after the scheduled end (trades use timing check above). */
export async function validateGameOpenForFeedMutations(gameSlug: string): Promise<string | null> {
  const rules = await getRuntimeRules(gameSlug)
  if (!rules?.endsAtIso) return null
  const endsAt = new Date(rules.endsAtIso).getTime()
  if (Number.isFinite(endsAt) && Date.now() > endsAt) {
    return 'This challenge has ended — the feed is read-only. Review your results on Perform or Leaderboard.'
  }
  return null
}

export async function filterTradeRowsAgainstGameRules(
  gameSlug: string,
  viewerUserId: string | null,
  rows: TradeBrowseRow[],
): Promise<TradeBrowseRow[]> {
  const rules = await getRuntimeRules(gameSlug)
  if (!rules || rules.assetsMode === 'all') return rows

  const normalizedRows = rows
    .map((row) => ({ row, sym: normalizedSymbol(row.symbol) }))
    .filter((x): x is { row: TradeBrowseRow; sym: string } => Boolean(x.sym))

  switch (rules.assetsMode) {
    case 'stocks_only':
      return normalizedRows.filter((x) => !isCryptoSymbol(x.sym)).map((x) => x.row)
    case 'crypto_only':
      return normalizedRows.filter((x) => isCryptoSymbol(x.sym)).map((x) => x.row)
    case 'category': {
      const cat = rules.assetsCategory
      if (!cat) return rows
      const allowed = await Promise.all(
        normalizedRows.map(async (x) =>
          (await isSymbolInTradeCategory(x.sym, cat, { gameSlug, userId: viewerUserId })) ? x.row : null,
        ),
      )
      return allowed.filter((row): row is TradeBrowseRow => row != null)
    }
    default:
      return rows
  }
}
