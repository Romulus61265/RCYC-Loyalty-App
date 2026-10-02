import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { guestMessage, reportError } from '@/core/errors';
import { colors, spacing } from '@/theme';
import { Button } from './Controls';
import { Caption, Eyebrow, Text } from './Typography';

/**
 * Full-screen fallback rendered by Expo Router when a route throws during
 * render. Export it from a layout as `ErrorBoundary` to protect that subtree.
 */
export function ErrorFallback({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, { source: 'route-boundary' });
  }, [error]);

  const { title, body } = guestMessage(error);
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Eyebrow>With our apologies</Eyebrow>
      <Text variant="display" align="center" style={{ marginTop: spacing.sm }}>
        {title}
      </Text>
      <Caption align="center" style={{ marginTop: spacing.sm, marginBottom: spacing.xl, maxWidth: 320 }}>
        {body}
      </Caption>
      <Button label="Try again" onPress={() => void retry()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.gutter, backgroundColor: colors.background },
});
