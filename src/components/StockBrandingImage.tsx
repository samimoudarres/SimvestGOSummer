import { ApiImage } from './ApiImage'

type Props = {
  src: string | null | undefined
  className?: string
  alt?: string
  width?: number
  height?: number
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'auto' | 'sync'
}

/** Company/crypto logo from `/api/stocks/.../branding-icon` — no profile-avatar fallback. */
export function StockBrandingImage({ src, alt = '', className, width, height, loading, decoding }: Props) {
  return (
    <ApiImage
      className={className}
      src={src ?? undefined}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
    />
  )
}
