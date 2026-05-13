import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { simvestFetch } from '../api/simvestFetch'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import './hostJoinRequestsScreen.css'

type JoinReqRow = {
  id: string
  userId: string
  displayName: string
  createdAtIso: string
}

export function HostJoinRequestsScreen() {
  const navigate = useNavigate()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? 'new'
  const [rows, setRows] = useState<JoinReqRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/join-requests`)
      if (res.status === 401 || res.status === 403) {
        setErr('You must be signed in as the game host to view join requests.')
        setRows([])
        return
      }
      if (!res.ok) {
        setErr((await res.text()) || 'Could not load requests.')
        return
      }
      const b = (await res.json()) as { requests?: JoinReqRow[] }
      setRows(Array.isArray(b.requests) ? b.requests : [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Load failed')
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  const act = useCallback(
    async (id: string, kind: 'approve' | 'reject') => {
      setBusy(id)
      setErr(null)
      try {
        const path =
          kind === 'approve'
            ? `/api/games/${encodeURIComponent(slug)}/join-requests/${encodeURIComponent(id)}/approve`
            : `/api/games/${encodeURIComponent(slug)}/join-requests/${encodeURIComponent(id)}/reject`
        const res = await simvestFetch(path, { method: 'POST' })
        if (!res.ok) {
          const t = await res.text()
          setErr(t || `${kind} failed`)
          return
        }
        await load()
      } catch (e) {
        setErr(e instanceof Error ? e.message : `${kind} failed`)
      } finally {
        setBusy(null)
      }
    },
    [load, slug],
  )

  return (
    <div className="hjr-root">
      <div className="hjr-phone">
        <button type="button" className="hjr-back" aria-label="Back" onClick={() => navigate(`/g/${encodeURIComponent(slug)}`)}>
          <BackArrowIcon />
        </button>
        <h1 className="hjr-title">Join requests</h1>
        <p className="hjr-sub">Approve players for your private game.</p>

        {err ? <p className="hjr-err">{err}</p> : null}

        <ul className="hjr-list">
          {rows.length === 0 && !err ? <li className="hjr-empty">No pending requests.</li> : null}
          {rows.map((r) => (
            <li key={r.id} className="hjr-row">
              <div className="hjr-meta">
                <p className="hjr-name">{r.displayName}</p>
                <p className="hjr-when">{new Date(r.createdAtIso).toLocaleString()}</p>
              </div>
              <div className="hjr-actions">
                <button
                  type="button"
                  className="hjr-btn hjr-btn--ok"
                  disabled={busy === r.id}
                  onClick={() => void act(r.id, 'approve')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="hjr-btn hjr-btn--no"
                  disabled={busy === r.id}
                  onClick={() => void act(r.id, 'reject')}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
