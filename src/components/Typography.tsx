import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, typography, type TypographyVariant } from '@/theme';

export interface TypographyProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', color = colors.textPrimary, align, style, ...rest }: TypographyProps) {
  return <RNText {...rest} style={[typography[variant], { color, textAlign: align }, style]} />;
}

export const Eyebrow = (p: TypographyProps) => <Text variant="eyebrow" color={colors.textMuted} {...p} />;
export const Title = (p: TypographyProps) => <Text variant="title" accessibilityRole="header" {...p} />;
export const Display = (p: TypographyProps) => <Text variant="display" accessibilityRole="header" {...p} />;
export const Caption = (p: TypographyProps) => <Text variant="caption" color={colors.textSecondary} {...p} />;
