import type { PortfolioApiRow, PortfolioTotals } from './portfolioTypes'

function fmtMoney(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function fmtSignedMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  const sign = n >= 0 ? '+' : '-'
  return `${sign}${fmtMoney(Math.abs(n))}`
}

function fmtSignedPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  const sign = n >= 0 ? '+' : '-'
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

function pctClass(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n) || Math.abs(n) < 1e-9) return ''
  return n > 0 ? 'pf-port-num--up' : 'pf-port-num--down'
}

export function DetailedPortfolioTable({
  rows,
  totals,
  onPick,
}: {
  rows: PortfolioApiRow[]
  totals: PortfolioTotals | null
  onPick: (symbol: string) => void
}) {
  return (
    <>
      <div className="pf-port-tableWrap" aria-label="Detailed holdings table">
        <table className="pf-port-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Last Price</th>
              <th>Avg Cost</th>
              <th>Change</th>
              <th>$ Today&apos;s Gain/Loss</th>
              <th>% Today&apos;s Gain/Loss</th>
              <th>$ Total Gain/Loss</th>
              <th>% Total Gain/Loss</th>
              <th>Current Value</th>
              <th>% of Account</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.ticker}
                className="pf-port-tableRow"
                role="button"
                tabIndex={0}
                onClick={() => onPick(row.ticker)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onPick(row.ticker)
                  }
                }}
              >
                <td>
                  <div className="pf-port-symbolCell">
                    <div className="pf-port-symbolTop">{row.ticker}</div>
                    <div className="pf-port-symbolName">{row.name}</div>
                  </div>
                </td>
                <td>{fmtMoney(row.lastPrice)}</td>
                <td>{fmtMoney(row.avgCost)}</td>
                <td className={pctClass(row.dayChangeDollars)}>{fmtSignedMoney(row.dayChangeDollars)}</td>
                <td className={pctClass(row.todayDollars)}>{fmtSignedMoney(row.todayDollars)}</td>
                <td className={pctClass(row.changePct)}>{fmtSignedPct(row.changePct)}</td>
                <td className={pctClass(row.totalReturnDollars)}>{fmtSignedMoney(row.totalReturnDollars)}</td>
                <td className={pctClass(row.totalReturnPct)}>{fmtSignedPct(row.totalReturnPct)}</td>
                <td>{fmtMoney(row.marketValue)}</td>
                <td>{fmtSignedPct(row.pctOfAccount)}</td>
                <td>{row.shares.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
              </tr>
            ))}
          </tbody>
          {totals ? (
            <tfoot>
              <tr>
                <td>Total</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td className={pctClass(totals.todayDollars)}>{fmtSignedMoney(totals.todayDollars)}</td>
                <td className={pctClass(totals.todayPct)}>{fmtSignedPct(totals.todayPct)}</td>
                <td className={pctClass(totals.totalReturnDollars)}>{fmtSignedMoney(totals.totalReturnDollars)}</td>
                <td className={pctClass(totals.totalReturnPct)}>{fmtSignedPct(totals.totalReturnPct)}</td>
                <td>{fmtMoney(totals.marketValue)}</td>
                <td>{totals.totalAccountValue > 1e-6 ? '100.00%' : '0.00%'}</td>
                <td>—</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {totals ? (
        <div className="pf-port-summaryRows">
          <div className="pf-port-summaryRow">
            <span>Pending Activity</span>
            <span>{fmtSignedMoney(totals.pendingActivityDollars)}</span>
          </div>
          <div className="pf-port-summaryRow">
            <span>Total Account Value</span>
            <span>{fmtMoney(totals.totalAccountValue)}</span>
          </div>
          <div className="pf-port-summaryRow">
            <span>Today&apos;s Change</span>
            <span className={pctClass(totals.todayDollars)}>{fmtSignedMoney(totals.todayDollars)}</span>
          </div>
        </div>
      ) : null}
    </>
  )
}
