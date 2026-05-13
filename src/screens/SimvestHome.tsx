import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMyJoinedGames, type MyGameSummary } from '../api/myGamesApi'
import { challengeAssets as ca } from '../challenge/challengeAssets'
import {
  ACTIVITY_SORT_MODES,
  activitySortLabels,
  type ActivitySortMode,
  parseSincePurchasePct,
  sortFeedPosts,
} from '../challenge/gameFeedSort'
import { gameTitle, GAME_SLUG, slugToVariant } from '../challenge/gameMeta'
import { assets } from '../figmaAssets'
import { gamePaths } from '../gameRoutes'
import { FeedRichBody } from '../feed/FeedRichBody'
import { FeedPollCard } from '../feed/FeedPollCard'
import { navigateToStock } from '../stocks/navigateToStock'
import './SimvestHome.css'
import { useHomeActivityFeed } from './useHomeActivityFeed'

export function SimvestHome() {
  const navigate = useNavigate()
  const [filterOpen, setFilterOpen] = useState(false)
  const [activitySort, setActivitySort] = useState<ActivitySortMode>('recent')
  const sortWrapRef = useRef<HTMLDivElement>(null)
  const gamesStackRef = useRef<HTMLDivElement>(null)
  const [gamesStackPx, setGamesStackPx] = useState(223)
  const [myGames, setMyGames] = useState<MyGameSummary[]>([])
  const sortLabels = activitySortLabels()

  const { posts, status, error, reload } = useHomeActivityFeed()

  const gamesBelowNov = useMemo(
    () => myGames.filter((g) => g.slug !== GAME_SLUG.nov2024),
    [myGames],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const list = await fetchMyJoinedGames()
        if (!cancelled) setMyGames(list)
      } catch {
        if (!cancelled) setMyGames([])
      }
    }
    void load()
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const onActivity = () => void load()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('simvest:activity-refresh', onActivity)
    window.addEventListener('simvest:holdings-refresh', onActivity)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('simvest:activity-refresh', onActivity)
      window.removeEventListener('simvest:holdings-refresh', onActivity)
    }
  }, [])

  useLayoutEffect(() => {
    const el = gamesStackRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setGamesStackPx(el.offsetHeight)
    })
    ro.observe(el)
    setGamesStackPx(el.offsetHeight)
    return () => ro.disconnect()
  }, [myGames])

  const layout = useMemo(() => {
    const stackTop = 124
    const gapBeforeActivity = 24
    const feedBelowActivityLabel = 28
    const minPhone = 874
    const feedMinH = 483
    const bottomPad = 32
    const activityTop = stackTop + gamesStackPx + gapBeforeActivity
    const feedTop = activityTop + feedBelowActivityLabel
    const phoneH = Math.max(minPhone, feedTop + feedMinH + bottomPad)
    const feedHeight = phoneH - feedTop - bottomPad
    return { activityTop, feedTop, feedHeight, phoneH }
  }, [gamesStackPx])

  const sortedPosts = useMemo(
    () => sortFeedPosts(posts, activitySort),
    [posts, activitySort],
  )

  useEffect(() => {
    if (!filterOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!sortWrapRef.current?.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [filterOpen])

  const onCreateGame = useCallback(() => {
    navigate(gamePaths.createGame)
  }, [navigate])

  const onJoinGame = useCallback(() => {
    navigate(gamePaths.join)
  }, [navigate])

  const onOpenJoinedGame = useCallback(
    (slug: string) => {
      navigate(`/g/${encodeURIComponent(slug)}`)
    },
    [navigate],
  )

  const onOpenNovGame = useCallback(() => {
    navigate(gamePaths.nov2024StockChallenge)
  }, [navigate])

  const openProfile = useCallback(
    (gameSlug: string, userId: string) => {
      navigate(`/g/${encodeURIComponent(gameSlug)}/profile/${encodeURIComponent(userId)}`)
    },
    [navigate],
  )

  return (
    <div className="sv-root">
      <div className="sv-phone" data-node-id="4:2" style={{ height: layout.phoneH, minHeight: 874 }}>
        <div className="sv-hero" data-node-id="2:2" />
        <button
          type="button"
          className="sv-icon-btn sv-settings"
          aria-label="Settings"
          data-node-id="settings"
        >
          <img src={assets.settings} alt="" width={34} height={34} />
        </button>
        <button
          type="button"
          className="sv-icon-btn sv-notify"
          aria-label="Notifications"
          data-node-id="notify"
        >
          <img src={assets.notification} alt="" width={28} height={28} />
        </button>
        <h1 className="sv-logo" data-node-id="2:3">
          SIMVEST
        </h1>
        <p className="sv-subhero" data-node-id="2:4">
          YOUR GAMES
        </p>

        <div className="sv-games-stack" ref={gamesStackRef}>
          <button
            type="button"
            className="sv-game-card sv-game-card--blue sv-game-card--compact"
            onClick={onCreateGame}
            data-node-id="2:5"
          >
            <span className="sv-plus sv-plus--blue sv-plus--compact" aria-hidden />
            <span className="sv-game-card__text sv-game-card__text--compact">
              <span className="sv-game-card__title sv-game-card__title--dark sv-game-card__title--compact">
                Create New Game
              </span>
              <span className="sv-game-card__subtitle sv-game-card__subtitle--dark sv-game-card__subtitle--compact">
                Invite friends to join
              </span>
            </span>
            <img
              className="sv-game-card__graph sv-game-card__graph--compact"
              src={assets.graphBlue}
              alt=""
            />
          </button>

          <button
            type="button"
            className="sv-game-card sv-game-card--blue sv-game-card--compact"
            onClick={onJoinGame}
            data-node-id="join-game"
          >
            <span className="sv-plus sv-plus--blue sv-plus--compact" aria-hidden />
            <span className="sv-game-card__text sv-game-card__text--compact">
              <span className="sv-game-card__title sv-game-card__title--dark sv-game-card__title--compact">
                Join Game
              </span>
              <span className="sv-game-card__subtitle sv-game-card__subtitle--dark sv-game-card__subtitle--compact">
                Enter code or scan QR
              </span>
            </span>
            <img
              className="sv-game-card__graph sv-game-card__graph--compact"
              src={assets.graphBlue}
              alt=""
            />
          </button>

          <button
            type="button"
            className="sv-game-card sv-game-card--gold"
            onClick={onOpenNovGame}
            data-node-id="3:50"
          >
            <span className="sv-plus sv-plus--gold" aria-hidden />
            <span className="sv-game-card__text">
              <span className="sv-game-card__title sv-game-card__title--gold">
                Nov. 2024 Stock Challenge
              </span>
              <span className="sv-game-card__subtitle sv-game-card__subtitle--dark">
                Hosted by John Smith
              </span>
            </span>
            <img
              className="sv-game-card__graph sv-game-card__graph--flip"
              src={assets.graphGold}
              alt=""
            />
          </button>

          {gamesBelowNov.map((g) => {
            const t = g.cardTheme
            return (
              <button
                key={g.slug}
                type="button"
                className="sv-game-card sv-game-card--joined-themed"
                onClick={() => onOpenJoinedGame(g.slug)}
                aria-label={`Open ${g.title}`}
                style={{
                  borderColor: t.joinButtonBorderColor,
                  ['--sv-joined-plus-bg' as string]: t.joinButtonColor,
                }}
              >
                <span className="sv-plus sv-plus--joined-home" aria-hidden />
                <span className="sv-game-card__text">
                  <span
                    className="sv-game-card__title sv-game-card__title--palette-home"
                    style={{
                      backgroundImage: `linear-gradient(${t.welcomeGradientAngleDeg}deg, ${t.welcomeGradientFrom}, ${t.welcomeGradientTo})`,
                    }}
                  >
                    {g.title}
                  </span>
                  <span className="sv-game-card__subtitle sv-game-card__subtitle--dark">{g.subtitle}</span>
                </span>
                <img
                  className="sv-game-card__graph sv-game-card__graph--flip sv-game-card__graph--joined"
                  src={assets.graphBlue}
                  alt=""
                />
              </button>
            )
          })}
        </div>

        <div className="sv-activity-header" style={{ top: layout.activityTop }}>
          <h2 className="sv-activity-title" data-node-id="4:17">
            ACTIVITY
          </h2>
          <div className="sv-sortWrap" ref={sortWrapRef}>
            <button
              type="button"
              className="sv-filter"
              aria-expanded={filterOpen}
              aria-haspopup="listbox"
              aria-label={`Sort activity. Current: ${sortLabels[activitySort]}`}
              onClick={() => setFilterOpen((v) => !v)}
              data-node-id="4:19"
            >
              <span>{sortLabels[activitySort]}</span>
              <span
                className={`sv-filter__chevron${filterOpen ? ' sv-filter__chevron--open' : ''}`}
              >
                <img src={assets.chevron} alt="" />
              </span>
            </button>
            {filterOpen ? (
              <ul className="sv-sortMenu" role="listbox" aria-label="Sort home activity">
                {ACTIVITY_SORT_MODES.map((m) => (
                  <li key={m}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={activitySort === m}
                      className={`sv-sortItem${activitySort === m ? ' sv-sortItem--on' : ''}`}
                      onClick={() => {
                        setActivitySort(m)
                        setFilterOpen(false)
                      }}
                    >
                      {sortLabels[m]}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div
          className="sv-feed-scroll"
          data-node-id="225:4564"
          style={{ top: layout.feedTop, height: layout.feedHeight }}
        >
          <div className="sv-feed-inner">
            {status === 'loading' || status === 'idle' ? (
              <p className="sv-feedStatus">Loading activity…</p>
            ) : null}
            {status === 'error' ? (
              <div className="sv-feedStatus sv-feedStatus--error">
                <p>{error ?? 'Could not load activity.'}</p>
                <button type="button" className="sv-feedRetry" onClick={() => void reload()}>
                  Retry
                </button>
              </div>
            ) : null}
            {status === 'ready' && sortedPosts.length === 0 ? (
              <p className="sv-feedStatus">
                No activity yet from your games. Open a game to post, or place a trade to see posts here.
              </p>
            ) : null}
            {sortedPosts.map((p) => {
              const kind = p.postKind === 'poll' ? 'poll' : p.postKind === 'text' ? 'text' : 'trade'
              const hasRationale = p.rationale.trim().length > 0

              const gainPct = parseSincePurchasePct(p.changePct)
              const pctKnown = gainPct !== null
              const pctUp = gainPct !== null ? gainPct >= 0 : false
              const pctRowClass = pctKnown
                ? pctUp
                  ? ' sv-trade__pct-row--up'
                  : ' sv-trade__pct-row--down'
                : ' sv-trade__pct-row--na'
              const pctTextClass = pctKnown
                ? pctUp
                  ? ' sv-trade__pct--up'
                  : ' sv-trade__pct--down'
                : ' sv-trade__pct--na'

              return (
                <article key={p.id} className="sv-post">
                  <div className="sv-post__shell">
                    <button
                      type="button"
                      className="sv-post__menu"
                      aria-label={`More options for ${p.author}`}
                    >
                      <img src={assets.ellipsis} alt="" />
                    </button>
                    <div className="sv-post__header">
                      <button
                        type="button"
                        className="sv-post__avatarBtn"
                        aria-label={`View ${p.author}'s profile`}
                        onClick={() => openProfile(p.gameSlug, p.userId)}
                      >
                        <img
                          className="sv-post__avatar"
                          src={p.avatar}
                          alt={p.author}
                          width={60}
                          height={60}
                        />
                      </button>
                      <div className="sv-post__headerText">
                        <p className="sv-post__byline">
                          <button
                            type="button"
                            className="sv-post__nameBtn"
                            onClick={() => openProfile(p.gameSlug, p.userId)}
                          >
                            {p.author}
                          </button>
                          <span className="sv-post__meta">
                            {kind === 'poll' ? ' shared a poll in ' : ' shared a post in '}
                            {p.gameName}
                          </span>
                        </p>
                        <p className="sv-post__time">{p.timestamp}</p>
                      </div>
                    </div>

                    {kind === 'poll' && p.poll ? (
                      <FeedPollCard
                        postId={p.id}
                        gameSlug={p.gameSlug}
                        poll={p.poll}
                        onVoted={() => void reload()}
                      />
                    ) : kind === 'text' ? (
                      p.richSegments?.length || p.attachmentImageUrl ? (
                        <FeedRichBody
                          segments={p.richSegments}
                          imageUrl={p.attachmentImageUrl}
                          fallbackText={p.rationale}
                          gameSlug={p.gameSlug}
                          returnPath="/"
                          navTab="activity"
                        />
                      ) : (
                        <p className="sv-textBody">{p.rationale}</p>
                      )
                    ) : (
                      <button
                        type="button"
                        className="sv-trade"
                        aria-label={`Open ${p.tickerSymbol} stock details`}
                        onClick={() =>
                          navigateToStock(navigate, p.tickerSymbol, {
                            gameSlug: p.gameSlug,
                            challengeTitle: gameTitle(slugToVariant(p.gameSlug)).toUpperCase(),
                            returnPath: '/',
                            navTab: 'activity',
                          })
                        }
                      >
                        <div className="sv-trade__top">
                          <img
                            className="sv-trade__logo"
                            src={p.tickerImage}
                            alt=""
                            width={44}
                            height={44}
                          />
                          <div className="sv-trade__mid">
                            <p className="sv-trade__headline">{p.tradeTitle}</p>
                            <div className="sv-trade__details">
                              <div className="sv-trade__row">
                                <span className="sv-trade__row-label">Shares Bought</span>
                                <span className="sv-trade__row-value">{p.sharesBought}</span>
                              </div>
                              <div className="sv-trade__row">
                                <span className="sv-trade__row-label">Order Total</span>
                                <span className="sv-trade__row-value">{p.orderTotal}</span>
                              </div>
                            </div>
                          </div>
                          <div className="sv-trade__aside">
                            <div className={`sv-trade__pct-row${pctRowClass}`}>
                              <img
                                className="sv-trade__arrow"
                                src={pctUp ? ca.line23 : ca.stockDown}
                                alt=""
                                width={23}
                                height={23}
                              />
                              <span className={`sv-trade__pct${pctTextClass}`}>{p.changePct}</span>
                            </div>
                            <p className="sv-trade__since">Since Purchase</p>
                            <div className="sv-trade__cols">
                              <div>
                                <div className="sv-trade__metric">{p.marketCap}</div>
                                <div className="sv-trade__metric-label">Market Cap</div>
                              </div>
                              <div>
                                <div className="sv-trade__metric">{p.revenue}</div>
                                <div className="sv-trade__metric-label">Revenue</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        {hasRationale ? (
                          <div className="sv-rationale">
                            <div className="sv-rationale__header">
                              <img src={assets.bulb} alt="" width={14} height={16} />
                              <span>Rationale:</span>
                            </div>
                            <div className="sv-rationale__body">{p.rationale}</div>
                          </div>
                        ) : null}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
