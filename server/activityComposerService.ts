import { getRuntimeRules } from './gameRuntimeRulesService'
import { fetchPlayerGameProfile } from './profilePerformService'
import { normalizeGameSlugParam } from './gameSlugNormalize'
import { listParticipationSlugsForUser } from './userParticipationSlugs'
import { getSetupProfileForUserGame } from './userSetupProfileService'
import { ensureUserProfileRecord } from './userProfileService'
import { resolveProfileAvatarUrl } from '../src/user/resolveProfileAvatarUrl.ts'

export async function resolvePostingGameSlugForUser(
  userId: string,
  hintRaw?: string | null,
): Promise<string> {
  const hint =
    typeof hintRaw === 'string' && hintRaw.trim().length > 0
      ? normalizeGameSlugParam(hintRaw.trim())
      : ''
  if (!userId || userId.length < 8) return hint

  const joined = new Set<string>()
  for (const s of await listParticipationSlugsForUser(userId)) {
    const t = normalizeGameSlugParam(s)
    if (t) joined.add(t)
  }

  if (hint) {
    if (joined.has(hint)) return hint
    const rules = await getRuntimeRules(hint)
    if (rules?.hostUserId === userId) return hint
    return hint
  }

  const joinedArr = [...joined].sort((a, b) => a.localeCompare(b))
  if (joinedArr.length > 0) return joinedArr[joinedArr.length - 1]!
  return ''
}

export type ComposerContextDto = {
  userId: string
  displayName: string
  avatarUrl: string
  gameSlug: string
}

export async function getComposerContextForUser(
  userId: string,
  gameSlugHint?: string | null,
): Promise<ComposerContextDto | null> {
  const slug = await resolvePostingGameSlugForUser(userId, gameSlugHint)
  if (!slug) return null
  const live = await fetchPlayerGameProfile(slug, userId)
  if (live) {
    return {
      userId: live.profile.userId,
      displayName: live.profile.displayName,
      avatarUrl: resolveProfileAvatarUrl(live.profile.avatarUrl),
      gameSlug: slug,
    }
  }
  const setup = await getSetupProfileForUserGame(userId, slug)
  const base = await ensureUserProfileRecord(userId)
  const displayName = setup ? `${setup.firstName} ${setup.lastName}`.trim() : base.displayName
  const avatarUrl = resolveProfileAvatarUrl(setup?.avatarUrl ?? base.avatarUrl)
  return { userId, displayName, avatarUrl, gameSlug: slug }
}
