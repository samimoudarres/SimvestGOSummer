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

export type JoinSetupDraftInput = {
  firstName: string
  lastName: string
  username: string
  phone: string
  email: string
  password: string
  avatarUrl: string
}

