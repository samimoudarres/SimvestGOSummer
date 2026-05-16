import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { GAME_SLUG } from '../challenge/gameMeta'
import { gamePaths } from '../gameRoutes'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import { MAX_PROFILE_AVATAR_FILE_BYTES } from '../profile/maxProfileAvatarUpload'
import { fetchExistingJoinSetup, saveJoinSetupProfile } from '../join/joinSetupApi'
import { JoinGameDefaultAvatarChoice, JoinGameProfileAvatarBlock, profileRowUsesDefaultGameAvatar } from '../join/JoinGameProfileAvatarBlock'
import type { JoinSetupDraftInput, JoinSetupFieldError } from '../join/joinSetupTypes'
import '../join/joinProfileSetup.css'
import { fetchMyAccount } from '../settings/settingsClient'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import { DEFAULT_PROFILE_AVATAR_URL, isPlaceholderProfileAvatarUrl } from '../user/resolveProfileAvatarUrl'
import { fetchCreateGameSettings } from './createGameSettingsApi'

const GAME_SLUG_KEY = GAME_SLUG.newTemplate

function emptyDraft(): JoinSetupDraftInput {
  return { username: '', avatarUrl: '' }
}

function accountPhotoForDraft(url: string | undefined): string {
  const t = typeof url === 'string' ? url.trim() : ''
  if (!t) return ''
  if (t === DEFAULT_PROFILE_AVATAR_URL) return ''
  if (isPlaceholderProfileAvatarUrl(t)) return ''
  return t
}

/**
 * After the host publishes a new challenge (slug `new`), collect the same per-game
 * identity fields as the join flow: **username** + **profile photo**. Persisted via
 * `POST /api/games/:slug/profile/setup` → `user-setup-profiles.json` keyed by this game.
 */
