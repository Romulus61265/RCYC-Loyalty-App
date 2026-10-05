/**
 * During a demonstration (DEMO_MODE), a slim bar above every screen: it says
 * the data is fictional and opens the presenter's script. It takes its own
 * place in the layout (and the top safe area), so it never covers content.
 * Outside a demonstration it renders nothing and changes nothing.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components';
import { useServices } from '@/services/ServiceProvider';
import { colors, spacing } from '@/theme';

export function DemoFrame({ children }: { children: ReactNode }) {
  const { demo } = useServices();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  if (!demo.mode) return <>{children}</>;
  const onPresenter = path === '/demo';
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={() => router.push('/demo')}
        disabled={onPresenter}
        accessibilityRole="button"
        accessibilityLabel="Demo: presenter's script"
        accessibilityState={{ disabled: onPresenter }}
        style={({ pressed }) => [styles.bar, { paddingTop: insets.top }, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.row}>
          <Text variant="caption" color={colors.textInverse} style={styles.label} numberOfLines={1}>
            Demo · fictional data
          </Text>
          {onPresenter ? null : (
            <Text variant="caption" color={colors.textInverse} style={styles.label} numberOfLines={1}>
              Presenter ›
            </Text>
          )}
        </View>
      </Pressable>
      {/* The bar has taken the top inset; screens below lay out as if it were not there. */}
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.textPrimary },
  row: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.gutter, gap: spacing.md },
  label: { letterSpacing: 1, textTransform: 'uppercase' },
});
