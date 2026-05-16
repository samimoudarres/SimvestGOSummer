import { GAME_SLUG } from './challenge/gameMeta'

/** Stable routes for game shells — use `slug` when persisting games from the API later. */
export const gamePaths = {
  createGame: '/create-game',
  /** Step 1+ of the create-game wizard (persists to `new` template slug). */
  createGameWizard: '/create-game/setup',
  /** Step 2 — theme / load-in screen customization. */
  createGameTheme: '/create-game/theme',
  /** After publishing: per-game username + photo (same persistence as join profile setup). */
  createGameHostProfile: '/create-game/your-in-game-profile',
  join: '/join',
  joinWelcome: (code: string) => `/join/welcome?code=${encodeURIComponent(code)}`,
  joinProfileSetup: (code: string) => `/join/profile-setup?code=${encodeURIComponent(code)}`,
  nov2024StockChallenge: `/g/${GAME_SLUG.nov2024}`,
  newGameTemplate: `/g/${GAME_SLUG.newTemplate}`,
  perform: (slug: string) => `/g/${slug}/perform`,
  profile: (slug: string, userId: string) => `/g/${slug}/profile/${encodeURIComponent(userId)}`,
} as const
