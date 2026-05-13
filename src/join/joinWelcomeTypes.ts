export type JoinWelcomePrizeDto = {
  rank: number
  label: string
  amountFormatted: string
}

export type JoinWelcomeThemeDto = {
  welcomeGradientAngleDeg: number
  welcomeGradientFrom: string
  welcomeGradientTo: string
  joinButtonColor: string
  joinButtonBorderColor: string
  prizeAmountColor: string
  titleTextShadow?: string
  backArrowColor?: string
}

export type JoinWelcomePayload = {
  gameSlug: string
  joinCode: string
  displayTitle: string
  welcomeTagline: string
  timelineIso?: {
    start?: string | null
    end?: string | null
  }
  timelineDetailLines: string[]
  buyInLine: string
  prizes: JoinWelcomePrizeDto[]
  prizePoolNote: string
  playerCount: number
  playerJoinLine: string
  theme: JoinWelcomeThemeDto
  welcomeCustomization: Record<string, unknown>
  /** From server: private games require host approval after profile setup. */
  joinPolicy?: 'open' | 'approval_required'
  /** When false, hide buy-in line and prize card block (template / free games). */
  showWelcomeEconomics?: boolean
  hostedByLine?: string | null
  /** When set, replaces maple-leaf decor from customization. */
  loadScreenDecorEmoji?: string | null
}
