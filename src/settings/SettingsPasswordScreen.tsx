/**
 * Change account password. Server requires the current password and re-runs
 * the same strength rule as signup (≥5 chars, must include a letter AND a
 * digit). Strength hints stay hidden until the user submits something
 * invalid, mirroring the signup screen's behavior.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchMyAccount,
  isValidPassword,
  updatePassword,
  type AccountFieldError,
} from './settingsClient'
import './settingsScreens.css'

export function SettingsPasswordScreen() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [missingAccount, setMissingAccount] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(new Map())
  const [success, setSuccess] = useState(false)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const result = await fetchMyAccount()
      if (cancelled) return
      if (result.ok) {
        /* Just a presence check — we don't render any account fields here. */
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

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (busy) return

      const map = new Map<string, string>()
      if (currentPassword.length === 0) {
        map.set('currentPassword', 'Enter your current password')
      }
      if (!isValidPassword(newPassword)) {
        map.set('newPassword', 'Password must be at least 5 characters and include letters and a number')
      }
      if (newPassword !== confirmPassword) {
        map.set('confirmPassword', 'Passwords do not match')
      }
      if (map.size > 0) {
        setFieldErrors(map)
        setErrorText(null)
        setSuccess(false)
        setShowRules(map.has('newPassword'))
        return
      }

      setBusy(true)
      setErrorText(null)
      setFieldErrors(new Map())
      setSuccess(false)
      setShowRules(false)

      const result = await updatePassword({ currentPassword, newPassword })
      if (result.ok) {
        setSuccess(true)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const next = new Map<string, string>()
        for (const fe of result.error.fields as AccountFieldError[]) {
          next.set(fe.field, fe.message)
        }
        setFieldErrors(next)
        if (next.has('newPassword')) setShowRules(true)
        setErrorText(result.error.fields.length === 0 ? result.error.message : null)
      }
      setBusy(false)
    },
    [busy, confirmPassword, currentPassword, newPassword],
  )

  if (loading) {
    return (
      <main className="ss-root">
        <section className="ss-phone">
          <ScreenHeader title="Password" onBack={() => navigate('/settings')} />
          <p className="ss-loading">Loading…</p>
        </section>
      </main>
    )
  }

  if (missingAccount) {
    return (
      <main className="ss-root">
        <section className="ss-phone">
          <ScreenHeader title="Password" onBack={() => navigate('/settings')} />
          <div className="ss-body">
            <p className="ss-error">
              You're in a guest session. Sign up to set a password for your Simvest account.
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
      <section className="ss-phone" aria-label="Change password">
        <ScreenHeader title="Password" onBack={() => navigate('/settings')} />

        <form className="ss-form" onSubmit={onSubmit} noValidate>
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v)
              if (fieldErrors.has('currentPassword')) {
                const next = new Map(fieldErrors)
                next.delete('currentPassword')
                setFieldErrors(next)
              }
              setSuccess(false)
            }}
            visible={showCurrent}
            onToggleVisible={() => setShowCurrent((s) => !s)}
            autoComplete="current-password"
            invalid={fieldErrors.has('currentPassword')}
            error={fieldErrors.get('currentPassword')}
            disabled={busy}
          />

          <PasswordField
            label="New password"
            value={newPassword}
            onChange={(v) => {
              setNewPassword(v)
              if (fieldErrors.has('newPassword')) {
                const next = new Map(fieldErrors)
                next.delete('newPassword')
                setFieldErrors(next)
              }
              setSuccess(false)
            }}
            visible={showNew}
            onToggleVisible={() => setShowNew((s) => !s)}
            autoComplete="new-password"
            invalid={fieldErrors.has('newPassword')}
            error={fieldErrors.get('newPassword')}
            disabled={busy}
            help={
              showRules
                ? 'Use at least 5 characters with letters and at least one number.'
                : undefined
            }
          />

          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v)
              if (fieldErrors.has('confirmPassword')) {
                const next = new Map(fieldErrors)
                next.delete('confirmPassword')
                setFieldErrors(next)
              }
              setSuccess(false)
            }}
            visible={showConfirm}
            onToggleVisible={() => setShowConfirm((s) => !s)}
            autoComplete="new-password"
            invalid={fieldErrors.has('confirmPassword')}
            error={fieldErrors.get('confirmPassword')}
            disabled={busy}
          />

          {errorText ? <div className="ss-error">{errorText}</div> : null}
          {success ? (
            <div className="ss-success">
              Password updated. Use your new password the next time you sign in.
            </div>
          ) : null}

          <div className="ss-footer">
            <button
              type="submit"
              className="ss-submit"
              disabled={
                busy ||
                currentPassword.length === 0 ||
                newPassword.length === 0 ||
                confirmPassword.length === 0
              }
              aria-busy={busy}
            >
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}

function PasswordField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  visible: boolean
  onToggleVisible: () => void
  autoComplete: string
  invalid: boolean
  error?: string
  disabled?: boolean
  help?: string
}) {
  return (
    <label className="ss-field">
      <span className="ss-label">{props.label}</span>
      <span className="ss-passwordWrap">
        <input
          type={props.visible ? 'text' : 'password'}
          autoComplete={props.autoComplete}
          className={`ss-input ss-input--password ${props.invalid ? 'ss-input--invalid' : ''}`}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          maxLength={128}
          disabled={props.disabled}
          aria-invalid={props.invalid}
        />
        <button
          type="button"
          className="ss-eye"
          aria-label={props.visible ? 'Hide password' : 'Show password'}
          aria-pressed={props.visible}
          onClick={props.onToggleVisible}
          tabIndex={-1}
        >
          {props.visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </span>
      {props.help ? <span className="ss-help">{props.help}</span> : null}
      {props.error ? <span className="ss-fieldErr">{props.error}</span> : null}
    </label>
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

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 5c-5.5 0-9.5 4.7-9.5 7s4 7 9.5 7 9.5-4.7 9.5-7-4-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 3l18 18M10.6 6.2A9.2 9.2 0 0 1 12 6c5.5 0 9.5 4.7 9.5 6 0 .7-1 2.3-2.8 3.8M6.3 7.4C4.2 8.9 2.5 11 2.5 12c0 1.3 4 6 9.5 6 1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