export function CreateGameHostProfileScreen() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<JoinSetupDraftInput>(emptyDraft)
  const [useDefaultAvatar, setUseDefaultAvatar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<JoinSetupFieldError[]>([])
  const [topError, setTopError] = useState<string | null>(null)
  const [gateOk, setGateOk] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setTopError(null)
      setGateOk(null)
      try {
        const settingsRes = await fetchCreateGameSettings(GAME_SLUG_KEY)
        if (cancelled) return
        if (!settingsRes.settings?.setupComplete || !settingsRes.isHost) {
          setGateOk(false)
          setLoading(false)
          return
        }
        setGateOk(true)

        const [existing, acct] = await Promise.all([
          fetchExistingJoinSetup(GAME_SLUG_KEY),
          fetchMyAccount(),
        ])
        if (cancelled) return

        let username = ''
        let avatarUrl = ''
        let useDefault = false
        if (existing) {
          username = existing.username
          const raw = existing.avatarUrl || ''
          useDefault = profileRowUsesDefaultGameAvatar(raw)
          avatarUrl = useDefault ? '' : raw
        } else if (acct.ok) {
          avatarUrl = accountPhotoForDraft(acct.account.avatarUrl)
          useDefault = false
        }
        setDraft({ username, avatarUrl })
        setUseDefaultAvatar(useDefault)
      } catch (e) {
        if (!cancelled) {
          setTopError(e instanceof Error ? e.message : 'Could not load this step.')
          setGateOk(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const onPickAvatar = useCallback((ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setTopError('Please choose an image file for your profile photo.')
      return
    }
    if (file.size > MAX_PROFILE_AVATAR_FILE_BYTES) {
      setTopError(
        `That photo is too large — choose one under ${Math.round(MAX_PROFILE_AVATAR_FILE_BYTES / (1024 * 1024))} MB.`,
      )
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result.startsWith('data:image/')) {
        setTopError('That image could not be read. Please try another image.')
        return
      }
      setDraft((prev) => ({ ...prev, avatarUrl: result }))
      setUseDefaultAvatar(false)
      setTopError(null)
    }
    reader.onerror = () => setTopError('Could not load that image. Try another file.')
    reader.readAsDataURL(file)
  }, [])

  const fieldError = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of errors) {
      if (!map.has(e.field)) map.set(e.field, e.message)
    }
    return map
  }, [errors])

  const submit = useCallback(async () => {
    if (!useDefaultAvatar && !draft.avatarUrl.trim()) {
      setTopError('Upload a profile photo or check “Use default profile picture”.')
      return
    }
    setSubmitting(true)
    setTopError(null)
    setErrors([])
    const result = await saveJoinSetupProfile(GAME_SLUG_KEY, {
      ...draft,
      useDefaultGameAvatar: useDefaultAvatar,
    })
    setSubmitting(false)
    if (!result.ok) {
      setErrors(result.errors)
      setTopError(result.message)
      return
    }
    if (result.data.pendingApproval) {
      setTopError('Unexpected approval state for the game host. Please try again or contact support.')
      return
    }
    rememberActiveGameSlug(GAME_SLUG_KEY)
    window.dispatchEvent(new CustomEvent('simvest:activity-refresh', { detail: { gameSlug: GAME_SLUG_KEY } }))
    window.dispatchEvent(new CustomEvent('simvest:holdings-refresh', { detail: { gameSlug: GAME_SLUG_KEY } }))
    navigate(gamePaths.newGameTemplate, { replace: true })
  }, [draft, navigate, useDefaultAvatar])

  if (loading) {
    return (
      <div className="jp-root">
        <div className="jp-phone">
          <p className="jp-note" style={{ position: 'absolute', top: 220, left: 38 }}>
            Loading…
          </p>
        </div>
      </div>
    )
  }

  if (gateOk === false) {
    return (
      <div className="jp-root">
        <div className="jp-phone">
          <button type="button" className="jp-back" aria-label="Back" onClick={() => navigate(gamePaths.createGameTheme)}>
            <BackArrowIcon />
          </button>
          <p className="jp-note" style={{ position: 'absolute', top: 220, left: 38, color: '#b00020' }}>
            {topError ?? 'Finish creating your game on the previous screen first.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="jp-root">
      <div className="jp-phone" data-node-id="create-host-profile">
        <button
          type="button"
          className="jp-back"
          aria-label="Back to theme"
          onClick={() => navigate(gamePaths.createGameTheme)}
        >
          <BackArrowIcon />
        </button>
        <h1 className="jp-logo">SIMVEST</h1>

        <JoinGameProfileAvatarBlock
          draft={draft}
          useDefaultAvatar={useDefaultAvatar}
          fileRef={fileRef}
          onPickAvatar={onPickAvatar}
        />

        <form className="jp-form" onSubmit={(e) => e.preventDefault()}>
          <p className="jp-formLeadTitle">
            How you&apos;ll appear <strong>in this game</strong>
          </p>
          <p className="jp-formLeadNote">
            Pick a username and photo for this challenge (or use the default picture). Players see this in the roster,
            activity feed, and leaderboards — separate from your main Simvest account settings.
          </p>
          <div className="jp-field">
            <p className="jp-label">Create username</p>
            <div className="jp-inputWrap">
              <input
                className="jp-input"
                placeholder="Enter username"
                value={draft.username}
                onChange={(e) => setDraft((p) => ({ ...p, username: e.target.value }))}
                autoCapitalize="none"
                autoComplete="username"
              />
            </div>
            {fieldError.get('username') ? <p className="jp-error">{fieldError.get('username')}</p> : null}
          </div>

          {fieldError.get('avatarUrl') ? <p className="jp-error">{fieldError.get('avatarUrl')}</p> : null}
          {topError ? <p className="jp-error">{topError}</p> : null}
        </form>

        <JoinGameDefaultAvatarChoice
          useDefaultAvatar={useDefaultAvatar}
          setUseDefaultAvatar={setUseDefaultAvatar}
          setDraft={setDraft}
          fileRef={fileRef}
        />

        <button type="button" className="jp-submit" disabled={submitting} onClick={() => void submit()}>
          {submitting ? 'Saving…' : 'Enter your game'}
        </button>
      </div>
    </div>
  )
}
