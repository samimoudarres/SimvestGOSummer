/** Massive / Polygon-style composite crypto tickers use this prefix in our API. */
export function isMassiveCryptoSymbol(sym: string): boolean {
  return sym.trim().toUpperCase().startsWith('X:')
}

/** UI-only label (Massive composite tickers hide the X: prefix for readability). */
export function displayTickerLabel(sym: string): string {
  const u = sym.trim().toUpperCase()
  if (u.startsWith('X:')) return u.slice(2)
  return u
}
