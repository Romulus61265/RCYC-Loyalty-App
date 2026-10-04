/**
 * The presenter's way into the script, shown on every screen during a
 * demonstration (DEMO_MODE) and never otherwise. Small and labelled "Demo",
 * so the audience is never in doubt that the data is fictional.
 */
import { Pressable, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components';
import { useServices } from '@/services/ServiceProvider';
import { colors, spacing } from '@/theme';

export function DemoButton() {
  const { demo } = useServices();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  if (!demo.mode || path === '/demo') return null;
  return (
    <Pressable
      onPress={() => router.push('/demo')}
      accessibilityRole="button"
      accessibilityLabel="Demo: presenter's script"
      hitSlop={6}
      style={({ pressed }) => [styles.pill, { top: insets.top + spacing.xs }, pressed && { opacity: 0.7 }]}
    >
      <Text variant="caption" color={colors.textInverse} style={styles.label}>
        Demo
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    // Beside the notification bell, clear of every screen's title; 32 pt plus hitSlop is a 44 pt target.
    position: 'absolute',
    right: 64,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.textPrimary,
    opacity: 0.85,
  },
  label: { letterSpacing: 1, textTransform: 'uppercase' },
});
