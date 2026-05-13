import { useNavigate } from 'react-router-dom'
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
}

export function ChallengeBottomNav({ gameSlug, active }: Props) {
  const navigate = useNavigate()
  const base = `/g/${gameSlug}`

  return (
    <nav className="gc-tabbar" aria-label="Game navigation">
      <button
        type="button"
        className={`gc-navItem${active === 'activity' ? ' gc-navItem--active' : ''}`}
        onClick={() => navigate(base)}
      >
        <img src={a.searchActivity} alt="" width={26} height={26} />
        ACTIVITY
      </button>
      <button
        type="button"
        className={`gc-navItem${active === 'perform' ? ' gc-navItem--active' : ''}`}
        onClick={() => navigate(`${base}/perform`)}
      >
        <img src={a.performance} alt="" width={26} height={26} />
        PERFORM.
      </button>
      <div className={`gc-navTradeCol${active === 'trade' ? ' gc-navTradeCol--active' : ''}`}>
        <div className="gc-tradeFabMount">
          <button
            type="button"
            className="gc-tradeFab"
            aria-label="Trade"
            onClick={() => navigate(`${base}/trade`)}
          >
            <img className="gc-tradeFab__ring" src={a.navRing} alt="" />
            <img className="gc-tradeFab__inner" src={a.navInner} alt="" />
            <img className="gc-tradeFab__dollar" src={a.dollar} alt="" />
          </button>
        </div>
        <span className="gc-navTradeLabel">TRADE</span>
      </div>
      <button
        type="button"
        className={`gc-navItem${active === 'portfolio' ? ' gc-navItem--active' : ''}`}
        onClick={() => navigate(`${base}/portfolio`)}
      >
        <img src={a.portfolio} alt="" width={26} height={26} />
        PORTFOLIO
      </button>
      <button
        type="button"
        className={`gc-navItem${active === 'leaderboard' ? ' gc-navItem--active' : ''}`}
        onClick={() => navigate(`${base}/leaderboard`)}
      >
        <img src={a.leaderboard} alt="" width={26} height={26} />
        LEADERBOARD
      </button>
    </nav>
  )
}
