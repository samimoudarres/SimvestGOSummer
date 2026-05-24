import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { useGameChallengeHeader } from '../challenge/useGameChallengeHeader'
import '../challenge/gameChallenge.css'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import { MiniSparkLine } from '../components/MiniSparkLine'
import type { PerformStockRow } from '../perform/performTypes'
import '../perform/performScreen.css'
import '../portfolio/portfolioScreen.css'
import {
  PORTFOLIO_SORT_OPTIONS,
  sortPortfolioRows,
  type PortfolioApiRow,
  type PortfolioSortMode,
} from '../portfolio/portfolioTypes'
import { navigateToStock } from '../stocks/navigateToStock'
import { StockBrandingImage } from '../components/StockBrandingImage'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import { getSimvestUserId } from '../user/simvestUserId'
import { resolveProfileAvatarUrl } from '../user/resolveProfileAvatarUrl'
import { DetailedPortfolioTable } from '../portfolio/DetailedPortfolioTable'
import { NetWorthInGameChart } from '../perform/NetWorthInGameChart'
import { usePlayerGameProfile } from './usePlayerGameProfile'
import './playerProfile.css'

function FireIcon() {
  return (
    <svg className="pf-fire" viewBox="0 0 14 14" aria-hidden>
      <defs>
        <linearGradient id="ppFire" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff6b00" />
          <stop offset="100%" stopColor="#ffcc00" />
        </linearGradient>
      </defs>
      <path
        fill="url(#ppFire)"
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
            <StockBrandingImage className="pf-stockLogo" src={row.logoUrl} alt="" />
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

export function UserProfileScreen() {
  const navigate = useNavigate()
  const { gameSlug, userId: userIdParam } = useParams<{ gameSlug: string; userId: string }>()
  const slug = gameSlug ?? ''
  const profileUserId = userIdParam ? decodeURIComponent(userIdParam) : ''
  const headerCtl = useGameChallengeHeader(slug)
  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])
  const chromeStyle = useGameChromeCssVars(slug)

  const { data, status, error } = usePlayerGameProfile(slug, profileUserId)
  const [sortMode, setSortMode] = useState<PortfolioSortMode>('total_pct')
  const [sortOpen, setSortOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview')
  const sortRef = useRef<HTMLDivElement>(null)

  const sortedHoldings = useMemo(
    () => sortPortfolioRows(data?.holdings ?? [], sortMode),
    [data?.holdings, sortMode],
  )
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

  const returnPath = useMemo(
    () => `/g/${slug}/profile/${encodeURIComponent(profileUserId)}`,
    [slug, profileUserId],
  )

  const onStock = useCallback(
    (symbol: string) => {
      navigateToStock(navigate, symbol, {
        gameSlug: slug,
        challengeTitle: headerCtl.headerTitle,
        returnPath,
        navTab: 'activity',
      })
    },
    [navigate, slug, headerCtl.headerTitle, returnPath],
  )

  if (!gameSlug) {
    return <Navigate to="/" replace />
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="pf-root" style={chromeStyle}>
        <div className="pf-phone pf-phone--profile">
          <div className="pf-scroll">
            <p className="pf-loading">Loading profile…</p>
          </div>
          <ChallengeBottomNav gameSlug={slug} active="profile" tradeLocked={headerCtl.gameHasEnded} />
        </div>
      </div>
    )
  }

  if (status === 'error' || !data) {
    return (
      <div className="pf-root" style={chromeStyle}>
        <div className="pf-phone pf-phone--profile">
          <div className="pf-scroll">
            <header className="gc-headerBand pp-topBand">
              <button type="button" className="gc-back" aria-label="Back" onClick={goBack}>
                <img src={a.back} alt="" />
              </button>
            </header>
            <p className="pp-err">{error ?? 'Profile unavailable.'}</p>
          </div>
          <ChallengeBottomNav gameSlug={slug} active="profile" tradeLocked={headerCtl.gameHasEnded} />
        </div>
      </div>
    )
  }

  const { profile, stats, rank, topGainers, topLosers, totals } = data
  const viewerId = getSimvestUserId().trim()
  const isOwnProfile = viewerId.length >= 8 && viewerId === profile.userId
  const displayFirst = (profile.displayName || 'Player').trim().split(/\s+/)[0] || 'Player'
  const rankLeadText = isOwnProfile ? "You're ranked" : `${displayFirst} is ranked`
  const memberLine =
    profile.memberDays === 1 ? '1 day on Simvest' : `${profile.memberDays} days on Simvest`
  const gameLine =
    profile.daysInThisGame == null
      ? 'This challenge: —'
      : profile.daysInThisGame === 1
        ? 'This challenge: 1 day'
        : `This challenge: ${profile.daysInThisGame} days`
  const gameLineTitle =
    profile.daysInThisGame == null
      ? 'Recorded when you open Perform or Portfolio, or complete a trade in this game.'
      : undefined

  return (
    <div className="pf-root" style={chromeStyle}>
      <div className="pf-phone pf-phone--profile">
        <div className="pf-scroll">
          <header className="gc-headerBand pp-topBand">
            <button type="button" className="gc-back" aria-label="Back to game" onClick={goBack}>
              <img src={a.back} alt="" />
            </button>
            <button type="button" className="gc-headerMenu" aria-label="More options">
              <img src={a.ellipsisHeader} alt="" />
            </button>

            <div className="pp-challengeIntro">
              <h1 className="pp-challengeTitle">{headerCtl.headerTitle}</h1>
              <p className="pp-challengeHost">{headerCtl.headerHost}</p>
            </div>

            <div className="pp-identity">
              <img className="pp-avatar" src={resolveProfileAvatarUrl(profile.avatarUrl)} alt="" width={64} height={64} />
              <div className="pp-identityText">
                <p className="pp-displayName">{profile.displayName}</p>
                {profile.username ? <p className="pp-username">@{profile.username}</p> : null}
                <p className="pp-memberLine">{memberLine}</p>
                <p
                  className={`pp-gameLine${profile.daysInThisGame == null ? ' pp-gameLine--empty' : ''}`}
                  title={gameLineTitle}
                >
                  {gameLine}
                </p>
              </div>
            </div>
            <p className="pp-perfHint">Performance · {headerCtl.headerTitle}</p>
          </header>

          <section className="pf-statsCard" aria-label="Performance summary">
            <div className="pf-statCol">
              <p className="pf-statLab">Net Worth</p>
              <p className="pf-statVal">{stats.netWorth}</p>
              <p className="pf-statSub">{stats.netWorthSub}</p>
            </div>
            <div className="pf-statCol">
              <p className="pf-statLab">Total Return</p>
              <p className="pf-statVal">{stats.totalReturn}</p>
              <p className="pf-statSub">{stats.totalReturnSub}</p>
            </div>
            <div className="pf-statCol pf-statCol--today">
              <p className="pf-statLab">Today&apos;s Return</p>
              <p className="pf-statVal">{stats.todayReturn}</p>
              <p className="pf-statSub">{stats.todayReturnSub}</p>
            </div>
          </section>

          <div
            className={`pf-rankBar${rank.streakLabel ? '' : ' pf-rankBar--noStreak'}`}
            aria-label="Rank"
          >
            <div className="pf-rankTextRow">
              <span className="pf-rankLead">{rankLeadText}</span>
              <span className="pf-rankNum">{rank.rankOrdinal}</span>
              <span className="pf-rankTrail">{rank.outOfLabel}</span>
            </div>
            {rank.streakLabel ? (
              <div className="pf-rankStreak">
                <span className="pf-rankStreakFire" aria-hidden>
                  <FireIcon />
                </span>
                <span className="pf-rankStreakText">{rank.streakLabel}</span>
              </div>
            ) : null}
          </div>

          {profile.userId.length >= 8 ? (
            <NetWorthInGameChart gameSlug={slug} userId={profile.userId} />
          ) : null}

          <div className="pf-carousel">
            <div className="pf-carouselTrack">
              <section className="pf-panel" aria-label="Top gainers">
                <h2 className="pf-panelTitle">Top gainers (today)</h2>
                <StockRows rows={topGainers} variant="gainers" onPick={onStock} />
              </section>
              <section className="pf-panel pf-panel--losers" aria-label="Top losers">
                <h2 className="pf-panelTitle">Top losers (today)</h2>
                <StockRows rows={topLosers} variant="losers" onPick={onStock} />
              </section>
            </div>
          </div>

          <section className="pf-port-sheet pp-holdings" aria-label="Investments">
            <div className="pf-port-investHead">
              <h2 className="pf-port-investTitle">ALL INVESTMENTS</h2>
              <div className="pf-port-headControls">
                <div className="pf-port-toggle" role="tablist" aria-label="Investments view">
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
            {!sortedHoldings.length ? (
              <p className="pf-port-empty">No positions to display.</p>
            ) : viewMode === 'overview' ? (
              sortedHoldings.map((row) => (
                <PortfolioRow key={row.ticker} row={row} onPick={() => onStock(row.ticker)} />
              ))
            ) : (
              <DetailedPortfolioTable rows={sortedHoldings} totals={totals} onPick={onStock} />
            )}
          </section>
        </div>

        <ChallengeBottomNav gameSlug={slug} active="profile" tradeLocked={headerCtl.gameHasEnded} />
      </div>
    </div>
  )
}
