import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChallengeBottomNav } from './ChallengeBottomNav'
import { challengeAssets as a } from './challengeAssets'
import {
  ACTIVITY_SORT_MODES,
  activitySortLabels,
  type ActivitySortMode,
  parseSincePurchasePct,
  sortFeedPosts,
} from './gameFeedSort'
import { gameHostLine, gameTitle, slugToVariant } from './gameMeta'
import { navigateToStock } from '../stocks/navigateToStock'
import { ActivityComposerRich } from '../feed/ActivityComposerRich'
import { FeedRichBody } from '../feed/FeedRichBody'
import { FeedPollCard } from '../feed/FeedPollCard'
import { useComposerContext } from '../hooks/useComposerContext'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import { getSimvestUserId } from '../user/simvestUserId'
import { useGameFeed } from './useGameFeed'
import { useGameTopGainsToday } from './useGameTopGainsToday'
import { useGameMembersPreview } from './useGameMembersPreview'
import { InviteGameSheet } from '../join/InviteGameSheet'
import { fetchCreateGameSettings } from '../createGame/createGameSettingsApi'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import './gameChallenge.css'

const GAIN_CARD_W = 111
const GAIN_GAP = 10
const GAIN_PAD = 5

function gainsTrackWidthPx(cardCount: number): number {
  const n = Math.max(1, Math.min(5, Math.floor(cardCount)))
  return GAIN_PAD + n * GAIN_CARD_W + (n - 1) * GAIN_GAP + GAIN_PAD
}

