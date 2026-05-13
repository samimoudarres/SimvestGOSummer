import { useCallback, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import type { FeedPollPayload, HydratedPollOption } from './richTextTypes'

type Props = {
  postId: string
  gameSlug: string
  poll: FeedPollPayload
  onVoted?: () => void
}

export function FeedPollCard({ postId, gameSlug, poll, onVoted }: Props) {
  const [options, setOptions] = useState<HydratedPollOption[]>(poll.options)
  const [myVote, setMyVote] = useState<string | null>(poll.myVoteId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const total = options.reduce((a, o) => a + o.count, 0)

  const vote = useCallback(
    async (optionId: string) => {
      if (myVote) return
      setBusyId(optionId)
      setErr(null)
      try {
        const res = await simvestFetch(
          `/api/games/${encodeURIComponent(gameSlug)}/feed/posts/${encodeURIComponent(postId)}/poll/vote`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ optionId }),
          },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setErr(typeof body?.error === 'string' ? body.error : 'Could not record vote')
          setBusyId(null)
          return
        }
        const tallies = body.tallies as Record<string, number> | undefined
        if (tallies && typeof tallies === 'object') {
          setOptions((prev) =>
            prev.map((o) => ({ ...o, count: typeof tallies[o.id] === 'number' ? tallies[o.id]! : o.count })),
          )
        }
        setMyVote(optionId)
        onVoted?.()
      } catch {
        setErr('Network error')
      } finally {
        setBusyId(null)
      }
    },
    [gameSlug, postId, myVote, onVoted],
  )

  return (
    <div className="feedPollCard">
      <p className="feedPollCard__q">{poll.question}</p>
      <ul className="feedPollCard__opts" role="list">
        {options.map((o) => {
          const pct = total > 0 ? Math.round((o.count / total) * 100) : 0
          const selected = myVote === o.id
          return (
            <li key={o.id} className="feedPollCard__li">
              <button
                type="button"
                className={`feedPollCard__opt${selected ? ' feedPollCard__opt--mine' : ''}`}
                disabled={!!myVote || busyId !== null}
                onClick={() => void vote(o.id)}
              >
                <span className="feedPollCard__label">{o.label}</span>
                <span className="feedPollCard__meta">
                  {o.count} vote{o.count === 1 ? '' : 's'}
                  {total > 0 ? ` · ${pct}%` : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {myVote ? <p className="feedPollCard__thanks">Thanks for voting.</p> : null}
      {err ? <p className="feedPollCard__err">{err}</p> : null}
    </div>
  )
}
