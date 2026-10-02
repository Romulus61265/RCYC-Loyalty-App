import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { guestMessage } from '@/core/errors';
import { colors, elevation, radii, spacing } from '@/theme';
import { Caption, Eyebrow, Text, Title } from './Typography';

/** Scrollable page with generous gutters. `edgeToEdge` lets a hero bleed under the status bar. */
export function Screen({ children, edgeToEdge = false }: { children: ReactNode; edgeToEdge?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: edgeToEdge ? 0 : insets.top + spacing.lg, paddingBottom: spacing.xxxl }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.pageHeader}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Text variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="subtitle" color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Section({ eyebrow, title, children, action, style }: { eyebrow?: string; title?: string; children: ReactNode; action?: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.section, style]}>
      {(eyebrow || title) && (
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            {title ? <Title style={{ marginTop: spacing.xxs }}>{title}</Title> : null}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

/** Quiet key/value row used for itinerary, suite and profile details. */
export function DetailRow({ label, value, detail, onPress }: { label: string; value: string; detail?: string; onPress?: () => void }) {
  const content = (
    <View style={styles.detailRow}>
      <Caption style={styles.detailLabel}>{label}</Caption>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{value}</Text>
        {detail ? <Caption style={{ marginTop: 2 }}>{detail}</Caption> : null}
      </View>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function LoadingState({ label = 'One moment…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Caption style={{ marginTop: spacing.sm }}>{label}</Caption>
    </View>
  );
}

/** Inline failure state. Copy is derived from the error code, never the raw message. */
export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { title, body } = guestMessage(error);
  return (
    <View style={styles.loading} accessibilityRole="alert">
      <Text variant="subtitle" align="center">
        {title}
      </Text>
      <Caption align="center" style={{ marginTop: spacing.xs }}>
        {body}
      </Caption>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" style={{ marginTop: spacing.md }}>
          <Eyebrow color={colors.accent}>Try again</Eyebrow>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pageHeader: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg },
  section: { paddingHorizontal: spacing.gutter, marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    padding: spacing.lg,
    ...elevation.soft,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: spacing.md },
  detailRow: { flexDirection: 'row', paddingVertical: spacing.sm },
  detailLabel: { width: 112, paddingTop: 2 },
  loading: { padding: spacing.xxl, alignItems: 'center', justifyContent: 'center' },
});
