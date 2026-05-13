/** Tiny non-interactive sparkline from real close prices (1D intraday, or last two sessions if 1D is sparse). */
export function MiniSparkLine({ vals, up }: { vals: number[]; up: boolean }) {
  if (!vals.length) {
    return (
      <svg className="pf-spark" viewBox="0 0 72 34" aria-hidden>
        <line x1="4" y1="17" x2="68" y2="17" stroke="#ccc" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = Math.max(max - min, 1e-9)
  const pts = vals
    .map((v, i) => {
      const x = vals.length > 1 ? (i / (vals.length - 1)) * 70 + 1 : 36
      const y = 30 - ((v - min) / span) * 26 + 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="pf-spark" viewBox="0 0 72 34" aria-hidden>
      <polyline
        fill="none"
        stroke={up ? '#0fae37' : '#d93025'}
        strokeWidth="2"
        points={pts}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
