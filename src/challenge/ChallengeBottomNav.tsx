import { useNavigate } from 'react-router-dom'
import { prefetchGameShell } from '../game/gameShellCache'
import { challengeAssets as a } from './challengeAssets'

export type ChallengeNavTab =
  | 'activity'
  | 'perform'
  | 'trade'
  | 'portfolio'
  | 'leaderboard'
  /** Sub-screens (profile) — no primary tab shows as selected. */
  | 'profile'

type Props = {
  gameSlug: string
  active: ChallengeNavTab
  /** When true, Trade is disabled (e.g. game ended) — tap shows Perform instead. */
  tradeLocked?: boolean
}

export function ChallengeBottomNav({ gameSlug, active, tradeLocked }: Props) {
  const navigate = useNavigate()
  const base = `/g/${gameSlug}`

  const go = (path: string) => {
    prefetchGameShell(gameSlug)
    navigate(path)
  }

  const onTrade = () => {
    if (tradeLocked) {
      go(`${base}/perform`)
      return
    }
    go(`${base}/trade`)
  }

  return (
    <nav className="gc-tabbar" aria-label="Game navigation">
      <button
        type="button"
        className={`gc-navItem${active === 'activity' ? ' gc-navItem--active' : ''}`}
        onClick={() => go(base)}
      >
        <img src={a.searchActivity} alt="" width={26} height={26} />
        ACTIVITY
      </button>
      <button
        type="button"
        className={`gc-navItem${active === 'perform' ? ' gc-navItem--active' : ''}`}
        onClick={() => go(`${base}/perform`)}
      >
        <img src={a.performance} alt="" width={26} height={26} />
        PERFORM.
      </button>
      <div
        className={`gc-navTradeCol${active === 'trade' ? ' gc-navTradeCol--active' : ''}${tradeLocked ? ' gc-navTradeCol--locked' : ''}`}
      >
        <div className="gc-tradeFabMount">
          <button
            type="button"
            className="gc-tradeFab"
            aria-label={tradeLocked ? 'Trade closed — view results' : 'Trade'}
            onClick={onTrade}
          >
            <img className="gc-tradeFab__ring" src={a.navRing} alt="" />
            <img className="gc-tradeFab__inner" src={a.navInner} alt="" />
            <img className="gc-tradeFab__dollar" src={a.dollar} alt="" />
          </button>
        </div>
        <span className="gc-navTradeLabel">{tradeLocked ? 'CLOSED' : 'TRADE'}</span>
      </div>
      <button
        type="button"
        className={`gc-navItem${active === 'portfolio' ? ' gc-navItem--active' : ''}`}
        onClick={() => go(`${base}/portfolio`)}
      >
        <img src={a.portfolio} alt="" width={26} height={26} />
        PORTFOLIO
      </button>
      <button
        type="button"
        className={`gc-navItem${active === 'leaderboard' ? ' gc-navItem--active' : ''}`}
        onClick={() => go(`${base}/leaderboard`)}
      >
        <img src={a.leaderboard} alt="" width={26} height={26} />
        LEADERBOARD
      </button>
    </nav>
  )
}
