export type JoinSetupProfileRecord = {
  userId: string
  gameSlug: string
  firstName: string
  lastName: string
  username: string
  phone: string | null
  email: string | null
  avatarUrl: string
  updatedAtIso: string
}

export type JoinSetupFieldError = {
  /* Backend can still emit any of these — we keep the union as-is so we
   * surface validation feedback for derived fields (e.g. a stale account
   * with a malformed email). The active form, however, only renders the
   * `username` / `avatarUrl` errors directly; the rest fall through to
   * the generic top error banner. */
  field:
    | 'firstName'
    | 'lastName'
    | 'username'
    | 'phone'
    | 'email'
    | 'password'
    | 'contact'
    | 'avatarUrl'
    | 'gameSlug'
  message: string
}

export type JoinSetupSaveResponse = {
  ok: true
  pendingApproval?: boolean
  profile: {
    userId: string
    gameSlug: string
    displayName: string
    username: string
    avatarUrl: string
  }
}

/**
 * What the join-setup form actually collects per game.
 *
 * Trimmed from the legacy "everything-about-you" shape — name, contact, and
 * password are now pulled from the user's logged-in Simvest account on the
 * server side, so the user doesn't have to re-enter them per game.
 */
export type JoinSetupDraftInput = {
  username: string
  avatarUrl: string
  /** When true, server stores the shared default silhouette for this game. */
  useDefaultGameAvatar?: boolean
}
