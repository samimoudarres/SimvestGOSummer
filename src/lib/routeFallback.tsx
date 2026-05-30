/** Minimal placeholder while a lazy route chunk loads — avoids blank flash. */
export function RouteFallback() {
  return (
    <main
      aria-busy="true"
      style={{
        minHeight: '100dvh',
        background: '#07406a',
      }}
    />
  )
}
