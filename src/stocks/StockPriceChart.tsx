import { useCallback, useId, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from 'react'
import { chartYDomainFromValues, clampToChart } from '../util/chartYSpan'
import type { ChartRange } from './stockDetailTypes'

const RANGES: ChartRange[] = ['1D', '5D', '1M', '3M', '1Y', '5Y']

type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }

type Props = {
  bars: Bar[]
  range: ChartRange
  onRangeChange: (r: ChartRange) => void
  loading?: boolean
  error?: string | null
  /** Defaults to "Price chart". */
  ariaLabel?: string
  /** Shown when not hovering; defaults to stock copy. */
  idleHintText?: string
  /** When there are no bars and no loading/error; defaults to market-closed copy. */
  emptyBarsMessage?: string
}

function fmtBarTime(t: number, range: ChartRange): string {
  const d = new Date(t)
  if (range === '1D' || range === '5D') {
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const VB_W = 360
const VB_H = 160

export function StockPriceChart({
  bars,
  range,
  onRangeChange,
  loading,
  error,
  ariaLabel = 'Price chart',
  idleHintText = 'Move across the chart to see price and date at each point.',
  emptyBarsMessage = 'No bars for this range (market closed or limited history).',
}: Props) {
  const gradId = `sdAreaGrad-${useId().replace(/:/g, '')}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null)

  const { pathD, areaD, minP, maxP, pts } = useMemo(() => {
    if (!bars.length) {
      return { pathD: '', areaD: '', minP: 0, maxP: 1, pts: [] as { x: number; y: number; b: Bar }[] }
    }
    const w = VB_W
    const h = 140
    const pad = 8
    const closes = bars.map((b) => b.c)
    const { min, max } = chartYDomainFromValues(closes)
    const span = max - min || 1
    const innerW = w - pad * 2
    const innerH = h - pad * 2
    const top = pad
    const bottom = pad + innerH
    const outPts = bars.map((b, i) => {
      const x = pad + (innerW * i) / Math.max(bars.length - 1, 1)
      const yRaw = pad + innerH * (1 - (b.c - min) / span)
      const y = clampToChart(yRaw, top, bottom)
      return { x, y, b }
    })
    const d = outPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const area =
      outPts.length > 0
        ? `${d} L${outPts[outPts.length - 1].x.toFixed(1)},${bottom} L${outPts[0].x.toFixed(1)},${bottom} Z`
        : ''
    return { pathD: d, areaD: area, minP: min, maxP: max, pts: outPts }
  }, [bars])

  const updateHover = useCallback(
    (clientX: number) => {
      if (!wrapRef.current || !pts.length) return
      const r = wrapRef.current.getBoundingClientRect()
      const x = clientX - r.left
      const ratio = Math.min(1, Math.max(0, x / r.width))
      const idx = Math.round(ratio * (pts.length - 1))
      setHover(idx)
      const pt = pts[idx]
      if (!svgRef.current) return
      const sr = svgRef.current.getBoundingClientRect()
      const left = sr.left - r.left + (pt.x / VB_W) * sr.width
      const top = sr.top - r.top + (pt.y / VB_H) * sr.height
      setTipPos({ left, top })
    },
    [pts],
  )

  const onMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      updateHover(e.clientX)
    },
    [updateHover],
  )

  const onTouch = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0]
      if (!t) return
      updateHover(t.clientX)
    },
    [updateHover],
  )

  const hi = hover != null && pts[hover] ? pts[hover] : null

  return (
    <section className="sd-chartCard" aria-label={ariaLabel}>
      <div className="sd-rangeRow">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={`sd-rangePill${r === range ? ' sd-rangePill--active' : ''}`}
            onClick={() => onRangeChange(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <div
        ref={wrapRef}
        className="sd-chartSvgWrap"
        onMouseMove={onMove}
        onMouseLeave={() => {
          setHover(null)
          setTipPos(null)
        }}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onTouchEnd={() => {
          setHover(null)
          setTipPos(null)
        }}
      >
        {loading ? <p className="sd-chartMsg">Loading chart…</p> : null}
        {!loading && error ? <p className="sd-chartMsg sd-chartMsg--err">{error}</p> : null}
        {!loading && !error && !bars.length ? <p className="sd-chartMsg">{emptyBarsMessage}</p> : null}
        {!loading && bars.length > 0 ? (
          <svg
            ref={svgRef}
            className="sd-priceSvg"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(10,149,219,0.35)" />
                <stop offset="100%" stopColor="rgba(10,149,219,0)" />
              </linearGradient>
            </defs>
            <path d={areaD} fill={`url(#${gradId})`} />
            <path d={pathD} fill="none" stroke="#0a95db" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {hi ? (
              <>
                <line
                  x1={hi.x}
                  y1={8}
                  x2={hi.x}
                  y2={152}
                  stroke="rgba(0,0,0,0.25)"
                  strokeDasharray="4 3"
                />
                <circle cx={hi.x} cy={hi.y} r="5" fill="#fff" stroke="#0a95db" strokeWidth="2" />
              </>
            ) : null}
          </svg>
        ) : null}
        {hi && tipPos ? (
          <div
            className="sd-chartFloatTip"
            style={{ left: tipPos.left, top: tipPos.top }}
            role="status"
          >
            <div className="sd-chartFloatTip__price">
              {hi.b.c.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </div>
            <div className="sd-chartFloatTip__date">{fmtBarTime(hi.b.t, range)}</div>
          </div>
        ) : null}
      </div>
      {!hi ? <p className="sd-chartHint">{idleHintText}</p> : null}
      {bars.length > 0 ? (
        <div className="sd-chartScale" aria-hidden>
          <span>{maxP.toFixed(2)}</span>
          <span>{minP.toFixed(2)}</span>
        </div>
      ) : null}
    </section>
  )
}
