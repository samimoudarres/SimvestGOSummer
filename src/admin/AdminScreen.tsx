import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearAdminSecret,
  fetchAdminDashboard,
  fetchAdminStatus,
  getStoredAdminSecret,
  storeAdminSecret,
  type AdminDashboardPayload,
} from './adminApi'
import { downloadCsv } from './exportCsv'
import './adminScreen.css'

type TabId = 'overview' | 'accounts' | 'games' | 'posts' | 'joinRequests'

function formatWhen(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function matchesQuery(haystack: string, q: string): boolean {
  if (!q) return true
  return haystack.toLowerCase().includes(q)
}

function rowMatches(fields: string[], q: string): boolean {
  return fields.some((f) => matchesQuery(f, q))
}

export function AdminScreen() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [secret, setSecret] = useState<string | null>(() => getStoredAdminSecret())
  const [passwordInput, setPasswordInput] = useState('')
  const [data, setData] = useState<AdminDashboardPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('overview')
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()

  useEffect(() => {
    let cancelled = false
    fetchAdminStatus()
      .then((s) => {
        if (!cancelled) setConfigured(s.configured)
      })
      .catch(() => {
        if (!cancelled) setConfigured(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadDashboard = useCallback(async (adminSecret: string) => {
    setLoading(true)
    setError(null)
    const result = await fetchAdminDashboard(adminSecret)
    setLoading(false)
    if (!result.ok) {
      if (result.status === 401) {
        clearAdminSecret()
        setSecret(null)
        setData(null)
      }
      setError(result.message)
      return
    }
    setData(result.data)
  }, [])

  useEffect(() => {
    if (!secret) return
    void loadDashboard(secret)
  }, [secret, loadDashboard])

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = passwordInput.trim()
    if (!trimmed) {
      setError('Enter the admin password.')
      return
    }
    storeAdminSecret(trimmed)
    setSecret(trimmed)
    setPasswordInput('')
  }

  const onLogout = () => {
    clearAdminSecret()
    setSecret(null)
    setData(null)
    setError(null)
  }

  const filteredAccounts = useMemo(() => {
    if (!data) return []
    return data.accounts.filter((a) =>
      rowMatches(
        [a.displayName, a.firstName, a.lastName, a.contact, a.userId, a.contactKind],
        q,
      ),
    )
  }, [data, q])

  const filteredGames = useMemo(() => {
    if (!data) return []
    return data.games.filter((g) =>
      rowMatches(
        [
          g.slug,
          g.displayName,
          g.visibility,
          g.hostDisplayName,
          g.hostUserId ?? '',
          g.joinCode ?? '',
        ],
        q,
      ),
    )
  }, [data, q])

  const filteredPosts = useMemo(() => {
    if (!data) return []
    return data.posts.filter((p) =>
      rowMatches(
        [p.author, p.gameSlug, p.tradeTitle, p.tickerSymbol, p.userId, p.postKind, p.rationalePreview],
        q,
      ),
    )
  }, [data, q])

  const filteredJoinRequests = useMemo(() => {
    if (!data) return []
    return data.joinRequests.filter((r) =>
      rowMatches([r.displayName, r.gameSlug, r.userId, r.status, r.id], q),
    )
  }, [data, q])

  const exportAccounts = () => {
    downloadCsv(
      'simvest-accounts.csv',
      ['userId', 'displayName', 'firstName', 'lastName', 'contactKind', 'contact', 'createdAt', 'updatedAt'],
      filteredAccounts.map((a) => [
        a.userId,
        a.displayName,
        a.firstName,
        a.lastName,
        a.contactKind,
        a.contact,
        a.createdAtIso,
        a.updatedAtIso,
      ]),
    )
  }

  const exportGames = () => {
    downloadCsv(
      'simvest-games.csv',
      [
        'slug',
        'displayName',
        'visibility',
        'hostUserId',
        'hostDisplayName',
        'joinCode',
        'setupComplete',
        'playerCount',
        'startsAt',
        'endsAt',
        'updatedAt',
      ],
      filteredGames.map((g) => [
        g.slug,
        g.displayName,
        g.visibility,
        g.hostUserId ?? '',
        g.hostDisplayName,
        g.joinCode ?? '',
        g.setupComplete,
        g.playerCount,
        g.startsAtIso,
        g.endsAtIso ?? '',
        g.updatedAtIso,
      ]),
    )
  }

  const exportPosts = () => {
    downloadCsv(
      'simvest-posts.csv',
      ['id', 'gameSlug', 'author', 'userId', 'kind', 'timestamp', 'title', 'ticker', 'hasImage', 'rationale'],
      filteredPosts.map((p) => [
        p.id,
        p.gameSlug,
        p.author,
        p.userId,
        p.postKind,
        p.timestampIso,
        p.tradeTitle,
        p.tickerSymbol,
        p.hasImage,
        p.rationalePreview,
      ]),
    )
  }

  const exportJoinRequests = () => {
    downloadCsv(
      'simvest-join-requests.csv',
      ['id', 'gameSlug', 'userId', 'displayName', 'status', 'createdAt', 'resolvedAt'],
      filteredJoinRequests.map((r) => [
        r.id,
        r.gameSlug,
        r.userId,
        r.displayName,
        r.status,
        r.createdAtIso,
        r.resolvedAtIso ?? '',
      ]),
    )
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'accounts', label: 'Accounts' },
    { id: 'games', label: 'Games' },
    { id: 'posts', label: 'Posts' },
    { id: 'joinRequests', label: 'Join requests' },
  ]

  if (!secret) {
    return (
      <div className="sv-admin">
        <a className="sv-admin__skip" href="#admin-main">
          Skip to main content
        </a>
        <main id="admin-main" className="sv-admin__wrap">
          <header className="sv-admin__header">
            <h1 className="sv-admin__title">Simvest admin</h1>
            <p className="sv-admin__subtitle">
              Read-only view of accounts, games, posts, and join requests. Not shown in the player app.
            </p>
          </header>
          <section className="sv-admin__card" aria-labelledby="admin-login-heading">
            <h2 id="admin-login-heading">Sign in</h2>
            {configured === false && (
              <p className="sv-admin__error" role="alert">
                This API does not have admin enabled. Set <code>SIMVEST_ADMIN_SECRET</code> on the server (at least 8
                characters).
              </p>
            )}
            <form onSubmit={onLogin}>
              <label className="sv-admin__label" htmlFor="admin-password">
                Admin password
              </label>
              <input
                id="admin-password"
                className="sv-admin__input"
                type="password"
                autoComplete="current-password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                disabled={configured === false}
              />
              {error && (
                <p className="sv-admin__error" role="alert">
                  {error}
                </p>
              )}
              <div className="sv-admin__row">
                <button type="submit" className="sv-admin__btn sv-admin__btn--primary" disabled={configured === false}>
                  Continue
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="sv-admin">
      <a className="sv-admin__skip" href="#admin-main">
        Skip to main content
      </a>
      <main id="admin-main" className="sv-admin__wrap">
        <header className="sv-admin__header">
          <h1 className="sv-admin__title">Simvest admin</h1>
          <p className="sv-admin__subtitle">
            {data ? `Data as of ${formatWhen(data.generatedAtIso)}` : 'Loading…'}
            {' · '}
            <button type="button" className="sv-admin__btn sv-admin__btn--ghost" onClick={onLogout}>
              Sign out
            </button>
          </p>
        </header>

        {error && (
          <p className="sv-admin__error" role="alert">
            {error}
          </p>
        )}

        {loading && !data && <p aria-live="polite">Loading dashboard…</p>}

        {data && (
          <>
            <div
              className="sv-admin__tabs"
              role="tablist"
              aria-label="Dashboard sections"
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  className="sv-admin__tab"
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab !== 'overview' && (
              <div className="sv-admin__toolbar">
                <div className="sv-admin__search-wrap">
                  <label className="sv-admin__label" htmlFor="admin-search">
                    Search this table
                  </label>
                  <input
                    id="admin-search"
                    className="sv-admin__input"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, email, game, slug…"
                  />
                </div>
                <button
                  type="button"
                  className="sv-admin__btn sv-admin__btn--secondary"
                  onClick={() => void loadDashboard(secret)}
                  disabled={loading}
                >
                  Refresh
                </button>
              </div>
            )}

            {tab === 'overview' && (
              <section
                role="tabpanel"
                id="panel-overview"
                aria-labelledby="tab-overview"
              >
                <ul className="sv-admin__stats">
                  <li className="sv-admin__stat">
                    <span className="sv-admin__stat-value">{data.overview.accountCount}</span>
                    <span className="sv-admin__stat-label">Accounts</span>
                  </li>
                  <li className="sv-admin__stat">
                    <span className="sv-admin__stat-value">{data.overview.gameCount}</span>
                    <span className="sv-admin__stat-label">Games</span>
                  </li>
                  <li className="sv-admin__stat">
                    <span className="sv-admin__stat-value">{data.overview.publicGameCount}</span>
                    <span className="sv-admin__stat-label">Public games</span>
                  </li>
                  <li className="sv-admin__stat">
                    <span className="sv-admin__stat-value">{data.overview.postCount}</span>
                    <span className="sv-admin__stat-label">Posts (latest {data.posts.length})</span>
                  </li>
                  <li className="sv-admin__stat">
                    <span className="sv-admin__stat-value">{data.overview.membershipJoinCount}</span>
                    <span className="sv-admin__stat-label">Membership rows</span>
                  </li>
                  <li className="sv-admin__stat">
                    <span className="sv-admin__stat-value">{data.overview.pendingJoinRequestCount}</span>
                    <span className="sv-admin__stat-label">Pending join requests</span>
                  </li>
                </ul>
                <p className="sv-admin__meta">
                  Use the tabs above to browse tables. Search and CSV export apply per table. Passwords are never shown.
                </p>
                <button
                  type="button"
                  className="sv-admin__btn sv-admin__btn--secondary"
                  onClick={() => void loadDashboard(secret)}
                  disabled={loading}
                >
                  Refresh data
                </button>
              </section>
            )}

            {tab === 'accounts' && (
              <section role="tabpanel" id="panel-accounts" aria-labelledby="tab-accounts">
                <p className="sv-admin__meta">
                  Showing {filteredAccounts.length} of {data.accounts.length} accounts
                </p>
                <div className="sv-admin__row">
                  <button type="button" className="sv-admin__btn sv-admin__btn--secondary" onClick={exportAccounts}>
                    Export CSV
                  </button>
                </div>
                <div className="sv-admin__table-scroll">
                  <table className="sv-admin__table">
                    <caption>User accounts</caption>
                    <thead>
                      <tr>
                        <th scope="col">Display name</th>
                        <th scope="col">Contact</th>
                        <th scope="col">User ID</th>
                        <th scope="col">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="sv-admin__empty">
                            No accounts match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredAccounts.map((a) => (
                          <tr key={a.userId}>
                            <td>{a.displayName}</td>
                            <td>
                              {a.contactKind}: {a.contact}
                            </td>
                            <td className="sv-admin__mono">{a.userId}</td>
                            <td>{formatWhen(a.createdAtIso)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {tab === 'games' && (
              <section role="tabpanel" id="panel-games" aria-labelledby="tab-games">
                <p className="sv-admin__meta">
                  Showing {filteredGames.length} of {data.games.length} games
                </p>
                <div className="sv-admin__row">
                  <button type="button" className="sv-admin__btn sv-admin__btn--secondary" onClick={exportGames}>
                    Export CSV
                  </button>
                </div>
                <div className="sv-admin__table-scroll">
                  <table className="sv-admin__table">
                    <caption>Games</caption>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Slug</th>
                        <th scope="col">Visibility</th>
                        <th scope="col">Players</th>
                        <th scope="col">Host</th>
                        <th scope="col">Code</th>
                        <th scope="col">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGames.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="sv-admin__empty">
                            No games match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredGames.map((g) => (
                          <tr key={g.slug}>
                            <td>{g.displayName}</td>
                            <td className="sv-admin__mono">{g.slug}</td>
                            <td>{g.visibility}</td>
                            <td>{g.playerCount}</td>
                            <td>{g.hostDisplayName || g.hostUserId || '—'}</td>
                            <td>{g.joinCode ?? '—'}</td>
                            <td>{formatWhen(g.updatedAtIso)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {tab === 'posts' && (
              <section role="tabpanel" id="panel-posts" aria-labelledby="tab-posts">
                <p className="sv-admin__meta">
                  Showing {filteredPosts.length} of {data.posts.length} recent posts (newest 2000 on server)
                </p>
                <div className="sv-admin__row">
                  <button type="button" className="sv-admin__btn sv-admin__btn--secondary" onClick={exportPosts}>
                    Export CSV
                  </button>
                </div>
                <div className="sv-admin__table-scroll">
                  <table className="sv-admin__table">
                    <caption>Feed posts</caption>
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">Author</th>
                        <th scope="col">Game</th>
                        <th scope="col">Kind</th>
                        <th scope="col">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPosts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="sv-admin__empty">
                            No posts match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredPosts.map((p) => (
                          <tr key={p.id}>
                            <td>{formatWhen(p.timestampIso)}</td>
                            <td>{p.author}</td>
                            <td className="sv-admin__mono">{p.gameSlug}</td>
                            <td>{p.postKind}</td>
                            <td>
                              {p.tradeTitle || p.tickerSymbol || p.rationalePreview || (p.hasImage ? '[image]' : '—')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {tab === 'joinRequests' && (
              <section role="tabpanel" id="panel-joinRequests" aria-labelledby="tab-joinRequests">
                <p className="sv-admin__meta">
                  Showing {filteredJoinRequests.length} of {data.joinRequests.length} join requests
                </p>
                <div className="sv-admin__row">
                  <button type="button" className="sv-admin__btn sv-admin__btn--secondary" onClick={exportJoinRequests}>
                    Export CSV
                  </button>
                </div>
                <div className="sv-admin__table-scroll">
                  <table className="sv-admin__table">
                    <caption>Join requests</caption>
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">Player</th>
                        <th scope="col">Game</th>
                        <th scope="col">Status</th>
                        <th scope="col">User ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJoinRequests.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="sv-admin__empty">
                            No join requests match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredJoinRequests.map((r) => (
                          <tr key={r.id}>
                            <td>{formatWhen(r.createdAtIso)}</td>
                            <td>{r.displayName}</td>
                            <td className="sv-admin__mono">{r.gameSlug}</td>
                            <td>{r.status}</td>
                            <td className="sv-admin__mono">{r.userId}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
