import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchNotifyAuthors, removeNotifyAuthor, type NotifyAuthorRow } from './settingsClient'
import { apiAssetSrc } from '../config/apiAssetSrc'
import { registerSimvestPushIfPossible } from '../push/registerSimvestPush'
import { networkErrorMessage } from '../api/networkErrorMessage'
import './settingsScreens.css'

export function SettingsPostNotificationsScreen() {
  const navigate = useNavigate()
  const [authors, setAuthors] = useState<NotifyAuthorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushStatus, setPushStatus] = useState<string | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const r = await fetchNotifyAuthors()
    if (!r.ok) {
      if (r.message.toLowerCase().includes('missing viewer')) {
        navigate('/login', { replace: true })
        return
      }
      setErr(r.message)
      setAuthors([])
    } else {
      setAuthors(r.authors)
    }
    setLoading(false)
  }, [navigate])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onRegErr = (ev: Event) => {
      const message = (ev as CustomEvent<{ message?: string }>).detail?.message
      setPushError(
        typeof message === 'string' && message.trim()
          ? message
          : 'Push registration failed. Check notification permission and try again.',
      )
      setPushStatus(null)
    }
    window.addEventListener('simvest:push-registration-error', onRegErr)
    return () => window.removeEventListener('simvest:push-registration-error', onRegErr)
  }, [])

  const enablePush = useCallback(async () => {
    if (pushBusy) return
    setPushBusy(true)
    setPushError(null)
    setPushStatus(null)
    try {
      const push = await registerSimvestPushIfPossible()
      if (push.ok) {
        setPushStatus('Push alerts are enabled on this device.')
      } else if (push.reason === 'denied') {
        setPushError(
          'Notifications are blocked for Simvest. Enable them in your phone or browser settings, then try again.',
        )
      } else if (push.reason === 'unsupported') {
        setPushError(
          'Push alerts need a supported browser (Chrome, Edge, or Safari) or the native app with notifications configured.',
        )
      } else {
        setPushError(
          'Could not enable push on this device. Check your connection and notification permission, then try again.',
        )
      }
    } catch (e) {
      setPushError(networkErrorMessage(e))
    } finally {
      setPushBusy(false)
    }
  }, [pushBusy])

  const onRemove = async (id: string) => {
    setBusyId(id)
    try {
      const ok = await removeNotifyAuthor(id)
      if (ok) setAuthors((prev) => prev.filter((a) => a.userId !== id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="ss-root">
      <section className="ss-phone" aria-label="Post notifications">
        <header className="ss-header">
          <button type="button" className="ss-back" aria-label="Back to settings" onClick={() => navigate('/settings')}>
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
          <h1 className="ss-title">Post alerts</h1>
          <span className="ss-headerSpacer" aria-hidden />
        </header>

        <div className="ss-body">
          <p className="ss-hintPara">
            When someone you follow posts or trades, Simvest can send a push notification to this
            device. Allow notifications when the app asks (phone) or in your browser when prompted.
          </p>

          <button
            type="button"
            className="ss-submit"
            disabled={pushBusy}
            onClick={() => void enablePush()}
          >
            {pushBusy ? 'Enabling…' : 'Enable push on this device'}
          </button>
          {pushStatus ? <p className="ss-hintPara">{pushStatus}</p> : null}
          {pushError ? <div className="ss-error">{pushError}</div> : null}

          {loading ? <p className="ss-loading">Loading…</p> : null}
          {err ? <div className="ss-error">{err}</div> : null}
          {!loading && !err && authors.length === 0 ? (
            <p className="ss-hintPara">You’re not following anyone for post alerts yet. Use “Notify me” on a feed post.</p>
          ) : null}
          {!loading && authors.length > 0 ? (
            <ul className="ss-notifyList">
              {authors.map((a) => (
                <li key={a.userId} className="ss-notifyRow">
                  <img className="ss-notifyAvatar" src={apiAssetSrc(a.avatarUrl)} alt="" width={40} height={40} />
                  <div className="ss-notifyCopy">
                    <span className="ss-notifyName">{a.displayName}</span>
                    <span className="ss-notifyId">{a.userId.slice(0, 10)}…</span>
                  </div>
                  <button
                    type="button"
                    className="ss-notifyRemove"
                    disabled={busyId === a.userId}
                    onClick={() => void onRemove(a.userId)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </main>
  )
}
