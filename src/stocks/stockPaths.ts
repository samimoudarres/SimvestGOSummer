export function stockPath(ticker: string): string {
  const raw = ticker.trim().toUpperCase()
  if (raw.startsWith('X:')) {
    return `/stock/${encodeURIComponent(raw)}`
  }
  const t = raw.replace(/[^A-Z0-9.-]/g, '')
  return `/stock/${encodeURIComponent(t)}`
}
