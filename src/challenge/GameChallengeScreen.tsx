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
import { gameTitle, slugToVariant } from './gameMeta'
import { navigateToStock } from '../stocks/navigateToStock'
import { ActivityComposerRich } from '../feed/ActivityComposerRich'
import { FeedRichBody } from '../feed/FeedRichBody'
import { FeedPollCard } from '../feed/FeedPollCard'
import { FeedPostSocialBar } from '../feed/FeedPostSocialBar'
import { FeedPostOverflowMenu } from '../feed/FeedPostOverflowMenu'
import { useComposerContext } from '../hooks/useComposerContext'
import { resolveProfileAvatarUrl } from '../user/resolveProfileAvatarUrl'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import { getSimvestUserId } from '../user/simvestUserId'
import { useGameFeed } from './useGameFeed'
import { useGameTopGainsToday } from './useGameTopGainsToday'
import { GameShellRosterBlock } from './GameShellRosterBlock'
import { useGameChallengeHeader } from './useGameChallengeHeader'
import { InviteGameSheet } from '../join/InviteGameSheet'
import { fetchCreateGameSettings } from '../createGame/createGameSettingsApi'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import { simvestFetch } from '../api/simvestFetch'
import { StockBrandingImage } from '../components/StockBrandingImage'
import { apiAssetSrc } from '../config/apiAssetSrc'
import './gameChallenge.css'

const GAIN_CARD_W = 111
const GAIN_GAP = 10
const GAIN_PAD = 5

type JoinReqRow = {
  id: string
  userId: string
  displayName: string
  createdAtIso: string
}

type DurationPreset = '1d' | '1w' | '1m' | '1y' | 'custom'

type SettingsRoster = {
  userId: string
  displayName: string
  avatarUrl: string
  isHost: boolean
}

type SettingsConfirm =
  | { kind: 'end' }
  | { kind: 'kick'; player: SettingsRoster }
  | { kind: 'leave' }
  | null

const DURATION_OPTIONS: { value: DurationPreset; label: string; sub: string }[] = [
  { value: '1d', label: '1 day', sub: 'Ends 24 hours from now' },
  { value: '1w', label: '1 week', sub: 'Ends 7 days from now' },
  { value: '1m', label: '1 month', sub: 'Ends 30 days from now' },
  { value: '1y', label: '1 year', sub: 'Ends 365 days from now' },
  { value: 'custom', label: 'Custom date', sub: 'Pick the day this game wraps' },
]

function gainsTrackWidthPx(cardCount: number): number {
  const n = Math.max(1, Math.min(5, Math.floor(cardCount)))
  return GAIN_PAD + n * GAIN_CARD_W + (n - 1) * GAIN_GAP + GAIN_PAD
}

