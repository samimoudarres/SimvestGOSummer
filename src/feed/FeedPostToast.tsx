import { createPortal } from 'react-dom'

/** Centered viewport toast — avoids `position:fixed` clipping inside scroll/transform parents. */
export function FeedPostToast({ message }: { message: string }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fp-toast" role="status" aria-live="polite">
      {message}
    </div>,
    document.body,
  )
}
