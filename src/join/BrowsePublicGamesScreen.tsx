import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import { gamePaths } from '../gameRoutes'
import { PublicGameCard } from './PublicGameCard'
import { rankPublicGamesForQuery } from './rankPublicGamesSearch'
import { usePublicGames } from './usePublicGames'
import '../trade/tradeScreen.css'
import './browsePublicGamesScreen.css'

export function BrowsePublicGamesScreen() {
  const navigate = useNavigate()
  const { games, status, error, reload } = usePublicGames(true)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 80)
    return () => window.clearTimeout(t)
  }, [query])

  const displayed = useMemo(
    () => rankPublicGamesForQuery(games, debouncedQuery),
    [games, debouncedQuery],
  )

  const onSelectGame = useCallback(
    (joinCode: string) => {
      navigate(gamePaths.joinWelcome(joinCode))
    },
    [navigate],
  )

  const showingSearch = debouncedQuery.trim().length > 0

  return (
    <div className="bpg-root">
      <div className="bpg-phone">
        <button type="button" className="bpg-back" onClick={() => navigate(-1)} aria-label="Back">
          <BackArrowIcon />
        </button>
        <h1 className="bpg-logo">SIMVEST</h1>

        <header className="bpg-head">
          <h2 className="bpg-title">Public games</h2>
          <div className="bpg-searchWrap">
            <label className="tr-searchEntryPill bpg-searchPill">
              <img src={a.searchMagnifier} alt="" className="tr-searchEntryIcon" />
              <input
                ref={searchInputRef}
                className="tr-searchFieldInput bpg-searchInput"
                type="search"
                name="public-games-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search games"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoCapitalize="none"
                enterKeyHint="search"
                aria-label="Search public games"
              />
            </label>
          </div>
        </header>

        <div className="bpg-list" role="region" aria-label="Public games list">
          {status === 'loading' || status === 'idle' ? (
            <p className="bpg-status">Loading live games…</p>
          ) : null}
          {status === 'error' ? (
            <div className="bpg-status bpg-status--error">
              <p>{error ?? 'Could not load public games.'}</p>
              <button type="button" className="bpg-retry" onClick={() => void reload()}>
                Try again
              </button>
            </div>
          ) : null}
          {status === 'ready' && games.length === 0 ? (
            <p className="bpg-hint">
              No public games are live right now. Check back soon or create your own game.
            </p>
          ) : null}
          {status === 'ready' && games.length > 0 && showingSearch && displayed.length === 0 ? (
            <p className="bpg-hint">No matches. Try the game title, host name, or dates.</p>
          ) : null}
          {status === 'ready' && displayed.length > 0 ? (
            <div className="bpg-listInner">
              {displayed.map((g) => (
                <PublicGameCard key={g.slug} game={g} onSelect={onSelectGame} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