export function GameChallengeScreen() {
  const navigate = useNavigate()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? ''
  const headerCtl = useGameChallengeHeader(slug)
  const gameHasEnded = headerCtl.gameHasEnded
  const { ingestCreateSettingsResponse } = headerCtl
  const [inviteOpen, setInviteOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [hostJoinInfo, setHostJoinInfo] = useState<{ count: number } | null>(null)
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(false)
  const [joinRequests, setJoinRequests] = useState<JoinReqRow[]>([])
  const [joinRequestsErr, setJoinRequestsErr] = useState<string | null>(null)
  const [joinRequestsBusy, setJoinRequestsBusy] = useState<string | null>(null)
  const [viewerIsHost, setViewerIsHost] = useState(false)
  const [gameIsPrivate, setGameIsPrivate] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState<'menu' | 'kick' | 'duration'>('menu')
  const [rosterRows, setRosterRows] = useState<SettingsRoster[]>([])
  const [kickListStatus, setKickListStatus] = useState<'idle' | 'loading' | 'ready' | 'err'>('idle')
  const [rosterErr, setRosterErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<SettingsConfirm>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmErr, setConfirmErr] = useState<string | null>(null)
  const [actionFlash, setActionFlash] = useState<string | null>(null)
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('1m')
  const [durationCustom, setDurationCustom] = useState<string>('')
  const [durationBusy, setDurationBusy] = useState(false)
  const [durationErr, setDurationErr] = useState<string | null>(null)
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
    /* Replace so “Back to home” does not leave the shell under extra history entries (and stays aligned with native back after join flow fixes). */
    navigate('/', { replace: true })
  }, [navigate])

  const openProfile = useCallback(
    (userId: string) => {
      navigate(`/g/${slug}/profile/${encodeURIComponent(userId)}`)
    },
    [navigate, slug],
  )

  const isTemplate = headerCtl.isTemplate
  const shellIsLive = headerCtl.shellIsLive
  const refreshGameShellMeta = useCallback(async () => {
    try {
      const d = await fetchCreateGameSettings(slug)
      ingestCreateSettingsResponse(d)
      const isPrivate = d.settings?.visibility === 'private'
      setViewerIsHost(Boolean(d.isHost))
      setGameIsPrivate(Boolean(isPrivate))
      if (d.isHost && isPrivate) {
        setHostJoinInfo({ count: Math.max(0, d.pendingJoinCount ?? 0) })
      } else {
        setHostJoinInfo(null)
      }
      if (d.settings) {
        const dp = (d.settings.durationPreset ?? '1m') as DurationPreset
        setDurationPreset(dp)
        setDurationCustom(
          dp === 'custom' && typeof d.settings.customEndsOn === 'string' ? d.settings.customEndsOn : '',
        )
      }
    } catch {
      setHostJoinInfo(null)
      setViewerIsHost(false)
      setGameIsPrivate(false)
    }
  }, [slug, ingestCreateSettingsResponse])

  const loadJoinRequests = useCallback(async () => {
    setJoinRequestsErr(null)
    try {
      const res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/join-requests`)
      if (!res.ok) {
        setJoinRequests([])
        setJoinRequestsErr((await res.text()) || 'Could not load join requests.')
        return
      }
      const body = (await res.json()) as { requests?: JoinReqRow[] }
      const rows = Array.isArray(body.requests) ? body.requests : []
      setJoinRequests(rows)
      setHostJoinInfo((cur) => (cur ? { count: rows.length } : cur))
    } catch (err) {
      setJoinRequestsErr(err instanceof Error ? err.message : 'Could not load join requests.')
    }
  }, [slug])

  const openJoinRequests = useCallback(() => {
    setJoinRequestsOpen(true)
    void loadJoinRequests()
  }, [loadJoinRequests])

  const actOnJoinRequest = useCallback(
    async (id: string, action: 'approve' | 'reject') => {
      setJoinRequestsBusy(id)
      setJoinRequestsErr(null)
      try {
        const res = await simvestFetch(
          `/api/games/${encodeURIComponent(slug)}/join-requests/${encodeURIComponent(id)}/${action}`,
          { method: 'POST' },
        )
        if (!res.ok) {
          setJoinRequestsErr((await res.text()) || `${action} failed.`)
          return
        }
        await loadJoinRequests()
        await refreshGameShellMeta()
        try {
          window.dispatchEvent(new CustomEvent('simvest:join-requests-changed'))
        } catch {
          /* ignore */
        }
      } catch (err) {
        setJoinRequestsErr(err instanceof Error ? err.message : `${action} failed.`)
      } finally {
        setJoinRequestsBusy(null)
      }
    },
    [loadJoinRequests, refreshGameShellMeta, slug],
  )

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    setSettingsView('menu')
    setRosterErr(null)
    setDurationErr(null)
  }, [])

  const loadRoster = useCallback(async () => {
    setKickListStatus('loading')
    setRosterErr(null)
    try {
      const res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/players`)
      if (!res.ok) {
        setRosterRows([])
        setKickListStatus('err')
        setRosterErr((await res.text()) || 'Could not load player list.')
        return
      }
      const body = (await res.json()) as { players?: SettingsRoster[] }
      setRosterRows(Array.isArray(body.players) ? body.players : [])
      setKickListStatus('ready')
    } catch (err) {
      setKickListStatus('err')
      setRosterErr(err instanceof Error ? err.message : 'Could not load player list.')
    }
  }, [slug])

  const openSettings = useCallback(() => {
    setSettingsOpen(true)
    setSettingsView('menu')
    setActionFlash(null)
  }, [])

  const openKickList = useCallback(() => {
    setSettingsView('kick')
    void loadRoster()
  }, [loadRoster])

  const openDurationForm = useCallback(() => {
    setSettingsView('duration')
    setDurationErr(null)
  }, [])

  const submitDurationChange = useCallback(async () => {
    setDurationBusy(true)
    setDurationErr(null)
    try {
      const body: Record<string, unknown> = { durationPreset }
      if (durationPreset === 'custom') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(durationCustom)) {
          setDurationErr('Pick a valid YYYY-MM-DD date.')
          setDurationBusy(false)
          return
        }
        body.customEndsOn = durationCustom
      }
      const res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/duration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        let msg = 'Could not update duration.'
        try {
          const j = (await res.json()) as { error?: string }
          if (typeof j.error === 'string' && j.error.trim()) msg = j.error
        } catch {
          /* ignore */
        }
        setDurationErr(msg)
        return
      }
      const j = (await res.json()) as { endsAtIso?: string }
      void j.endsAtIso
      setActionFlash('Game duration updated.')
      setSettingsView('menu')
      await refreshGameShellMeta()
    } catch (err) {
      setDurationErr(err instanceof Error ? err.message : 'Could not update duration.')
    } finally {
      setDurationBusy(false)
    }
  }, [durationCustom, durationPreset, refreshGameShellMeta, slug])

  const runConfirm = useCallback(async () => {
    if (!confirm) return
    setConfirmBusy(true)
    setConfirmErr(null)
    try {
      if (confirm.kind === 'end') {
        const res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/end`, { method: 'POST' })
        if (!res.ok) {
          setConfirmErr((await res.text()) || 'Could not end the game.')
          return
        }
        const j = (await res.json()) as { endsAtIso?: string }
        void j.endsAtIso
        setConfirm(null)
        closeSettings()
        setActionFlash('Game ended for everyone.')
        void refreshGameShellMeta()
      } else if (confirm.kind === 'kick') {
        const res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/kick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: confirm.player.userId }),
        })
        if (!res.ok) {
          setConfirmErr((await res.text()) || 'Could not remove that player.')
          return
        }
        setRosterRows((rows) => rows.filter((r) => r.userId !== confirm.player.userId))
        setActionFlash(`Removed ${confirm.player.displayName} from the game.`)
        setConfirm(null)
      } else if (confirm.kind === 'leave') {
        const res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/leave`, { method: 'POST' })
        if (!res.ok) {
          setConfirmErr((await res.text()) || 'Could not leave the game.')
          return
        }
        setConfirm(null)
        closeSettings()
        navigate('/', { replace: true })
      }
    } catch (err) {
      setConfirmErr(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setConfirmBusy(false)
    }
  }, [confirm, closeSettings, navigate, slug, refreshGameShellMeta])

  useEffect(() => {
    if (!actionFlash) return
    const id = window.setTimeout(() => setActionFlash(null), 4000)
    return () => window.clearTimeout(id)
  }, [actionFlash])

  useEffect(() => {
    void refreshGameShellMeta()
  }, [refreshGameShellMeta])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshGameShellMeta()
    }
    const onJoinReq = () => void refreshGameShellMeta()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('simvest:join-requests-changed', onJoinReq)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('simvest:join-requests-changed', onJoinReq)
    }
  }, [refreshGameShellMeta])

  useEffect(() => {
    if (!viewerIsHost || !gameIsPrivate) return
    const id = window.setInterval(() => void refreshGameShellMeta(), 20_000)
    return () => window.clearInterval(id)
  }, [viewerIsHost, gameIsPrivate, refreshGameShellMeta])

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])

  const { posts: feedPosts, status: feedStatus, error: feedErr, reload: reloadFeed } = useGameFeed(slug)
  const { ctx: composerCtx, reload: reloadComposer } = useComposerContext(shellIsLive ? slug : null)
  const {
    rows: topGainRows,
    status: topGainsStatus,
    error: topGainsErr,
  } = useGameTopGainsToday(slug, shellIsLive)

  const sortedFeedPosts = useMemo(
    () => sortFeedPosts(feedPosts, activitySort),
    [feedPosts, activitySort],
  )

  const viewerUserId = useMemo(() => getSimvestUserId(), [])

  const chromeStyle = useGameChromeCssVars(slug)

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
          <div className="gc-phoneCanvas">
        <header className="gc-headerBand">
          <button type="button" className="gc-back" aria-label="Back to home" onClick={goHome}>
            <img src={a.back} alt="" />
          </button>
          <button
            type="button"
            className="gc-headerMenu"
            aria-label="Game settings and notifications"
            aria-expanded={settingsOpen}
            onClick={() => (settingsOpen ? closeSettings() : openSettings())}
          >
            <img src={a.ellipsisHeader} alt="" />
            {viewerIsHost && gameIsPrivate && hostJoinInfo && hostJoinInfo.count > 0 ? (
              <span className="gc-headerMenuBadge" aria-hidden>
                {hostJoinInfo.count}
              </span>
            ) : null}
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
          {joinRequestsOpen ? (
            <div className="gc-joinRequestsPopover" role="dialog" aria-label="Join requests">
              <div className="gc-joinRequestsHead">
                <div>
                  <p className="gc-joinRequestsEyebrow">Private game</p>
                  <h2 className="gc-joinRequestsTitle">Join requests</h2>
                </div>
                <button
                  type="button"
                  className="gc-joinRequestsClose"
                  aria-label="Close join requests"
                  onClick={() => setJoinRequestsOpen(false)}
                >
                  x
                </button>
              </div>
              {joinRequestsErr ? <p className="gc-joinRequestsErr">{joinRequestsErr}</p> : null}
              {!joinRequestsErr && joinRequests.length === 0 ? (
                <p className="gc-joinRequestsEmpty">No pending requests right now.</p>
              ) : null}
              {joinRequests.map((r) => (
                <div key={r.id} className="gc-joinRequestRow">
                  <div className="gc-joinRequestMeta">
                    <p className="gc-joinRequestName">{r.displayName || r.userId}</p>
                    <p className="gc-joinRequestWhen">{new Date(r.createdAtIso).toLocaleString()}</p>
                  </div>
                  <div className="gc-joinRequestActions">
                    <button
                      type="button"
                      className="gc-joinRequestApprove"
                      disabled={joinRequestsBusy === r.id}
                      onClick={() => void actOnJoinRequest(r.id, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="gc-joinRequestDeny"
                      disabled={joinRequestsBusy === r.id}
                      onClick={() => void actOnJoinRequest(r.id, 'reject')}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {settingsOpen ? (
            <div className="gc-settingsPopover" role="dialog" aria-label="Game settings">
              <div className="gc-settingsHead">
                <div>
                  <p className="gc-settingsEyebrow">{viewerIsHost ? 'Host controls' : 'Game settings'}</p>
                  <h2 className="gc-settingsTitle">
                    {settingsView === 'menu'
                      ? 'Game settings'
                      : settingsView === 'kick'
                        ? 'Kick a player'
                        : 'Change duration'}
                  </h2>
                </div>
                <button
                  type="button"
                  className="gc-settingsClose"
                  aria-label="Close game settings"
                  onClick={closeSettings}
                >
                  x
                </button>
              </div>

              {settingsView === 'menu' ? (
                <div className="gc-settingsList">
                  {viewerIsHost && gameIsPrivate ? (
                    <button
                      type="button"
                      className="gc-settingsRow"
                      onClick={() => {
                        setSettingsOpen(false)
                        openJoinRequests()
                      }}
                    >
                      <span className="gc-settingsRowLabel">Review join requests</span>
                      <span className="gc-settingsRowMeta">
                        {hostJoinInfo ? `${hostJoinInfo.count} pending` : 'None pending'}
                      </span>
                    </button>
                  ) : null}

                  {viewerIsHost ? (
                    <>
                      <button type="button" className="gc-settingsRow" onClick={openDurationForm}>
                        <span className="gc-settingsRowLabel">Change game duration</span>
                        <span className="gc-settingsRowMeta">Update when the game wraps</span>
                      </button>
                      <button type="button" className="gc-settingsRow" onClick={openKickList}>
                        <span className="gc-settingsRowLabel">Kick a player</span>
                        <span className="gc-settingsRowMeta">Remove someone from this game</span>
                      </button>
                      <button
                        type="button"
                        className="gc-settingsRow gc-settingsRow--danger"
                        onClick={() => setConfirm({ kind: 'end' })}
                      >
                        <span className="gc-settingsRowLabel">End game</span>
                        <span className="gc-settingsRowMeta">Wrap this challenge for everyone right now</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="gc-settingsRow gc-settingsRow--danger"
                      onClick={() => setConfirm({ kind: 'leave' })}
                    >
                      <span className="gc-settingsRowLabel">Leave game</span>
                      <span className="gc-settingsRowMeta">
                        You will lose your progress and stop seeing this game on your home feed.
                      </span>
                    </button>
                  )}
                </div>
              ) : null}

              {settingsView === 'kick' ? (
                <div className="gc-settingsList">
                  {kickListStatus === 'loading' ? <p className="gc-settingsHint">Loading players…</p> : null}
                  {rosterErr ? <p className="gc-settingsErr">{rosterErr}</p> : null}
                  {kickListStatus === 'ready' && rosterRows.filter((r) => !r.isHost).length === 0 ? (
                    <p className="gc-settingsHint">No other players have joined this game yet.</p>
                  ) : null}
                  {rosterRows
                    .filter((r) => !r.isHost)
                    .map((p) => (
                      <div key={p.userId} className="gc-settingsRow gc-settingsRow--player">
                        <div className="gc-settingsPlayer">
                          <img
                            src={resolveProfileAvatarUrl(p.avatarUrl)}
                            alt=""
                            className="gc-settingsPlayerAvatar"
                          />
                          <span className="gc-settingsPlayerName">{p.displayName}</span>
                        </div>
                        <button
                          type="button"
                          className="gc-settingsKickBtn"
                          onClick={() => setConfirm({ kind: 'kick', player: p })}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  <button type="button" className="gc-settingsBack" onClick={() => setSettingsView('menu')}>
                    Back
                  </button>
                </div>
              ) : null}

              {settingsView === 'duration' ? (
                <div className="gc-settingsList">
                  <p className="gc-settingsHint">
                    Pick how much longer this game should run. Players will see the new countdown right away.
                  </p>
                  {DURATION_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`gc-settingsDurationRow${durationPreset === opt.value ? ' gc-settingsDurationRow--on' : ''}`}
                    >
                      <input
                        type="radio"
                        name="gc-settings-duration"
                        value={opt.value}
                        checked={durationPreset === opt.value}
                        onChange={() => setDurationPreset(opt.value)}
                      />
                      <span className="gc-settingsDurationMeta">
                        <span className="gc-settingsDurationLabel">{opt.label}</span>
                        <span className="gc-settingsDurationSub">{opt.sub}</span>
                      </span>
                    </label>
                  ))}
                  {durationPreset === 'custom' ? (
                    <input
                      type="date"
                      className="gc-settingsDurationDate"
                      value={durationCustom}
                      onChange={(e) => setDurationCustom(e.target.value)}
                      min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                    />
                  ) : null}
                  {durationErr ? <p className="gc-settingsErr">{durationErr}</p> : null}
                  <div className="gc-settingsRowActions">
                    <button
                      type="button"
                      className="gc-settingsBack"
                      onClick={() => setSettingsView('menu')}
                      disabled={durationBusy}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="gc-settingsPrimary"
                      onClick={() => void submitDurationChange()}
                      disabled={durationBusy}
                    >
                      {durationBusy ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {confirm ? (
            <div className="gc-confirmOverlay" role="dialog" aria-modal="true">
              <div className="gc-confirmCard">
                <h3 className="gc-confirmTitle">
                  {confirm.kind === 'end'
                    ? 'End this game?'
                    : confirm.kind === 'kick'
                      ? `Remove ${confirm.player.displayName}?`
                      : 'Leave this game?'}
                </h3>
                <p className="gc-confirmBody">
                  {confirm.kind === 'end'
                    ? 'The game will close immediately. Players keep their final standings, but no further trades or posts can be made.'
                    : confirm.kind === 'kick'
                      ? `${confirm.player.displayName} will lose access to this game. Their cash, holdings, and posts in this game will be removed.`
                      : 'Your cash, holdings, posts, and standings for this game will be deleted. The game will disappear from your home screen.'}
                </p>
                {confirmErr ? <p className="gc-confirmErr">{confirmErr}</p> : null}
                <div className="gc-confirmActions">
                  <button
                    type="button"
                    className="gc-confirmCancel"
                    onClick={() => {
                      setConfirm(null)
                      setConfirmErr(null)
                    }}
                    disabled={confirmBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="gc-confirmDanger"
                    onClick={() => void runConfirm()}
                    disabled={confirmBusy}
                  >
                    {confirmBusy
                      ? 'Working…'
                      : confirm.kind === 'end'
                        ? 'End game'
                        : confirm.kind === 'kick'
                          ? 'Remove player'
                          : 'Leave game'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {actionFlash ? (
            <div className="gc-actionFlash" role="status" aria-live="polite">
              {actionFlash}
            </div>
          ) : null}
          <GameShellRosterBlock
            shellIsLive={shellIsLive}
            rosterStatus={headerCtl.rosterStatus}
            rosterMembers={headerCtl.rosterMembers}
            totalPlayers={headerCtl.totalPlayers}
            onInviteClick={() => setInviteOpen(true)}
            onMemberProfileClick={openProfile}
          />
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
        ) : gameHasEnded ? (
          <section className="gc-composer gc-composer--ended" aria-label="Challenge ended">
            <p className="gc-composerEndedNote">
              This challenge has ended. The feed below is complete and read-only — open Perform or
              Leaderboard for your final results.
            </p>
          </section>
        ) : (
          <ActivityComposerRich
            gameSlug={slug}
            onPosted={() => {
              void reloadFeed()
              void reloadComposer()
            }}
            shellClassName="gc-composer gc-composer--interactive"
            avatarUrl={resolveProfileAvatarUrl(composerCtx?.avatarUrl)}
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
                          <img src={apiAssetSrc(g.avatarUrl)} alt="" />
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
                      <img className="gc-feedAvatar" src={apiAssetSrc(post.avatar)} alt="" />
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
                    <FeedPostOverflowMenu
                      post={post}
                      gameSlug={gameSlugForPost}
                      viewerUserId={viewerUserId}
                      variant="game"
                      onUpdated={() => void reloadFeed()}
                    />
                  </div>

                  {kind === 'poll' && post.poll ? (
                    <>
                      <FeedPollCard
                        postId={post.id}
                        gameSlug={gameSlugForPost}
                        poll={post.poll}
                        onVoted={() => void reloadFeed()}
                      />
                      <FeedPostSocialBar
                        post={post}
                        gameSlug={gameSlugForPost}
                        variant="game"
                        interactionsLocked={gameHasEnded || Boolean(post.feedInteractionsLocked)}
                        onCountsDirty={() => void reloadFeed()}
                      />
                    </>
                  ) : kind === 'text' ? (
                    <>
                      {post.richSegments?.length || post.attachmentImageUrl ? (
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
                      )}
                      <FeedPostSocialBar
                        post={post}
                        gameSlug={gameSlugForPost}
                        variant="game"
                        interactionsLocked={gameHasEnded || Boolean(post.feedInteractionsLocked)}
                        onCountsDirty={() => void reloadFeed()}
                      />
                    </>
                  ) : (
                    <>
                    <div className="gc-trade gc-tradeCardWrap">
                    <button
                      type="button"
                      className="gc-tradeTap"
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
                      {(() => {
                        const isSell = post.side === 'sell'
                        const fillPriceLabel =
                          typeof post.purchasePrice === 'number' && Number.isFinite(post.purchasePrice)
                            ? `$${post.purchasePrice.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : null
                        const realizedDollars =
                          isSell &&
                          typeof post.costBasis === 'number' &&
                          Number.isFinite(post.costBasis) &&
                          post.costBasis > 0
                            ? (() => {
                                const proceeds = parseFloat(
                                  (post.orderTotal || '').replace(/[^0-9.\-]/g, ''),
                                )
                                return Number.isFinite(proceeds) ? proceeds - post.costBasis : null
                              })()
                            : null
                        const realizedPct =
                          realizedDollars != null && post.costBasis && post.costBasis > 0
                            ? (realizedDollars / post.costBasis) * 100
                            : null
                        // Inline value shows just the dollar delta — the percent is already in
                        // the top-right realized badge, so we don't repeat it and risk wrapping.
                        const realizedLabel =
                          realizedDollars != null
                            ? `${realizedDollars >= 0 ? '+' : '-'}$${Math.abs(realizedDollars).toLocaleString(
                                'en-US',
                                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                              )}`
                            : null
                        // Reference realizedPct so future tweaks keep computing it; the badge in the
                        // aside is driven server-side via post.changePct.
                        void realizedPct
                        const sinceLabel = isSell ? 'Realized' : 'Since Purchase'
                        return (
                          <div className="gc-trade__top">
                            <div className="gc-trade__upper">
                              <StockBrandingImage className="gc-trade__logo" src={post.tickerImage} alt="" />
                              <div className="gc-trade__mid">
                                <p className="gc-trade__headline">{post.tradeTitle}</p>
                              </div>
                              <div className="gc-trade__aside">
                                <div
                                  className={`gc-trade__pctRow${pctKnown ? (pctUp ? ' gc-trade__pctRow--up' : ' gc-trade__pctRow--down') : ' gc-trade__pctRow--na'}`}
                                >
                                  <img
                                    src={
                                      pctKnown
                                        ? pctUp
                                          ? a.changeArrowUp
                                          : a.changeArrowDown
                                        : a.line23
                                    }
                                    alt=""
                                    width={23}
                                    height={23}
                                  />
                                  <span
                                    className={`gc-trade__pct${pctKnown ? (pctUp ? ' gc-trade__pct--up' : ' gc-trade__pct--down') : ' gc-trade__pct--na'}`}
                                  >
                                    {post.changePct}
                                  </span>
                                </div>
                                <p className="gc-trade__since">{sinceLabel}</p>
                                <div className="gc-trade__cols">
                                  <div>
                                    <div className="gc-trade__metric">{post.marketCap}</div>
                                    <div className="gc-trade__metricLabel">Market Cap</div>
                                  </div>
                                  <div>
                                    <div className="gc-trade__metric">{post.revenue}</div>
                                    <div className="gc-trade__metricLabel">Revenue</div>
                                  </div>
                                  {!isSell && fillPriceLabel ? (
                                    <div>
                                      <div className="gc-trade__metric">{fillPriceLabel}</div>
                                      <div className="gc-trade__metricLabel">Buy Price</div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <div className="gc-trade__details">
                              <div className="gc-trade__row">
                                <span className="gc-trade__label">
                                  {isSell ? 'Shares Sold' : 'Shares Bought'}
                                </span>
                                <span className="gc-trade__value">{post.sharesBought}</span>
                              </div>
                              {isSell && fillPriceLabel ? (
                                <div className="gc-trade__row">
                                  <span className="gc-trade__label">Sale Price</span>
                                  <span className="gc-trade__value">{fillPriceLabel}</span>
                                </div>
                              ) : null}
                              <div className="gc-trade__row">
                                <span className="gc-trade__label">{isSell ? 'Proceeds' : 'Order Total'}</span>
                                <span className="gc-trade__value">{post.orderTotal}</span>
                              </div>
                              {isSell && realizedLabel ? (
                                <div className="gc-trade__row">
                                  <span className="gc-trade__label">
                                    Realized {realizedDollars! >= 0 ? 'Gain' : 'Loss'}
                                  </span>
                                  <span
                                    className="gc-trade__value"
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
                        <div className="gc-rationaleShell">
                          <div className="gc-rationaleHead">
                            <img src={a.bulb} alt="" width={14} height={16} />
                            <span>Rationale:</span>
                          </div>
                          <div className="gc-rationaleBox">{post.rationale}</div>
                        </div>
                      ) : null}
                    </div>
                    <FeedPostSocialBar
                      post={post}
                      gameSlug={gameSlugForPost}
                      variant="game"
                      interactionsLocked={gameHasEnded || Boolean(post.feedInteractionsLocked)}
                      onCountsDirty={() => void reloadFeed()}
                    />
                    </>
                  )}
                </article>
              )
            })}
          </div>
        )}
          </div>
        </div>

        <ChallengeBottomNav gameSlug={slug} active="activity" tradeLocked={gameHasEnded} />
      </div>
      <InviteGameSheet open={inviteOpen} onClose={() => setInviteOpen(false)} gameSlug={slug} />
    </div>
  )
}
