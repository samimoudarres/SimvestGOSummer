import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { gameHostLine, gameTitle, slugToVariant } from '../challenge/gameMeta'
import '../challenge/gameChallenge.css'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import {
  LEADERBOARD_SORT_OPTIONS,
  type LeaderboardSortKey,
} from './leaderboardTypes'
import { useGameLeaderboard } from './useGameLeaderboard'
import './leaderboardScreen.css'

function avatarRingClass(rank: number): string {
  if (rank === 1) return 'lb-avatarRing lb-avatarRing--gold'
  if (rank === 2) return 'lb-avatarRing lb-avatarRing--silver'
  if (rank === 3) return 'lb-avatarRing lb-avatarRing--bronze'
  return 'lb-avatarRing lb-avatarRing--plain'
}

export function LeaderboardScreen() {
  const navigate = useNavigate()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? ''
  const variant = slugToVariant(slug)
  const isTemplate = variant === 'template'

  const [sort, setSort] = useState<LeaderboardSortKey>('overall_return')
  const [sortOpen, setSortOpen] = useState(false)
  const sortWrapRef = useRef<HTMLDivElement>(null)

  const { data, status, error } = useGameLeaderboard(slug, sort)

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])

  const chromeStyle = useGameChromeCssVars(slug)

  useEffect(() => {
    if (!sortOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!sortWrapRef.current?.contains(e.target as Node)) setSortOpen(false)
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

  const title = gameTitle(variant)
  const host = gameHostLine(variant)

  const sortLabel =
    LEADERBOARD_SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Overall Return'

  if (!gameSlug) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="lb-root" style={chromeStyle}>
      <div className="lb-phone">
        <div className="lb-scroll">
          <header className="gc-headerBand lb-header">
            <button type="button" className="gc-back" aria-label="Back to activity" onClick={goBack}>
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

          <section className="lb-sheet" aria-label="Leaderboard">
            <div className="lb-toolbar">
              <p className="lb-playerCount">
                {data ? `${data.totalPlayers} PLAYERS` : 'PLAYERS'}
              </p>
              <div className="lb-sortWrap" ref={sortWrapRef}>
                <button
                  type="button"
                  className="lb-sortBtn"
                  aria-expanded={sortOpen}
                  aria-haspopup="listbox"
                  onClick={() => setSortOpen((o) => !o)}
                >
                  {sortLabel}
                  <img className="lb-sortChevron" src={a.chevronDown} alt="" aria-hidden />
                </button>
                {sortOpen ? (
                  <ul className="lb-sortMenu" role="listbox" aria-label="Sort leaderboard">
                    {LEADERBOARD_SORT_OPTIONS.map((opt) => (
                      <li key={opt.key}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={sort === opt.key}
                          className={`lb-sortItem${sort === opt.key ? ' lb-sortItem--on' : ''}`}
                          onClick={() => {
                            setSort(opt.key)
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

            {status === 'loading' && !data ? (
              <p className="lb-loading">Loading leaderboard…</p>
            ) : null}
            {error ? <p className="lb-error">{error}</p> : null}

            {data && data.rows.length === 0 ? (
              <p className="lb-loading">No players in this game yet.</p>
            ) : null}

            {data &&
              data.rows.map((row) => {
                const ring = avatarRingClass(row.rank)
                const pillClass =
                  row.sortMetricLabel === '—'
                    ? 'lb-pill lb-pill--muted'
                    : row.positive
                      ? 'lb-pill lb-pill--up'
                      : 'lb-pill lb-pill--down'
                return (
                  <button
                    key={row.userId}
                    type="button"
                    className="lb-row"
                    onClick={() => openProfile(row.userId)}
                  >
                    <div className={ring}>
                      <img src={row.avatarUrl} alt="" />
                    </div>
                    <div className="lb-nameBlock">
                      <p className="lb-displayName">{row.displayName}</p>
                      <p className="lb-handle">{row.handle}</p>
                    </div>
                    <div className="lb-stats">
                      <p className="lb-nw">{row.netWorthLabel}</p>
                      <span className={pillClass}>{row.sortMetricLabel}</span>
                    </div>
                  </button>
                )
              })}
          </section>
        </div>

        <ChallengeBottomNav gameSlug={slug} active="leaderboard" />
      </div>
    </div>
  )
}
