import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { gameHostLine, gameTitle, slugToVariant, type GameChallengeVariant } from '../challenge/gameMeta'
import '../challenge/gameChallenge.css'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import { MiniSparkLine } from '../components/MiniSparkLine'
import { navigateToStock } from '../stocks/navigateToStock'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import '../perform/performScreen.css'
import {
  PORTFOLIO_SORT_OPTIONS,
  sortPortfolioRows,
  type PortfolioApiRow,
  type PortfolioSortMode,
} from './portfolioTypes'
import { DetailedPortfolioTable } from './DetailedPortfolioTable'
import { usePortfolio } from './usePortfolio'
import './portfolioScreen.css'

export function PortfolioScreen() {
  const navigate = useNavigate()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? ''
  const variant: GameChallengeVariant = slugToVariant(slug)

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])
  const chromeStyle = useGameChromeCssVars(slug)
  const isTemplate = variant === 'template'

  const { rows, totals, status, error } = usePortfolio(slug)
  const [sortMode, setSortMode] = useState<PortfolioSortMode>('total_pct')
  const [sortOpen, setSortOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview')
  const sortRef = useRef<HTMLDivElement>(null)

  const sortedRows = useMemo(() => sortPortfolioRows(rows, sortMode), [rows, sortMode])
  const sortLabel = PORTFOLIO_SORT_OPTIONS.find((o) => o.id === sortMode)?.label ?? 'Total % Return'

  useEffect(() => {
    if (!sortOpen) return
    const onDoc = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [sortOpen])

  const goBack = useCallback(() => {
    navigate(`/g/${slug}`)
  }, [navigate, slug])

  const onStock = useCallback(
    (symbol: string) => {
      navigateToStock(navigate, symbol, {
        gameSlug: slug,
        challengeTitle: gameTitle(variant),
        returnPath: `/g/${slug}/portfolio`,
        navTab: 'portfolio',
      })
    },
    [navigate, slug, variant],
  )

  const title = gameTitle(variant)
  const host = gameHostLine(variant)

  if (!gameSlug) {
    return <Navigate to="/" replace />
  }

  if ((status === 'loading' || status === 'idle') && rows.length === 0 && totals === null) {
    return (
      <div className="pf-root" style={chromeStyle}>
        <div className="pf-phone pf-phone--portfolio">
          <div className="pf-port-body">
            <p className="pf-loading">Loading portfolio…</p>
          </div>
          <ChallengeBottomNav gameSlug={slug} active="portfolio" />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="pf-root" style={chromeStyle}>
        <div className="pf-phone pf-phone--portfolio">
          <div className="pf-port-body">
            <p className="pf-port-err">{error ?? 'Could not load portfolio.'}</p>
          </div>
          <ChallengeBottomNav gameSlug={slug} active="portfolio" />
        </div>
      </div>
    )
  }

  return (
    <div className="pf-root" style={chromeStyle}>
      <div className="pf-phone pf-phone--portfolio">
        <div className="pf-port-body">
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

          <section className="pf-port-sheet" aria-label="Your investments">
            <div className="pf-port-investHead">
              <h2 className="pf-port-investTitle">INVESTMENTS</h2>
              <div className="pf-port-headControls">
                <div className="pf-port-toggle" role="tablist" aria-label="Portfolio view">
                  <button
                    type="button"
                    role="tab"
                    className={`pf-port-toggleBtn${viewMode === 'overview' ? ' pf-port-toggleBtn--active' : ''}`}
                    aria-selected={viewMode === 'overview'}
                    onClick={() => setViewMode('overview')}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`pf-port-toggleBtn${viewMode === 'detailed' ? ' pf-port-toggleBtn--active' : ''}`}
                    aria-selected={viewMode === 'detailed'}
                    onClick={() => setViewMode('detailed')}
                  >
                    Detailed
                  </button>
                </div>
                <div className="pf-port-sort" ref={sortRef}>
                  <button
                    type="button"
                    className="pf-port-sortBtn"
                    aria-expanded={sortOpen}
                    aria-haspopup="listbox"
                    aria-label="Sort investments"
                    onClick={() => setSortOpen((v) => !v)}
                  >
                    {sortLabel}
                    <svg className="pf-port-sortChev" viewBox="0 0 24 24" aria-hidden>
                      <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
                    </svg>
                  </button>
                  {sortOpen ? (
                    <ul className="pf-port-menu" role="listbox" aria-label="Sort by">
                      {PORTFOLIO_SORT_OPTIONS.map((opt) => (
                        <li key={opt.id} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={sortMode === opt.id}
                            className={`pf-port-menu__opt${sortMode === opt.id ? ' pf-port-menu__opt--active' : ''}`}
                            onClick={() => {
                              setSortMode(opt.id)
                              setSortOpen(false)
                            }}
                          >
                            {opt.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>

            {!sortedRows.length ? (
              <p className="pf-port-empty">
                No holdings for this game yet. Positions are stored on the server in{' '}
                <code>server/data/holdings.json</code> (per game slug).
              </p>
            ) : viewMode === 'overview' ? (
              sortedRows.map((row) => (
                <PortfolioRow key={row.ticker} row={row} onPick={() => onStock(row.ticker)} />
              ))
            ) : (
              <DetailedPortfolioTable rows={sortedRows} totals={totals} onPick={onStock} />
            )}
          </section>
        </div>

        <ChallengeBottomNav gameSlug={slug} active="portfolio" />
      </div>
    </div>
  )
}

function PortfolioRow({ row, onPick }: { row: PortfolioApiRow; onPick: () => void }) {
  return (
    <button type="button" className="pf-stockRow" onClick={onPick}>
      <span className="pf-stockLogoWrap">
        <img className="pf-stockLogo" src={row.logoUrl} alt="" />
      </span>
      <div>
        <p className="pf-stockSym">{row.ticker}</p>
        <p className="pf-stockCo">{row.name}</p>
      </div>
      <MiniSparkLine vals={row.sparkline} up={row.positive} />
      <p className="pf-stockPrice">{row.priceDisplay}</p>
      <span className={`pf-pct ${row.positive ? 'pf-pct--up' : 'pf-pct--down'}`}>{row.changeLabel}</span>
    </button>
  )
}

