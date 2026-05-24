import { ApiImage } from './ApiImage'
import {
  DEFAULT_PROFILE_AVATAR_URL,
  resolveProfileAvatarUrl,
} from '../user/resolveProfileAvatarUrl'

const PROFILE_FALLBACK = DEFAULT_PROFILE_AVATAR_URL

type Props = {
  url: string | null | undefined
  alt?: string
  className?: string
  width?: number
  height?: number
}

/** Profile photo with grey default fallback — safe for data URLs and `/api` paths. */
export function ProfileAvatar({ url, alt = '', className, width, height }: Props) {
  return (
    <ApiImage
      className={className}
      src={resolveProfileAvatarUrl(url)}
      alt={alt}
      width={width}
      height={height}
      fallbackSrc={PROFILE_FALLBACK}
    />
  )
}
