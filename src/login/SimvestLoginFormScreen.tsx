/**
 * Sign-in form for an existing Simvest account.
 *
 * Flow:
 *   1. User types `username` (or email) + `password` and presses Log in.
 *   2. Client POSTs `/api/auth/login`. Server resolves credentials against
 *      `user-setup-profiles.json` and returns `{ user: { userId, ... } }`.
 *   3. On success we swap the local `simvest-user-id-v1` to the returned id
 *      (so `/api/me/*` requests immediately scope to the real account),
 *      flip `setSimvestLoggedIn(true)`, then route back to `/`.
 *   4. On failure we render a single generic message — the server never
 *      reveals whether the identifier exists.
 *
 * Keyboard / mobile behavior:
 *   - The username input is `autoFocus`, so the on-screen keyboard pops on
 *     mount on mobile Safari/Chrome.
 *   - Both inputs declare `autocomplete` so password managers / iOS Keychain
 *     can autofill credentials.
 *   - The visible Log in button is `type="submit"` and lives inside a real
 *     `<form>` — Enter/Go on the mobile keyboard triggers it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mergeCachedAccountFromLogin, writeCachedAccount } from '../auth/accountSessionCache'
import { fetchMyAccount } from '../settings/settingsClient'
import { ensurePreLoginViewerId, setSimvestUserId } from '../user/simvestUserId'
import { setSimvestLoggedIn } from './loginState'
import { simvestFetch } from '../api/simvestFetch'
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal'
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal'
import './simvestLoginForm.css'

type LoginResponse = {
  user?: {
    userId?: string
    username?: string
    displayName?: string
    avatarUrl?: string
  }
  error?: string
}

const GENERIC_ERROR = 'Username or password is incorrect.'

export function SimvestLoginFormScreen() {
  const navigate = useNavigate()
  const usernameRef = useRef<HTMLInputElement>(null)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)

  useEffect(() => {
    /* Defer to next frame so iOS reliably opens the keyboard on a fresh push nav. */
    const id = window.requestAnimationFrame(() => {
      usernameRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [])

  const goBackToCarousel = useCallback(() => {
    navigate('/login')
  }, [navigate])

  const onSubmit = useCallback(
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
          /* Always surface a single generic message — matches what the server
           * sends back and avoids leaking which field was wrong. */
          setError(body?.error?.trim() || GENERIC_ERROR)
          return
        }

        const swapped = setSimvestUserId(body.user.userId)
        if (!swapped) {
          setError('Login succeeded but the session could not be saved on this device.')
          return
        }
        /* `rememberMe` is a UI courtesy today — we always persist the gate
         * flag because the device id is also persisted. If/when sessions move
         * to short-lived tokens, gate this on `rememberMe`. */
        setSimvestLoggedIn(true)
        mergeCachedAccountFromLogin({
          userId: body.user.userId,
          displayName: body.user.displayName,
          avatarUrl: body.user.avatarUrl,
        })
        void fetchMyAccount().then((r) => {
          if (r.ok) writeCachedAccount(r.account)
        })
        navigate('/', { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : GENERIC_ERROR)
      } finally {
        setBusy(false)
      }
    },
    [busy, identifier, navigate, password],
  )

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !busy

  return (
    <main className="sli-root">
      <section className="sli-phone" aria-label="Simvest login">
        <header className="sli-header">
          <button
            type="button"
            className="sli-close"
            aria-label="Back to welcome"
            onClick={goBackToCarousel}
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
          <h1 className="sli-title">Log in</h1>
          <span className="sli-headerSpacer" aria-hidden />
        </header>

        <form className="sli-form" onSubmit={onSubmit} noValidate>
          <label className="sli-field">
            <span className="sli-label">Email, phone, or username</span>
            <input
              ref={usernameRef}
              type="text"
              name="username"
              autoComplete="username"
              /* `inputMode="text"` keeps the standard keyboard since we accept
               * any of email / phone / legacy username — the resolver decides
               * which store to hit based on the value shape. */
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

          <div className="sli-row">
            <label className="sli-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={busy}
              />
              <span className="sli-rememberBox" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M5 12.5l4.5 4.5L19 7"
                    stroke="#fff"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
              <span className="sli-rememberText">Remember me</span>
            </label>
          </div>

          <button type="button" className="sli-link" onClick={() => { /* placeholder */ }}>
            Forgot username or password?
          </button>
          <button
            type="button"
            className="sli-link"
            onClick={() => navigate('/signup/name')}
          >
            Don’t have an account? Sign up
          </button>

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
            disabled={!canSubmit}
            aria-busy={busy}
          >
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </section>
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsOfServiceModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </main>
  )
}
