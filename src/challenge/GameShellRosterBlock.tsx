import { challengeAssets as a } from './challengeAssets'
import { resolveProfileAvatarUrl } from '../user/resolveProfileAvatarUrl'
import type { GameMemberPreview } from './useGameMembersPreview'

type RosterStatus = 'idle' | 'loading' | 'ready' | 'error'

export type GameShellRosterBlockProps = {
  shellIsLive: boolean
  rosterStatus: RosterStatus
  rosterMembers: GameMemberPreview[]
  totalPlayers: number
  onInviteClick: () => void
  /** When set, face buttons open profile; otherwise avatars are non-interactive (sub-tabs). */
  onMemberProfileClick?: (userId: string) => void
}

export function GameShellRosterBlock({
  shellIsLive,
  rosterStatus,
  rosterMembers,
  totalPlayers,
  onInviteClick,
  onMemberProfileClick,
}: GameShellRosterBlockProps) {
  const interactive = typeof onMemberProfileClick === 'function'

  return (
    <>
      <div className="gc-peopleRow">
        {!shellIsLive ? (
          <>
            <div
              className="gc-avatarSm gc-avatarHost"
              style={{
                background: '#e8e8e8',
                border: '2px dashed #cfcfcf',
              }}
              aria-hidden
            />
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="gc-avatarSm"
                style={{
                  background: '#ececec',
                  border: '2px dashed #d8d8d8',
                }}
                aria-hidden
              />
            ))}
          </>
        ) : rosterStatus === 'loading' || rosterStatus === 'idle' ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="gc-avatarSm"
                style={{
                  background: '#ececec',
                  border: '2px dashed #d8d8d8',
                }}
                aria-hidden
              />
            ))}
          </>
        ) : rosterMembers.length === 0 ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="gc-avatarSm"
                style={{
                  background: '#f4f4f4',
                  border: '2px solid #e4e4e4',
                }}
                aria-hidden
              />
            ))}
          </>
        ) : (
          <>
            {rosterMembers.slice(0, 5).map((m, i) => {
              const face = (
                <img
                  src={resolveProfileAvatarUrl(m.avatarUrl)}
                  alt=""
                  width={i === 0 ? 36 : 35}
                  height={36}
                />
              )
              if (interactive) {
                return (
                  <button
                    key={m.userId}
                    type="button"
                    className={i === 0 ? 'gc-avatarHost gc-rosterFace' : 'gc-avatarSm gc-rosterFace'}
                    aria-label={`Open profile: ${m.displayName}`}
                    onClick={() => onMemberProfileClick!(m.userId)}
                  >
                    {face}
                  </button>
                )
              }
              return (
                <span
                  key={m.userId}
                  className={i === 0 ? 'gc-avatarHost gc-rosterFace' : 'gc-avatarSm gc-rosterFace'}
                  aria-hidden
                >
                  {face}
                </span>
              )
            })}
          </>
        )}
        <button type="button" className="gc-invitePill" onClick={onInviteClick}>
          <img src={a.plusIcon} alt="" />
          <span>Invite</span>
        </button>
      </div>
      {!shellIsLive ? (
        <p className="gc-names">
          <strong className="gc-muted">Players you invite will appear here.</strong>
        </p>
      ) : rosterStatus === 'loading' || rosterStatus === 'idle' ? (
        <p className="gc-names">
          <span className="gc-muted">Loading players…</span>
        </p>
      ) : totalPlayers <= 0 ? (
        <p className="gc-names">
          <strong className="gc-muted">No players yet — tap Invite to share your join code.</strong>
        </p>
      ) : (
        <p className="gc-names">
          {rosterMembers[0] ? (
            <>
              <strong>{rosterMembers[0].displayName || 'Player'}</strong>
              {totalPlayers >= 2 && rosterMembers[1] ? (
                <>
                  <span className="gc-muted">, </span>
                  <strong>{rosterMembers[1].displayName || 'Player'}</strong>
                </>
              ) : null}
              {totalPlayers >= 3 && rosterMembers[2] ? (
                <>
                  <span className="gc-muted">, </span>
                  <strong>{rosterMembers[2].displayName || 'Player'}</strong>
                </>
              ) : null}
              {totalPlayers > 3 ? (
                <>
                  <span className="gc-muted">, and </span>
                  <strong>
                    {totalPlayers - 3} other{totalPlayers - 3 === 1 ? '' : 's'}
                  </strong>
                </>
              ) : null}
            </>
          ) : (
            <strong className="gc-muted">
              {totalPlayers} player{totalPlayers === 1 ? '' : 's'} in this game
            </strong>
          )}
        </p>
      )}
    </>
  )
}
