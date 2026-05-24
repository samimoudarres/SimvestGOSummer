import { ProfileAvatar } from '../components/ProfileAvatar'
import type { PublicGameItem } from './publicGamesTypes'
import './publicGameCard.css'

type Props = {
  game: PublicGameItem
  onSelect: (joinCode: string) => void
}

export function PublicGameCard({ game, onSelect }: Props) {
  const { theme } = game
  const joinColor = theme.joinButtonColor

  return (
    <button
      type="button"
      className="pgc-card"
      aria-label={`Join ${game.title}`}
      onClick={() => onSelect(game.joinCode)}
    >
      <div
        className="pgc-card__bg"
        style={{
          backgroundImage: `linear-gradient(${theme.gradientAngleDeg}deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        }}
        aria-hidden
      />
      {game.loadScreenEmoji ? (
        <span className="pgc-card__wm" aria-hidden>
          {game.loadScreenEmoji}
        </span>
      ) : null}
      <div className="pgc-card__inner">
        <h2 className="pgc-card__title">{game.title}</h2>
        {game.hostedByLine ? <p className="pgc-card__host">{game.hostedByLine}</p> : null}
        <div className="pgc-card__spacer" aria-hidden />
        <div className="pgc-card__foot">
          <div className="pgc-card__roster">
            {game.memberAvatars.length > 0 ? (
              <ul className="pgc-card__avatars" aria-hidden>
                {game.memberAvatars.map((m) => (
                  <li key={m.userId}>
                    <ProfileAvatar className="pgc-card__avatar" url={m.avatarUrl} alt="" />
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="pgc-card__names">{game.membersLine}</p>
          </div>
          <span className="pgc-card__join" style={{ color: joinColor }}>
            <span className="pgc-card__joinPlus" style={{ color: joinColor }}>
              +
            </span>
            Join
          </span>
        </div>
      </div>
    </button>
  )
}
