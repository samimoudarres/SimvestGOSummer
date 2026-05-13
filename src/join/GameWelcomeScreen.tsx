import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { gamePaths } from '../gameRoutes'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import { fetchJoinWelcome } from './fetchJoinWelcome'
import type { JoinWelcomePayload } from './joinWelcomeTypes'
import './gameWelcomeScreen.css'

export function GameWelcomeScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const codeParam = typeof params.get('code') === 'string' ? params.get('code')!.trim() : ''

  const [payload, setPayload] = useState<JoinWelcomePayload | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!/^\d{6}$/.test(codeParam)) {
      setPayload(null)
      setStatus('error')
      setError('Missing or invalid game code.')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const data = await fetchJoinWelcome(codeParam)
      if (!data) {
        setPayload(null)
        setStatus('error')
        setError('That code is not tied to an active Simvest game yet.')
        return
      }
      setPayload(data)
      setStatus('ready')
    } catch (e) {
      setPayload(null)
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Could not load game details.')
    }
  }, [codeParam])

  useEffect(() => {
    void load()
  }, [load])

  const customization = payload?.welcomeCustomization ?? {}
  const showMapleLeaf = customization.showMapleLeaf === true
  const showStockWatermark = customization.showStockChartWatermark !== false
  const prizeCardGlow =
    typeof customization.welcomeCardGlow === 'string' && customization.welcomeCardGlow.trim().length > 0
      ? customization.welcomeCardGlow.trim()
      : '0 0 10px rgba(255, 255, 255, 0.8)'

  const backdropStyle = useMemo(() => {
    if (!payload) {
      return {
        background: 'linear-gradient(141.75deg, #f7b104 9.17%, #9c5a02 89.71%)',
      } as CSSProperties
    }
    const { theme } = payload
    return {
      background: `linear-gradient(${theme.welcomeGradientAngleDeg}deg, ${theme.welcomeGradientFrom} 9.17%, ${theme.welcomeGradientTo} 89.71%)`,
    } as CSSProperties
  }, [payload])

  const titleStyle = useMemo(() => {
    if (!payload?.theme.titleTextShadow) return undefined
    return { textShadow: payload.theme.titleTextShadow }
  }, [payload])

  const btnStyle = useMemo(() => {
    if (!payload) return {}
    return {
      background: payload.theme.joinButtonColor,
      borderColor: payload.theme.joinButtonBorderColor,
    } as CSSProperties
  }, [payload])

  const amtColor = payload?.theme.prizeAmountColor ?? '#0fae37'

  const backColor = status === 'ready' && payload ? (payload.theme.backArrowColor ?? '#ffffff') : '#ffffff'

  const enterSetupProfile = useCallback(() => {
    if (!payload) return
    navigate(gamePaths.joinProfileSetup(payload.joinCode))
  }, [navigate, payload])

  const decorEmoji =
    typeof payload?.loadScreenDecorEmoji === 'string' && payload.loadScreenDecorEmoji.trim().length > 0
      ? payload.loadScreenDecorEmoji.trim()
      : null

  const showEconomics = payload?.showWelcomeEconomics !== false

  const invalidCode = !/^\d{6}$/.test(codeParam)

  return (
    <div className="gw-root">
      <div
        className={`gw-phone${payload?.showWelcomeEconomics === false ? ' gw-phone--noEconomy' : ''}`}
        data-node-id="386:1367"
        style={backdropStyle}
      >
        <button
          type="button"
          className="gw-back"
          aria-label="Back"
          style={{ color: backColor }}
          onClick={() => navigate('/join')}
        >
          <BackArrowIcon />
        </button>

        {invalidCode ? (
          <div className="gw-status gw-status--error">
            <p>Go back and enter your six-digit code to see this screen.</p>
            <button type="button" className="gw-retry" onClick={() => navigate('/join')}>
              Enter code
            </button>
          </div>
        ) : status === 'loading' ? (
          <p className="gw-loader" role="status">
            Loading game…
          </p>
        ) : status === 'error' ? (
          <div className="gw-status gw-status--error">
            <p>{error}</p>
            <button type="button" className="gw-retry" onClick={() => void load()}>
              Try again
            </button>
            <button type="button" className="gw-retry" style={{ marginTop: 10 }} onClick={() => navigate('/join')}>
              Edit code
            </button>
          </div>
        ) : payload ? (
          <>
            {showStockWatermark ? <div className="gw-stockwm" aria-hidden /> : null}
            {decorEmoji ? (
              <span className="gw-maple gw-maple--emoji" aria-hidden="true">
                {decorEmoji}
              </span>
            ) : showMapleLeaf ? (
              <span className="gw-maple gw-maple--emoji" aria-hidden="true">
                🍁
              </span>
            ) : null}

            {payload.hostedByLine ? <p className="gw-hosted">{payload.hostedByLine}</p> : null}

            <p className="gw-tagline">{payload.welcomeTagline}</p>

            <h1 className="gw-title" style={titleStyle}>
              {payload.displayTitle}
            </h1>

            <div className="gw-details" role="group" aria-label="Game schedule and rules summary">
              {payload.timelineDetailLines.map((line) => (
                <p key={line} style={{ margin: 0 }}>
                  {line}
                </p>
              ))}
            </div>

            {showEconomics ? <p className="gw-buyin">{payload.buyInLine}</p> : null}

            {payload.joinPolicy === 'approval_required' ? (
              <p className="gw-privateNote" role="note">
                This game is private: after you finish your profile, the host must approve you before you can trade.
              </p>
            ) : null}

            <button type="button" className="gw-join" style={btnStyle} onClick={enterSetupProfile}>
              Join Game
            </button>

            {showEconomics ? (
              <>
                <div className="gw-prizeCard" style={{ boxShadow: prizeCardGlow }} />

                <div className="gw-trophy" aria-hidden>
                  <span aria-hidden>🏆</span>
                </div>

                <h2 className="gw-prizeHead">CURRENT GAME PRIZES</h2>

                <ul className="gw-prizeList">
                  {payload.prizes.map((p) => (
                    <li key={p.rank}>
                      <span>{p.label} </span>
                      <span className="gw-prizeAmt" style={{ color: amtColor }}>
                        {p.amountFormatted}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="gw-disclaimer">{payload.prizePoolNote}</p>
              </>
            ) : null}

            <p className="gw-players" aria-live="polite">
              {payload.playerJoinLine}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
