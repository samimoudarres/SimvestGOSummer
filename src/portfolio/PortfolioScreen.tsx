import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { challengeAssets as a } from '../challenge/challengeAssets'
import '../challenge/gameChallenge.css'
import { GameShellRosterBlock } from '../challenge/GameShellRosterBlock'
import { useGameChallengeHeader } from '../challenge/useGameChallengeHeader'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import { MiniSparkLine } from '../components/MiniSparkLine'
import { navigateToStock } from '../stocks/navigateToStock'
import { StockBrandingImage } from '../components/StockBrandingImage'
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
  const headerCtl = useGameChallengeHeader(slug)

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])
  const chromeStyle = useGameChromeCssVars(slug)

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

  const openProfile = useCallback(
    (userId: string) => {
      navigate(`/g/${slug}/profile/${encodeURIComponent(userId)}`)
    },
    [navigate, slug],
  )

  const onInviteFromTab = useCallback(() => {
    navigate(`/g/${encodeURIComponent(slug)}`)
  }, [navigate, slug])

  const onStock = useCallback(
    (symbol: string) => {
      navigateToStock(navigate, symbol, {
        gameSlug: slug,
        challengeTitle: headerCtl.headerTitle,
        returnPath: `/g/${slug}/portfolio`,
        navTab: 'portfolio',
      })
    },
    [navigate, slug, headerCtl.headerTitle],
  )

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
          <ChallengeBottomNav gameSlug={slug} active="portfolio" tradeLocked={headerCtl.gameHasEnded} />
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
          <ChallengeBottomNav gameSlug={slug} active="portfolio" tradeLocked={headerCtl.gameHasEnded} />
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
            <div className="gc-headerCopy">
              <h1 className="gc-title">{headerCtl.headerTitle}</h1>
              <p className="gc-host">{headerCtl.headerHost}</p>
              {headerCtl.headerCountdown ? (
                <p className="gc-countdown" aria-live="polite">
                  {headerCtl.headerCountdown}
                </p>
              ) : null}
            </div>
            <GameShellRosterBlock
              shellIsLive={headerCtl.shellIsLive}
              rosterStatus={headerCtl.rosterStatus}
              rosterMembers={headerCtl.rosterMembers}
              totalPlayers={headerCtl.totalPlayers}
              onInviteClick={onInviteFromTab}
              onMemberProfileClick={openProfile}
            />
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
                    <span className="pf-port-sortBtnLabel">{sortLabel}</span>
                    <span
                      className={`pf-port-sortChevWrap${sortOpen ? ' pf-port-sortChevWrap--open' : ''}`}
                      aria-hidden
                    >
                      <img src={a.chevronDown} alt="" />
                    </span>
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
                Start trading to build your portfolio! Tap the gold Trade button at the bottom center of the screen to browse stocks and open positions.
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

        <ChallengeBottomNav gameSlug={slug} active="portfolio" tradeLocked={headerCtl.gameHasEnded} />
      </div>
    </div>
  )
}

function PortfolioRow({ row, onPick }: { row: PortfolioApiRow; onPick: () => void }) {
  return (
    <button type="button" className="pf-stockRow" onClick={onPick}>
      <span className="pf-stockLogoWrap">
        <StockBrandingImage className="pf-stockLogo" src={row.logoUrl} alt="" />
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

