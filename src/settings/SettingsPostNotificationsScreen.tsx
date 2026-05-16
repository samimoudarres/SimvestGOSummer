import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchNotifyAuthors, removeNotifyAuthor, type NotifyAuthorRow } from './settingsClient'
import { apiAssetSrc } from '../config/apiAssetSrc'
import './settingsScreens.css'

export function SettingsPostNotificationsScreen() {
  const navigate = useNavigate()
  const [authors, setAuthors] = useState<NotifyAuthorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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
            device (allow notifications in your browser when prompted).
          </p>
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
