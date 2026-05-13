/** Canonical palette ids persisted on `GameRuntimeRules.themePaletteId`. */
export const THEME_PALETTE_IDS = [
  'amber_glow',
  'ocean_deep',
  'violet_night',
  'emerald_bank',
  'rose_sunset',
  'slate_steel',
  'crimson_pulse',
  'teal_reef',
  'royal_indigo',
  'sand_dune',
] as const

export type ThemePaletteId = (typeof THEME_PALETTE_IDS)[number]

export const LOAD_SCREEN_ICON_IDS = [
  'leaf',
  'sprout',
  'chart',
  'rocket',
  'gem',
  'bolt',
  'coin',
  'trophy',
  'star',
  'fire',
] as const

export type LoadScreenIconId = (typeof LOAD_SCREEN_ICON_IDS)[number]

export function isThemePaletteId(s: string): s is ThemePaletteId {
  return (THEME_PALETTE_IDS as readonly string[]).includes(s)
}

export function isLoadScreenIconId(s: string): s is LoadScreenIconId {
  return (LOAD_SCREEN_ICON_IDS as readonly string[]).includes(s)
}

/** Emoji shown on welcome + theme editor preview (single decorative layer). */
export function decorEmojiForIcon(id: LoadScreenIconId): string {
  const m: Record<LoadScreenIconId, string> = {
    leaf: '🍁',
    sprout: '🌿',
    chart: '📈',
    rocket: '🚀',
    gem: '💎',
    bolt: '⚡',
    coin: '🪙',
    trophy: '🏆',
    star: '✨',
    fire: '🔥',
  }
  return m[id]
}

/** Welcome screen linear gradient + accents (matches JoinWelcomeThemeDto fields). */
export type WelcomeChromeFromPalette = {
  welcomeGradientAngleDeg: number
  welcomeGradientFrom: string
  welcomeGradientTo: string
  joinButtonColor: string
  joinButtonBorderColor: string
  prizeAmountColor: string
  titleTextShadow?: string
  backArrowColor?: string
}

export type ChallengeChromeVars = {
  /** Header band: 3-stop vertical gradient */
  '--sv-chrome-h1': string
  '--sv-chrome-h2': string
  '--sv-chrome-h3': string
  /** Trade / stock top bar: 3-stop */
  '--sv-chrome-bar1': string
  '--sv-chrome-bar2': string
  '--sv-chrome-bar3': string
  /** Horizontal accent (section titles etc.) */
  '--sv-chrome-accent-a': string
  '--sv-chrome-accent-b': string
}

type PaletteDef = {
  welcome: WelcomeChromeFromPalette
  challenge: ChallengeChromeVars
}

