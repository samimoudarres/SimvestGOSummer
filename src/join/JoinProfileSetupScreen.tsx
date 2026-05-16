import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { gamePaths } from '../gameRoutes'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import { fetchJoinWelcome } from './fetchJoinWelcome'
import { fetchExistingJoinSetup, saveJoinSetupProfile } from './joinSetupApi'
import { MAX_PROFILE_AVATAR_FILE_BYTES } from '../profile/maxProfileAvatarUpload'
import { JoinGameDefaultAvatarChoice, JoinGameProfileAvatarBlock, profileRowUsesDefaultGameAvatar } from './JoinGameProfileAvatarBlock'
import type { JoinSetupDraftInput, JoinSetupFieldError } from './joinSetupTypes'
import './joinProfileSetup.css'

function emptyDraft(): JoinSetupDraftInput {
  return { username: '', avatarUrl: '' }
}

export function JoinProfileSetupScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const code = params.get('code')?.trim() ?? ''
  const [gameSlug, setGameSlug] = useState<string | null>(null)
  const [draft, setDraft] = useState<JoinSetupDraftInput>(emptyDraft)
  const [useDefaultAvatar, setUseDefaultAvatar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<JoinSetupFieldError[]>([])
  const [topError, setTopError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setTopError(null)
      if (!/^\d{6}$/.test(code)) {
        setTopError('Missing or invalid game code.')
        setLoading(false)
        return
      }
      try {
        const welcome = await fetchJoinWelcome(code)
        if (!welcome) {
          setTopError('This code does not match an active game.')
          setLoading(false)
          return
        }
        if (cancelled) return
        setGameSlug(welcome.gameSlug)
        /* If the user already set up this game (rare — happens on edit), pre-fill
         * the two fields we still show so they can update without restarting. */
        const existing = await fetchExistingJoinSetup(welcome.gameSlug)
        if (cancelled) return
        if (existing) {
          setDraft((prev) => ({
            ...prev,
            username: existing.username,
            avatarUrl: profileRowUsesDefaultGameAvatar(existing.avatarUrl) ? '' : existing.avatarUrl || '',
          }))
          setUseDefaultAvatar(profileRowUsesDefaultGameAvatar(existing.avatarUrl))
        }
      } catch (e) {
        if (!cancelled) {
          setTopError(e instanceof Error ? e.message : 'Could not prepare profile setup.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [code])

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
    if (!gameSlug) return
    if (!useDefaultAvatar && !draft.avatarUrl.trim()) {
      setTopError('Upload a profile photo or check “Use default profile picture”.')
      return
    }
    setSubmitting(true)
    setTopError(null)
    setErrors([])
    const result = await saveJoinSetupProfile(gameSlug, {
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
      setTopError(null)
      try {
        window.dispatchEvent(new CustomEvent('simvest:join-requests-changed'))
      } catch {
        /* ignore */
      }
      navigate('/', {
        replace: true,
        state: {
          joinNotice:
            'Your join request was sent to the host. You will get access to this game after they approve your profile.',
        },
      })
      return
    }
    /* Replace so WebView / hardware “back” cannot return to profile setup after join. */
    navigate(`/g/${encodeURIComponent(gameSlug)}`, { replace: true })
  }, [draft, gameSlug, navigate, useDefaultAvatar])

  if (loading) {
    return (
      <div className="jp-root">
        <div className="jp-phone">
          <p className="jp-note" style={{ position: 'absolute', top: 220, left: 38 }}>
            Loading profile setup…
          </p>
        </div>
      </div>
    )
  }

  if (!gameSlug) {
    return (
      <div className="jp-root">
        <div className="jp-phone">
          <button type="button" className="jp-back" onClick={() => navigate(gamePaths.join)}>
            <BackArrowIcon />
          </button>
          <p className="jp-note" style={{ position: 'absolute', top: 220, left: 38, color: '#b00020' }}>
            {topError ?? 'Could not open profile setup.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="jp-root">
      <div className="jp-phone" data-node-id="284:7217">
        <button
          type="button"
          className="jp-back"
          aria-label="Back"
          onClick={() => navigate(gamePaths.joinWelcome(code))}
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

          <p className="jp-note">
            We’ll use your Simvest account info for everything else — your photo and username are the only
            things you can customize per game.
          </p>
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
          {submitting ? 'Saving…' : 'Start trading'}
        </button>
      </div>
    </div>
  )
}
