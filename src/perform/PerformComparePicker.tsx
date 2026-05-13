import { useCallback, useEffect, useMemo, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { PerformCompareCandidatePlayer } from './performTypes'

const MAX_COMPARISONS = 5

type Tab = 'players' | 'stocks'

type Props = {
  open: boolean
  gameSlug: string
  existingTokens: string[]
  onClose: () => void
  onAddToken: (token: string) => void
  onRemoveToken: (token: string) => void
}

function tokenForUser(id: string) {
  return `user:${id}`
}

function tokenForStock(ticker: string) {
  return `stock:${ticker.toUpperCase().trim()}`
}

function parseExistingUserIds(tokens: string[]): Set<string> {
  const s = new Set<string>()
  for (const t of tokens) {
    const low = t.toLowerCase()
    if (low.startsWith('user:')) s.add(t.slice(5).trim())
  }
  return s
}

function parseExistingStocks(tokens: string[]): Set<string> {
  const s = new Set<string>()
  for (const t of tokens) {
    const low = t.toLowerCase()
    if (low.startsWith('stock:')) s.add(t.slice(6).trim().toUpperCase())
  }
  return s
}

type SearchRow = { symbol: string; companyName: string; logoUrl: string }

export function PerformComparePicker({
  open,
  gameSlug,
  existingTokens,
  onClose,
  onAddToken,
  onRemoveToken,
}: Props) {
  const [tab, setTab] = useState<Tab>('players')
  const [players, setPlayers] = useState<PerformCompareCandidatePlayer[]>([])
  const [playersStatus, setPlayersStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<SearchRow[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const usedSlots = existingTokens.length
  const canAddMore = usedSlots < MAX_COMPARISONS

  const existingUsers = useMemo(() => parseExistingUserIds(existingTokens), [existingTokens])
  const existingStocks = useMemo(() => parseExistingStocks(existingTokens), [existingTokens])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPlayersStatus('loading')
    simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/perform/compare/candidates`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return
        if (Array.isArray(body?.players)) {
          setPlayers(body.players as PerformCompareCandidatePlayer[])
          setPlayersStatus('idle')
        } else {
          setPlayersStatus('error')
        }
      })
      .catch(() => {
        if (!cancelled) setPlayersStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [open, gameSlug])

  useEffect(() => {
    if (!open || tab !== 'stocks') return
    const t = q.trim()
    if (t.length < 1) {
      setRows([])
      setSearchStatus('idle')
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      setSearchStatus('loading')
      simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/trade/search?q=${encodeURIComponent(t)}`)
        .then((r) => r.json())
        .then((body) => {
          if (cancelled) return
          const rrows = Array.isArray(body?.rows) ? (body.rows as SearchRow[]) : []
          setRows(rrows.slice(0, 24))
          setSearchStatus('idle')
        })
        .catch(() => {
          if (!cancelled) setSearchStatus('error')
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [open, tab, gameSlug, q])

  const addUser = useCallback(
    (id: string) => {
      if (!canAddMore) return
      onAddToken(tokenForUser(id))
    },
    [canAddMore, onAddToken],
  )

  const addStock = useCallback(
    (sym: string) => {
      if (!canAddMore) return
      onAddToken(tokenForStock(sym))
    },
    [canAddMore, onAddToken],
  )

  if (!open) return null

  return (
    <div className="pf-compareModalOverlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="pf-compareModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-compare-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pf-compareModalHead">
          <h2 id="pf-compare-modal-title" className="pf-compareModalTitle">
            Add comparison
          </h2>
          <button type="button" className="pf-compareModalClose" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="pf-compareModalSub">
          Indexed lines like the chart — compare your portfolio in this game to another player or any stock (up to {MAX_COMPARISONS} lines
          besides you).
        </p>

        <div className="pf-compareCurrent">
          <p className="pf-compareCurrentLab">Comparing ({existingTokens.length} / {MAX_COMPARISONS})</p>
          {existingTokens.length === 0 ? (
            <p className="pf-compareCurrentEmpty">You only — add a player or stock below.</p>
          ) : (
            <ul className="pf-compareTokenList">
              {existingTokens.map((tok) => (
                <li key={tok} className="pf-compareTokenRow">
                  <span className="pf-compareTokenText">{tok.replace(/^user:/, 'Player: ').replace(/^stock:/, '')}</span>
                  <button type="button" className="pf-compareTokenRemove" onClick={() => onRemoveToken(tok)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pf-compareTabs">
          <button
            type="button"
            className={`pf-compareTab${tab === 'players' ? ' pf-compareTab--on' : ''}`}
            onClick={() => setTab('players')}
          >
            Players in game
          </button>
          <button
            type="button"
            className={`pf-compareTab${tab === 'stocks' ? ' pf-compareTab--on' : ''}`}
            onClick={() => setTab('stocks')}
          >
            Stocks
          </button>
        </div>

        {!canAddMore ? (
          <p className="pf-compareLimit">Remove a comparison to add another.</p>
        ) : null}

        {tab === 'players' ? (
          <div className="pf-comparePanel">
            {playersStatus === 'loading' ? <p className="pf-comparePanelStatus">Loading players…</p> : null}
            {playersStatus === 'error' ? <p className="pf-comparePanelStatus pf-comparePanelStatus--err">Could not load players.</p> : null}
            <ul className="pf-comparePlayerList">
              {players.map((p) => {
                const added = existingUsers.has(p.userId)
                return (
                  <li key={p.userId}>
                    <button
                      type="button"
                      className={`pf-comparePlayerBtn${added ? ' pf-comparePlayerBtn--added' : ''}`}
                      disabled={!canAddMore && !added}
                      onClick={() => (added ? onRemoveToken(tokenForUser(p.userId)) : addUser(p.userId))}
                    >
                      <img className="pf-comparePlayerAvatar" src={p.avatarUrl} alt="" />
                      <span className="pf-comparePlayerName">{p.displayName}</span>
                      <span className="pf-comparePlayerAction">{added ? 'Added' : 'Add'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="pf-comparePanel">
            <label className="pf-compareSearchLab">
              Search
              <input
                className="pf-compareSearchInput"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ticker or company"
                autoComplete="off"
              />
            </label>
            {searchStatus === 'loading' ? <p className="pf-comparePanelStatus">Searching…</p> : null}
            <ul className="pf-compareStockList">
              {rows.map((r) => {
                const sym = r.symbol.toUpperCase()
                const added = existingStocks.has(sym)
                return (
                  <li key={sym}>
                    <button
                      type="button"
                      className={`pf-compareStockBtn${added ? ' pf-compareStockBtn--added' : ''}`}
                      disabled={!canAddMore && !added}
                      onClick={() => (added ? onRemoveToken(tokenForStock(sym)) : addStock(sym))}
                    >
                      {r.logoUrl ? (
                        <img className="pf-compareStockIcon" src={r.logoUrl} alt="" />
                      ) : (
                        <span className="pf-compareStockIconPf" aria-hidden />
                      )}
                      <span className="pf-compareStockSym">{sym}</span>
                      <span className="pf-compareStockName">{r.companyName}</span>
                      <span className="pf-compareStockAction">{added ? 'Added' : 'Add'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
