import type { Ref } from 'react';
import { Platform, Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, typography, type TypographyVariant } from '@/theme';

export interface TypographyProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  /** For moving focus to it (see useFocusOnChange). */
  ref?: Ref<RNText>;
}

/**
 * How far each style may grow with the system text size. Reading text
 * reaches at least 200% (WCAG 1.4.4); headings, already large, grow less
 * so a heading never outgrows the screen.
 */
export const MAX_FONT_SCALE: Record<TypographyVariant, number> = {
  hero: 1.4,
  display: 1.6,
  title: 1.8,
  subtitle: 2,
  body: 2.2,
  bodyStrong: 2.2,
  caption: 2.2,
  eyebrow: 2.2,
};

/**
 * Words joined by the house separator ("Day 6 · Monte Carlo") are spoken
 * with a pause, not "dot" (iOS and Android; web screen readers pass over it).
 */
function spoken(children: TypographyProps['children']): string | undefined {
  if (Platform.OS === 'web') return undefined;
  const parts = Array.isArray(children) ? children : [children];
  if (!parts.every((p) => typeof p === 'string' || typeof p === 'number')) return undefined;
  const text = parts.join('');
  return text.includes(' · ') ? text.split(' · ').join(', ') : undefined;
}

export function Text({ variant = 'body', color = colors.textPrimary, align, style, maxFontSizeMultiplier, accessibilityLabel, ...rest }: TypographyProps) {
  return (
    <RNText
      {...rest}
      accessibilityLabel={accessibilityLabel ?? spoken(rest.children)}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE[variant]}
      style={[typography[variant], { color, textAlign: align }, style]}
    />
  );
}

export const Eyebrow = (p: TypographyProps) => <Text variant="eyebrow" color={colors.textMuted} {...p} />;
export const Title = (p: TypographyProps) => <Text variant="title" accessibilityRole="header" {...p} />;
export const Display = (p: TypographyProps) => <Text variant="display" accessibilityRole="header" {...p} />;
export const Caption = (p: TypographyProps) => <Text variant="caption" color={colors.textSecondary} {...p} />;
