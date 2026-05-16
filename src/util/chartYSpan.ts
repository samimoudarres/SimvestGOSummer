/**
 * Maps a data range [loRaw, hiRaw] to a chart Y-axis domain that always shows movement.
 * The axis is fit tightly to the observed min/max with a small symmetric padding, so
 * real fluctuations stay visible whether they span cents or thousands. When every sample
 * is identical (or only one sample exists) we synthesize a tiny band proportional to the
 * value's magnitude so the line still renders instead of collapsing to a single point.
 */
export function widenChartValueSpan(loRaw: number, hiRaw: number): { min: number; max: number } {
  const lo = Math.min(loRaw, hiRaw)
  const hi = Math.max(loRaw, hiRaw)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { min: 0, max: 1 }
  }
  if (lo === hi) {
    const base = Math.abs(lo) > 1e-12 ? Math.abs(lo) : 1
    const eps = base * 0.0025
    return { min: lo - eps, max: hi + eps }
  }
  const span = hi - lo
  const pad = span * 0.05
  return { min: lo - pad, max: hi + pad }
}

function median(sorted: readonly number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  const m = Math.floor(n / 2)
  return n % 2 === 0 ? (sorted[m - 1]! + sorted[m]!) / 2 : sorted[m]!
}

/**
 * Computes a Y-axis domain from a full series of values that zooms into the bulk of the
 * data so real fluctuations stay visible even when 1–2 outlier samples (e.g. a single live
 * snapshot far from historical bars) would otherwise dominate the range.
 *
 * Strategy:
 *   - For small series (< 10 samples) just fit tightly to min/max via `widenChartValueSpan`.
 *   - Otherwise use median ± k·MAD (median absolute deviation, k = 3 ≈ ~99% of bulk for
 *     normal-ish distributions). Clamp those bounds inside the actual data extent so we
 *     never zoom out past the data, and never zoom in past padding-friendly limits.
 *   - If too many values sit outside either side of the robust band, include that side's
 *     true min/max so sustained moves do not flatten against the chart edge. This keeps
 *     one-off end spikes from crushing the chart while still displaying real trends fully.
 *   - Outlier samples beyond the returned domain are expected to be visually clamped to the
 *     chart edge by the caller (see `clampToChart`) so the line still renders in-bounds.
 */
export function chartYDomainFromValues(values: readonly number[]): { min: number; max: number } {
  const finite: number[] = []
  for (const v of values) if (Number.isFinite(v)) finite.push(v)
  if (finite.length === 0) return { min: 0, max: 1 }
  if (finite.length === 1) return widenChartValueSpan(finite[0]!, finite[0]!)

  let dataMin = finite[0]!
  let dataMax = finite[0]!
  for (const v of finite) {
    if (v < dataMin) dataMin = v
    if (v > dataMax) dataMax = v
  }
  if (dataMin === dataMax) return widenChartValueSpan(dataMin, dataMax)

  if (finite.length < 10) return widenChartValueSpan(dataMin, dataMax)

  const sorted = [...finite].sort((a, b) => a - b)
  const med = median(sorted)
  const deviations = finite.map((v) => Math.abs(v - med)).sort((a, b) => a - b)
  const mad = median(deviations)

  if (mad <= 0) return widenChartValueSpan(dataMin, dataMax)

  const k = 3
  const robustLo = med - k * mad
  const robustHi = med + k * mad
  const lowOutliers = finite.filter((v) => v < robustLo).length
  const highOutliers = finite.filter((v) => v > robustHi).length
  const sustainedMoveThreshold = Math.max(3, Math.ceil(finite.length * 0.05))
  const lo = lowOutliers > sustainedMoveThreshold ? dataMin : Math.max(dataMin, robustLo)
  const hi = highOutliers > sustainedMoveThreshold ? dataMax : Math.min(dataMax, robustHi)
  if (lo >= hi) return widenChartValueSpan(dataMin, dataMax)
  return widenChartValueSpan(lo, hi)
}

/**
 * Computes a Y-axis domain that fits tightly to every observed value with a small symmetric
 * padding. Use this for charts where every plotted series is intentional and must remain
 * fully visible (no clipping/clamping), e.g. the Compare Performance chart. Unlike
 * `chartYDomainFromValues`, this never filters outliers — the axis dynamically grows so the
 * lowest dipping series and highest rising series both stay inside the chart.
 */
export function chartYDomainTightFromValues(values: readonly number[]): { min: number; max: number } {
  let dataMin = Number.POSITIVE_INFINITY
  let dataMax = Number.NEGATIVE_INFINITY
  let count = 0
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < dataMin) dataMin = v
    if (v > dataMax) dataMax = v
    count++
  }
  if (count === 0) return { min: 0, max: 1 }
  return widenChartValueSpan(dataMin, dataMax)
}

/** Clamps a y pixel coordinate to the chart drawing area so outlier samples stay in-bounds. */
export function clampToChart(y: number, top: number, bottom: number): number {
  if (!Number.isFinite(y)) return top
  if (y < top) return top
  if (y > bottom) return bottom
  return y
}
