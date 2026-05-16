import { useCallback, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from 'react'
import { chartYDomainFromValues, clampToChart } from '../util/chartYSpan'
import type {
  PerformCompareSeries,
  PerformCompareSeriesId,
  PerformCompareSeriesKind,
} from './performTypes'
import type { ChartRange } from '../stocks/stockDetailTypes'

type Props = {
  yAxisLabels: string[]
  series: PerformCompareSeries[]
  visible: Record<string, boolean>
  selected: PerformCompareSeriesId | null
  onSelectLine: (id: PerformCompareSeriesId | null) => void
  /** When false, chart is a stub (e.g. loading). */
  interactive?: boolean
  sampledAtMs?: number[]
  chartRange?: ChartRange
}

const W = 320
const H = 220
const PAD_L = 8
const PAD_R = 44
const PAD_T = 8
const PAD_B = 12

function isVisible(visible: Record<string, boolean>, id: string): boolean {
  return visible[id] !== false
}

function fmtIndexedTick(v: number, span: number): string {
  if (!Number.isFinite(v)) return '—'
  // Pick decimals so adjacent ticks (~5 across the visible span) stay distinguishable
  // when the Y axis is tight around small fluctuations.
  const stepPerTick = span > 0 ? span / 5 : 0
  let decimals: number
  if (stepPerTick >= 1) decimals = 0
  else if (stepPerTick >= 0.1) decimals = 1
  else if (stepPerTick >= 0.01) decimals = 2
  else decimals = 3
  if (decimals === 0 && Math.abs(v - Math.round(v)) < 0.05) return `${Math.round(v)}`
  return v.toFixed(decimals)
}

const Y_TOP = PAD_T
const Y_BOTTOM = H - PAD_B

function pathForValuesLinear(
  values: number[],
  minV: number,
  maxV: number,
  show: boolean,
): string {
  if (values.length < 2 || !show) return ''
  const span = Math.max(maxV - minV, 1)
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  return values
    .map((v, i) => {
      const x = PAD_L + (innerW * i) / (values.length - 1)
      const yRaw = PAD_T + innerH * (1 - (v - minV) / span)
      const y = clampToChart(yRaw, Y_TOP, Y_BOTTOM)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

/** Piecewise-constant (post-step): value i holds until sample i+1 — matches sampled net worth semantics. */
function pathForValuesStep(
  values: number[],
  minV: number,
  maxV: number,
  show: boolean,
): string {
  if (values.length < 2 || !show) return ''
  const span = Math.max(maxV - minV, 1)
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const xAt = (i: number) => PAD_L + (innerW * i) / (values.length - 1)
  const yAt = (v: number) =>
    clampToChart(PAD_T + innerH * (1 - (v - minV) / span), Y_TOP, Y_BOTTOM)
  let d = `M${xAt(0).toFixed(1)},${yAt(values[0]!).toFixed(1)}`
  for (let i = 0; i < values.length - 1; i++) {
    const x2 = xAt(i + 1)
    const y1 = yAt(values[i]!)
    const y2 = yAt(values[i + 1]!)
    d += ` L${x2.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`
  }
  return d
}

function pathForSeries(
  values: number[],
  minV: number,
  maxV: number,
  show: boolean,
  kind: PerformCompareSeriesKind | undefined,
): string {
  if (kind === 'you' || kind === 'player') {
    return pathForValuesStep(values, minV, maxV, show)
  }
  return pathForValuesLinear(values, minV, maxV, show)
}

function buildPts(values: number[], minV: number, maxV: number, show: boolean) {
  if (values.length < 2 || !show) return [] as { x: number; y: number; v: number }[]
  const span = Math.max(maxV - minV, 1)
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  return values.map((v, i) => ({
    x: PAD_L + (innerW * i) / (values.length - 1),
    y: clampToChart(PAD_T + innerH * (1 - (v - minV) / span), Y_TOP, Y_BOTTOM),
    v,
  }))
}

function fmtIndexedTip(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const pct = v - 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

function fmtAxisTime(ms: number, range: ChartRange | undefined): string {
  const d = new Date(ms)
  if (range === '1D' || range === '5D') {
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  if (range === '1M' || range === '3M') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PerformCompareChart({
  yAxisLabels,
  series,
  visible,
  selected,
  onSelectLine,
  interactive = true,
  sampledAtMs,
  chartRange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const innerW = W - PAD_L - PAD_R

  const { minV, maxV } = useMemo(() => {
    const flat: number[] = []
    for (const s of series) {
      if (!isVisible(visible, s.id)) continue
      for (const v of s.values) {
        if (Number.isFinite(v)) flat.push(v)
      }
    }
    if (flat.length === 0) return { minV: 97, maxV: 103 }
    const w = chartYDomainFromValues(flat)
    return { minV: w.min, maxV: w.max }
  }, [series, visible])

  const displayYAxisLabels = useMemo(() => {
    const n = Math.max(2, Math.min(yAxisLabels.length || 5, 7))
    const labels: string[] = []
    const span = maxV - minV
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1)
      const v = maxV - t * span
      labels.push(fmtIndexedTick(v, span))
    }
    return labels
  }, [minV, maxV, yAxisLabels.length])

  const seriesPts = useMemo(() => {
    return series.map((s) => ({
      id: s.id,
      color: s.color,
      label: s.legendLabel,
      show: isVisible(visible, s.id),
      path: pathForSeries(s.values, minV, maxV, isVisible(visible, s.id), s.kind),
      pts: buildPts(s.values, minV, maxV, isVisible(visible, s.id)),
    }))
  }, [series, visible, minV, maxV])

  const updateHover = useCallback(
    (clientX: number) => {
      if (!interactive || series.length === 0) return
      const n = series[0]?.values.length ?? 0
      if (n < 2) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const xSvg = ((clientX - rect.left) / Math.max(rect.width, 1)) * W
      const ratio = Math.min(1, Math.max(0, (xSvg - PAD_L) / innerW))
      const idx = Math.round(ratio * (n - 1))
      setHover(idx)
    },
    [interactive, series],
  )

  const onMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      updateHover(e.clientX)
    },
    [updateHover],
  )

  const onTouch = useCallback(
    (e: TouchEvent<SVGSVGElement>) => {
      const t = e.touches[0]
      if (!t) return
      updateHover(t.clientX)
    },
    [updateHover],
  )

  const gridYs = useMemo(() => {
    const innerH = H - PAD_T - PAD_B
    const n = displayYAxisLabels.length
    return displayYAxisLabels.map((_, i) => {
      const y = PAD_T + (innerH * i) / Math.max(n - 1, 1)
      return y
    })
  }, [displayYAxisLabels])

  const hoverIdx = hover != null && seriesPts[0]?.pts[hover] ? hover : null
  const hoverTime =
    hoverIdx != null && sampledAtMs && sampledAtMs[hoverIdx] != null
      ? fmtAxisTime(sampledAtMs[hoverIdx]!, chartRange)
      : null

  return (
    <div className="pf-chartWrap">
      <div className="pf-chartPlot" role="presentation">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="pf-chartSvg"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onTouchStart={onTouch}
          onTouchMove={onTouch}
          onClick={() => onSelectLine(null)}
        >
          {gridYs.map((y, i) => (
            <line
              key={i}
              x1={PAD_L}
              y1={y}
              x2={W - PAD_R}
              y2={y}
              stroke="#d0d0d0"
              strokeWidth={i === 0 ? 1.2 : 1}
              strokeDasharray={i === 0 ? '0' : '4 5'}
            />
          ))}
          {interactive && hoverIdx != null && seriesPts[0]?.pts[hoverIdx] ? (
            <line
              x1={seriesPts[0].pts[hoverIdx]!.x}
              y1={PAD_T}
              x2={seriesPts[0].pts[hoverIdx]!.x}
              y2={H - PAD_B}
              stroke="#999"
              strokeWidth={1}
              strokeDasharray="3 4"
              pointerEvents="none"
            />
          ) : null}
          {series.map((s) => {
            const meta = seriesPts.find((p) => p.id === s.id)
            const path = meta?.path ?? ''
            if (!path) return null
            const thick = selected === s.id
            return (
              <path
                key={s.id}
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth={thick ? 3.2 : 2}
                strokeLinecap={s.kind === 'you' || s.kind === 'player' ? 'butt' : 'round'}
                strokeLinejoin={s.kind === 'you' || s.kind === 'player' ? 'miter' : 'round'}
                opacity={isVisible(visible, s.id) ? 1 : 0}
                className="pf-chartLine"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectLine(s.id)
                }}
              />
            )
          })}
          {interactive && hoverIdx != null
            ? seriesPts.map((meta) => {
                const p = meta.pts[hoverIdx]
                if (!meta.show || !p) return null
                return (
                  <circle
                    key={`dot-${meta.id}`}
                    cx={p.x}
                    cy={p.y}
                    r={selected === meta.id ? 5 : 3.5}
                    fill={meta.color}
                    stroke="#fff"
                    strokeWidth={1.2}
                    pointerEvents="none"
                  />
                )
              })
            : null}
        </svg>
        <div className="pf-chartYAxis" aria-hidden>
          {displayYAxisLabels.map((lab, i) => (
            <span key={i} className="pf-chartYLab">
              {lab}
            </span>
          ))}
        </div>
      </div>
      <p className="pf-chartHint" aria-live="polite">
        {hoverIdx != null ? (
          <>
            {hoverTime ? (
              <>
                <strong>{hoverTime}</strong>
                <br />
              </>
            ) : null}
            {series
              .filter((s) => isVisible(visible, s.id))
              .map((s) => {
                const v = s.values[hoverIdx]
                return (
                  <span key={s.id} className="pf-chartTipLine">
                    <span className="pf-chartTipSwatch" style={{ backgroundColor: s.color }} aria-hidden />
                    {s.legendLabel}: {fmtIndexedTip(v ?? NaN)}
                    <br />
                  </span>
                )
              })}
          </>
        ) : selected ? (
          `${series.find((x) => x.id === selected)?.legendLabel ?? ''} — tap chart to clear.`
        ) : interactive ? null : (
          'Loading chart…'
        )}
      </p>
    </div>
  )
}