const PALETTES: Record<ThemePaletteId, PaletteDef> = {
  amber_glow: {
    welcome: {
      welcomeGradientAngleDeg: 141.75,
      welcomeGradientFrom: '#f7b104',
      welcomeGradientTo: '#9c5a02',
      joinButtonColor: '#0fae37',
      joinButtonBorderColor: '#0fae37',
      prizeAmountColor: '#0fae37',
      titleTextShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#f7b104',
      '--sv-chrome-h2': '#f7b104',
      '--sv-chrome-h3': '#965402',
      '--sv-chrome-bar1': '#f7b104',
      '--sv-chrome-bar2': '#c98503',
      '--sv-chrome-bar3': '#9f5d02',
      '--sv-chrome-accent-a': '#f7b104',
      '--sv-chrome-accent-b': '#965402',
    },
  },
  ocean_deep: {
    welcome: {
      welcomeGradientAngleDeg: 145,
      welcomeGradientFrom: '#1fb6ff',
      welcomeGradientTo: '#064a8a',
      joinButtonColor: '#0b84c9',
      joinButtonBorderColor: '#053d66',
      prizeAmountColor: '#12c97a',
      titleTextShadow: '0 0 12px rgba(255, 255, 255, 0.55)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#2ec5ff',
      '--sv-chrome-h2': '#1a8fe0',
      '--sv-chrome-h3': '#0a4a7a',
      '--sv-chrome-bar1': '#38b8ff',
      '--sv-chrome-bar2': '#1f7fd4',
      '--sv-chrome-bar3': '#0c3f6e',
      '--sv-chrome-accent-a': '#2ec5ff',
      '--sv-chrome-accent-b': '#0a4a7a',
    },
  },
  violet_night: {
    welcome: {
      welcomeGradientAngleDeg: 138,
      welcomeGradientFrom: '#b56bff',
      welcomeGradientTo: '#3a0f6b',
      joinButtonColor: '#7c3aed',
      joinButtonBorderColor: '#4c1d95',
      prizeAmountColor: '#c4b5fd',
      titleTextShadow: '0 0 14px rgba(255, 255, 255, 0.45)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#c084fc',
      '--sv-chrome-h2': '#7c3aed',
      '--sv-chrome-h3': '#4c1d95',
      '--sv-chrome-bar1': '#d8b4fe',
      '--sv-chrome-bar2': '#9333ea',
      '--sv-chrome-bar3': '#581c87',
      '--sv-chrome-accent-a': '#c084fc',
      '--sv-chrome-accent-b': '#4c1d95',
    },
  },
  emerald_bank: {
    welcome: {
      welcomeGradientAngleDeg: 135,
      welcomeGradientFrom: '#34d399',
      welcomeGradientTo: '#065f46',
      joinButtonColor: '#059669',
      joinButtonBorderColor: '#047857',
      prizeAmountColor: '#a7f3d0',
      titleTextShadow: '0 0 12px rgba(255, 255, 255, 0.4)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#4ade80',
      '--sv-chrome-h2': '#16a34a',
      '--sv-chrome-h3': '#14532d',
      '--sv-chrome-bar1': '#6ee7b7',
      '--sv-chrome-bar2': '#22c55e',
      '--sv-chrome-bar3': '#166534',
      '--sv-chrome-accent-a': '#4ade80',
      '--sv-chrome-accent-b': '#14532d',
    },
  },
  rose_sunset: {
    welcome: {
      welcomeGradientAngleDeg: 132,
      welcomeGradientFrom: '#fb7185',
      welcomeGradientTo: '#9f1239',
      joinButtonColor: '#e11d48',
      joinButtonBorderColor: '#881337',
      prizeAmountColor: '#fecdd3',
      titleTextShadow: '0 0 12px rgba(255, 255, 255, 0.5)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#fb7185',
      '--sv-chrome-h2': '#f43f5e',
      '--sv-chrome-h3': '#9f1239',
      '--sv-chrome-bar1': '#fda4af',
      '--sv-chrome-bar2': '#e11d48',
      '--sv-chrome-bar3': '#881337',
      '--sv-chrome-accent-a': '#fb7185',
      '--sv-chrome-accent-b': '#9f1239',
    },
  },
  slate_steel: {
    welcome: {
      welcomeGradientAngleDeg: 140,
      welcomeGradientFrom: '#94a3b8',
      welcomeGradientTo: '#1e293b',
      joinButtonColor: '#475569',
      joinButtonBorderColor: '#334155',
      prizeAmountColor: '#e2e8f0',
      titleTextShadow: '0 0 10px rgba(255, 255, 255, 0.35)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#94a3b8',
      '--sv-chrome-h2': '#64748b',
      '--sv-chrome-h3': '#1e293b',
      '--sv-chrome-bar1': '#cbd5e1',
      '--sv-chrome-bar2': '#64748b',
      '--sv-chrome-bar3': '#0f172a',
      '--sv-chrome-accent-a': '#94a3b8',
      '--sv-chrome-accent-b': '#1e293b',
    },
  },
  crimson_pulse: {
    welcome: {
      welcomeGradientAngleDeg: 136,
      welcomeGradientFrom: '#f87171',
      welcomeGradientTo: '#7f1d1d',
      joinButtonColor: '#dc2626',
      joinButtonBorderColor: '#991b1b',
      prizeAmountColor: '#fecaca',
      titleTextShadow: '0 0 12px rgba(255, 255, 255, 0.45)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#f87171',
      '--sv-chrome-h2': '#ef4444',
      '--sv-chrome-h3': '#7f1d1d',
      '--sv-chrome-bar1': '#fca5a5',
      '--sv-chrome-bar2': '#dc2626',
      '--sv-chrome-bar3': '#7f1d1d',
      '--sv-chrome-accent-a': '#f87171',
      '--sv-chrome-accent-b': '#7f1d1d',
    },
  },
  teal_reef: {
    welcome: {
      welcomeGradientAngleDeg: 142,
      welcomeGradientFrom: '#2dd4bf',
      welcomeGradientTo: '#115e59',
      joinButtonColor: '#0d9488',
      joinButtonBorderColor: '#0f766e',
      prizeAmountColor: '#ccfbf1',
      titleTextShadow: '0 0 12px rgba(255, 255, 255, 0.45)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#5eead4',
      '--sv-chrome-h2': '#14b8a6',
      '--sv-chrome-h3': '#134e4a',
      '--sv-chrome-bar1': '#99f6e4',
      '--sv-chrome-bar2': '#0d9488',
      '--sv-chrome-bar3': '#115e59',
      '--sv-chrome-accent-a': '#2dd4bf',
      '--sv-chrome-accent-b': '#134e4a',
    },
  },
  royal_indigo: {
    welcome: {
      welcomeGradientAngleDeg: 138,
      welcomeGradientFrom: '#818cf8',
      welcomeGradientTo: '#312e81',
      joinButtonColor: '#4f46e5',
      joinButtonBorderColor: '#3730a3',
      prizeAmountColor: '#e0e7ff',
      titleTextShadow: '0 0 12px rgba(255, 255, 255, 0.45)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#a5b4fc',
      '--sv-chrome-h2': '#6366f1',
      '--sv-chrome-h3': '#312e81',
      '--sv-chrome-bar1': '#c7d2fe',
      '--sv-chrome-bar2': '#4f46e5',
      '--sv-chrome-bar3': '#312e81',
      '--sv-chrome-accent-a': '#818cf8',
      '--sv-chrome-accent-b': '#312e81',
    },
  },
  sand_dune: {
    welcome: {
      welcomeGradientAngleDeg: 134,
      welcomeGradientFrom: '#fcd34d',
      welcomeGradientTo: '#92400e',
      joinButtonColor: '#b45309',
      joinButtonBorderColor: '#78350f',
      prizeAmountColor: '#fef3c7',
      titleTextShadow: '0 0 10px rgba(255, 255, 255, 0.55)',
      backArrowColor: '#ffffff',
    },
    challenge: {
      '--sv-chrome-h1': '#fcd34d',
      '--sv-chrome-h2': '#d97706',
      '--sv-chrome-h3': '#78350f',
      '--sv-chrome-bar1': '#fde68a',
      '--sv-chrome-bar2': '#d97706',
      '--sv-chrome-bar3': '#92400e',
      '--sv-chrome-accent-a': '#fcd34d',
      '--sv-chrome-accent-b': '#78350f',
    },
  },
}

export function defaultPaletteIdForSlug(gameSlug: string): ThemePaletteId {
  if (gameSlug === 'nov-2024-stock-challenge') return 'amber_glow'
  return 'ocean_deep'
}

export function resolvePalette(gameSlug: string, themePaletteId: string | null | undefined): ThemePaletteId {
  if (themePaletteId && isThemePaletteId(themePaletteId)) return themePaletteId
  return defaultPaletteIdForSlug(gameSlug)
}

export function welcomeThemeForPalette(id: ThemePaletteId): WelcomeChromeFromPalette {
  return PALETTES[id].welcome
}

export function challengeVarsForPalette(id: ThemePaletteId): ChallengeChromeVars {
  return PALETTES[id].challenge
}

export const THEME_PALETTE_LABELS: Record<ThemePaletteId, string> = {
  amber_glow: 'Amber gold',
  ocean_deep: 'Ocean blue',
  violet_night: 'Violet night',
  emerald_bank: 'Emerald',
  rose_sunset: 'Rose sunset',
  slate_steel: 'Slate steel',
  crimson_pulse: 'Crimson',
  teal_reef: 'Teal reef',
  royal_indigo: 'Royal indigo',
  sand_dune: 'Sand dune',
}
