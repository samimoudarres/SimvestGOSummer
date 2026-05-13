import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { challengeAssets as a } from '../challenge/challengeAssets'
import {
  gameHostLine,
  gameTitle,
  slugToVariant,
  type GameChallengeVariant,
} from '../challenge/gameMeta'
import '../challenge/gameChallenge.css'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import { NetWorthInGameChart } from './NetWorthInGameChart'
import { PerformCompareChart } from './PerformCompareChart'
import { PerformComparePicker } from './PerformComparePicker'
import type { PerformCompareSeries, PerformCompareSeriesId, PerformStockRow } from './performTypes'
import { usePerformCompare } from './usePerformCompare'
import { usePerformDashboard } from './usePerformDashboard'
import { MiniSparkLine } from '../components/MiniSparkLine'
import type { ChartRange } from '../stocks/stockDetailTypes'
import { navigateToStock } from '../stocks/navigateToStock'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import { getSimvestUserId } from '../user/simvestUserId'
import './performScreen.css'

const CHART_RANGES: ChartRange[] = ['1D', '5D', '1M', '3M', '1Y', '5Y']

function compareStorageKey(slug: string) {
  return `simvest:perform-compare:v1:${slug}`
}

function loadCompareTokens(slug: string): string[] {
  try {
    const raw = localStorage.getItem(compareStorageKey(slug))
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function saveCompareTokens(slug: string, tokens: string[]) {
  try {
    localStorage.setItem(compareStorageKey(slug), JSON.stringify(tokens))
  } catch {
    /* quota / private mode */
  }
}

function FireIcon() {
  return (
    <svg className="pf-fire" viewBox="0 0 14 14" aria-hidden>
      <defs>
        <linearGradient id="pfFire" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff6b00" />
          <stop offset="100%" stopColor="#ffcc00" />
        </linearGradient>
      </defs>
      <path
        fill="url(#pfFire)"
        d="M7 1c.8 2.2 2.5 2.8 2.5 5.2 0 1.6-.9 2.9-2.2 3.4.3-.5.5-1.1.5-1.7 0-1.4-.8-2.6-2-3.2C4.6 6.5 3 8.2 3 10.2 3 11.5 3.6 12.6 4.5 13.3 3.3 12.5 2 10.5 2 8.1 2 5.4 4.2 3.1 7 1z"
      />
    </svg>
  )
}

function StockRows({
  rows,
  variant,
  onPick,
}: {
  rows: PerformStockRow[]
  variant: 'gainers' | 'losers'
  onPick: (symbol: string) => void
}) {
  return (
    <>
      {rows.map((row) => (
        <button
          key={row.symbol + variant}
          type="button"
          className="pf-stockRow"
          onClick={() => onPick(row.symbol)}
        >
          <span className="pf-stockLogoWrap">
            <img className="pf-stockLogo" src={row.logoUrl} alt="" />
          </span>
          <div>
            <p className="pf-stockSym">{row.symbol}</p>
            <p className="pf-stockCo">{row.companyName}</p>
          </div>
          <MiniSparkLine vals={row.sparkline} up={row.positive} />
          <p className="pf-stockPrice">{row.price}</p>
          <span
            className={`pf-pct ${row.positive ? 'pf-pct--up' : 'pf-pct--down'}${row.changeVariant === 'striped' ? ' pf-pct--striped' : ''}`}
          >
            {row.changeLabel}
          </span>
        </button>
      ))}
    </>
  )
}

export function PerformScreen() {
  const navigate = useNavigate()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? ''
  const variant: GameChallengeVariant = slugToVariant(slug)
  const isTemplate = variant === 'template'

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])

  const chromeStyle = useGameChromeCssVars(slug)

  const { data } = usePerformDashboard(slug)
  const viewerUserId = getSimvestUserId().trim()
  const [toast, setToast] = useState<string | null>(null)
  const [comparePickerOpen, setComparePickerOpen] = useState(false)
  const [compareTokens, setCompareTokens] = useState<string[]>([])
  const [chartRange, setChartRange] = useState<ChartRange>('1D')
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({ you: true })
  const [selectedSeries, setSelectedSeries] = useState<PerformCompareSeriesId | null>(null)

  useEffect(() => {
    setCompareTokens(loadCompareTokens(slug))
  }, [slug])

  const { data: compareData, status: compareStatus, error: compareError } = usePerformCompare(
    slug,
    chartRange,
    compareTokens,
  )

  useEffect(() => {
    if (!compareData?.series?.length) return
    setVisibleSeries((prev) => {
      const next = { ...prev }
      for (const s of compareData.series) {
        if (next[s.id] === undefined) next[s.id] = true
      }
      return next
    })
  }, [compareData])

  const persistCompareTokens = useCallback(
    (next: string[]) => {
      setCompareTokens(next)
      saveCompareTokens(slug, next)
    },
    [slug],
  )

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1600)
  }, [])

  const onStock = useCallback(
    (symbol: string) => {
      navigateToStock(navigate, symbol, {
        gameSlug: slug,
        challengeTitle: gameTitle(variant),
        returnPath: `/g/${slug}/perform`,
        navTab: 'perform',
      })
    },
    [navigate, slug, variant],
  )

  const toggleSeries = useCallback((id: string) => {
    setVisibleSeries((v) => ({ ...v, [id]: !v[id] }))
  }, [])

  const goBack = useCallback(() => {
    navigate(`/g/${slug}`)
  }, [navigate, slug])

  const onAddCompareToken = useCallback(
    (token: string) => {
      const t = token.trim()
      if (!t) return
      if (compareTokens.includes(t)) {
        showToast('Already on the chart.')
        return
      }
      if (compareTokens.length >= 5) {
        showToast('Remove a comparison first (max 5).')
        return
      }
      persistCompareTokens([...compareTokens, t])
    },
    [compareTokens, persistCompareTokens, showToast],
  )

  const onRemoveCompareToken = useCallback(
    (token: string) => {
      persistCompareTokens(compareTokens.filter((x) => x !== token))
    },
    [compareTokens, persistCompareTokens],
  )

  const removeComparisonBySeriesId = useCallback(
    (id: string) => {
      if (id === 'you') return
      if (!id.startsWith('user:') && !id.startsWith('stock:')) return
      if (!compareTokens.includes(id)) return
      persistCompareTokens(compareTokens.filter((t) => t !== id))
    },
    [compareTokens, persistCompareTokens],
  )

  const chartSeries = useMemo((): PerformCompareSeries[] => {
    if (compareData?.series?.length) return compareData.series
    if (compareStatus === 'loading') {
      return [
        {
          id: 'you',
          kind: 'you',
          legendLabel: 'You',
          color: '#0a95db',
          values: Array(8).fill(100),
        },
      ]
    }
    return []
  }, [compareData, compareStatus])

  const chartYAxis =
    compareData?.yAxisLabels?.length && compareData.series.length > 0
      ? compareData.yAxisLabels
      : ['105', '102', '100', '98', '95']

  const legendPairs = useMemo(() => {
    const rows: PerformCompareSeries[][] = []
    for (let i = 0; i < chartSeries.length; i += 2) {
      rows.push(chartSeries.slice(i, i + 2))
    }
    return rows
  }, [chartSeries])

  if (!gameSlug) {
    return <Navigate to="/" replace />
  }

  if (!data) {
    return (
      <div className="pf-root" style={chromeStyle}>
        <div className="pf-phone">
          <div className="pf-scroll">
            <p className="pf-loading">Loading…</p>
          </div>
          <ChallengeBottomNav gameSlug={slug} active="perform" />
        </div>
      </div>
    )
  }

  const title = gameTitle(variant)
  const host = gameHostLine(variant)

  return (
    <div className="pf-root" style={chromeStyle}>
      <div className="pf-phone">
        <div className="pf-scroll">
          <header className="gc-headerBand pf-performHeader">
            <button type="button" className="gc-back" aria-label="Back to game" onClick={goBack}>
              <img src={a.back} alt="" />
            </button>
            <button type="button" className="gc-headerMenu" aria-label="More options">
              <img src={a.ellipsisHeader} alt="" />
            </button>
            <h1 className="gc-title">{title}</h1>
            <p className="gc-host">{host}</p>
            <div className="gc-peopleRow">
              {isTemplate ? (
                <>
                  <div
                    className="gc-avatarSm gc-avatarHost"
                    style={{
                      background: '#e8e8e8',
                      border: '2px dashed #cfcfcf',
                    }}
                    aria-hidden
                  />
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="gc-avatarSm"
                      style={{
                        background: '#ececec',
                        border: '2px dashed #d8d8d8',
                      }}
                      aria-hidden
                    />
                  ))}
                </>
              ) : (
                <>
                  <img className="gc-avatarHost" src={a.avatarHost} alt="" width={36} height={36} />
                  <img className="gc-avatarSm" src={a.avatarA} alt="" />
                  <img className="gc-avatarSm" src={a.avatarB} alt="" />
                  <img className="gc-avatarSm" src={a.avatarC} alt="" />
                  <img className="gc-avatarSm" src={a.avatarD} alt="" />
                </>
              )}
              <button type="button" className="gc-invitePill">
                <img src={a.plusIcon} alt="" />
                <span>Invite</span>
              </button>
            </div>
            {isTemplate ? (
              <p className="gc-names">
                <strong className="gc-muted">Players you invite will appear here.</strong>
              </p>
            ) : (
              <p className="gc-names">
                <strong>Charlie Brown</strong>
                <span className="gc-muted">, </span>
                <strong>Marley Woodson</strong>
                <span className="gc-muted">, </span>
                <strong>Devin Michaels</strong>
                <span className="gc-muted">, and </span>
                <strong>32 others</strong>
              </p>
            )}
          </header>

          <section className="pf-statsCard" aria-label="Performance summary">
            <div className="pf-statCol">
              <p className="pf-statLab">Your Net Worth</p>
              <p className="pf-statVal">{data.stats.netWorth}</p>
              <p className="pf-statSub">{data.stats.netWorthSub}</p>
            </div>
            <div className="pf-statCol">
              <p className="pf-statLab">Total Return</p>
              <p className="pf-statVal">{data.stats.totalReturn}</p>
              <p className="pf-statSub">{data.stats.totalReturnSub}</p>
            </div>
            <div className="pf-statCol pf-statCol--today">
              <p className="pf-statLab">Today&apos;s Return</p>
              <p className="pf-statVal">{data.stats.todayReturn}</p>
              <p className="pf-statSub">{data.stats.todayReturnSub}</p>
              <FireIcon />
            </div>
          </section>

          <div className="pf-rankBar" aria-label="Rank">
            <div className="pf-rankTextRow">
              <span className="pf-rankLead">You&apos;re ranked</span>
              <span className="pf-rankNum">{data.rank.rankOrdinal}</span>
              <span className="pf-rankTrail">{data.rank.outOfLabel}</span>
            </div>
            <div className="pf-rankStreak">
              <span className="pf-rankStreakFire" aria-hidden>
                <FireIcon />
              </span>
              <span className="pf-rankStreakText">{data.rank.streakLabel}</span>
            </div>
          </div>

          {viewerUserId.length >= 8 ? (
            <NetWorthInGameChart gameSlug={slug} userId={viewerUserId} />
          ) : null}

          <div className="pf-carousel">
            <div className="pf-carouselTrack">
              <section className="pf-panel" aria-label="Top gainers">
                <h2 className="pf-panelTitle">Your top gainers</h2>
                <StockRows rows={data.topGainers} variant="gainers" onPick={onStock} />
              </section>
              <section className="pf-panel pf-panel--losers" aria-label="Top losers">
                <h2 className="pf-panelTitle">Your top losers</h2>
                <StockRows rows={data.topLosers} variant="losers" onPick={onStock} />
              </section>
            </div>
          </div>

          <h2 className="pf-compareTitle">COMPARE PERFORMANCE</h2>
          <section className="pf-compareCard" aria-label="Compare performance chart">
            <div className="pf-compareHead">
              <div>
                <p className="pf-netWorthLab">COMPARE</p>
              </div>
              <button
                type="button"
                className="pf-addCompare"
                onClick={() => setComparePickerOpen(true)}
              >
                <img src={a.plusIcon} alt="" />
                Add Comparison
              </button>
            </div>

            <div className="pf-rangeRow pf-rangeRow--perform">
              {CHART_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`pf-rangePill${r === chartRange ? ' pf-rangePill--active' : ''}`}
                  onClick={() => setChartRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            {compareData?.warnings?.length ? (
              <ul className="pf-compareWarnings">
                {compareData.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}

            {compareError ? <p className="pf-compareError">{compareError}</p> : null}

            <div className="pf-legendGrid pf-legendGrid--flow">
              {legendPairs.map((pair, rowIdx) => (
                <Fragment key={rowIdx}>
                  {pair.map((s) => {
                    const off = visibleSeries[s.id] === false
                    const removable = s.kind === 'player' || s.kind === 'stock'
                    return (
                      <div key={s.id} className="pf-legendCell">
                        <button
                          type="button"
                          className={`pf-legendBtn${off ? ' pf-legendBtn--off' : ''}`}
                          onClick={() => toggleSeries(s.id)}
                          aria-pressed={!off}
                        >
                          <span
                            className="pf-legendSwatch"
                            style={{ backgroundColor: s.color }}
                            aria-hidden
                          />
                          {(s.kind === 'you' || s.kind === 'player') && s.avatarUrl ? (
                            <img className="pf-legAvatar" src={s.avatarUrl} alt="" />
                          ) : null}
                          {s.legendIcon === 'clock' ? (
                            <svg className="pf-clockIcon" viewBox="0 0 24 24" aria-hidden width={22} height={22}>
                              <circle cx="12" cy="12" r="9" fill="none" stroke="#777" strokeWidth="1.5" />
                              <path
                                d="M12 7v5l3 2"
                                fill="none"
                                stroke="#777"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : null}
                          <span className="pf-legendBtnText">{s.legendLabel}</span>
                        </button>
                        {removable ? (
                          <button
                            type="button"
                            className="pf-legendRemove"
                            aria-label={`Remove ${s.legendLabel} from comparison`}
                            onClick={() => removeComparisonBySeriesId(s.id)}
                          >
                            ×
                          </button>
                        ) : (
                          <span className="pf-legendRemoveSpacer" aria-hidden />
                        )}
                      </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>

            <PerformCompareChart
              yAxisLabels={chartYAxis}
              series={chartSeries}
              visible={visibleSeries}
              selected={selectedSeries}
              onSelectLine={setSelectedSeries}
              interactive={compareStatus !== 'loading' && chartSeries.length > 0}
              sampledAtMs={compareData?.sampledAtMs}
              chartRange={compareData?.range ?? chartRange}
            />

            {compareStatus === 'loading' && !compareData ? (
              <p className="pf-compareLoading">Updating chart…</p>
            ) : null}
          </section>
        </div>

        {toast ? <div className="pf-toast">{toast}</div> : null}

        <PerformComparePicker
          open={comparePickerOpen}
          gameSlug={slug}
          existingTokens={compareTokens}
          onClose={() => setComparePickerOpen(false)}
          onAddToken={onAddCompareToken}
          onRemoveToken={onRemoveCompareToken}
        />

        <ChallengeBottomNav gameSlug={slug} active="perform" />
      </div>
    </div>
  )
}
