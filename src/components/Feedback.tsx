/**
 * Small, reusable feedback primitives: skeleton placeholders, status lines,
 * empty notes and section-level errors. All presentational.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { announce, liveRegion, readAs, useAnnounce } from '@/hooks/useAnnounce';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { guestMessage } from '@/core/errors';
import { colors, radii, spacing } from '@/theme';
import { TextLink } from './Controls';
import { Caption, Eyebrow, Text } from './Typography';

export type StatusTone = 'calm' | 'pending' | 'attention';

const TONE_COLOR: Record<StatusTone, string> = {
  calm: colors.calm,
  pending: colors.accentText,
  attention: colors.attention,
};

/**
 * Quiet status: a small dot and words. Never a coloured badge. The dot is
 * decoration; the words carry the meaning. `live` reads it out when it
 * appears or changes (a message after an action).
 */
export function StatusLine({ label, tone, style, live }: { label: string; tone: StatusTone; style?: ViewStyle; live?: boolean }) {
  useAnnounce(live ? label : undefined);
  return (
    <View style={[styles.status, style]} {...(live ? liveRegion('polite') : {})}>
      <View style={[styles.dot, { backgroundColor: TONE_COLOR[tone] }]} aria-hidden accessibilityElementsHidden importantForAccessibility="no" />
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
  useAnnounce(`${title} ${body}`);
  return (
    <View style={styles.inlineError} accessibilityRole="alert">
      <Text variant="bodyStrong">{title}</Text>
      <Caption style={{ marginTop: 2 }}>{body}</Caption>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={14} style={{ marginTop: spacing.sm }}>
          <Eyebrow color={colors.accentText}>Try again</Eyebrow>
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
        <View key={f.label} style={styles.fact} {...readAs(`${f.label}: ${f.value === '—' ? 'not recorded' : f.value}`)}>
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
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.8);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);
  // Decorative: the screen's loading label is what assistive technology hears.
  return <Animated.View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height, width, borderRadius: radius, backgroundColor: colors.border, opacity }, style]} />;
}

const styles = StyleSheet.create({
  visuallyHidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  status: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  empty: { paddingVertical: spacing.xs },
  inlineError: { padding: spacing.md, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  facts: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  fact: { minWidth: 64 },
});

/**
 * Says `message` without showing it, whenever it changes (not on first
 * render): "12 experiences", "Saved". Always mounted, so web screen
 * readers hear each change; iOS and Android are told directly.
 */
export function LiveAnnouncer({ message }: { message: string }) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    announce(message, { everywhere: true });
  }, [message]);
  // Present from the start, so the web reads changes rather than the arrival.
  return (
    <View style={styles.visuallyHidden} {...(Platform.OS === 'web' ? liveRegion('polite') : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const })}>
      <Text>{message}</Text>
    </View>
  );
}
