import { useMemo, useState } from 'react'
import { StockPriceChart } from '../stocks/StockPriceChart'
import type { ChartRange } from '../stocks/stockDetailTypes'
import '../stocks/stockDetail.css'
import { usePlayerNetWorthChart } from './usePlayerNetWorthChart'

type Props = {
  gameSlug: string
  userId: string
  enabled?: boolean
}

export function NetWorthInGameChart({ gameSlug, userId, enabled = true }: Props) {
  const [range, setRange] = useState<ChartRange>('1D')
  const { data, status, error } = usePlayerNetWorthChart(gameSlug, userId, range, enabled)

  const bars = useMemo(() => {
    if (!data?.bars?.length) return []
    return data.bars.map((b) => ({
      t: b.t,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: b.v ?? 0,
    }))
  }, [data])

  const loading = enabled && !data && (status === 'loading' || status === 'idle')
  const err = enabled ? error : null

  return (
    <section className="pf-nwChartWrap" aria-label="Net worth in this game">
      <p className="pf-netWorthLab pf-nwChartTitle">NET WORTH</p>
      <StockPriceChart
        bars={bars}
        range={range}
        onRangeChange={setRange}
        loading={loading}
        error={err}
        ariaLabel="Net worth chart"
        idleHintText="Move across the chart to see net worth and time at each point."
        emptyBarsMessage="No net worth history for this range yet. Open Portfolio or Perform, or trade in this game to record points."
      />
    </section>
  )
}
