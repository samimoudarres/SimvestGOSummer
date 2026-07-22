/**
 * Stack of sheet/overlay close handlers for Android hardware back.
 * Last registered (topmost sheet) wins.
 */
const stack: Array<() => void> = []

export function pushSheetBackHandler(close: () => void): () => void {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** @returns true if a sheet handled the back press */
export function tryCloseTopSheet(): boolean {
  const close = stack[stack.length - 1]
  if (!close) return false
  close()
  return true
}
