/**
 * Small, reusable feedback primitives: skeleton placeholders, status lines,
 * empty notes and section-level errors. All presentational.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { guestMessage } from '@/core/errors';
import { colors, radii, spacing } from '@/theme';
import { TextLink } from './Controls';
import { Caption, Eyebrow, Text } from './Typography';

export type StatusTone = 'calm' | 'pending' | 'attention';

const TONE_COLOR: Record<StatusTone, string> = {
  calm: colors.calm,
  pending: colors.accent,
  attention: colors.attention,
};

/** Quiet status: a small dot and words. Never a coloured badge. */
export function StatusLine({ label, tone, style }: { label: string; tone: StatusTone; style?: ViewStyle }) {
  return (
    <View style={[styles.status, style]} accessibilityLabel={`Status: ${label}`}>
      <View style={[styles.dot, { backgroundColor: TONE_COLOR[tone] }]} />
      <Caption color={TONE_COLOR[tone]}>{label}</Caption>
    </View>
  );
}

/** Calm empty state with an optional next step. */
export function EmptyNote({ title, body, actionLabel, onAction }: { title?: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      {title ? <Text variant="bodyStrong">{title}</Text> : null}
      <Caption style={title ? { marginTop: 2 } : undefined}>{body}</Caption>
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.sm }}>
          <TextLink label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

/** Compact, section-level failure. The rest of the screen keeps working. */
export function InlineError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, body } = guestMessage(error);
  return (
    <View style={styles.inlineError} accessibilityRole="alert">
      <Text variant="bodyStrong">{title}</Text>
      <Caption style={{ marginTop: 2 }}>{body}</Caption>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={12} style={{ marginTop: spacing.sm }}>
          <Eyebrow color={colors.accent}>Try again</Eyebrow>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Row of value-over-label facts ("62 m² / Living"). */
export function FactRow({ facts, inverse = false }: { facts: { label: string; value: string }[]; inverse?: boolean }) {
  return (
    <View style={styles.facts}>
      {facts.map((f) => (
        <View key={f.label} style={styles.fact}>
          <Text variant="title" color={inverse ? colors.textInverse : colors.textPrimary}>
            {f.value}
          </Text>
          <Eyebrow color={inverse ? colors.textInverseMuted : colors.textMuted}>{f.label}</Eyebrow>
        </View>
      ))}
    </View>
  );
}

/**
 * Placeholder block for loading layouts. Pulses gently, and holds still
 * when the system "reduce motion" setting is on.
 */
export function SkeletonBlock({ height, width = '100%', radius = radii.sm, style }: { height: number; width?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  // Created once; state (not a ref) so it is safe to read during render.
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (reduce || cancelled) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.55, duration: 900, useNativeDriver: true }),
          ]),
        );
        loop.start();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [opacity]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: colors.border, opacity }, style]} />;
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  empty: { paddingVertical: spacing.xs },
  inlineError: { padding: spacing.md, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  facts: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  fact: { minWidth: 64 },
});
