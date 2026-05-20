import { apiAssetSrc } from '../config/apiAssetSrc'

/** Grey default silhouette (matches Settings + server `DEFAULT_AVATAR`). */
export const DEFAULT_PROFILE_AVATAR_URL = '/figma-assets/blank-avatar.svg'

/**
 * Figma “shell” raster faces used before real roster data loads — must never be treated as the
 * signed-in user’s profile photo in UI or persisted profile.
 */
const PLACEHOLDER_CHALLENGE_AVATAR =
  /^\/figma-assets\/challenge\/(composer-avatar|feed-avatar|avatar-host|avatar-[a-z])\.png$/i

/** Safe `src` for `<img>`: real URL/data URL, or the grey default. */
export function resolveProfileAvatarUrl(raw: string | null | undefined): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return apiAssetSrc(DEFAULT_PROFILE_AVATAR_URL)
  if (PLACEHOLDER_CHALLENGE_AVATAR.test(t)) return apiAssetSrc(DEFAULT_PROFILE_AVATAR_URL)
  return apiAssetSrc(t)
}

/** True when this value is a known decorative face asset (not user content). */
export function isPlaceholderProfileAvatarUrl(raw: string | null | undefined): boolean {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return false
  return PLACEHOLDER_CHALLENGE_AVATAR.test(t)
}
