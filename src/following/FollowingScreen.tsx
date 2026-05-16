import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChallengeBottomNav } from '../challenge/ChallengeBottomNav'
import { challengeAssets as a } from '../challenge/challengeAssets'
import { useGameChallengeHeader } from '../challenge/useGameChallengeHeader'
import '../challenge/gameChallenge.css'
import { useGameChromeCssVars } from '../game/useGameChromeCssVars'
import '../perform/performScreen.css'
import { MiniSparkLine } from '../components/MiniSparkLine'
import { simvestFetch } from '../api/simvestFetch'
import { navigateToStock } from '../stocks/navigateToStock'
import { ApiImage } from '../components/ApiImage'
import { rememberActiveGameSlug } from '../user/activeGameSlug'
import { LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { displayTickerLabel } from '../stocks/displayTicker'
import type { TradeBrowseRow } from '../trade/tradeTypes'
import './followingScreen.css'

export function FollowingScreen() {
  const navigate = useNavigate()
  const { gameSlug } = useParams<{ gameSlug: string }>()
  const slug = gameSlug ?? ''
  const headerCtl = useGameChallengeHeader(slug)

  useEffect(() => {
    rememberActiveGameSlug(slug)
  }, [slug])

  const chromeStyle = useGameChromeCssVars(slug)

  const [rows, setRows] = useState<TradeBrowseRow[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const goBack = useCallback(() => {
    navigate(`/g/${slug}`)
  }, [navigate, slug])

  useEffect(() => {
    let cancelled = false
    const load = async (isPoll: boolean) => {
      if (!isPoll) {
        setStatus('loading')
        setError(null)
      }
      try {
        const r = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/me/following`, {
          cache: 'no-store',
        })
        const body = (await r.json().catch(() => ({}))) as { tickers?: unknown; error?: string }
        if (cancelled) return
        if (!r.ok || !body || !Array.isArray(body.tickers)) {
          if (!isPoll) {
            setError(typeof body.error === 'string' ? body.error : 'Could not load follows')
            setStatus('error')
          }
          return
        }
        const tickers = body.tickers as string[]
        if (tickers.length < 1) {
          setRows([])
          setStatus('ready')
          return
        }
        const qs = tickers.map((t) => encodeURIComponent(t)).join(',')
        const r2 = await simvestFetch(`/api/games/${encodeURIComponent(slug)}/trade/search?recents=${qs}`, {
          cache: 'no-store',
        })
        const b2 = (await r2.json().catch(() => ({}))) as { rows?: unknown; error?: string }
        if (cancelled) return
        if (r2.ok && b2 && Array.isArray(b2.rows)) {
          setRows(b2.rows as TradeBrowseRow[])
          setStatus('ready')
        } else if (!isPoll) {
          setError(typeof b2.error === 'string' ? b2.error : 'Could not load symbols')
          setStatus('error')
        }
      } catch {
        if (!cancelled && !isPoll) {
          setError('Network error')
          setStatus('error')
        }
      }
    }

    void load(false)
    const id = window.setInterval(() => void load(true), LIVE_MARKETS_POLL_MS)
    const offVisible = onDocumentVisible(() => void load(true))
    return () => {
      cancelled = true
      window.clearInterval(id)
      offVisible()
    }
  }, [slug])

  const onStock = useCallback(
    (symbol: string) => {
      navigateToStock(navigate, symbol, {
        gameSlug: slug,
        challengeTitle: headerCtl.headerTitle,
        returnPath: `/g/${slug}/following`,
        navTab: 'perform',
      })
    },
    [navigate, slug, headerCtl.headerTitle],
  )

  if (!gameSlug) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="pf-root" style={chromeStyle}>
      <div className="fol-phone">
        <header className="fol-topBand">
          <button type="button" className="fol-back" aria-label="Back" onClick={goBack}>
            <img src={a.back} alt="" />
          </button>
          <h1 className="fol-title">Following</h1>
        </header>

        <div className="fol-scroll">
          {status === 'loading' ? <p className="fol-msg">Loading…</p> : null}
          {status === 'error' ? <p className="fol-err">{error ?? 'Something went wrong.'}</p> : null}
          {status === 'ready' && !rows.length ? (
            <p className="fol-msg">
              You are not following any symbols yet. Open a stock and tap Follow.
            </p>
          ) : null}
          {status === 'ready' && rows.length > 0
            ? rows.map((row) => (
                <button key={row.symbol} type="button" className="pf-stockRow" onClick={() => onStock(row.symbol)}>
                  <span className="pf-stockLogoWrap">
                    <ApiImage className="pf-stockLogo" src={row.logoUrl} alt="" loading="lazy" decoding="async" />
                  </span>
                  <div>
                    <p className="pf-stockSym">{displayTickerLabel(row.symbol)}</p>
                    <p className="pf-stockCo">{row.companyName}</p>
                  </div>
                  <MiniSparkLine vals={row.sparkline} up={row.positive} />
                  <p className="pf-stockPrice">{row.price}</p>
                  <span className={`pf-pct ${row.positive ? 'pf-pct--up' : 'pf-pct--down'}`}>{row.changeLabel}</span>
                </button>
              ))
            : null}
        </div>

        <ChallengeBottomNav gameSlug={slug} active="perform" tradeLocked={headerCtl.gameHasEnded} />
      </div>
    </div>
  )
}
