import type { GameFeedPostRow } from '../challenge/useGameFeed'
import { plainTextFromRichSegments } from './richSegmentsPlain'

/** Clipboard-friendly summary for feed posts (trade / text / poll). */
export function formatFeedPostShareText(post: GameFeedPostRow): string {
  const kind = post.postKind === 'poll' ? 'poll' : post.postKind === 'text' ? 'text' : 'trade'
  const lines: string[] = []

  lines.push(`${post.author} · ${post.timestamp}`)

  if (kind === 'trade') {
    lines.push(post.tradeTitle.trim())
    const sym = (post.tickerSymbol || '').replace(/\s+/g, '').toUpperCase()
    if (sym) lines.push(`Ticker: ${sym}`)
    const sharesLabel = post.side === 'sell' ? 'Shares sold' : 'Shares bought'
    lines.push(`${sharesLabel}: ${post.sharesBought}`)
    const rat = post.rationale.trim()
    if (rat) lines.push(`Rationale: ${rat}`)
  } else if (kind === 'poll' && post.poll?.question) {
    lines.push(`Poll: ${post.poll.question}`)
  } else {
    const rich = plainTextFromRichSegments(post.richSegments).trim()
    const rat = post.rationale.trim()
    if (rich) lines.push(rich)
    else if (rat) lines.push(rat)
  }

  return lines.filter((x) => x.length > 0).join('\n')
}
