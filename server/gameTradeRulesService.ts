import { normalizeCryptoCompositeTicker, normalizeTicker } from './stockService'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { isSymbolInTradeCategory } from './tradeService'

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
      const ok = await isSymbolInTradeCategory(sym, cat)
      if (!ok) {
        return `This game only allows buys in the “${cat}” category right now. You can still browse any symbol, but purchases are limited to that set.`
      }
      return null
    }
    default:
      return null
  }
}
