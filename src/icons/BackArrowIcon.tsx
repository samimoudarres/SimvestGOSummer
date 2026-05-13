/** Left-pointing back chevron (matches `public/figma-assets/challenge/arrow-back.svg`). */
export function BackArrowIcon({
  className,
  width = 18,
  height = 14,
  stroke = 'currentColor',
}: {
  className?: string
  /** Renders at ~18×14 by default to match join-flow headers */
  width?: number
  height?: number
  stroke?: string
}) {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 20 16"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19 8L1 8M7 1L1 8L7 15"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
