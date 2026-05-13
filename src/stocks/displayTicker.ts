/** UI-only label (Massive composite tickers hide the X: prefix for readability). */
export function displayTickerLabel(sym: string): string {
  const u = sym.trim().toUpperCase()
  if (u.startsWith('X:')) return u.slice(2)
  return u
}
