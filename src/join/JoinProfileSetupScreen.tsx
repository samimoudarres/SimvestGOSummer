import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { gamePaths } from '../gameRoutes'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import { fetchJoinWelcome } from './fetchJoinWelcome'
import { fetchExistingJoinSetup, saveJoinSetupProfile } from './joinSetupApi'
import type { JoinSetupDraftInput, JoinSetupFieldError } from './joinSetupTypes'
import './joinProfileSetup.css'

function UserIcon() {
  return (
    <svg viewBox="0 0 73 73" aria-hidden>
      <circle cx="36.5" cy="36.5" r="36.5" fill="#8b8f94" />
      <circle cx="36.5" cy="26.8" r="10.2" fill="#ffffff" />
      <path d="M15 58c4.8-10.5 14.2-15.7 21.5-15.7S53.2 47.5 58 58" fill="#ffffff" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 5c4.5 0 8.5 2.5 10.5 7-2 4.5-6 7-10.5 7S3.5 16.5 1.5 12C3.5 7.5 7.5 5 12 5zm0 2.5A4.5 4.5 0 1 0 12 16.5 4.5 4.5 0 0 0 12 7.5z"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M2 4l2-2 18 18-2 2-3.2-3.2c-1.5.8-3.1 1.2-4.8 1.2-4.5 0-8.5-2.5-10.5-7 1-2.2 2.5-4 4.4-5.2L2 4zm9.3 9.3a2.2 2.2 0 0 0 3-3l-3-3a4.5 4.5 0 0 0-2.5 1.2l2.5 2.5zm10.7-1.3c-.8 1.8-2 3.4-3.5 4.5l-1.4-1.4A8.5 8.5 0 0 0 19.9 12c-2-4.5-6-7-10.5-7-.7 0-1.4.1-2 .2L5.8 3.6c1.3-.4 2.7-.6 4.2-.6 4.5 0 8.5 2.5 10.5 7z"
      />
    </svg>
  )
}

function emptyDraft(): JoinSetupDraftInput {
  return {
    firstName: '',
    lastName: '',
    username: '',
    phone: '',
    email: '',
    password: '',
    avatarUrl: '',
  }
}

export function JoinProfileSetupScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)
  const code = params.get('code')?.trim() ?? ''
  const [gameSlug, setGameSlug] = useState<string | null>(null)
  const [draft, setDraft] = useState<JoinSetupDraftInput>(emptyDraft)
  const [showPassword, setShowPassword] = useState(false)
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
        const existing = await fetchExistingJoinSetup(welcome.gameSlug)
        if (cancelled) return
        if (existing) {
          setDraft((prev) => ({
            ...prev,
            firstName: existing.firstName,
            lastName: existing.lastName,
            username: existing.username,
            phone: existing.phone ?? '',
            email: existing.email ?? '',
            avatarUrl: existing.avatarUrl || '',
            password: '',
          }))
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
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result.startsWith('data:image/')) {
        setTopError('That image could not be read. Please try another image.')
        return
      }
      setDraft((prev) => ({ ...prev, avatarUrl: result }))
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
    setSubmitting(true)
    setTopError(null)
    setErrors([])
    const result = await saveJoinSetupProfile(gameSlug, draft)
    setSubmitting(false)
    if (!result.ok) {
      setErrors(result.errors)
      setTopError(result.message)
      return
    }
    if (result.data.pendingApproval) {
      setTopError(null)
      navigate('/', {
        replace: true,
        state: {
          joinNotice:
            'Your join request was sent to the host. You will get access to this game after they approve your profile.',
        },
      })
      return
    }
    navigate(`/g/${encodeURIComponent(gameSlug)}`)
  }, [draft, gameSlug, navigate])

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

        <div className="jp-avatarWrap">
          <button
            type="button"
            className="jp-avatarBtn"
            aria-label="Set profile photo"
            onClick={() => fileRef.current?.click()}
          >
            {draft.avatarUrl ? (
              <img className="jp-avatarImg" src={draft.avatarUrl} alt="" />
            ) : (
              <span className="jp-avatarIcon">
                <UserIcon />
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onPickAvatar}
          />
        </div>
        <p className="jp-photoHint">Set profile photo</p>

        <form className="jp-form" onSubmit={(e) => e.preventDefault()}>
          <div className="jp-row2">
            <div className="jp-field">
              <p className="jp-label">First name</p>
              <div className="jp-inputWrap">
                <input
                  className="jp-input"
                  placeholder="Enter first name"
                  value={draft.firstName}
                  onChange={(e) => setDraft((p) => ({ ...p, firstName: e.target.value }))}
                  autoComplete="given-name"
                />
              </div>
              {fieldError.get('firstName') ? <p className="jp-error">{fieldError.get('firstName')}</p> : null}
            </div>
            <div className="jp-field">
              <p className="jp-label">Last name</p>
              <div className="jp-inputWrap">
                <input
                  className="jp-input"
                  placeholder="Enter last name"
                  value={draft.lastName}
                  onChange={(e) => setDraft((p) => ({ ...p, lastName: e.target.value }))}
                  autoComplete="family-name"
                />
              </div>
              {fieldError.get('lastName') ? <p className="jp-error">{fieldError.get('lastName')}</p> : null}
            </div>
          </div>

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

          <div className="jp-field">
            <p className="jp-label">Phone number</p>
            <div className="jp-inputWrap">
              <input
                className="jp-input"
                placeholder="Enter phone number"
                value={draft.phone}
                onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            {fieldError.get('phone') ? <p className="jp-error">{fieldError.get('phone')}</p> : null}
          </div>

          <div className="jp-field">
            <p className="jp-label">Email</p>
            <div className="jp-inputWrap">
              <input
                className="jp-input"
                placeholder="Enter email address"
                value={draft.email}
                onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                type="email"
                inputMode="email"
                autoComplete="email"
              />
            </div>
            {fieldError.get('email') ? <p className="jp-error">{fieldError.get('email')}</p> : null}
          </div>

          <div className="jp-field">
            <p className="jp-label">Create password</p>
            <div className="jp-inputWrap">
              <input
                className="jp-input jp-input--pwd"
                placeholder="Enter new password"
                value={draft.password}
                onChange={(e) => setDraft((p) => ({ ...p, password: e.target.value }))}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="jp-eye"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {fieldError.get('password') ? <p className="jp-error">{fieldError.get('password')}</p> : null}
          </div>

          <p className="jp-note">Phone or email is required (you only need one).</p>
          {fieldError.get('contact') ? <p className="jp-error">{fieldError.get('contact')}</p> : null}
          {fieldError.get('avatarUrl') ? <p className="jp-error">{fieldError.get('avatarUrl')}</p> : null}
          {topError ? <p className="jp-error">{topError}</p> : null}
        </form>

        <button type="button" className="jp-submit" disabled={submitting} onClick={() => void submit()}>
          {submitting ? 'Saving…' : 'Start trading'}
        </button>
      </div>
    </div>
  )
}

