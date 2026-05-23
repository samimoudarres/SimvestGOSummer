/**
 * Signup step 2 — choose Email or Phone, then create a password.
 *
 * Toggle behavior:
 *   - "Email" mode → text input, `inputMode="email"`, `autocomplete="email"`.
 *   - "Phone" mode → text input, `inputMode="tel"`, `autocomplete="tel"`.
 *     On iOS / Android, `inputMode="tel"` brings up the numeric phone pad.
 *
 * Password rule (matches server `validateSignupCompleteInput`):
 *   - At least 5 characters.
 *   - Contains at least one letter.
 *   - Contains at least one digit.
 *
 * Submit pipeline:
 *   1. Run client-side validation (instant feedback, mirrors server rules).
 *   2. POST `/api/auth/signup/complete` with the `draftId` from sessionStorage.
 *   3. On success: swap local user id → returned `userId`, flip the login
 *      gate to `true`, clear the draft, navigate to the success screen.
 *
 * If the draft expired (server returned 410), bounce back to step 1 so the
 * user re-enters their name. Validation errors from the server are rendered
 * inline beside the offending field where possible.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal'
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal'
import { ensurePreLoginViewerId, setSimvestUserId } from '../user/simvestUserId'
import { setSimvestLoggedIn } from '../login/loginState'
import {
  clearDraft,
  completeSignup,
  ensureSignupDraftFromStoredName,
  isValidEmail,
  isValidPassword,
  isValidPhone,
  readDraftId,
  readDraftName,
  SIGNUP_DRAFT_PENDING,
  type SignupValidationError,
} from './signupClient'
import './signupScreens.css'

type ContactKind = 'email' | 'phone'

function fieldErrorFor(errors: SignupValidationError[] | undefined, field: string): string | null {
  if (!errors) return null
  const hit = errors.find((e) => e.field === field)
  return hit?.message ?? null
}

export function SignupCredentialsScreen() {
  const navigate = useNavigate()
  const contactRef = useRef<HTMLInputElement>(null)

  const [draftReady, setDraftReady] = useState(() => {
    const id = readDraftId()
    return Boolean(id && id !== SIGNUP_DRAFT_PENDING)
  })
  const [draftError, setDraftError] = useState<string | null>(null)

  /* Step 1 navigates instantly; create the server draft here in the background. */
  useEffect(() => {
    const { firstName, lastName } = readDraftName()
    if (!firstName.trim() || !lastName.trim()) {
      navigate('/signup/name', { replace: true })
      return
    }
    const id = readDraftId()
    if (id && id !== SIGNUP_DRAFT_PENDING) {
      setDraftReady(true)
      return
    }
    let cancelled = false
    void (async () => {
      const result = await ensureSignupDraftFromStoredName()
      if (cancelled) return
      if (!result.ok) {
        setDraftError(result.error)
        setDraftReady(false)
        return
      }
      setDraftReady(true)
      setDraftError(null)
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const [contactKind, setContactKind] = useState<ContactKind>('email')
  const [contact, setContact] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<SignupValidationError[] | undefined>(undefined)
  /**
   * Whether the user has actually tried to submit yet. Until they have, we
   * keep validation hints invisible so the password field doesn't look like
   * it's "yelling" rules at them while they're still typing. Once they hit
   * Continue with an invalid value the hint flips on and stays on for the
   * rest of the session (otherwise it would flicker on every keystroke).
   */
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [touched, setTouched] = useState<{ contact: boolean }>({ contact: false })
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => contactRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [])

  /* Reset contact + visible errors when the user flips between email and
   * phone — the value entered for one kind almost never makes sense for the
   * other and keeping it stale leads to confusing validation states. */
  const switchKind = useCallback(
    (next: ContactKind) => {
      if (next === contactKind) return
      setContactKind(next)
      setContact('')
      setTouched((t) => ({ ...t, contact: false }))
      setServerErrors((prev) => prev?.filter((e) => e.field !== 'contact'))
      if (error) setError(null)
      /* Re-focus the new input so the keyboard pops with the right kind. */
      window.requestAnimationFrame(() => contactRef.current?.focus())
    },
    [contactKind, error],
  )

  const clientContactError = useMemo(() => {
    /* Show contact errors after blur (existing behavior) OR after a failed
     * submit. Blur-based hints still help users notice an obviously bad email
     * before they hit Continue. */
    if (!touched.contact && !submitAttempted) return null
    if (!contact.trim()) {
      return contactKind === 'email' ? 'Enter your email' : 'Enter your phone number'
    }
    if (contactKind === 'email' && !isValidEmail(contact)) return 'Enter a valid email address'
    if (contactKind === 'phone' && !isValidPhone(contact)) return 'Enter a valid phone number'
    return null
  }, [contact, contactKind, submitAttempted, touched.contact])

  const clientPasswordError = useMemo(() => {
    /* Password: only surface anything once the user actually presses Continue.
     * Per spec, the password rule shouldn't be visible while they're choosing
     * a password — it should only appear if their attempt didn't meet it. */
    if (!submitAttempted) return null
    if (!password) return 'Choose a password'
    if (!isValidPassword(password)) {
      return 'Password must be at least 5 characters and include letters and a number'
    }
    return null
  }, [password, submitAttempted])

  /* Server-side errors take precedence over local hints — they're authoritative. */
  const contactError = fieldErrorFor(serverErrors, 'contact') ?? clientContactError
  const passwordError = fieldErrorFor(serverErrors, 'password') ?? clientPasswordError

  const goBack = useCallback(() => navigate('/signup/name'), [navigate])

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (busy) return

      setSubmitAttempted(true)
      setTouched({ contact: true })
      const contactOk =
        contactKind === 'email' ? isValidEmail(contact) : isValidPhone(contact)
      const passwordOk = isValidPassword(password)
      if (!contactOk || !passwordOk) return

      const draftId = readDraftId()
      if (!draftId) {
        setError('Your signup session expired. Going back to step 1…')
        window.setTimeout(() => navigate('/signup/name', { replace: true }), 1100)
        return
      }

      setBusy(true)
      setError(null)
      setServerErrors(undefined)
      try {
        const result = await completeSignup({
          draftId,
          contactKind,
          contact: contact.trim(),
          password,
          previousViewerId: ensurePreLoginViewerId(),
        })
        if (!result.ok) {
          if (result.status === 410) {
            /* Draft expired or already used — send the user back to re-enter their name. */
            setError(result.error || 'Your signup session expired. Going back to step 1…')
            window.setTimeout(() => navigate('/signup/name', { replace: true }), 1200)
            return
          }
          if (result.errors && result.errors.length > 0) {
            setServerErrors(result.errors)
            const general = result.errors.find(
              (er) => er.field !== 'contact' && er.field !== 'password',
            )
            if (general) setError(general.message)
          } else {
            setError(result.error)
          }
          return
        }

        const swapped = setSimvestUserId(result.user.userId)
        if (!swapped) {
          setError('Account created but the session could not be saved on this device.')
          return
        }
        setSimvestLoggedIn(true)
        clearDraft()
        navigate('/signup/success', { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create your account. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [busy, contact, contactKind, navigate, password],
  )

  const canSubmit =
    draftReady &&
    !draftError &&
    contact.trim().length > 0 &&
    password.length > 0 &&
    !busy &&
    /* Don't show "submit" as available while client-side rules clearly fail;
     * the submit handler still re-validates so this is purely UX polish. */
    (contactKind === 'email' ? true : /\d/.test(contact)) &&
    password.length >= 5

  return (
    <main className="su-root">
      <section className="su-phone" aria-label="Create your account">
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
          <h2 className="su-prompt">Create your account</h2>
          <p className="su-subprompt">
            Use your email or phone number — we’ll use this to sign you back in later.
          </p>
          {draftError ? (
            <div className="su-error" role="alert">
              {draftError}{' '}
              <button
                type="button"
                className="su-legalBtn"
                onClick={() => void ensureSignupDraftFromStoredName().then((r) => {
                  if (r.ok) {
                    setDraftReady(true)
                    setDraftError(null)
                  } else setDraftError(r.error)
                })}
              >
                Retry
              </button>
            </div>
          ) : null}
          {!draftReady && !draftError ? (
            <p className="su-subprompt" aria-live="polite">
              Preparing your signup…
            </p>
          ) : null}

          <div
            className="su-segment"
            role="tablist"
            aria-label="Choose email or phone for your account"
          >
            <button
              type="button"
              role="tab"
              aria-selected={contactKind === 'email'}
              className={`su-segmentBtn${contactKind === 'email' ? ' su-segmentBtn--active' : ''}`}
              onClick={() => switchKind('email')}
              disabled={busy}
            >
              Email
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={contactKind === 'phone'}
              className={`su-segmentBtn${contactKind === 'phone' ? ' su-segmentBtn--active' : ''}`}
              onClick={() => switchKind('phone')}
              disabled={busy}
            >
              Phone number
            </button>
          </div>

          <label className="su-field">
            <span className="su-label">
              {contactKind === 'email' ? 'Email' : 'Phone number'}
            </span>
            {contactKind === 'email' ? (
              <input
                key="contact-email"
                ref={contactRef}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                className={`su-input${contactError ? ' su-input--invalid' : ''}`}
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value)
                  setServerErrors((prev) => prev?.filter((er) => er.field !== 'contact'))
                  if (error) setError(null)
                }}
                onBlur={() => setTouched((t) => ({ ...t, contact: true }))}
                maxLength={120}
                disabled={busy}
                aria-invalid={Boolean(contactError)}
                placeholder="name@example.com"
              />
            ) : (
              <input
                key="contact-phone"
                ref={contactRef}
                type="tel"
                name="tel"
                autoComplete="tel"
                inputMode="tel"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                pattern="[0-9 +()\-]*"
                className={`su-input${contactError ? ' su-input--invalid' : ''}`}
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value)
                  setServerErrors((prev) => prev?.filter((er) => er.field !== 'contact'))
                  if (error) setError(null)
                }}
                onBlur={() => setTouched((t) => ({ ...t, contact: true }))}
                maxLength={20}
                disabled={busy}
                aria-invalid={Boolean(contactError)}
                placeholder="(555) 123-4567"
              />
            )}
            {contactError ? <span className="su-fieldError">{contactError}</span> : null}
          </label>

          <label className="su-field">
            <span className="su-label">Password</span>
            <span className="su-passwordWrap">
              <input
                type={showPassword ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                enterKeyHint="go"
                className={`su-input su-input--password${passwordError ? ' su-input--invalid' : ''}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setServerErrors((prev) => prev?.filter((er) => er.field !== 'password'))
                  if (error) setError(null)
                }}
                /* Intentionally NO onBlur "touched" tracking on password —
                 * password requirements only render after a failed submit. */
                maxLength={128}
                disabled={busy}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'su-pw-help' : undefined}
              />
              <button
                type="button"
                className="su-eye"
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
            {passwordError ? (
              <span id="su-pw-help" className="su-fieldError">
                {passwordError}
              </span>
            ) : null}
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
            {busy ? 'Creating account…' : 'Continue'}
          </button>
        </form>
      </section>
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsOfServiceModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </main>
  )
}
