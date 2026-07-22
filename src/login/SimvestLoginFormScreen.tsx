/**
 * Sign-in form for an existing Simvest account (+ forgot-password flow).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { mergeCachedAccountFromLogin, writeCachedAccount } from '../auth/accountSessionCache'
import { resolvePostAuthPath } from '../auth/postAuthNavigate'
import { fetchMyAccount } from '../settings/settingsClient'
import { ensurePreLoginViewerId, setSimvestUserId } from '../user/simvestUserId'
import { setSimvestLoggedIn } from './loginState'
import { setSessionToken } from '../auth/sessionToken'
import { simvestFetch } from '../api/simvestFetch'
import { networkErrorMessage } from '../api/networkErrorMessage'
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal'
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal'
import './simvestLoginForm.css'

type LoginResponse = {
  token?: string
  sessionToken?: string
  user?: {
    userId?: string
    username?: string
    displayName?: string
    avatarUrl?: string
  }
  error?: string
}

type Mode = 'login' | 'resetRequest' | 'resetConfirm'

const GENERIC_ERROR = 'Username or password is incorrect.'

export function SimvestLoginFormScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const usernameRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)

  const [resetContact, setResetContact] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      usernameRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [mode])

  const goBackToCarousel = useCallback(() => {
    navigate('/login', { state: location.state })
  }, [navigate, location.state])

  const onSubmitLogin = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (busy) return

      const trimmedId = identifier.trim()
      if (!trimmedId || !password) {
        setError(GENERIC_ERROR)
        return
      }

      setBusy(true)
      setError(null)
      try {
        const previousViewerId = ensurePreLoginViewerId()
        const resp = await simvestFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail: trimmedId, password, previousViewerId }),
        })

        if (resp.status === 429) {
          setError('Too many attempts. Please wait a moment and try again.')
          return
        }

        let body: LoginResponse | null = null
        try {
          body = (await resp.json()) as LoginResponse
        } catch {
          body = null
        }

        if (!resp.ok || !body?.user?.userId) {
          setError(body?.error?.trim() || GENERIC_ERROR)
          return
        }

        const token = (body.token ?? body.sessionToken)?.trim() ?? ''
        if (!token || !setSessionToken(token)) {
          setError('Login succeeded but the session could not be saved on this device.')
          return
        }

        const swapped = setSimvestUserId(body.user.userId)
        if (!swapped) {
          setError('Login succeeded but the session could not be saved on this device.')
          return
        }
        setSimvestLoggedIn(true)
        mergeCachedAccountFromLogin({
          userId: body.user.userId,
          displayName: body.user.displayName,
          avatarUrl: body.user.avatarUrl,
        })
        void fetchMyAccount().then((r) => {
          if (r.ok) writeCachedAccount(r.account)
        })
        navigate(resolvePostAuthPath(location.state), { replace: true })
      } catch (err) {
        setError(networkErrorMessage(err) || GENERIC_ERROR)
      } finally {
        setBusy(false)
      }
    },
    [busy, identifier, navigate, password, location.state],
  )

  const onSubmitResetRequest = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (busy) return
      const contact = resetContact.trim()
      if (!contact) {
        setError('Enter the email or phone for your account.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        const resp = await simvestFetch('/api/auth/password-reset/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact }),
        })
        const body = (await resp.json().catch(() => ({}))) as {
          error?: string
          challengeId?: string
          code?: string
          message?: string
        }
        if (resp.status === 429) {
          setError(body.error || 'Too many attempts. Please wait a moment and try again.')
          return
        }
        if (!resp.ok || !body.challengeId || !body.code) {
          setError(body.error || 'Could not start password reset. Try again.')
          return
        }
        setChallengeId(body.challengeId)
        setResetCode(body.code)
        setInfo(body.message || 'Enter the code below and choose a new password.')
        setMode('resetConfirm')
      } catch (err) {
        setError(networkErrorMessage(err) || 'Could not start password reset.')
      } finally {
        setBusy(false)
      }
    },
    [busy, resetContact],
  )

  const onSubmitResetConfirm = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (busy) return
      if (newPassword !== newPassword2) {
        setError('New passwords do not match.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        const resp = await simvestFetch('/api/auth/password-reset/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId,
            code: resetCode.trim(),
            newPassword,
          }),
        })
        const body = (await resp.json().catch(() => ({}))) as { error?: string; ok?: boolean }
        if (!resp.ok) {
          setError(body.error || 'Could not reset password.')
          return
        }
        setMode('login')
        setPassword('')
        setNewPassword('')
        setNewPassword2('')
        setResetCode('')
        setChallengeId('')
        setInfo('Password updated. Log in with your new password.')
        setError(null)
      } catch (err) {
        setError(networkErrorMessage(err) || 'Could not reset password.')
      } finally {
        setBusy(false)
      }
    },
    [busy, challengeId, newPassword, newPassword2, resetCode],
  )

  const title =
    mode === 'login' ? 'Log in' : mode === 'resetRequest' ? 'Reset password' : 'New password'

  return (
    <main className="sli-root">
      <section className="sli-phone" aria-label="Simvest login">
        <header className="sli-header">
          <button
            type="button"
            className="sli-close"
            aria-label={mode === 'login' ? 'Back to welcome' : 'Back'}
            onClick={() => {
              if (mode === 'login') goBackToCarousel()
              else if (mode === 'resetConfirm') {
                setMode('resetRequest')
                setError(null)
              } else {
                setMode('login')
                setError(null)
                setInfo(null)
              }
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h1 className="sli-title">{title}</h1>
          <span className="sli-headerSpacer" aria-hidden />
        </header>

        {mode === 'login' ? (
          <form className="sli-form" onSubmit={onSubmitLogin} noValidate>
            <label className="sli-field">
              <span className="sli-label">Email, phone, or username</span>
              <input
                ref={usernameRef}
                type="text"
                name="username"
                autoComplete="username"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                className="sli-input"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value)
                  if (error) setError(null)
                }}
                maxLength={120}
                disabled={busy}
                aria-invalid={Boolean(error)}
              />
            </label>

            <label className="sli-field">
              <span className="sli-label">Password</span>
              <span className="sli-passwordWrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  enterKeyHint="go"
                  className="sli-input sli-input--password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError(null)
                  }}
                  maxLength={128}
                  disabled={busy}
                  aria-invalid={Boolean(error)}
                />
                <button
                  type="button"
                  className="sli-eye"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((s) => !s)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 3l18 18M10.6 6.2A9.2 9.2 0 0 1 12 6c5.5 0 9.5 4.7 9.5 6 0 .7-1 2.3-2.8 3.8M6.3 7.4C4.2 8.9 2.5 11 2.5 12c0 1.3 4 6 9.5 6 1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M12 5c-5.5 0-9.5 4.7-9.5 7s4 7 9.5 7 9.5-4.7 9.5-7-4-7-9.5-7Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        fill="none"
                      />
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
                    </svg>
                  )}
                </button>
              </span>
            </label>

            <button
              type="button"
              className="sli-link"
              onClick={() => {
                setMode('resetRequest')
                setResetContact(identifier.trim())
                setError(null)
                setInfo(null)
              }}
            >
              Forgot username or password?
            </button>
            <button
              type="button"
              className="sli-link"
              onClick={() => navigate('/signup/name', { state: location.state })}
            >
              Don’t have an account? Sign up
            </button>

            {info ? (
              <p className="sli-footerCopy" role="status">
                {info}
              </p>
            ) : null}
            {error ? (
              <div className="sli-error" role="alert" aria-live="assertive">
                {error}
              </div>
            ) : null}

            <div className="sli-footer">
              <p className="sli-footerCopy">
                By logging in you agree to keep your Simvest portfolio, games, and activity tied to this
                account.
              </p>
            </div>

            <p className="sli-legalRow">
              Learn how we use your data in our{' '}
              <button type="button" className="sli-legalBtn" onClick={() => setPrivacyOpen(true)}>
                Privacy Policy
              </button>
              .
            </p>
            <p className="sli-legalRow sli-legalRow--stacked">
              Read our{' '}
              <button type="button" className="sli-legalBtn" onClick={() => setTermsOpen(true)}>
                Terms of Service
              </button>
              .
            </p>

            <button
              type="submit"
              className="sli-submit"
              disabled={!(identifier.trim().length > 0 && password.length > 0 && !busy)}
            >
              {busy ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        ) : null}

        {mode === 'resetRequest' ? (
          <form className="sli-form" onSubmit={onSubmitResetRequest} noValidate>
            <p className="sli-footerCopy">
              Enter the email or phone number on your account. We’ll give you a 6-digit code to set a
              new password.
            </p>
            <label className="sli-field">
              <span className="sli-label">Email or phone</span>
              <input
                ref={usernameRef}
                type="text"
                name="reset-contact"
                autoComplete="username"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="sli-input"
                value={resetContact}
                onChange={(e) => {
                  setResetContact(e.target.value)
                  if (error) setError(null)
                }}
                maxLength={120}
                disabled={busy}
              />
            </label>
            {error ? (
              <div className="sli-error" role="alert">
                {error}
              </div>
            ) : null}
            <button type="submit" className="sli-submit" disabled={busy || !resetContact.trim()}>
              {busy ? 'Please wait…' : 'Continue'}
            </button>
          </form>
        ) : null}

        {mode === 'resetConfirm' ? (
          <form className="sli-form" onSubmit={onSubmitResetConfirm} noValidate>
            {info ? <p className="sli-footerCopy">{info}</p> : null}
            <label className="sli-field">
              <span className="sli-label">6-digit code</span>
              <input
                type="text"
                name="reset-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="sli-input"
                value={resetCode}
                onChange={(e) => {
                  setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  if (error) setError(null)
                }}
                maxLength={6}
                disabled={busy}
              />
            </label>
            <label className="sli-field">
              <span className="sli-label">New password</span>
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                className="sli-input"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  if (error) setError(null)
                }}
                maxLength={128}
                disabled={busy}
              />
            </label>
            <label className="sli-field">
              <span className="sli-label">Confirm new password</span>
              <input
                type="password"
                name="new-password-2"
                autoComplete="new-password"
                className="sli-input"
                value={newPassword2}
                onChange={(e) => {
                  setNewPassword2(e.target.value)
                  if (error) setError(null)
                }}
                maxLength={128}
                disabled={busy}
              />
            </label>
            {error ? (
              <div className="sli-error" role="alert">
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              className="sli-submit"
              disabled={busy || resetCode.length !== 6 || !newPassword || !newPassword2}
            >
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        ) : null}
      </section>

      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsOfServiceModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </main>
  )
}
