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
  /** Driftwood, deepened for text: 5:1 on ivory (WCAG AA). */
  taupe: '#6E665B',
  graphite: '#5B5750',
  ink: '#1E2530',
  navy: '#14213D',
  deepSea: '#0E1A2B',
  seaGlass: '#7F9C96',
  /** Sea-glass, deepened for words and status icons: 4.8:1 on ivory. */
  seaGlassDeep: '#56706A',
  champagne: '#B89B6A',
  /** Champagne, deepened for words on light surfaces: 5:1 on ivory. */
  champagneDeep: '#7A6544',
  champagneSoft: '#E8DCC4',
  coral: '#B5654A',
  /** Coral, deepened for words: 4.9:1 on ivory. */
  terracotta: '#9E5640',
  white: '#FFFFFF',
} as const;

export const colors = {
  background: palette.ivory,
  surface: palette.porcelain,
  surfaceElevated: palette.white,
  surfaceInverse: palette.deepSea,
  border: palette.sand,
  borderStrong: palette.stone,
  /** Outlines of fields and steppers: 3:1 against ivory, porcelain and white (WCAG 1.4.11). */
  borderInput: '#8C8579',
  textPrimary: palette.ink,
  textSecondary: palette.graphite,
  /** Secondary words, eyebrows, hints. Every text colour meets WCAG AA (4.5:1) on ivory, porcelain and white. */
  textMuted: palette.taupe,
  textInverse: palette.porcelain,
  textInverseMuted: 'rgba(251,249,246,0.72)',
  /** Secondary words on imagery (over the words scrim): ≥ 4.5:1 even over a white photograph. */
  textOnImageMuted: 'rgba(251,249,246,0.88)',
  /** Champagne for rules, dots and fills; on dark surfaces it may also be text (6.6:1 on deep sea). */
  accent: palette.champagne,
  /** Champagne words on light surfaces: links, eyebrows, statuses. */
  accentText: palette.champagneDeep,
  accentSoft: palette.champagneSoft,
  /** Done, confirmed, settled: words and icons (≥ 4.5:1). */
  calm: palette.seaGlassDeep,
  /** Urgent or invalid: words and icons (≥ 4.5:1). */
  attention: palette.terracotta,
  scrim: 'rgba(14,26,43,0.45)',
} as const;

/**
 * Scrims over imagery. `words` sits behind text on a picture: ivory text is
 * ≥ 4.5:1 from the middle down even over a white photograph (checked in
 * check:a11y). `top` shades the top edge for a line placed there.
 */
export const scrims = {
  words: { colors: ['rgba(14,26,43,0)', 'rgba(14,26,43,0.7)', 'rgba(14,26,43,0.74)'], locations: [0.15, 0.55, 1] },
  top: { colors: ['rgba(14,26,43,0.72)', 'rgba(14,26,43,0.7)', 'rgba(14,26,43,0)'], locations: [0, 0.13, 0.28] },
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
