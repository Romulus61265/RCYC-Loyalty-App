/**
 * Design tokens — "Quiet Luxury" design language.
 *
 * Palette drawn from the Mediterranean at dusk: warm ivory paper, deep navy
 * ink, sea-glass and a restrained champagne accent. Colour is used sparingly;
 * hierarchy is carried by typography and space rather than by badges.
 */

export const palette = {
  ivory: '#F6F2EC',
  porcelain: '#FBF9F6',
  sand: '#E9E1D5',
  stone: '#CFC5B6',
  driftwood: '#9A8F80',
  graphite: '#5B5750',
  ink: '#1E2530',
  navy: '#14213D',
  deepSea: '#0E1A2B',
  seaGlass: '#7F9C96',
  champagne: '#B89B6A',
  champagneSoft: '#E8DCC4',
  coral: '#B5654A',
  white: '#FFFFFF',
} as const;

export const colors = {
  background: palette.ivory,
  surface: palette.porcelain,
  surfaceElevated: palette.white,
  surfaceInverse: palette.deepSea,
  border: palette.sand,
  borderStrong: palette.stone,
  textPrimary: palette.ink,
  textSecondary: palette.graphite,
  textMuted: palette.driftwood,
  textInverse: palette.porcelain,
  textInverseMuted: 'rgba(251,249,246,0.72)',
  accent: palette.champagne,
  accentSoft: palette.champagneSoft,
  calm: palette.seaGlass,
  attention: palette.coral,
  scrim: 'rgba(14,26,43,0.45)',
} as const;

export const fonts = {
  display: 'CormorantGaramond_500Medium',
  displayItalic: 'CormorantGaramond_500Medium_Italic',
  displayLight: 'CormorantGaramond_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
} as const;

export const typography = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: -0.3 },
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.2 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  subtitle: { fontFamily: fonts.displayItalic, fontSize: 19, lineHeight: 26 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 23 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
  },
} as const;

/** 4pt base grid; luxury layouts lean on the generous end. */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  gutter: 24,
} as const;

export const radii = { none: 0, sm: 4, md: 10, lg: 18, pill: 999 } as const;

export const motion = {
  /** Calm, unhurried timings — nothing should "pop". */
  fast: 180,
  base: 280,
  slow: 480,
  easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
} as const;

export const elevation = {
  soft: {
    shadowColor: palette.deepSea,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
} as const;

export type TypographyVariant = keyof typeof typography;
