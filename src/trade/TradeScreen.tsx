import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { useGameChallengeHeader } from '../challenge/useGameChallengeHeader'
import '../challenge/gameChallenge.css'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import '../perform/performScreen.css'
import { MiniSparkLine } from '../components/MiniSparkLine'
import { navigateToStock } from '../stocks/navigateToStock'
import { ApiImage } from '../components/ApiImage'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import type { CategoryIcon, CategoryVisual, TradeBrowseRow, TradeCategoryId } from './tradeTypes'
import { TRADE_CATEGORY_OPTIONS, TRADE_CATEGORY_VISUALS, categoryIconSrc } from './tradeTypes'
import { displayTickerLabel, isMassiveCryptoSymbol } from '../stocks/displayTicker'
import { useTradeBrowse } from './useTradeBrowse'
import { useGameFollowTickers } from './useGameFollowTickers'
import { useTradeSearchResults } from './useTradeSearch'
import './tradeScreen.css'

const RECENT_STORAGE_KEY = 'simvest-trade-recent-tickers-v1'

/** Category card corner logos — same `ApiImage` path as the browse list (native-safe `/api/...`). */
function TradeCategoryIconStrip({
  icons,
}: {
  icons: readonly [CategoryIcon, CategoryIcon, CategoryIcon]
}) {
  return (
    <span className="tr-catBtnIcons" aria-hidden="true">
      <ApiImage className="tr-catBtnIcon tr-catBtnIcon--left" src={categoryIconSrc(icons[2])} alt="" decoding="async" />
      <ApiImage className="tr-catBtnIcon tr-catBtnIcon--mid" src={categoryIconSrc(icons[1])} alt="" decoding="async" />
      <ApiImage className="tr-catBtnIcon tr-catBtnIcon--right" src={categoryIconSrc(icons[0])} alt="" decoding="async" />
    </span>
  )
}

function persistRecentTickers(syms: string[]) {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(syms))
  } catch {
    /* quota / private mode */
  }
}

function readRecentTickers(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    const j = raw ? JSON.parse(raw) : []
    if (!Array.isArray(j)) return []
    const list = j.filter((x): x is string => typeof x === 'string')
    const cleaned = list.filter((s) => !isMassiveCryptoSymbol(s)).slice(0, 12)
    if (cleaned.length !== list.length) persistRecentTickers(cleaned)
    return cleaned
  } catch {
    return []
  }
}

