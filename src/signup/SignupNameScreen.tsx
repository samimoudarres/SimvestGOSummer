/**
 * Signup step 1 — "What is your full name?"
 *
 * Validates First / Last are non-empty, calls `POST /api/auth/signup/start`,
 * stashes the resulting `draftId` in sessionStorage, and navigates to step 2.
 * The name itself is persisted on the server (in a 30-min draft store) so the
 * credentials step only needs to POST contact + password + `draftId`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal'
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal'
import { readDraftName, saveDraftId, startSignup } from './signupClient'
import './signupScreens.css'

export function SignupNameScreen() {
  const navigate = useNavigate()
  const firstRef = useRef<HTMLInputElement>(null)

  /* Re-hydrate the in-progress name from sessionStorage so the user can hit
   * Back from step 2 and edit their entry without re-typing. */
  const persisted = readDraftName()
  const [firstName, setFirstName] = useState(persisted.firstName)
  const [lastName, setLastName] = useState(persisted.lastName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [firstError, setFirstError] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)

  useEffect(() => {
    /* iOS reliably opens the keyboard only after the route finishes pushing.
     * `requestAnimationFrame` defers to the next paint, which is the soonest
     * Safari will actually focus + open the keyboard. */
    const id = window.requestAnimationFrame(() => firstRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [])

  const goBack = useCallback(() => {
    navigate('/login')
  }, [navigate])

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (busy) return

      const f = firstName.trim()
      const l = lastName.trim()
      const fErr = !f ? 'First name is required' : null
      const lErr = !l ? 'Last name is required' : null
      setFirstError(fErr)
      setLastError(lErr)
      if (fErr || lErr) return

      setBusy(true)
      setError(null)
      try {
        const result = await startSignup(f, l)
        if (!result.ok) {
          setError(result.error)
          return
        }
        saveDraftId(result.data.draftId, f, l)
        navigate('/signup/credentials')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your name. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [busy, firstName, lastName, navigate],
  )

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && !busy

  return (
    <main className="su-root">
      <section className="su-phone" aria-label="Create your Simvest account">
        <header className="su-header">
          <button type="button" className="su-back" aria-label="Back" onClick={goBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>
          <h1 className="su-headerTitle">Sign up</h1>
          <span className="su-headerSpacer" aria-hidden />
        </header>

        <form className="su-form" onSubmit={onSubmit} noValidate>
          <h2 className="su-prompt">What is your full name?</h2>

          <label className="su-field">
            <span className="su-label">First name</span>
            <input
              ref={firstRef}
              type="text"
              name="given-name"
              autoComplete="given-name"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="next"
              className={`su-input${firstError ? ' su-input--invalid' : ''}`}
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value)
                if (firstError) setFirstError(null)
                if (error) setError(null)
              }}
              maxLength={60}
              disabled={busy}
              aria-invalid={Boolean(firstError)}
            />
            {firstError ? <span className="su-fieldError">{firstError}</span> : null}
          </label>

          <label className="su-field">
            <span className="su-label">Last name</span>
            <input
              type="text"
              name="family-name"
              autoComplete="family-name"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="go"
              className={`su-input${lastError ? ' su-input--invalid' : ''}`}
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value)
                if (lastError) setLastError(null)
                if (error) setError(null)
              }}
              maxLength={60}
              disabled={busy}
              aria-invalid={Boolean(lastError)}
            />
            {lastError ? <span className="su-fieldError">{lastError}</span> : null}
          </label>

          {error ? (
            <div className="su-error" role="alert" aria-live="assertive">
              {error}
            </div>
          ) : null}

          <p className="su-legalRow">
            Learn how we use your data in our{' '}
            <button type="button" className="su-legalBtn" onClick={() => setPrivacyOpen(true)}>
              Privacy Policy
            </button>
            .
          </p>
          <p className="su-legalRow su-legalRow--stacked">
            Read our{' '}
            <button type="button" className="su-legalBtn" onClick={() => setTermsOpen(true)}>
              Terms of Service
            </button>
            .
          </p>

          <div className="su-spacer" />

          <button type="submit" className="su-submit" disabled={!canSubmit} aria-busy={busy}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </section>
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsOfServiceModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </main>
  )
}
