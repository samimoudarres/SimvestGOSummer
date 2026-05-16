import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { apiAssetSrc, isCapacitorShell } from '../config/apiAssetSrc'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  src: string | null | undefined
}

/**
 * Renders API-hosted images on native: `<img src="http://…/api/…">` is blocked as mixed
 * content inside the HTTPS Capacitor WebView, but `fetch` works — we show a blob URL instead.
 */
export function ApiImage({ src, alt = '', ...rest }: Props) {
  const resolved = apiAssetSrc(src)
  const [displaySrc, setDisplaySrc] = useState(resolved)

  useEffect(() => {
    if (!resolved) {
      setDisplaySrc('')
      return
    }

    const needsFetch =
      isCapacitorShell() &&
      /^https?:\/\//i.test(resolved) &&
      /\/api\//i.test(resolved)

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
        if (!cancelled) setDisplaySrc(resolved)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [resolved])

  if (!displaySrc) return null
  return <img {...rest} src={displaySrc} alt={alt} />
}
