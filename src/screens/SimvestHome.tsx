import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMyJoinedGames, type MyGameSummary } from '../api/myGamesApi'
import { simvestFetch } from '../api/simvestFetch'
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
import { prefetchGameShell } from '../game/gameShellCache'
import { gamePaths } from '../gameRoutes'
import { FeedRichBody } from '../feed/FeedRichBody'
import { FeedPollCard } from '../feed/FeedPollCard'
import { FeedPostOverflowMenu } from '../feed/FeedPostOverflowMenu'
import { FeedPostSocialBar } from '../feed/FeedPostSocialBar'
import { fetchMyAccount } from '../settings/settingsClient'
import { getSimvestUserId, SIMVEST_USER_ID_STORAGE_KEY } from '../user/simvestUserId'
import { resolveProfileAvatarUrl } from '../user/resolveProfileAvatarUrl'
import { navigateToStock } from '../stocks/navigateToStock'
import { ApiImage } from '../components/ApiImage'
import { apiAssetSrc } from '../config/apiAssetSrc'
import './SimvestHome.css'
import { isNativeAppShell } from '../hooks/useViewportShellHeight'
import { useHomeActivityFeed } from './useHomeActivityFeed'
import { useSuggestedGames } from './useSuggestedGames'

export function SimvestHome() {
  const navigate = useNavigate()
  const [filterOpen, setFilterOpen] = useState(false)
  const [activitySort, setActivitySort] = useState<ActivitySortMode>('recent')
  const sortWrapRef = useRef<HTMLDivElement>(null)
  const [myGames, setMyGames] = useState<MyGameSummary[]>([])
  const [hostJoinPendingTotal, setHostJoinPendingTotal] = useState(0)
  const sortLabels = activitySortLabels()

  const [viewerUserId, setViewerUserId] = useState(() => getSimvestUserId())
  const [homeSettingsAvatarSrc, setHomeSettingsAvatarSrc] = useState(() => resolveProfileAvatarUrl(''))

  const { posts, status, error, reload } = useHomeActivityFeed()

  /* Brand-new accounts with no joined games see a curated "Suggested
   * games" block in place of the empty activity feed. Once they join even
   * one game `myGames` becomes non-empty and the hook idles. */
  const showSuggestions = myGames.length === 0
  const {
    games: suggestedGames,
    status: suggestedStatus,
    totalEligible: suggestedTotalEligible,
    canRotateMore: suggestedCanRotateMore,
    busy: suggestedBusy,
    reload: reloadSuggestions,
    rotate: rotateSuggestedGames,
  } = useSuggestedGames(showSuggestions)

  const gamesBelowNov = useMemo(
    () => myGames.filter((g) => g.slug !== GAME_SLUG.nov2024),
    [myGames],
  )
  /**
   * The Nov 2024 Stock Challenge card has bespoke gold styling so we render
   * it as a static element above the dynamic joined-game list. Only show it
   * to users who have actually joined that game — a brand-new account
   * should land on a clean home with just Create / Join CTAs.
   */
  const showNovCard = useMemo(
    () => myGames.some((g) => g.slug === GAME_SLUG.nov2024),
    [myGames],
  )

  useEffect(() => {
    const syncViewer = () => setViewerUserId(getSimvestUserId())
    syncViewer()
    window.addEventListener('simvest:user-id-changed', syncViewer)
    const onStorageViewer = (e: StorageEvent) => {
      if (e.key === SIMVEST_USER_ID_STORAGE_KEY) syncViewer()
    }
    window.addEventListener('storage', onStorageViewer)
    return () => {
      window.removeEventListener('simvest:user-id-changed', syncViewer)
      window.removeEventListener('storage', onStorageViewer)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadAvatar = async () => {
      const result = await fetchMyAccount()
      if (cancelled) return
      if (result.ok) {
        setHomeSettingsAvatarSrc(resolveProfileAvatarUrl(result.account.avatarUrl))
      } else {
        setHomeSettingsAvatarSrc(resolveProfileAvatarUrl(''))
      }
    }
    void loadAvatar()
    const onUserId = () => void loadAvatar()
    window.addEventListener('simvest:user-id-changed', onUserId)
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIMVEST_USER_ID_STORAGE_KEY) void loadAvatar()
    }
    window.addEventListener('storage', onStorage)
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadAvatar()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.removeEventListener('simvest:user-id-changed', onUserId)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadHostJoinInbox = async () => {
      try {
        const res = await simvestFetch('/api/me/host/join-requests')
        if (!res.ok) {
          if (!cancelled) setHostJoinPendingTotal(0)
          return
        }
        const body = (await res.json()) as { requests?: unknown[] }
        const n = Array.isArray(body.requests) ? body.requests.length : 0
        if (!cancelled) setHostJoinPendingTotal(n)
      } catch {
        if (!cancelled) setHostJoinPendingTotal(0)
      }
    }
    const load = async () => {
      try {
        const list = await fetchMyJoinedGames()
        if (!cancelled) {
          setMyGames(list)
          const fromCards = list.reduce((sum, g) => sum + (g.pendingJoinRequestCount ?? 0), 0)
          setHostJoinPendingTotal((cur) => Math.max(cur, fromCards))
        }
      } catch {
        if (!cancelled) setMyGames([])
      }
      await loadHostJoinInbox()
    }
    void load()
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const onActivity = () => void load()
    const onJoinReq = () => void load()
    const onUserId = () => void load()
    const onStorageUser = (e: StorageEvent) => {
      if (e.key === SIMVEST_USER_ID_STORAGE_KEY) void load()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('simvest:activity-refresh', onActivity)
    window.addEventListener('simvest:holdings-refresh', onActivity)
    window.addEventListener('simvest:join-requests-changed', onJoinReq)
    window.addEventListener('simvest:user-id-changed', onUserId)
    window.addEventListener('storage', onStorageUser)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('simvest:activity-refresh', onActivity)
      window.removeEventListener('simvest:holdings-refresh', onActivity)
      window.removeEventListener('simvest:join-requests-changed', onJoinReq)
      window.removeEventListener('simvest:user-id-changed', onUserId)
      window.removeEventListener('storage', onStorageUser)
    }
  }, [])

  const nativeShell = isNativeAppShell()

  const layout = useMemo(() => {
    const stackTop = 124
    const gapBeforeActivity = 24
    const feedBelowActivityLabel = 62
    const minPhone = 874
    const feedMinH = 483
    const bottomPad = 32
    const compactCardH = 52
    const fullCardH = 103
    const cardGap = 8
    const fullCardCount = gamesBelowNov.length + (showNovCard ? 1 : 0)
    const cardCount = 2 + fullCardCount
    const gamesStackPx =
      compactCardH * 2 + fullCardH * fullCardCount + cardGap * Math.max(0, cardCount - 1)
    const activityTop = stackTop + gamesStackPx + gapBeforeActivity
    const feedTop = activityTop + feedBelowActivityLabel
    const phoneH = Math.max(minPhone, feedTop + feedMinH + bottomPad)
    const feedHeight = phoneH - feedTop - bottomPad
    return { activityTop, feedTop, feedHeight, phoneH }
  }, [gamesBelowNov.length, showNovCard])

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
    (g: MyGameSummary) => {
      prefetchGameShell(g.slug)
      if (g.status === 'finished') {
        navigate(`/g/${encodeURIComponent(g.slug)}/perform`)
        return
      }
      navigate(`/g/${encodeURIComponent(g.slug)}`)
    },
    [navigate],
  )

  const onOpenNovGame = useCallback(() => {
    navigate(gamePaths.nov2024StockChallenge)
  }, [navigate])

  const onOpenSuggestedGame = useCallback(
    (joinCode: string) => {
      /* Route through the standard join welcome → profile-setup pipeline so
       * the user lands in membership the same way as any other join. */
      navigate(gamePaths.joinWelcome(joinCode))
    },
    [navigate],
  )

  const openProfile = useCallback(
    (gameSlug: string, userId: string) => {
      navigate(`/g/${encodeURIComponent(gameSlug)}/profile/${encodeURIComponent(userId)}`)
    },
    [navigate],
  )

  return (
    <div className="sv-root">
      <div className="sv-phone" data-node-id="4:2"         style={
          nativeShell
            ? ({ '--sv-feed-top': `${layout.feedTop}px` } as CSSProperties)
            : { height: layout.phoneH, minHeight: 874 }
        }>
        <div className="sv-hero" data-node-id="2:2" />
        <button
          type="button"
          className="sv-icon-btn sv-settings"
          aria-label="Open settings"
          onClick={() => navigate('/settings')}
        >
          <img className="sv-settingsAvatar" src={homeSettingsAvatarSrc} alt="" />
        </button>
        <h1 className="sv-logo" data-node-id="2:3">
          SIMVEST
        </h1>
        <p className="sv-subhero" data-node-id="2:4">
          YOUR GAMES
        </p>

        {hostJoinPendingTotal > 0 ? (
          <p className="sv-hostJoinBanner" role="status">
            {hostJoinPendingTotal === 1
              ? '1 player requested to join your private game.'
              : `${hostJoinPendingTotal} players requested to join your private games.`}{' '}
            Open the game and tap the requests badge to approve or deny.
          </p>
        ) : null}

        <div className="sv-games-stack">
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

          {showNovCard ? (
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
          ) : null}

          {gamesBelowNov.map((g) => {
            const t = g.cardTheme
            return (
              <button
                key={g.slug}
                type="button"
                className={`sv-game-card sv-game-card--joined-themed${g.status === 'finished' ? ' sv-game-card--finished' : ''}`}
                onClick={() => onOpenJoinedGame(g)}
                aria-label={`Open ${g.title}`}
                style={{
                  borderColor: t.joinButtonBorderColor,
                }}
              >
                <span
                  className="sv-joined-gameMark"
                  style={{ backgroundColor: t.joinButtonColor }}
                  aria-hidden
                >
                  <span className="sv-joined-gameMark__emoji">{g.loadScreenEmoji}</span>
                </span>
                <span className="sv-game-card__text">
                  <span
                    className="sv-game-card__title sv-game-card__title--palette-home"
                    style={{
                      backgroundImage: `linear-gradient(${t.welcomeGradientAngleDeg}deg, ${t.welcomeGradientFrom}, ${t.welcomeGradientTo})`,
                    }}
                  >
                    {g.title}
                  </span>
                  <span className="sv-game-card__subtitle sv-game-card__subtitle--dark">
                    {g.status === 'finished' ? (
                      <>
                        <span className="sv-game-finishedPill">FINISHED</span>
                        <span className="sv-game-finishedSub">{g.subtitle}</span>
                      </>
                    ) : g.isHost && g.pendingJoinRequestCount > 0 ? (
                      <>
                        {g.subtitle}
                        <span className="sv-joinReqPill">
                          {g.pendingJoinRequestCount} join request
                          {g.pendingJoinRequestCount === 1 ? '' : 's'} pending
                        </span>
                      </>
                    ) : (
                      g.subtitle
                    )}
                  </span>
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
          style={
            nativeShell
              ? { top: layout.feedTop }
              : { top: layout.feedTop, height: layout.feedHeight }
          }
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
            {status === 'ready' && sortedPosts.length === 0 && !showSuggestions ? (
              <p className="sv-feedStatus">
                No activity yet from your games. Open a game to post, or place a trade to see posts here.
              </p>
            ) : null}
            {status === 'ready' && sortedPosts.length === 0 && showSuggestions ? (
              <section className="sv-suggested" aria-label="Suggested games">
                <header className="sv-suggested__head">
                  <h3 className="sv-suggested__title">Suggested games</h3>
                  <p className="sv-suggested__sub">
                    Live, public games you can hop into right now. We show up to three at a time when enough
                    games are live — use refresh to see a different set.
                  </p>
                </header>
                {suggestedStatus === 'loading' || suggestedStatus === 'idle' ? (
                  <p className="sv-suggested__empty">Loading live games…</p>
                ) : suggestedStatus === 'error' ? (
                  <div className="sv-suggested__empty">
                    <p>Could not load suggestions right now.</p>
                    <button
                      type="button"
                      className="sv-feedRetry"
                      onClick={() => reloadSuggestions()}
                    >
                      Try again
                    </button>
                  </div>
                ) : suggestedGames.length === 0 ? (
                  <div className="sv-suggested__empty">
                    <p>
                      No public games are live at the moment. Tap{' '}
                      <strong>Create New Game</strong> above to start one and invite friends.
                    </p>
                  </div>
                ) : (
                  <>
                    <ul className="sv-suggested__list">
                      {suggestedGames.map((g) => (
                        <li key={g.slug} className="sv-suggested__item">
                          <button
                            type="button"
                            className="sv-suggested__card"
                            aria-label={`Join ${g.title}`}
                            onClick={() => onOpenSuggestedGame(g.joinCode)}
                            style={{
                              borderColor: g.theme.joinButtonBorderColor,
                            }}
                          >
                            <div
                              className="sv-suggested__hero"
                              style={{
                                backgroundImage: `linear-gradient(${g.theme.gradientAngleDeg}deg, ${g.theme.gradientFrom}, ${g.theme.gradientTo})`,
                              }}
                              aria-hidden
                            />
                            <div className="sv-suggested__body">
                              <div className="sv-suggested__topRow">
                                <span className="sv-suggested__badge">SUGGESTED</span>
                                <span className="sv-suggested__players">{g.playerLine}</span>
                              </div>
                              <h4
                                className="sv-suggested__name"
                                style={{
                                  backgroundImage: `linear-gradient(${g.theme.gradientAngleDeg}deg, ${g.theme.gradientFrom}, ${g.theme.gradientTo})`,
                                }}
                              >
                                {g.title}
                              </h4>
                              {g.hostedByLine ? (
                                <p className="sv-suggested__host">{g.hostedByLine}</p>
                              ) : null}
                              <p className="sv-suggested__rules">
                                <span>{g.rulesSummary}</span>
                                <span aria-hidden> · </span>
                                <span>{g.durationLine}</span>
                              </p>
                              <span
                                className="sv-suggested__joinBtn"
                                style={{
                                  background: g.theme.joinButtonColor,
                                  borderColor: g.theme.joinButtonBorderColor,
                                }}
                              >
                                Join game
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {suggestedCanRotateMore ? (
                      <div className="sv-suggested__footer">
                        <p className="sv-suggested__rotateHint">
                          {suggestedTotalEligible} live games — tap refresh for three more you can join.
                        </p>
                        <button
                          type="button"
                          className="sv-suggested__refresh"
                          disabled={suggestedBusy}
                          onClick={() => rotateSuggestedGames()}
                        >
                          Refresh suggestions
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
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
                    <FeedPostOverflowMenu
                      post={p}
                      gameSlug={p.gameSlug}
                      viewerUserId={viewerUserId}
                      variant="home"
                      onUpdated={() => void reload()}
                    />
                    <div className="sv-post__header">
                      <button
                        type="button"
                        className="sv-post__avatarBtn"
                        aria-label={`View ${p.author}'s profile`}
                        onClick={() => openProfile(p.gameSlug, p.userId)}
                      >
                        <img
                          className="sv-post__avatar"
                          src={apiAssetSrc(p.avatar)}
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
                      <>
                        <FeedPollCard
                          postId={p.id}
                          gameSlug={p.gameSlug}
                          poll={p.poll}
                          onVoted={() => void reload()}
                        />
                        <FeedPostSocialBar
                          post={p}
                          gameSlug={p.gameSlug}
                          variant="home"
                          onCountsDirty={() => void reload()}
                        />
                      </>
                    ) : kind === 'text' ? (
                      <>
                        {p.richSegments?.length || p.attachmentImageUrl ? (
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
                        )}
                        <FeedPostSocialBar
                          post={p}
                          gameSlug={p.gameSlug}
                          variant="home"
                          interactionsLocked={Boolean(p.feedInteractionsLocked)}
                          onCountsDirty={() => void reload()}
                        />
                      </>
                    ) : (
                      <>
                      <div className="sv-trade sv-tradeCardWrap">
                      <button
                        type="button"
                        className="sv-tradeTap"
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
                        {(() => {
                          const isSell = p.side === 'sell'
                          const fillPriceLabel =
                            typeof p.purchasePrice === 'number' && Number.isFinite(p.purchasePrice)
                              ? `$${p.purchasePrice.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : null
                          const realizedDollars =
                            isSell && typeof p.costBasis === 'number' && Number.isFinite(p.costBasis) && p.costBasis > 0
                              ? (() => {
                                  const proceeds = parseFloat((p.orderTotal || '').replace(/[^0-9.\-]/g, ''))
                                  return Number.isFinite(proceeds) ? proceeds - p.costBasis : null
                                })()
                              : null
                          const realizedPct =
                            realizedDollars != null && p.costBasis && p.costBasis > 0
                              ? (realizedDollars / p.costBasis) * 100
                              : null
                          // Show only dollar delta inline — the percent lives in the top-right
                          // realized badge, so we avoid wrapping or duplicate signals.
                          const realizedLabel =
                            realizedDollars != null
                              ? `${realizedDollars >= 0 ? '+' : '-'}$${Math.abs(realizedDollars).toLocaleString(
                                  'en-US',
                                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                                )}`
                              : null
                          void realizedPct
                          const sinceLabel = isSell ? 'Realized' : 'Since Purchase'
                          return (
                            <div className="sv-trade__top">
                              <div className="sv-trade__upper">
                                <ApiImage
                                  className="sv-trade__logo"
                                  src={p.tickerImage}
                                  alt=""
                                  width={44}
                                  height={44}
                                />
                                <div className="sv-trade__mid">
                                  <p className="sv-trade__headline">{p.tradeTitle}</p>
                                </div>
                                <div className="sv-trade__aside">
                                  <div className={`sv-trade__pct-row${pctRowClass}`}>
                                    <img
                                      className="sv-trade__arrow"
                                      src={
                                        pctKnown
                                          ? pctUp
                                            ? ca.changeArrowUp
                                            : ca.changeArrowDown
                                          : ca.line23
                                      }
                                      alt=""
                                      width={23}
                                      height={23}
                                    />
                                    <span className={`sv-trade__pct${pctTextClass}`}>{p.changePct}</span>
                                  </div>
                                  <p className="sv-trade__since">{sinceLabel}</p>
                                  <div className="sv-trade__cols">
                                    <div>
                                      <div className="sv-trade__metric">{p.marketCap}</div>
                                      <div className="sv-trade__metric-label">Market Cap</div>
                                    </div>
                                    <div>
                                      <div className="sv-trade__metric">{p.revenue}</div>
                                      <div className="sv-trade__metric-label">Revenue</div>
                                    </div>
                                    {!isSell && fillPriceLabel ? (
                                      <div>
                                        <div className="sv-trade__metric">{fillPriceLabel}</div>
                                        <div className="sv-trade__metric-label">Buy Price</div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <div className="sv-trade__details">
                                <div className="sv-trade__row">
                                  <span className="sv-trade__row-label">
                                    {isSell ? 'Shares Sold' : 'Shares Bought'}
                                  </span>
                                  <span className="sv-trade__row-value">{p.sharesBought}</span>
                                </div>
                                {isSell && fillPriceLabel ? (
                                  <div className="sv-trade__row">
                                    <span className="sv-trade__row-label">Sale Price</span>
                                    <span className="sv-trade__row-value">{fillPriceLabel}</span>
                                  </div>
                                ) : null}
                                <div className="sv-trade__row">
                                  <span className="sv-trade__row-label">{isSell ? 'Proceeds' : 'Order Total'}</span>
                                  <span className="sv-trade__row-value">{p.orderTotal}</span>
                                </div>
                                {isSell && realizedLabel ? (
                                  <div className="sv-trade__row">
                                    <span className="sv-trade__row-label">
                                      Realized {realizedDollars! >= 0 ? 'Gain' : 'Loss'}
                                    </span>
                                    <span
                                      className="sv-trade__row-value"
                                      style={{ color: realizedDollars! >= 0 ? '#047a3a' : '#b42318' }}
                                    >
                                      {realizedLabel}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )
                        })()}
                      </button>
                        {hasRationale ? (
                          <div className="sv-rationale">
                            <div className="sv-rationale__header">
                              <img src={assets.bulb} alt="" width={14} height={16} />
                              <span>Rationale:</span>
                            </div>
                            <div className="sv-rationale__body">{p.rationale}</div>
                          </div>
                        ) : null}
                    </div>
                    <FeedPostSocialBar
                      post={p}
                      gameSlug={p.gameSlug}
                      variant="home"
                      interactionsLocked={Boolean(p.feedInteractionsLocked)}
                      onCountsDirty={() => void reload()}
                    />
                    </>
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
