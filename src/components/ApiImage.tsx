import { useCallback, useEffect, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { apiAssetSrc, isCapacitorShell } from '../config/apiAssetSrc'

const DEFAULT_FALLBACK = '/figma-assets/blank-avatar.svg'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  src: string | null | undefined
  /** Shown when the primary `src` fails to load (404, network, empty blob). */
  fallbackSrc?: string
}

/**
 * Renders API-hosted images on native: `<img src="http://…/api/…">` is blocked as mixed
 * content inside the HTTPS Capacitor WebView, but `fetch` works — we show a blob URL instead.
 * Static `/figma-assets/...` paths are resolved via `apiAssetSrc` for Capacitor `base: './'`.
 */
export function ApiImage({ src, alt = '', fallbackSrc, onError, ...rest }: Props) {
  const resolved = apiAssetSrc(src)
  const fallback = apiAssetSrc(fallbackSrc ?? DEFAULT_FALLBACK)
  const [displaySrc, setDisplaySrc] = useState(resolved)
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    setUsingFallback(false)
    if (!resolved) {
      setDisplaySrc(fallback)
      setUsingFallback(true)
      return
    }

    const needsFetch =
      /\/api\//i.test(resolved) &&
      (/^https?:\/\//i.test(resolved) || (isCapacitorShell() && resolved.startsWith('http')))

    if (!needsFetch) {
      setDisplaySrc(resolved)
      return
    }

    let cancelled = false
    let objectUrl = ''

    void (async () => {
      try {
        const resp = await simvestFetch(resolved, { method: 'GET' })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const blob = await resp.blob()
        if (blob.size < 1) throw new Error('empty')
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setDisplaySrc(objectUrl)
      } catch {
        if (!cancelled) {
          setDisplaySrc(fallback)
          setUsingFallback(true)
        }
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [resolved, fallback])

  const handleError = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      if (!usingFallback && fallback && displaySrc !== fallback) {
        setDisplaySrc(fallback)
        setUsingFallback(true)
      }
      onError?.(e)
    },
    [usingFallback, fallback, displaySrc, onError],
  )

  if (!displaySrc) return null
  return <img {...rest} src={displaySrc} alt={alt} onError={handleError} />
}
