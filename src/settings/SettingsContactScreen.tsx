/**
 * Change the login contact (email or phone). Requires the user's current
 * password — same gate the server enforces. The contact toggle dynamically
 * swaps `type` / `inputMode` so the right mobile keyboard appears.
 *
 * On success: the active account row is mutated server-side; the new value
 * will be required at the next sign-in. The screen surfaces a green confirm
 * banner and resets the password field.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchMyAccount,
  isValidEmail,
  isValidPhone,
  updateContact,
  type AccountContactKind,
  type AccountFieldError,
  type AccountPublicView,
} from './settingsClient'
import './settingsScreens.css'

export function SettingsContactScreen() {
  const navigate = useNavigate()
  const [account, setAccount] = useState<AccountPublicView | null>(null)
  const [loading, setLoading] = useState(true)
  const [missingAccount, setMissingAccount] = useState(false)

  const [contactKind, setContactKind] = useState<AccountContactKind>('email')
  const [contact, setContact] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
        setContactKind(result.account.contactKind)
        setContact(result.account.contact)
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
      if (busy || !account) return

      /* Lightweight client-side validation. Server re-runs the same rules. */
      const map = new Map<string, string>()
      const trimmed = contact.trim()
      const validShape = contactKind === 'email' ? isValidEmail(trimmed) : isValidPhone(trimmed)
      if (!validShape) {
        map.set(
          'contact',
          contactKind === 'email'
            ? 'Enter a valid email address'
            : 'Enter a valid phone number (at least 7 digits)',
        )
      }
      if (currentPassword.length === 0) {
        map.set('currentPassword', 'Enter your current password')
      }
      if (map.size > 0) {
        setFieldErrors(map)
        setErrorText(null)
        setSuccess(false)
        return
      }

      setBusy(true)
      setErrorText(null)
      setFieldErrors(new Map())
      setSuccess(false)

      const result = await updateContact({
        contactKind,
        contact: trimmed,
        currentPassword,
      })

      if (result.ok) {
        setAccount(result.account)
        setContact(result.account.contact)
        setCurrentPassword('')
        setSuccess(true)
      } else {
        const next = new Map<string, string>()
        for (const fe of result.error.fields as AccountFieldError[]) {
          next.set(fe.field, fe.message)
        }
        setFieldErrors(next)
        setErrorText(result.error.fields.length === 0 ? result.error.message : null)
      }
      setBusy(false)
    },
    [account, busy, contact, contactKind, currentPassword],
  )

  if (loading) {
    return (
      <main className="ss-root">
        <section className="ss-phone">
          <ScreenHeader title="Email or phone" onBack={() => navigate('/settings')} />
          <p className="ss-loading">Loading…</p>
        </section>
      </main>
    )
  }

  if (missingAccount) {
    return (
      <main className="ss-root">
        <section className="ss-phone">
          <ScreenHeader title="Email or phone" onBack={() => navigate('/settings')} />
          <div className="ss-body">
            <p className="ss-error">
              You're in a guest session. Sign up to create a Simvest account before changing your
              contact info.
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
      <section className="ss-phone" aria-label="Change email or phone">
        <ScreenHeader title="Email or phone" onBack={() => navigate('/settings')} />

        <form className="ss-form" onSubmit={onSubmit} noValidate>
          <div className="ss-segmented" role="tablist" aria-label="Contact type">
            <button
              type="button"
              className="ss-segmentedBtn"
              role="tab"
              aria-pressed={contactKind === 'email'}
              onClick={() => {
                if (contactKind !== 'email') {
                  setContactKind('email')
                  setContact('')
                  const next = new Map(fieldErrors)
                  next.delete('contact')
                  setFieldErrors(next)
                  setSuccess(false)
                }
              }}
              disabled={busy}
            >
              Email
            </button>
            <button
              type="button"
              className="ss-segmentedBtn"
              role="tab"
              aria-pressed={contactKind === 'phone'}
              onClick={() => {
                if (contactKind !== 'phone') {
                  setContactKind('phone')
                  setContact('')
                  const next = new Map(fieldErrors)
                  next.delete('contact')
                  setFieldErrors(next)
                  setSuccess(false)
                }
              }}
              disabled={busy}
            >
              Phone
            </button>
          </div>

          <label className="ss-field">
            <span className="ss-label">
              {contactKind === 'email' ? 'New email address' : 'New phone number'}
            </span>
            <input
              type={contactKind === 'email' ? 'email' : 'tel'}
              inputMode={contactKind === 'email' ? 'email' : 'tel'}
              autoComplete={contactKind === 'email' ? 'email' : 'tel'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`ss-input ${fieldErrors.has('contact') ? 'ss-input--invalid' : ''}`}
              value={contact}
              onChange={(e) => {
                setContact(e.target.value)
                if (fieldErrors.has('contact')) {
                  const next = new Map(fieldErrors)
                  next.delete('contact')
                  setFieldErrors(next)
                }
                setSuccess(false)
              }}
              maxLength={contactKind === 'email' ? 120 : 24}
              placeholder={contactKind === 'email' ? 'you@example.com' : '+1 (555) 555-5555'}
              disabled={busy}
              aria-invalid={fieldErrors.has('contact')}
            />
            <span className="ss-help">
              You'll use this to log in to Simvest from now on.
            </span>
            {fieldErrors.get('contact') ? (
              <span className="ss-fieldErr">{fieldErrors.get('contact')}</span>
            ) : null}
          </label>

          <label className="ss-field">
            <span className="ss-label">Current password</span>
            <span className="ss-passwordWrap">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className={`ss-input ss-input--password ${
                  fieldErrors.has('currentPassword') ? 'ss-input--invalid' : ''
                }`}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value)
                  if (fieldErrors.has('currentPassword')) {
                    const next = new Map(fieldErrors)
                    next.delete('currentPassword')
                    setFieldErrors(next)
                  }
                  setSuccess(false)
                }}
                maxLength={128}
                disabled={busy}
                aria-invalid={fieldErrors.has('currentPassword')}
              />
              <button
                type="button"
                className="ss-eye"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </span>
            <span className="ss-help">Required to confirm it's really you.</span>
            {fieldErrors.get('currentPassword') ? (
              <span className="ss-fieldErr">{fieldErrors.get('currentPassword')}</span>
            ) : null}
          </label>

          {errorText ? <div className="ss-error">{errorText}</div> : null}
          {success ? (
            <div className="ss-success">
              Saved. Use your new {contactKind === 'email' ? 'email' : 'phone number'} to log in
              next time.
            </div>
          ) : null}

          <div className="ss-footer">
            <button
              type="submit"
              className="ss-submit"
              disabled={busy || contact.trim().length === 0 || currentPassword.length === 0}
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
