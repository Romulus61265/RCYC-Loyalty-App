import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnnounce } from '@/hooks/useAnnounce';
import { guestMessage } from '@/core/errors';
import { colors, elevation, radii, spacing } from '@/theme';
import { Caption, Eyebrow, Text, Title } from './Typography';

/** Maximum width of the reading column; wider screens centre it. */
export const CONTENT_MAX_WIDTH = 720;

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
      <Text variant="display" accessibilityRole="header" aria-level={1} style={{ marginTop: spacing.xs }}>
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

/** `level={1}` when the section is the page (an empty state with no page header). */
export function Section({ eyebrow, title, children, action, style, level = 2 }: { eyebrow?: string; title?: string; children: ReactNode; action?: ReactNode; style?: ViewStyle; level?: 1 | 2 }) {
  return (
    <View style={[styles.section, style]}>
      {(eyebrow || title) && (
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            {/* The section's heading: its title, or the eyebrow when there is no title. */}
            {eyebrow ? (
              <Eyebrow accessibilityRole={title ? undefined : 'header'} aria-level={title ? undefined : level}>
                {eyebrow}
              </Eyebrow>
            ) : null}
            {title ? (
              <Title aria-level={level} style={{ marginTop: spacing.xxs }}>
                {title}
              </Title>
            ) : null}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

/** A pressable card is one control: `link` when it opens another screen, `button` when it acts here. */
export function Card({ children, style, onPress, accessibilityLabel, accessibilityRole = 'button' }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; accessibilityRole?: 'button' | 'link' }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole={accessibilityRole}
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
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label} aria-busy accessible>
      <ActivityIndicator color={colors.accentText} />
      <Caption style={{ marginTop: spacing.sm }}>{label}</Caption>
    </View>
  );
}

/** Inline failure state. Copy is derived from the error code, never the raw message. */
export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { title, body } = guestMessage(error);
  useAnnounce(`${title} ${body}`);
  return (
    <View style={styles.loading} accessibilityRole="alert">
      <Text variant="subtitle" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Caption align="center" style={{ marginTop: spacing.xs }}>
        {body}
      </Caption>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={14} style={{ marginTop: spacing.md }}>
          <Eyebrow color={colors.accentText}>Try again</Eyebrow>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A whole screen that could not load: the failure state, centred, with a retry. */
export function ScreenError({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      <ErrorState error={error} onRetry={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // Centred reading column: comfortable line lengths on tablets and web.
  pageHeader: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  section: { paddingHorizontal: spacing.gutter, marginTop: spacing.xl, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
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
