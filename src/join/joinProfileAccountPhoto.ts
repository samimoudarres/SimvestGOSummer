import { DEFAULT_PROFILE_AVATAR_URL, isPlaceholderProfileAvatarUrl } from '../user/resolveProfileAvatarUrl'

/** Map account settings avatar into join-profile draft state (empty = show upload prompt). */
export function accountPhotoForJoinDraft(url: string | undefined): string {
  const t = typeof url === 'string' ? url.trim() : ''
  if (!t) return ''
  if (t === DEFAULT_PROFILE_AVATAR_URL) return ''
  if (isPlaceholderProfileAvatarUrl(t)) return ''
  return t
}