export function GameChallengeScreen() {
  const navigate = useNavigate()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? ''
  const variant = slugToVariant(slug)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [hostJoinBanner, setHostJoinBanner] = useState<{ count: number } | null>(null)
  const [templateTitle, setTemplateTitle] = useState<string | null>(null)
  const [templateHostLine, setTemplateHostLine] = useState<string | null>(null)
  const [runtimeShell, setRuntimeShell] = useState<{ title: string | null; hostLine: string | null }>({
    title: null,
    hostLine: null,
  })
  /**
   * Create-game flow persists the draft at slug `new`, then navigates to `/g/new` with
   * `setupComplete` true. `slugToVariant` still maps `new` → `template`, which used to force
   * placeholder activity (no composer, no feed). When the host has finished publishing, treat
   * the shell like a normal game so posts and trades show in this game’s activity.
   */
  const [newGamePublished, setNewGamePublished] = useState<boolean | null>(null)
  const [activitySort, setActivitySort] = useState<ActivitySortMode>('recent')
  const sortWrapRef = useRef<HTMLDivElement>(null)
  const sortLabels = activitySortLabels()

  useEffect(() => {
    if (!filterOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!sortWrapRef.current?.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [filterOpen])

  const goHome = useCallback(() => {
    navigate('/')
  }, [navigate])

  const openProfile = useCallback(
    (userId: string) => {
      navigate(`/g/${slug}/profile/${encodeURIComponent(userId)}`)
    },
    [navigate, slug],
  )

  const isTemplate = variant === 'template'
  const shellIsLive = !isTemplate || newGamePublished === true
  const refreshGameShellMeta = useCallback(async () => {
    try {
      const d = await fetchCreateGameSettings(slug)
      if (isTemplate) {
        setNewGamePublished(Boolean(d.settings?.setupComplete))
      } else {
        setNewGamePublished(null)
      }
      if (d.isHost && d.pendingJoinCount > 0) {
        setHostJoinBanner({ count: d.pendingJoinCount })
      } else {
        setHostJoinBanner(null)
      }
      if (isTemplate && d.settings) {
        const name = d.settings.gameDisplayName.trim()
        setTemplateTitle(name || null)
        const hn = d.settings.hostDisplayName.trim()
        setTemplateHostLine(hn ? `Hosted by ${hn}` : null)
      } else if (!isTemplate) {
        setTemplateTitle(null)
        setTemplateHostLine(null)
      }
    } catch {
      setHostJoinBanner(null)
      if (isTemplate) {
        setTemplateTitle(null)
        setTemplateHostLine(null)
        setNewGamePublished(null)
      }
    }
  }, [isTemplate, slug])

  useEffect(() => {
    void refreshGameShellMeta()
  }, [refreshGameShellMeta])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshGameShellMeta()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refreshGameShellMeta])

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    void (async () => {
      try {
        const d = await fetchCreateGameSettings(slug)
        if (cancelled) return
        if (variant === 'template') {
          setNewGamePublished(Boolean(d.settings?.setupComplete))
        } else {
          setNewGamePublished(null)
        }
        if (!d.settings) {
          setRuntimeShell({ title: null, hostLine: null })
          return
        }
        const t = d.settings.gameDisplayName.trim()
        const hn = d.settings.hostDisplayName.trim()
        setRuntimeShell({
          title: t || null,
          hostLine: hn ? `Hosted by ${hn}` : null,
        })
      } catch {
        if (!cancelled) setRuntimeShell({ title: null, hostLine: null })
        if (!cancelled && variant === 'template') setNewGamePublished(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, variant])

  const { posts: feedPosts, status: feedStatus, error: feedErr, reload: reloadFeed } = useGameFeed(slug)
  const { ctx: composerCtx, reload: reloadComposer } = useComposerContext(shellIsLive ? slug : null)
  const {
    rows: topGainRows,
    status: topGainsStatus,
    error: topGainsErr,
  } = useGameTopGainsToday(slug, shellIsLive)
  const {
    members: rosterMembers,
    totalPlayers,
    status: rosterStatus,
  } = useGameMembersPreview(gameSlug, Boolean(gameSlug) && shellIsLive)

  const sortedFeedPosts = useMemo(
    () => sortFeedPosts(feedPosts, activitySort),
    [feedPosts, activitySort],
  )

  const chromeStyle = useGameChromeCssVars(slug)

  const headerTitle =
    isTemplate && templateTitle ? templateTitle : runtimeShell.title ?? gameTitle(variant)
  const headerHost =
    isTemplate && templateHostLine ? templateHostLine : runtimeShell.hostLine ?? gameHostLine(variant)

  if (!gameSlug) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="gc-root" style={chromeStyle}>
      <div
        className={`gc-phone${isTemplate && !shellIsLive ? ' gc-phone--template' : ''}`}
        data-node-id="19:7"
      >
        <div className="gc-phoneMain">
          {hostJoinBanner ? (
            <div className="gc-hostJoinBanner" role="status">
              <span className="gc-hostJoinBannerText">
                {hostJoinBanner.count === 1
                  ? '1 player is waiting for you to approve their join request.'
                  : `${hostJoinBanner.count} players are waiting for you to approve their join requests.`}
              </span>
              <button
                type="button"
                className="gc-hostJoinBannerBtn"
                onClick={() => navigate(`/g/${encodeURIComponent(slug)}/join-requests`)}
              >
                Review
              </button>
            </div>
          ) : null}
          <div className="gc-phoneCanvas">
        <header className="gc-headerBand">
          <button
            type="button"
            className="gc-back"
            aria-label="Back to home"
            onClick={goHome}
          >
            <img src={a.back} alt="" />
          </button>
          <button type="button" className="gc-headerMenu" aria-label="More options">
            <img src={a.ellipsisHeader} alt="" />
          </button>
          <h1 className="gc-title">{headerTitle}</h1>
          <p className="gc-host">{headerHost}</p>
          <div className="gc-peopleRow">
            {!shellIsLive ? (
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
            ) : rosterStatus === 'loading' || rosterStatus === 'idle' ? (
              <>
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
            ) : rosterMembers.length === 0 ? (
              <>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="gc-avatarSm"
                    style={{
                      background: '#f4f4f4',
                      border: '2px solid #e4e4e4',
                    }}
                    aria-hidden
                  />
                ))}
              </>
            ) : (
              <>
                {rosterMembers.slice(0, 5).map((m, i) => (
                  <button
                    key={m.userId}
                    type="button"
                    className={i === 0 ? 'gc-avatarHost gc-rosterFace' : 'gc-avatarSm gc-rosterFace'}
                    aria-label={`Open profile: ${m.displayName}`}
                    onClick={() => openProfile(m.userId)}
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" width={i === 0 ? 36 : 35} height={36} />
                    ) : (
                      <span className="gc-rosterInitial" aria-hidden>
                        {(m.displayName || '?').trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                  </button>
                ))}
              </>
            )}
            <button type="button" className="gc-invitePill" onClick={() => setInviteOpen(true)}>
              <img src={a.plusIcon} alt="" />
              <span>Invite</span>
            </button>
          </div>
          {!shellIsLive ? (
            <p className="gc-names">
              <strong className="gc-muted">Players you invite will appear here.</strong>
            </p>
          ) : rosterStatus === 'loading' || rosterStatus === 'idle' ? (
            <p className="gc-names">
              <span className="gc-muted">Loading players…</span>
            </p>
          ) : totalPlayers <= 0 ? (
            <p className="gc-names">
              <strong className="gc-muted">No players yet — tap Invite to share your join code.</strong>
            </p>
          ) : (
            <p className="gc-names">
              {rosterMembers[0] ? (
                <>
                  <strong>{rosterMembers[0].displayName || 'Player'}</strong>
                  {totalPlayers >= 2 && rosterMembers[1] ? (
                    <>
                      <span className="gc-muted">, </span>
                      <strong>{rosterMembers[1].displayName || 'Player'}</strong>
                    </>
                  ) : null}
                  {totalPlayers >= 3 && rosterMembers[2] ? (
                    <>
                      <span className="gc-muted">, </span>
                      <strong>{rosterMembers[2].displayName || 'Player'}</strong>
                    </>
                  ) : null}
                  {totalPlayers > 3 ? (
                    <>
                      <span className="gc-muted">, and </span>
                      <strong>{totalPlayers - 3} other{totalPlayers - 3 === 1 ? '' : 's'}</strong>
                    </>
                  ) : null}
                </>
              ) : (
                <strong className="gc-muted">{totalPlayers} player{totalPlayers === 1 ? '' : 's'} in this game</strong>
              )}
            </p>
          )}
        </header>

        {!shellIsLive ? (
          <section className="gc-composer gc-composer--interactive" aria-label="Create post">
            <div
              className="gc-composerAvatar"
              style={{
                background: '#ececec',
                border: '2px dashed #d0d0d0',
              }}
              aria-hidden
            />
            <p className="gc-composerPlaceholder">Share something...</p>
            <div className="gc-composerActions">
              <button type="button" className="gc-pillBtn" disabled>
                <img src={a.imageIcon} alt="" />
                Image
              </button>
              <button type="button" className="gc-pillBtn" disabled>
                <img src={a.pollIcon} alt="" />
                Poll
              </button>
              <button type="button" className="gc-pillBtn gc-pillBtn--wide" disabled>
                <img src={a.investmentIcon} alt="" />
                Tag Investment
              </button>
            </div>
          </section>
        ) : (
          <ActivityComposerRich
            gameSlug={slug}
            onPosted={() => {
              void reloadFeed()
              void reloadComposer()
            }}
            shellClassName="gc-composer gc-composer--interactive"
            avatarUrl={composerCtx?.avatarUrl || a.composerAvatar}
            onAvatarClick={() =>
              composerCtx?.userId
                ? openProfile(composerCtx.userId)
                : openProfile(getSimvestUserId())
            }
            layout="game"
            imageIcon={a.imageIcon}
            pollIcon={a.pollIcon}
            investIcon={a.investmentIcon}
          />
        )}

        <h2 className="gc-sectionTitle">TODAY&apos;S TOP GAINS</h2>

        <div className="gc-gainsScroll">
          <div
            className="gc-gainsTrack"
            style={{
              width: !shellIsLive
                ? gainsTrackWidthPx(4)
                : topGainsStatus === 'error'
                  ? gainsTrackWidthPx(1)
                  : topGainsStatus === 'ready' && topGainRows.length === 0
                    ? gainsTrackWidthPx(1)
                    : topGainsStatus === 'ready'
                      ? gainsTrackWidthPx(topGainRows.length)
                      : gainsTrackWidthPx(5),
            }}
          >
            {!shellIsLive
              ? [0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="gc-gainCard gc-gainCard--ghost"
                    data-slot="gain-placeholder"
                  >
                    <div className="gc-ghostCircle" />
                    <p className="gc-gainName">Player</p>
                    <p className="gc-gainPct">—%</p>
                  </div>
                ))
              : topGainsStatus === 'loading' || topGainsStatus === 'idle'
                ? [0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="gc-gainCard gc-gainCard--ghost" aria-hidden>
                      <div className="gc-ghostCircle" />
                      <p className="gc-gainName">…</p>
                      <p className="gc-gainPct">…</p>
                    </div>
                  ))
                : topGainsStatus === 'error'
                  ? (
                      <div className="gc-gainCard gc-gainCard--ghost" role="status">
                        <p className="gc-gainName" style={{ fontSize: 11 }}>
                          Unavailable
                        </p>
                        <p className="gc-gainPct" style={{ fontSize: 10, color: '#888' }}>
                          {topGainsErr ?? 'Error'}
                        </p>
                      </div>
                    )
                  : topGainRows.length === 0
                    ? (
                        <div className="gc-gainCard gc-gainCard--ghost" role="status">
                          <p className="gc-gainName" style={{ fontSize: 11 }}>
                            No players
                          </p>
                          <p className="gc-gainPct" style={{ fontSize: 10, color: '#888' }}>
                            Yet
                          </p>
                        </div>
                      )
                    : topGainRows.map((g) => (
                        <button
                          key={g.userId}
                          type="button"
                          className="gc-gainCard"
                          aria-label={`View ${g.displayName} profile, today ${g.pctLabel}`}
                          onClick={() => openProfile(g.userId)}
                        >
                          <img src={g.avatarUrl} alt="" />
                          <p className="gc-gainName gc-gainName--ellipsis" title={g.displayName}>
                            {g.displayNameShort}
                          </p>
                          <p className={`gc-gainPct${g.positive ? '' : ' gc-gainPct--down'}`}>{g.pctLabel}</p>
                        </button>
                      ))}
          </div>
        </div>

        <div className="gc-activityHead">
          <h2>ACTIVITY</h2>
          <div className="gc-sortWrap" ref={sortWrapRef}>
            <button
              type="button"
              className="gc-filterBtn"
              aria-expanded={filterOpen}
              aria-haspopup="listbox"
              aria-label={`Sort activity. Current: ${sortLabels[activitySort]}`}
              onClick={() => setFilterOpen((v) => !v)}
            >
              {sortLabels[activitySort]}
              <span
                className={`gc-filterBtnChevron${filterOpen ? ' gc-filterBtnChevron--open' : ''}`}
                aria-hidden
              >
                <img src={a.chevronDown} alt="" />
              </span>
            </button>
            {filterOpen ? (
              <ul className="gc-sortMenu" role="listbox" aria-label="Sort activity feed">
                {ACTIVITY_SORT_MODES.map((m) => (
                  <li key={m} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={activitySort === m}
                      className={`gc-sortItem${activitySort === m ? ' gc-sortItem--on' : ''}`}
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

        {!shellIsLive ? (
          <div className="gc-placeholderCard">
            <p>
              Game feed will show here once players join and start posting trades.
            </p>
          </div>
        ) : feedStatus === 'loading' || feedStatus === 'idle' ? (
          <p className="gc-feedLoad">Loading activity…</p>
        ) : feedStatus === 'error' ? (
          <div className="gc-placeholderCard">
            <p>{feedErr ?? 'Could not load activity.'}</p>
          </div>
        ) : feedPosts.length === 0 ? (
          <div className="gc-placeholderCard">
            <p>No posts yet. Share an update or make a trade to show it here.</p>
          </div>
        ) : (
          <div className="gc-feedStack">
            {sortedFeedPosts.map((post) => {
              const kind =
                post.postKind === 'poll' ? 'poll' : post.postKind === 'text' ? 'text' : 'trade'
              const hasRationale = post.rationale.trim().length > 0
              const sym = (post.tickerSymbol || '').replace(/\s+/g, '').toUpperCase()
              const gainPct = parseSincePurchasePct(post.changePct)
              const pctKnown = gainPct !== null
              const pctUp = gainPct !== null ? gainPct >= 0 : false
              const gameSlugForPost = post.gameSlug ?? slug
              return (
                <article
                  key={post.id}
                  className={`gc-feedCard${kind === 'text' || kind === 'poll' ? ' gc-feedCard--text' : ''}`}
                >
                  <div className="gc-feedHeader">
                    <button
                      type="button"
                      className="gc-feedAvatarWrap gc-feedProfileHit"
                      aria-label={`View ${post.author}'s profile`}
                      onClick={() => openProfile(post.userId)}
                    >
                      <img className="gc-feedAvatar" src={post.avatar} alt="" />
                    </button>
                    <div className="gc-feedTextCol">
                      <p className="gc-feedByline">
                        <button
                          type="button"
                          className="gc-feedNameBtn"
                          onClick={() => openProfile(post.userId)}
                        >
                          {post.author}
                        </button>
                        <span className="gc-feedMeta">
                          {kind === 'poll' ? ' shared a poll in ' : ' shared a post in '}
                          {post.gameName}
                        </span>
                      </p>
                      <p className="gc-feedTime">{post.timestamp}</p>
                    </div>
                    <button type="button" className="gc-feedMenu" aria-label="Post options">
                      <img src={a.ellipsis} alt="" />
                    </button>
                  </div>

                  {kind === 'poll' && post.poll ? (
                    <FeedPollCard
                      postId={post.id}
                      gameSlug={gameSlugForPost}
                      poll={post.poll}
                      onVoted={() => void reloadFeed()}
                    />
                  ) : kind === 'text' ? (
                    post.richSegments?.length || post.attachmentImageUrl ? (
                      <FeedRichBody
                        segments={post.richSegments}
                        imageUrl={post.attachmentImageUrl}
                        fallbackText={post.rationale}
                        gameSlug={gameSlugForPost}
                        returnPath={`/g/${encodeURIComponent(gameSlugForPost)}`}
                        navTab="activity"
                      />
                    ) : (
                      <p className="gc-textBody">{post.rationale}</p>
                    )
                  ) : (
                    <button
                      type="button"
                      className="gc-trade"
                      aria-label={`Open ${sym} stock details`}
                      onClick={() => {
                        const sg = gameSlugForPost
                        navigateToStock(navigate, sym, {
                          gameSlug: sg,
                          challengeTitle: gameTitle(slugToVariant(sg)),
                          returnPath: `/g/${encodeURIComponent(sg)}`,
                          navTab: 'activity',
                        })
                      }}
                    >
                      <div className="gc-trade__top">
                        <img className="gc-trade__logo" src={post.tickerImage} alt="" />
                        <div className="gc-trade__mid">
                          <p className="gc-trade__headline">{post.tradeTitle}</p>
                          <div className="gc-trade__details">
                            <div className="gc-trade__row">
                              <span className="gc-trade__label">Shares Bought</span>
                              <span className="gc-trade__value">{post.sharesBought}</span>
                            </div>
                            <div className="gc-trade__row">
                              <span className="gc-trade__label">Order Total</span>
                              <span className="gc-trade__value">{post.orderTotal}</span>
                            </div>
                          </div>
                        </div>
                        <div className="gc-trade__aside">
                          <div
                            className={`gc-trade__pctRow${pctKnown ? (pctUp ? ' gc-trade__pctRow--up' : ' gc-trade__pctRow--down') : ' gc-trade__pctRow--na'}`}
                          >
                            <img src={pctUp ? a.line23 : a.stockDown} alt="" width={23} height={23} />
                            <span
                              className={`gc-trade__pct${pctKnown ? (pctUp ? ' gc-trade__pct--up' : ' gc-trade__pct--down') : ' gc-trade__pct--na'}`}
                            >
                              {post.changePct}
                            </span>
                          </div>
                          <p className="gc-trade__since">Since Purchase</p>
                          <div className="gc-trade__cols">
                            <div>
                              <div className="gc-trade__metric">{post.marketCap}</div>
                              <div className="gc-trade__metricLabel">Market Cap</div>
                            </div>
                            <div>
                              <div className="gc-trade__metric">{post.revenue}</div>
                              <div className="gc-trade__metricLabel">Revenue</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {hasRationale ? (
                        <div className="gc-rationaleShell">
                          <div className="gc-rationaleHead">
                            <img src={a.bulb} alt="" width={14} height={16} />
                            <span>Rationale:</span>
                          </div>
                          <div className="gc-rationaleBox">{post.rationale}</div>
                        </div>
                      ) : null}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        )}
          </div>
        </div>

        <ChallengeBottomNav gameSlug={slug} active="activity" />
      </div>
      <InviteGameSheet open={inviteOpen} onClose={() => setInviteOpen(false)} gameSlug={slug} />
    </div>
  )
}
