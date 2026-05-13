export type RichTextSegment =
  | { type: 'text'; text: string }
  | { type: 'ticker'; symbol: string; label: string }

export type HydratedPollOption = { id: string; label: string; count: number }

export type FeedPollPayload = {
  question: string
  options: HydratedPollOption[]
  myVoteId: string | null
}
