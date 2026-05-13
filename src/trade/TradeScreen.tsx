import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { gameTitle, slugToVariant } from '../challenge/gameMeta'
import '../challenge/gameChallenge.css'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import '../perform/performScreen.css'
import { MiniSparkLine } from '../components/MiniSparkLine'
import { navigateToStock } from '../stocks/navigateToStock'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import type { TradeBrowseRow, TradeCategoryId } from './tradeTypes'
import { TRADE_CATEGORY_OPTIONS } from './tradeTypes'
import { displayTickerLabel } from '../stocks/displayTicker'
import { useTradeBrowse } from './useTradeBrowse'
import { useTradeSearchResults } from './useTradeSearch'
import './tradeScreen.css'

const RECENT_STORAGE_KEY = 'simvest-trade-recent-tickers-v1'

function readRecentTickers(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    const j = raw ? JSON.parse(raw) : []
    if (!Array.isArray(j)) return []
    return j.filter((x): x is string => typeof x === 'string').slice(0, 12)
  } catch {
    return []
  }
}

function persistRecentTickers(syms: string[]) {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(syms))
  } catch {
    /* quota / private mode */
  }
}

export function TradeScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? ''
  const variant = slugToVariant(slug)

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])

  const chromeStyle = useGameChromeCssVars(slug)

  const [category, setCategory] = useState<TradeCategoryId>('popular')
  const { payload, status, error } = useTradeBrowse(slug, category)

  const rows = useMemo(() => {
    if (!payload || payload.category !== category) return []
    return payload.rows
  }, [payload, category])

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [recentTickers, setRecentTickers] = useState<string[]>(() => readRecentTickers())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const buyJumpApplied = useRef(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 160)
    return () => window.clearTimeout(t)
  }, [query])

  /** Stock detail “Buy” jumps here with search prefilled. */
  useEffect(() => {
    if (buyJumpApplied.current) return
    const st = location.state as { tradeSearchQuery?: string } | undefined
    const q = st?.tradeSearchQuery
    if (typeof q !== 'string' || q.trim().length < 1) return
    buyJumpApplied.current = true
    const trimmed = q.trim()
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
        challengeTitle: gameTitle(variant),
        returnPath: `/g/${slug}/trade`,
        navTab: 'trade',
      })
    },
    [navigate, slug, variant],
  )

  const pushRecentAndNavigate = useCallback(
    (symbol: string) => {
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

  return (
    <div className="pf-root" style={chromeStyle}>
      <div className="pf-phone pf-phone--trade">
        <div className="tr-body">
          <header className="tr-topBand tr-topBand--browse">
            <button type="button" className="tr-back" aria-label="Back to game" onClick={goBack}>
              <img src={a.back} alt="" />
            </button>
            <button
              type="button"
              className="tr-searchEntryPill"
              aria-label="Search stocks, crypto, and ETFs"
              onClick={() => {
                setQuery('')
                setDebouncedQuery('')
                setSearchOpen(true)
              }}
            >
              <img src={a.searchActivity} alt="" className="tr-searchEntryIcon" />
              <span className="tr-searchEntryText">Search stocks, crypto, and ETFs</span>
            </button>
          </header>

          <div className="tr-mainScroll">
            <div className="tr-catSection">
              <p className="tr-catSectionLabel">Browse</p>
              <div className="tr-catScroll">
                <div className="tr-catTrack" role="tablist" aria-label="Browse by category">
                  {TRADE_CATEGORY_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={category === c.id}
                      className={`tr-catBtn${category === c.id ? ' tr-catBtn--on' : ''}`}
                      onClick={() => setCategory(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
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

        <ChallengeBottomNav gameSlug={slug} active="trade" />

        {searchOpen ? (
          <div className="tr-searchOverlay" role="dialog" aria-modal="true" aria-label="Search stocks">
            <div className="tr-searchOverlayInner">
              <div className="tr-searchGold">
                <div className="tr-searchTopRow">
                  <label className="tr-searchPillField">
                    <img src={a.searchActivity} alt="" className="tr-searchPillIcon" />
                    <input
                      ref={searchInputRef}
                      className="tr-searchFieldInput"
                      type="search"
                      name="trade-stock-search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search stocks, crypto, and ETFs"
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
                  <p className="tr-searchHint">Type a company name or ticker symbol. Crypto pairs (e.g. BTC) work too.</p>
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
        <img className="pf-stockLogo" src={row.logoUrl} alt="" loading="lazy" decoding="async" />
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
