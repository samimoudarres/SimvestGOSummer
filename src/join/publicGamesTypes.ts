export type PublicGameTheme = {
  gradientFrom: string
  gradientTo: string
  gradientAngleDeg: number
  joinButtonColor: string
  joinButtonBorderColor: string
}

export type PublicGameMemberPreview = {
  userId: string
  displayName: string
  avatarUrl: string
}

export type PublicGameItem = {
  slug: string
  joinCode: string
  title: string
  hostedByLine: string | null
  playerCount: number
  membersLine: string
  memberAvatars: PublicGameMemberPreview[]
  rulesSummary: string
  durationLine: string
  startsAtIso: string | null
  endsAtIso: string | null
  theme: PublicGameTheme
  loadScreenEmoji: string | null
  searchText: string
  /** Present on suggested-games API only. */
  playerLine?: string
}
