/**
 * Edit profile (name, display name, avatar). Submits via `PATCH
 * /api/me/account/profile`; on success the server mirrors `displayName` +
 * `avatarUrl` to `user-profiles.json` so activity posts, leaderboard rows,
 * and the composer all reflect the change without a page refresh on those
 * surfaces' next fetch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchMyAccount,
  updateProfile,
  type AccountFieldError,
  type AccountPublicView,
} from './settingsClient'
import { MAX_PROFILE_AVATAR_FILE_BYTES } from '../profile/maxProfileAvatarUpload'
import { apiAssetSrc } from '../config/apiAssetSrc'
import './settingsScreens.css'

const DEFAULT_AVATAR = '/figma-assets/blank-avatar.svg'

export function SettingsProfileScreen() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [account, setAccount] = useState<AccountPublicView | null>(null)
  const [loading, setLoading] = useState(true)
  const [missingAccount, setMissingAccount] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map())
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const result = await fetchMyAccount()
      if (cancelled) return
      if (result.ok) {
        setAccount(result.account)
        setFirstName(result.account.firstName)
        setLastName(result.account.lastName)
        setDisplayName(result.account.displayName)
        setAvatarUrl(result.account.avatarUrl)
      } else if (result.error.status === 404) {
        setMissingAccount(true)
      } else if (result.error.status === 401) {
        navigate('/login', { replace: true })
        return
      } else {
        setErrorText(result.error.message)
      }
      setLoading(false)
    }
    load().catch((err) => {
      if (cancelled) return
      setErrorText(err instanceof Error ? err.message : 'Could not load your account')
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const onPickAvatar = useCallback((file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorText('Please choose an image file for your profile photo.')
      return
    }
    if (file.size > MAX_PROFILE_AVATAR_FILE_BYTES) {
      setErrorText(
        `That image is too large — pick one under ${Math.round(MAX_PROFILE_AVATAR_FILE_BYTES / (1024 * 1024))} MB.`,
      )
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result.startsWith('data:image/')) {
        setErrorText('That image could not be read. Please try another file.')
        return
      }
      setAvatarUrl(result)
      setErrorText(null)
      setSuccess(false)
    }
    reader.onerror = () => setErrorText('Could not load that image. Try another file.')
    reader.readAsDataURL(file)
  }, [])

  const dirty = useMemo(() => {
    if (!account) return false
    return (
      firstName.trim() !== account.firstName ||
      lastName.trim() !== account.lastName ||
      displayName.trim() !== account.displayName ||
      avatarUrl !== account.avatarUrl
    )
  }, [account, firstName, lastName, displayName, avatarUrl])

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (busy || !account) return

      setBusy(true)
      setErrorText(null)
      setFieldErrors(new Map())
      setSuccess(false)

      const result = await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: displayName.trim(),
        avatarUrl,
      })

      if (result.ok) {
        setAccount(result.account)
        setFirstName(result.account.firstName)
        setLastName(result.account.lastName)
        setDisplayName(result.account.displayName)
        setAvatarUrl(result.account.avatarUrl)
        setSuccess(true)
      } else {
        const map = new Map<string, string>()
        for (const fe of result.error.fields as AccountFieldError[]) {
          map.set(fe.field, fe.message)
        }
        setFieldErrors(map)
        setErrorText(result.error.fields.length === 0 ? result.error.message : null)
      }
      setBusy(false)
    },
    [account, avatarUrl, busy, displayName, firstName, lastName],
  )

  if (loading) {
    return (
      <main className="ss-root">
        <section className="ss-phone">
          <ScreenHeader title="Edit profile" onBack={() => navigate('/settings')} />
          <p className="ss-loading">Loading…</p>
        </section>
      </main>
    )
  }

  if (missingAccount) {
    return (
      <main className="ss-root">
        <section className="ss-phone">
          <ScreenHeader title="Edit profile" onBack={() => navigate('/settings')} />
          <div className="ss-body">
            <p className="ss-error">
              You're in a guest session. Sign up to create a Simvest account before editing your
              profile.
            </p>
            <button type="button" className="ss-submit" onClick={() => navigate('/signup/name')}>
              Create a Simvest account
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="ss-root">
      <section className="ss-phone" aria-label="Edit profile">
        <ScreenHeader title="Edit profile" onBack={() => navigate('/settings')} />

        <form className="ss-form" onSubmit={onSubmit} noValidate>
          <div className="ss-avatarRow">
            <img
              className="ss-avatarLarge"
              src={apiAssetSrc(avatarUrl || DEFAULT_AVATAR)}
              alt="Current profile photo"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="ss-avatarPickBtn"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                Change photo
              </button>
              {avatarUrl && avatarUrl !== DEFAULT_AVATAR ? (
                <button
                  type="button"
                  className="ss-avatarPickBtn"
                  onClick={() => {
                    setAvatarUrl(DEFAULT_AVATAR)
                    setSuccess(false)
                  }}
                  disabled={busy}
                  style={{ borderColor: '#b0c2d2', color: '#5d7c95' }}
                >
                  Reset to default
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="ss-avatarHiddenFile"
                onChange={(e) => onPickAvatar(e.target.files?.[0])}
                tabIndex={-1}
              />
            </div>
          </div>

          <div className="ss-fieldRow">
            <label className="ss-field">
              <span className="ss-label">First name</span>
              <input
                type="text"
                className={`ss-input ${fieldErrors.has('firstName') ? 'ss-input--invalid' : ''}`}
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value)
                  if (fieldErrors.has('firstName')) {
                    const next = new Map(fieldErrors)
                    next.delete('firstName')
                    setFieldErrors(next)
                  }
                  setSuccess(false)
                }}
                maxLength={60}
                autoComplete="given-name"
                disabled={busy}
                aria-invalid={fieldErrors.has('firstName')}
              />
              {fieldErrors.get('firstName') ? (
                <span className="ss-fieldErr">{fieldErrors.get('firstName')}</span>
              ) : null}
            </label>
            <label className="ss-field">
              <span className="ss-label">Last name</span>
              <input
                type="text"
                className={`ss-input ${fieldErrors.has('lastName') ? 'ss-input--invalid' : ''}`}
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value)
                  if (fieldErrors.has('lastName')) {
                    const next = new Map(fieldErrors)
                    next.delete('lastName')
                    setFieldErrors(next)
                  }
                  setSuccess(false)
                }}
                maxLength={60}
                autoComplete="family-name"
                disabled={busy}
                aria-invalid={fieldErrors.has('lastName')}
              />
              {fieldErrors.get('lastName') ? (
                <span className="ss-fieldErr">{fieldErrors.get('lastName')}</span>
              ) : null}
            </label>
          </div>

          <label className="ss-field">
            <span className="ss-label">Display name</span>
            <input
              type="text"
              className={`ss-input ${fieldErrors.has('displayName') ? 'ss-input--invalid' : ''}`}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                if (fieldErrors.has('displayName')) {
                  const next = new Map(fieldErrors)
                  next.delete('displayName')
                  setFieldErrors(next)
                }
                setSuccess(false)
              }}
              maxLength={60}
              autoComplete="nickname"
              disabled={busy}
              aria-invalid={fieldErrors.has('displayName')}
            />
            <span className="ss-help">
              Shown on activity posts and the leaderboard. Defaults to your full name.
            </span>
            {fieldErrors.get('displayName') ? (
              <span className="ss-fieldErr">{fieldErrors.get('displayName')}</span>
            ) : null}
          </label>

          {errorText ? <div className="ss-error">{errorText}</div> : null}
          {success ? <div className="ss-success">Profile saved.</div> : null}

          <div className="ss-footer">
            <button
              type="submit"
              className="ss-submit"
              disabled={busy || !dirty}
              aria-busy={busy}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="ss-header">
      <button type="button" className="ss-back" aria-label="Back" onClick={onBack}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15 6l-7 6 7 6"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
      <h1 className="ss-title">{title}</h1>
      <span className="ss-headerSpacer" aria-hidden />
    </header>
  )
}
