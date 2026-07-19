/**
 * Renders API-hosted images on native: `<img src="http://…/api/…">` is blocked as mixed
 * content inside the HTTPS Capacitor WebView, but `fetch` works — we show a blob URL instead.
 * Static `/figma-assets/...` paths are resolved via `apiAssetSrc` for Capacitor `base: './'`.
 */
import { useCallback, useEffect, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { apiAssetSrc, isCapacitorShell } from '../config/apiAssetSrc'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  src: string | null | undefined
  /** When set, shown if the primary `src` fails (profile photos only — not stock logos). */
  fallbackSrc?: string
}

const BLOB_LRU_MAX = 48

/** Reuse Capacitor blob URLs across remounts (browser uses plain URLs — no blob fetch). */
const blobByResolved = new Map<string, string>()
const blobInflight = new Map<string, Promise<string>>()
const blobLru: string[] = []

function touchBlobLru(resolved: string): void {
  const i = blobLru.indexOf(resolved)
  if (i >= 0) blobLru.splice(i, 1)
  blobLru.push(resolved)
  while (blobLru.length > BLOB_LRU_MAX) {
    const oldest = blobLru.shift()
    if (!oldest) break
    const url = blobByResolved.get(oldest)
    if (url) {
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* ignore */
      }
      blobByResolved.delete(oldest)
    }
  }
}

function blobForApiUrl(resolved: string): Promise<string> {
  const hit = blobByResolved.get(resolved)
  if (hit) {
    touchBlobLru(resolved)
    return Promise.resolve(hit)
  }
  const pending = blobInflight.get(resolved)
  if (pending) return pending
  const work = (async () => {
    const resp = await simvestFetch(resolved, { method: 'GET' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    if (blob.size < 1) throw new Error('empty')
    const objectUrl = URL.createObjectURL(blob)
    blobByResolved.set(resolved, objectUrl)
    touchBlobLru(resolved)
    return objectUrl
  })().finally(() => blobInflight.delete(resolved))
  blobInflight.set(resolved, work)
  return work
}

export function ApiImage({ src, alt = '', fallbackSrc, onError, ...rest }: Props) {
  const resolved = apiAssetSrc(src)
  const fallback = fallbackSrc != null ? apiAssetSrc(fallbackSrc) : ''
  const [displaySrc, setDisplaySrc] = useState(() => {
    if (!resolved) return fallback || ''
    return blobByResolved.get(resolved) || resolved
  })
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    setUsingFallback(false)
    if (!resolved) {
      setDisplaySrc(fallback || '')
      setUsingFallback(Boolean(fallback))
      return
    }

    const needsBlob =
      isCapacitorShell() &&
      /\/api\//i.test(resolved) &&
      /^https?:\/\//i.test(resolved)

    if (!needsBlob) {
      setDisplaySrc(resolved)
      return
    }

    const cached = blobByResolved.get(resolved)
    if (cached) {
      touchBlobLru(resolved)
      setDisplaySrc(cached)
      return
    }

    let cancelled = false
    void blobForApiUrl(resolved)
      .then((objectUrl) => {
        if (!cancelled) setDisplaySrc(objectUrl)
      })
      .catch(() => {
        if (!cancelled) {
          if (fallback) {
            setDisplaySrc(fallback)
            setUsingFallback(true)
          } else {
            setDisplaySrc(resolved)
          }
        }
      })

    return () => {
      cancelled = true
    }
  }, [resolved, fallback])

  const handleError = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      if (fallback && !usingFallback && displaySrc !== fallback) {
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
