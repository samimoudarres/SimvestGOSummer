import { useMemo } from 'react'
import type { StockFinancialQuarter, StockFinancialYear } from './stockDetailTypes'

type Mode = 'annual' | 'quarterly'

type Props = {
  mode: Mode
  onModeChange: (m: Mode) => void
  annual: StockFinancialYear[]
  quarterly: StockFinancialQuarter[]
  epsAnnual: { year: number; eps: number }[]
  epsQuarterly: { year: number; quarter: number; eps: number }[]
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(0)}`
}

function fmtEps(n: number): string {
  return `$${n.toFixed(2)}`
}

export function StockFinancialsChart({
  mode,
  onModeChange,
  annual,
  quarterly,
  epsAnnual,
  epsQuarterly,
}: Props) {
  const useEps = useMemo(() => {
    const core = mode === 'annual' ? annual : quarterly
    const eps = mode === 'annual' ? epsAnnual : epsQuarterly
    const coreEmpty =
      !core.length || core.every((r) => Math.abs(r.revenue) < 1e-6 && Math.abs(r.netIncome) < 1e-6)
    return coreEmpty && eps.length > 0
  }, [mode, annual, quarterly, epsAnnual, epsQuarterly])

  const rows = useMemo(() => {
    if (useEps) {
      if (mode === 'annual') {
        const sorted = [...epsAnnual].sort((a, b) => a.year - b.year)
        return sorted.slice(-4).map((r) => ({
          label: String(r.year),
          revenue: 0,
          netIncome: 0,
          eps: r.eps,
        }))
      }
      const sorted = [...epsQuarterly].sort((a, b) => {
        const ta = a.year * 10 + a.quarter
        const tb = b.year * 10 + b.quarter
        return ta - tb
      })
      return sorted.slice(-4).map((r) => ({
        label: `Q${r.quarter} ${r.year}`,
        revenue: 0,
        netIncome: 0,
        eps: r.eps,
      }))
    }
    if (mode === 'annual') {
      const sorted = [...annual].sort((a, b) => a.year - b.year)
      return sorted.slice(-4).map((r) => ({
        label: String(r.year),
        revenue: r.revenue,
        netIncome: r.netIncome,
        eps: null as number | null,
      }))
    }
    const sorted = [...quarterly].sort((a, b) => {
      const ta = a.year * 10 + a.quarter
      const tb = b.year * 10 + b.quarter
      return ta - tb
    })
    return sorted.slice(-4).map((r) => ({
      label: `Q${r.quarter} ${r.year}`,
      revenue: r.revenue,
      netIncome: r.netIncome,
      eps: null as number | null,
    }))
  }, [mode, annual, quarterly, epsAnnual, epsQuarterly, useEps])

  const maxScale = useMemo(() => {
    if (useEps) {
      return Math.max(1e-6, ...rows.map((r) => r.eps ?? 0))
    }
    return Math.max(1, ...rows.map((r) => r.revenue))
  }, [rows, useEps])

  const maxBar = 120

  if (!rows.length) {
    return (
      <section className="sd-finCard" aria-label="Financials">
        <h2 className="sd-finTitle">Financials</h2>
        <p className="sd-finEmpty">Financial statement data is not available for this symbol.</p>
      </section>
    )
  }

  return (
    <section className="sd-finCard" aria-label="Financials">
      <h2 className="sd-finTitle">Financials</h2>
      <div className="sd-finToggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'annual'}
          className={`sd-finToggleBtn${mode === 'annual' ? ' sd-finToggleBtn--on' : ''}`}
          onClick={() => onModeChange('annual')}
        >
          Annual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'quarterly'}
          className={`sd-finToggleBtn${mode === 'quarterly' ? ' sd-finToggleBtn--on' : ''}`}
          onClick={() => onModeChange('quarterly')}
        >
          Quarterly
        </button>
      </div>
      {useEps ? (
        <p className="sd-finSub">Revenue details were not available; showing diluted earnings per share instead.</p>
      ) : null}
      <div className="sd-finBars" aria-hidden>
        {rows.map((r) => {
          if (useEps && r.eps != null) {
            const h = (r.eps / maxScale) * maxBar
            return (
              <div key={r.label} className="sd-finCol">
                <div className="sd-finStack">
                  <div className="sd-finGreen sd-finGreen--solo" style={{ height: `${Math.max(h, 4)}px` }} />
                </div>
                <div className="sd-finYearPill">{r.label}</div>
                <div className="sd-finNums">
                  <span className="sd-finNet">{fmtEps(r.eps)}</span>
                  <span className="sd-finCaption">per share</span>
                </div>
              </div>
            )
          }
          const full = (r.revenue / maxScale) * maxBar
          const green =
            r.revenue > 0 && r.netIncome > 0
              ? Math.min(full, (r.netIncome / r.revenue) * full)
              : r.netIncome > 0
                ? Math.min(full, full * 0.35)
                : 0
          const grey = Math.max(0, full - green)
          return (
            <div key={r.label} className="sd-finCol">
              <div className="sd-finStack">
                <div className="sd-finGreen" style={{ height: `${green}px` }} />
                <div className="sd-finGrey" style={{ height: `${grey}px` }} />
              </div>
              <div className="sd-finYearPill">{r.label}</div>
              <div className="sd-finNums">
                <span className="sd-finRev">{fmtMoney(r.revenue)}</span>
                <span className="sd-finNet">{fmtMoney(r.netIncome)}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="sd-finLegend">
        <span>
          <i className="sd-dot sd-dot--green" /> {useEps ? 'Diluted EPS' : 'Net Profit'}
        </span>
        {!useEps ? (
          <span>
            <i className="sd-dot sd-dot--grey" /> Revenue
          </span>
        ) : null}
      </div>
    </section>
  )
}