export function TradeScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? ''
  const headerCtl = useGameChallengeHeader(slug)

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])

  const chromeStyle = useGameChromeCssVars(slug)

  const headerSubtitle = headerCtl.headerTitle.toUpperCase()

  const [category, setCategory] = useState<TradeCategoryId>('popular')
  const categoryStripOrder = useMemo(
    () => [
      ...TRADE_CATEGORY_OPTIONS.filter((c) => c.id !== 'crypto'),
      ...TRADE_CATEGORY_OPTIONS.filter((c) => c.id === 'crypto'),
    ],
    [],
  )
  const { payload, status, error } = useTradeBrowse(slug, category)
  const followPreviewTickers = useGameFollowTickers(slug || undefined)

  useEffect(() => {
    if (category === 'crypto') setCategory('popular')
  }, [category])

  const rows = useMemo(() => {
    if (!payload || payload.category !== category) return []
    return payload.rows.filter((row) => !isMassiveCryptoSymbol(row.symbol))
  }, [payload, category])

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [recentTickers, setRecentTickers] = useState<string[]>(() => readRecentTickers())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const buyJumpApplied = useRef(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 80)
    return () => window.clearTimeout(t)
  }, [query])

  /** Stock detail “Buy” jumps here with search prefilled. */
  useEffect(() => {
    if (buyJumpApplied.current) return
    const st = location.state as { tradeSearchQuery?: string } | undefined
    const q = st?.tradeSearchQuery
    if (typeof q !== 'string' || q.trim().length < 1) return
    const trimmed = q.trim()
    if (isMassiveCryptoSymbol(trimmed)) {
      buyJumpApplied.current = true
      navigate(location.pathname, { replace: true, state: {} })
      return
    }
    buyJumpApplied.current = true
    setSearchOpen(true)
    setQuery(trimmed)
    setDebouncedQuery(trimmed)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    if (!searchOpen) return
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setQuery('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const {
    rows: searchRows,
    status: searchStatus,
    error: searchError,
  } = useTradeSearchResults(slug, searchOpen, debouncedQuery, recentTickers)

  const goBack = useCallback(() => {
    navigate(`/g/${slug}`)
  }, [navigate, slug])

  const onStock = useCallback(
    (symbol: string) => {
      navigateToStock(navigate, symbol, {
        gameSlug: slug,
        challengeTitle: headerCtl.headerTitle,
        returnPath: `/g/${slug}/trade`,
        navTab: 'trade',
      })
    },
    [navigate, slug, headerCtl.headerTitle],
  )

  const pushRecentAndNavigate = useCallback(
    (symbol: string) => {
      if (isMassiveCryptoSymbol(symbol)) return
      setRecentTickers((prev) => {
        const next = [symbol, ...prev.filter((x) => x !== symbol)].slice(0, 12)
        persistRecentTickers(next)
        return next
      })
      setSearchOpen(false)
      setQuery('')
      onStock(symbol)
    },
    [onStock],
  )

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQuery('')
  }, [])

  const showingResultsLabel = query.trim().length > 0

  if (!gameSlug) {
    return <Navigate to="/" replace />
  }
  if (headerCtl.gameHasEnded) {
    return <Navigate to={`/g/${encodeURIComponent(slug)}/perform`} replace />
  }

  return (
    <div className="pf-root" style={chromeStyle}>
      <div className="pf-phone pf-phone--trade">
        <div className="tr-body">
          <header className="tr-topBand tr-topBand--browse">
            <button type="button" className="tr-back" aria-label="Back to game" onClick={goBack}>
              <img src={a.back} alt="" />
            </button>
            <h1 className="tr-headerTitle">TRADE</h1>
            <span className="tr-headerMenu" aria-hidden="true">
              <img src={a.ellipsisHeader} alt="" />
            </span>
            <p className="tr-headerSubtitle">{headerSubtitle}</p>
            <button
              type="button"
              className="tr-searchEntryPill"
              aria-label="Search stocks and ETFs"
              onClick={() => {
                setQuery('')
                setDebouncedQuery('')
                setSearchOpen(true)
              }}
            >
              <img src={a.searchMagnifier} alt="" className="tr-searchEntryIcon" />
              <span className="tr-searchEntryText">Search stocks and ETFs</span>
            </button>
          </header>

          <div className="tr-mainScroll">
            <p className="tr-simDisclaimer" role="note">
              Simulated trading only — virtual funds. Not real money or investment advice.
            </p>
            <div className="tr-catSection">
              <p className="tr-catSectionLabel">Start browsing</p>
              <div className="tr-catScroll">
                <div className="tr-catTrack" role="tablist" aria-label="Browse by category">
                  {categoryStripOrder.map((c) => {
                    const baseVisual = TRADE_CATEGORY_VISUALS[c.id]
                    let visual: CategoryVisual = baseVisual
                    if (c.id === 'following') {
                      const icons: [CategoryIcon, CategoryIcon, CategoryIcon] = [
                        followPreviewTickers[0]
                          ? { ticker: followPreviewTickers[0] }
                          : baseVisual.icons[0],
                        followPreviewTickers[1]
                          ? { ticker: followPreviewTickers[1] }
                          : baseVisual.icons[1],
                        followPreviewTickers[2]
                          ? { ticker: followPreviewTickers[2] }
                          : baseVisual.icons[2],
                      ]
                      visual = { ...baseVisual, icons }
                    }
                    const style = {
                      '--tr-catColor': visual.borderColor,
                      '--tr-catGlow': visual.glowColor,
                    } as CSSProperties
                    const isCryptoCard = c.id === 'crypto'
                    return isCryptoCard ? (
                      <div
                        key={c.id}
                        role="tab"
                        aria-selected={false}
                        aria-disabled="true"
                        tabIndex={-1}
                        aria-label="Crypto, coming soon"
                        className="tr-catBtn tr-catBtn--comingSoon"
                        style={style}
                      >
                        <span className="tr-catBtnLabel">{c.label}</span>
                        <TradeCategoryIconStrip icons={visual.icons} />
                        <span className="tr-catComingSoonRibbon" aria-hidden="true">
                          coming soon
                        </span>
                      </div>
                    ) : (
                      <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={category === c.id}
                        className={`tr-catBtn${category === c.id ? ' tr-catBtn--on' : ''}`}
                        style={style}
                        onClick={() => setCategory(c.id)}
                      >
                        <span className="tr-catBtnLabel">{c.label}</span>
                        <TradeCategoryIconStrip icons={visual.icons} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="tr-listArea">
              {status === 'loading' && rows.length === 0 ? (
                <ul className="tr-skel" aria-hidden>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <li key={i} className="tr-skelRow" />
                  ))}
                </ul>
              ) : null}
              {status === 'loading' && rows.length > 0 ? <p className="tr-load tr-load--inline">Updating…</p> : null}
              {status === 'error' ? <p className="tr-err">{error ?? 'Something went wrong.'}</p> : null}
              {status === 'ready' && !rows.length ? (
                <p className="tr-hint">No symbols in this category right now. Try another tab.</p>
              ) : null}
              {status === 'ready'
                ? rows.map((row) => (
                    <TradeRow
                      key={row.symbol}
                      row={row}
                      displaySym={displayTickerLabel(row.symbol)}
                      onPick={() => onStock(row.symbol)}
                    />
                  ))
                : null}
            </div>
          </div>
        </div>

        <ChallengeBottomNav gameSlug={slug} active="trade" tradeLocked={headerCtl.gameHasEnded} />

        {searchOpen ? (
          <div className="tr-searchOverlay" role="dialog" aria-modal="true" aria-label="Search stocks">
            <div className="tr-searchOverlayInner">
              <div className="tr-searchGold">
                <div className="tr-searchTopRow">
                  <label className="tr-searchPillField">
                    <img src={a.searchMagnifier} alt="" className="tr-searchPillIcon" />
                    <input
                      ref={searchInputRef}
                      className="tr-searchFieldInput"
                      type="search"
                      name="trade-stock-search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search stocks and ETFs"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      autoCapitalize="none"
                      enterKeyHint="search"
                      aria-label="Search query"
                    />
                  </label>
                  <button type="button" className="tr-searchCancel" onClick={closeSearch}>
                    Cancel
                  </button>
                </div>
              </div>

              <div className="tr-searchScroll">
                <p className="tr-searchListHeading">{showingResultsLabel ? 'Results' : 'Recent'}</p>

                {searchStatus === 'loading' ? <p className="tr-searchStatus">Searching…</p> : null}
                {searchStatus === 'error' ? (
                  <p className="tr-searchErr" role="alert">
                    {searchError ?? 'Something went wrong.'}
                  </p>
                ) : null}

                {searchStatus === 'ready' && !searchRows.length && !showingResultsLabel && recentTickers.length < 1 ? (
                  <p className="tr-searchHint">Type a company name or ticker symbol.</p>
                ) : null}

                {searchStatus === 'ready' && !searchRows.length && showingResultsLabel ? (
                  <p className="tr-searchHint">No matches. Try a different spelling or symbol.</p>
                ) : null}

                {searchStatus === 'ready' && searchRows.length > 0
                  ? searchRows.map((row) => (
                      <TradeRow
                        key={row.symbol}
                        row={row}
                        displaySym={displayTickerLabel(row.symbol)}
                        onPick={() => pushRecentAndNavigate(row.symbol)}
                      />
                    ))
                  : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TradeRow({
  row,
  displaySym,
  onPick,
}: {
  row: TradeBrowseRow
  displaySym: string
  onPick: () => void
}) {
  return (
    <button type="button" className="pf-stockRow" onClick={onPick}>
      <span className="pf-stockLogoWrap">
        <ApiImage className="pf-stockLogo" src={row.logoUrl} alt="" loading="lazy" decoding="async" />
      </span>
      <div>
        <p className="pf-stockSym">{displaySym}</p>
        <p className="pf-stockCo">{row.companyName}</p>
      </div>
      <MiniSparkLine vals={row.sparkline} up={row.positive} />
      <p className="pf-stockPrice">{row.price}</p>
      <span className={`pf-pct ${row.positive ? 'pf-pct--up' : 'pf-pct--down'}`}>{row.changeLabel}</span>
    </button>
  )
}
