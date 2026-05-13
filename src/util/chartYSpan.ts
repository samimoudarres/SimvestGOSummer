/**
 * When numeric samples sit in a very narrow band (e.g. net worth $100,050–$100,400),
 * mapping raw min→max to chart height makes the line look flat. Widen the domain around
 * the midpoint so relative movement stays visible, without flattening real large swings.
 */
export function widenChartValueSpan(loRaw: number, hiRaw: number): { min: number; max: number } {
  let lo = Math.min(loRaw, hiRaw)
  let hi = Math.max(loRaw, hiRaw)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { min: 0, max: 1 }
  }
  if (lo === hi) {
    const base = Math.abs(lo) > 1e-12 ? Math.abs(lo) : 1
    lo -= base * 0.005
    hi += base * 0.005
  }
  const mid = (lo + hi) / 2
  let span = hi - lo
  const minSpanByMagnitude = Math.abs(mid) > 1e-12 ? Math.abs(mid) * 0.0025 : span * 0.15
  const minSpanByObserved = span * 0.1
  span = Math.max(span, minSpanByMagnitude, minSpanByObserved)
  const pad = span * 0.05
  return { min: mid - span * 0.5 - pad, max: mid + span * 0.5 + pad }
}
