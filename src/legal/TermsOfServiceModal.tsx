import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { publicAssetUrl } from '../util/publicAssetUrl'
import './privacyPolicyModal.css'

/** Cached so reopening the modal does not refetch. */
let tosCache: string | null = null
let tosLoadPromise: Promise<string> | null = null

function termsDocumentUrl(): string {
  return publicAssetUrl('legal/terms-of-service.txt')
}

async function loadTermsOfServiceText(): Promise<string> {
  if (tosCache) return tosCache
  if (!tosLoadPromise) {
    tosLoadPromise = fetch(termsDocumentUrl())
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((t) => {
        tosCache = t
        return t
      })
      .catch((e) => {
        tosLoadPromise = null
        throw e
      })
  }
  return tosLoadPromise
}

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Full-screen overlay with scrollable terms of service (served from `public/legal/terms-of-service.txt`).
 */
export function TermsOfServiceModal({ open, onClose }: Props) {
  const [text, setText] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoadError(null)
    if (tosCache) {
      setText(tosCache)
      return
    }
    setText(null)
    let cancelled = false
    void loadTermsOfServiceText()
      .then((t) => {
        if (!cancelled) setText(t)
      })
      .catch(() => {
        if (!cancelled)
          setLoadError('Could not load the terms of service. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  const onBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  if (!open) return null

  return createPortal(
    <div
      className="pp-modalBackdrop"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className="pp-modalShell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tos-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pp-modalHeader">
          <button type="button" className="pp-modalClose" aria-label="Close terms of service" onClick={onClose}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h1 id="tos-modal-title" className="pp-modalTitle">
            Terms of Service
          </h1>
          <span className="pp-modalHeaderSpacer" aria-hidden />
        </header>

        <div className="pp-modalBody">
          {loadError ? (
            <p className="pp-modalError" role="alert">
              {loadError}
            </p>
          ) : text == null ? (
            <p className="pp-modalLoading">Loading…</p>
          ) : (
            <pre className="pp-modalPre">{text}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
