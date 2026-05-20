/**
 * Settings main menu.
 *
 * Lands the user on a list of account-management entry points. Each row
 * pushes deeper into a dedicated edit screen so the forms stay focused on
 * one concern at a time (the same pattern iOS / Android settings use).
 *
 * Data flow:
 *   - `GET /api/me/account` populates the header card (display name, contact,
 *     avatar) and primes the per-section subscreens with the freshest values.
 *   - On 404 (no account row for this device id) we tell the user they're in
 *     a guest session and offer a Sign-up shortcut — settings can't mutate
 *     credentials they never set up.
 *   - Log out clears the session (login flag + viewer id) and returns to `/login`.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAuthSession } from '../auth/clearAuthSession'
import { deleteMyAccount, fetchMyAccount, type AccountPublicView } from './settingsClient'
import { apiAssetSrc } from '../config/apiAssetSrc'
import './settingsScreens.css'

export function SettingsScreen() {
  const navigate = useNavigate()
  const [account, setAccount] = useState<AccountPublicView | null>(null)
  const [loading, setLoading] = useState(true)
  const [missingAccount, setMissingAccount] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setErrorText(null)
      setMissingAccount(false)
      const result = await fetchMyAccount()
      if (cancelled) return
      if (result.ok) {
        setAccount(result.account)
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

  const goBackHome = useCallback(() => {
    navigate('/')
  }, [navigate])

  const performLogout = useCallback(() => {
    clearAuthSession()
    setConfirmLogout(false)
    navigate('/login', { replace: true })
  }, [navigate])

  const performDeleteAccount = useCallback(async () => {
    if (deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const result = await deleteMyAccount(deletePassword)
      if (!result.ok) {
        const pw = result.error.fields.find((f) => f.field === 'currentPassword')
        setDeleteError(pw?.message ?? result.error.message)
        return
      }
      clearAuthSession()
      setConfirmDelete(false)
      setDeletePassword('')
      navigate('/login', { replace: true })
    } catch {
      setDeleteError('Could not delete your account. Check your connection and try again.')
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteBusy, deletePassword, navigate])

  return (
    <main className="ss-root">
      <section className="ss-phone" aria-label="Simvest settings">
        <header className="ss-header">
          <button
            type="button"
            className="ss-back"
            aria-label="Back to home"
            onClick={goBackHome}
          >
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
          <h1 className="ss-title">Settings</h1>
          <span className="ss-headerSpacer" aria-hidden />
        </header>

        <div className="ss-body">
          {loading ? (
            <p className="ss-loading">Loading your account…</p>
          ) : missingAccount ? (
            <>
              <div className="ss-greeting">
                <div className="ss-greetCopy">
                  <span className="ss-greetName">You're in a guest session</span>
                  <span className="ss-greetContact">
                    Sign up to manage your name, contact, and password.
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="ss-submit"
                onClick={() => navigate('/signup/name')}
              >
                Create a Simvest account
              </button>
              <button
                type="button"
                className="ss-submit ss-submit--danger"
                onClick={() => setConfirmLogout(true)}
              >
                Log out
              </button>
            </>
          ) : account ? (
            <>
              <div className="ss-greeting">
                <img
                  className="ss-avatar"
                  src={apiAssetSrc(account.avatarUrl || '/figma-assets/blank-avatar.svg')}
                  alt=""
                />
                <div className="ss-greetCopy">
                  <span className="ss-greetName">{account.displayName}</span>
                  <span className="ss-greetContact">{account.contact}</span>
                </div>
              </div>

              {errorText ? <div className="ss-error">{errorText}</div> : null}

              <p className="ss-sectionLabel">Account</p>
              <div className="ss-card">
                <SettingsRow
                  title="Post alerts"
                  subtitle="Notify me when selected players post"
                  iconKind="bell"
                  onClick={() => navigate('/settings/post-notifications')}
                />
                <SettingsRow
                  title="Edit profile"
                  subtitle="Name, display name, profile photo"
                  iconKind="profile"
                  onClick={() => navigate('/settings/profile')}
                />
                <SettingsRow
                  title={account.contactKind === 'email' ? 'Email' : 'Phone number'}
                  subtitle={account.contact}
                  iconKind={account.contactKind === 'email' ? 'mail' : 'phone'}
                  onClick={() => navigate('/settings/contact')}
                />
                <SettingsRow
                  title="Password"
                  subtitle="Change your sign-in password"
                  iconKind="lock"
                  onClick={() => navigate('/settings/password')}
                />
              </div>

              <p className="ss-sectionLabel">About</p>
              <div className="ss-about">
                <div className="ss-aboutRow">
                  <span>Member since</span>
                  <span className="ss-aboutVal">
                    {new Date(account.createdAtIso).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <div className="ss-aboutRow">
                  <span>Account ID</span>
                  <span className="ss-aboutVal" title={account.userId}>
                    {account.userId.slice(0, 8)}…
                  </span>
                </div>
                <div className="ss-aboutRow">
                  <span>App version</span>
                  <span className="ss-aboutVal">Simvest 1.0.7</span>
                </div>
              </div>

              <p className="ss-legalNote">
                Simvest is a stock simulation for education and competition only. No real money is
                traded.
              </p>

              <button
                type="button"
                className="ss-submit ss-submit--outlineDanger"
                onClick={() => {
                  setDeleteError(null)
                  setDeletePassword('')
                  setConfirmDelete(true)
                }}
              >
                Delete account
              </button>

              <button
                type="button"
                className="ss-submit ss-submit--danger"
                onClick={() => setConfirmLogout(true)}
              >
                Log out
              </button>
            </>
          ) : (
            <p className="ss-error">{errorText ?? 'Could not load your account.'}</p>
          )}
        </div>
      </section>

      {confirmDelete ? (
        <div
          className="ss-modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ss-delete-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteBusy) setConfirmDelete(false)
          }}
        >
          <div className="ss-modal">
            <h2 className="ss-modalTitle" id="ss-delete-title">
              Delete your account?
            </h2>
            <p className="ss-modalBody">
              This permanently removes your Simvest account, profile, simulated portfolios, game
              memberships, and activity posts. This cannot be undone.
            </p>
            <label className="ss-modalLabel" htmlFor="ss-delete-password">
              Confirm with your password
            </label>
            <input
              id="ss-delete-password"
              type="password"
              className="ss-modalInput"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              disabled={deleteBusy}
            />
            {deleteError ? <p className="ss-modalError">{deleteError}</p> : null}
            <div className="ss-modalActions">
              <button
                type="button"
                className="ss-modalBtn ss-modalBtn--cancel"
                disabled={deleteBusy}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ss-modalBtn ss-modalBtn--confirmDanger"
                disabled={deleteBusy || deletePassword.length < 1}
                onClick={() => void performDeleteAccount()}
              >
                {deleteBusy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmLogout ? (
        <div
          className="ss-modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ss-logout-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmLogout(false)
          }}
        >
          <div className="ss-modal">
            <h2 className="ss-modalTitle" id="ss-logout-title">
              Log out of Simvest?
            </h2>
            <p className="ss-modalBody">
              You'll be returned to the welcome screen. Your portfolio, games, and activity stay
              saved to this account — log back in any time to pick up where you left off.
            </p>
            <div className="ss-modalActions">
              <button
                type="button"
                className="ss-modalBtn ss-modalBtn--cancel"
                onClick={() => setConfirmLogout(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ss-modalBtn ss-modalBtn--confirm"
                onClick={performLogout}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

/* ------------------------------------------------------------------------- */

type IconKind = 'profile' | 'mail' | 'phone' | 'lock' | 'bell'

function SettingsRow(props: {
  title: string
  subtitle?: string
  iconKind: IconKind
  onClick: () => void
}) {
  return (
    <button type="button" className="ss-row" onClick={props.onClick}>
      <span className="ss-rowIcon" aria-hidden>
        <RowIcon kind={props.iconKind} />
      </span>
      <span className="ss-rowCopy">
        <span className="ss-rowTitle">{props.title}</span>
        {props.subtitle ? <span className="ss-rowSub">{props.subtitle}</span> : null}
      </span>
      <span className="ss-rowChevron" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
    </button>
  )
}

function RowIcon({ kind }: { kind: IconKind }) {
  if (kind === 'profile') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <path
          d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    )
  }
  if (kind === 'mail') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect
          x="3"
          y="5"
          width="18"
          height="14"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
        />
        <path
          d="M4 7l8 6 8-6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    )
  }
  if (kind === 'phone') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M5 3h4l2 5-2 1.5a11 11 0 0 0 5.5 5.5L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    )
  }
  if (kind === 'bell') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
        />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <rect
        x="4.5"
        y="10.5"
        width="15"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
      <path
        d="M8 10V8a4 4 0 0 1 8 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
