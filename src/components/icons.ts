/**
 * Icons are decoration unless they say otherwise. On iOS and Android a
 * glyph is a character in an icon font, which a screen reader would stop on
 * and read as nothing; the words beside it, or the control's own name, say
 * what it means. An icon that must be heard on its own opts back in with
 * `{...meaningfulIcon('Sensitive information')}`.
 */
import Ionicons from '@expo/vector-icons/Ionicons';

const Icon = Ionicons as unknown as { defaultProps?: Record<string, unknown> };
Icon.defaultProps = { ...Icon.defaultProps, accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true };

export const meaningfulIcon = (label: string) =>
  ({ accessible: true, accessibilityElementsHidden: false, importantForAccessibility: 'yes', 'aria-hidden': false, accessibilityRole: 'image', accessibilityLabel: label }) as const;
