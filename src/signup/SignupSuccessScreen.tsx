/**
 * Signup step 3 — "Account created!" success screen.
 *
 * By the time we render this, `SignupCredentialsScreen` has already:
 *   - swapped `simvest-user-id-v1` to the new account's `userId`
 *   - set the `simvest-login-complete-v1` gate to `true`
 *
 * So tapping "Start trading" just needs to route to `/`, which lets
 * `HomeRoute` render `SimvestHome` for the freshly-signed-in user. The home
 * screen pulls activity / games / portfolio from `/api/me/*` scoped by the
 * new `userId`, so a returning visitor sees their data immediately.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PrivacyPolicyModal } from '../legal/PrivacyPolicyModal'
import { TermsOfServiceModal } from '../legal/TermsOfServiceModal'
import { isSimvestLoggedIn } from '../login/loginState'
import { clearDraft } from './signupClient'
import './signupScreens.css'

export function SignupSuccessScreen() {
  const navigate = useNavigate()
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)

  /* If someone lands here without an active session (e.g. shared link), send
   * them back to the start so the success state isn't misleading. */
  useEffect(() => {
    if (!isSimvestLoggedIn()) {
      navigate('/login', { replace: true })
      return
    }
    /* Defensive: ensure the draft is gone even on a refresh of this screen. */
    clearDraft()
  }, [navigate])

  const onStartTrading = useCallback(() => {
    navigate('/', { replace: true })
  }, [navigate])

  return (
    <main className="su-root">
      <section className="su-phone" aria-label="Account created">
        <header className="su-header">
          <span className="su-headerSpacer" aria-hidden />
          <h1 className="su-headerTitle">Welcome to Simvest</h1>
          <span className="su-headerSpacer" aria-hidden />
        </header>

        <div className="su-successBody">
          <div className="su-checkBadge" aria-hidden="true">
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path
                d="M12 24l8 8 16-18"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>

          <h2 className="su-successTitle">Your account is ready</h2>
          <p>
            You’re all set. Jump in to follow live markets, join games, and start practicing your
            trading strategy with zero risk.
          </p>
        </div>

        <div className="su-successFooter">
          <button type="button" className="su-submit" onClick={onStartTrading}>
            Start trading
          </button>
          <p className="su-legalRow su-legalRow--success">
            Our{' '}
            <button type="button" className="su-legalBtn" onClick={() => setPrivacyOpen(true)}>
              Privacy Policy
            </button>{' '}
            explains how we handle your data.
          </p>
          <p className="su-legalRow su-legalRow--success su-legalRow--stacked">
            Our{' '}
            <button type="button" className="su-legalBtn" onClick={() => setTermsOpen(true)}>
              Terms of Service
            </button>{' '}
            explains the rules for using Simvest.
          </p>
        </div>
      </section>
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <TermsOfServiceModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </main>
  )
}
