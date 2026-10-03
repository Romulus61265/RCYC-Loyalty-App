import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { JourneyAlert } from '@/domain';
import { colors, radii, spacing } from '@/theme';
import { Caption, Eyebrow, Text } from './Typography';

export function Button({ label, onPress, variant = 'primary', disabled }: { label: string; onPress: () => void; variant?: 'primary' | 'quiet' | 'inverse'; disabled?: boolean }) {
  const primary = variant === 'primary';
  const inverse = variant === 'inverse';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : inverse ? styles.buttonInverse : styles.buttonQuiet,
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      <Eyebrow color={primary || inverse ? colors.textInverse : colors.textPrimary}>{label}</Eyebrow>
    </Pressable>
  );
}

/** Understated text link with a hairline arrow. */
export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={12} style={styles.link}>
      <Eyebrow color={colors.accent}>{label}</Eyebrow>
      <Ionicons name="arrow-forward" size={12} color={colors.accent} style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

export function SegmentedTabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  // Keep the selected tab in view (e.g. a deep link to a later section),
  // scrolling only when it would otherwise sit beyond the visible edge.
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);
  const reveal = (key: string, animated: boolean) => {
    const l = layouts.current.get(key);
    if (!l || !viewport.current) return;
    if (l.x + l.width + spacing.gutter > viewport.current) scrollRef.current?.scrollTo({ x: Math.max(0, l.x - spacing.gutter), animated });
  };
  useEffect(() => {
    reveal(value, true);
  }, [value]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.segments}
      accessibilityRole="tablist"
      onLayout={(e) => {
        viewport.current = e.nativeEvent.layout.width;
        reveal(value, false);
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            onLayout={(e) => {
              layouts.current.set(o.value, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width });
              if (active) reveal(o.value, false);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            hitSlop={{ top: 8, bottom: 8 }}
            style={styles.segment}
          >
            <Eyebrow color={active ? colors.textPrimary : colors.textMuted}>{o.label}</Eyebrow>
            <View style={[styles.segmentRule, active && { backgroundColor: colors.accent }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Selectable pill for filters. Announces its selected state. */
export function Chip({ label, selected, onPress, hint }: { label: string; selected: boolean; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-selected={selected}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Caption color={selected ? colors.textInverse : colors.textPrimary}>{label}</Caption>
      {hint ? (
        <Caption color={selected ? colors.textInverseMuted : colors.textMuted} style={{ fontSize: 11, lineHeight: 14 }}>
          {hint}
        </Caption>
      ) : null}
    </Pressable>
  );
}

/** Journey alert — calm wording; shows what has already been handled. */
export function AlertNote({ alert, onDismiss, onAction }: { alert: JourneyAlert; onDismiss?: () => void; onAction?: () => void }) {
  const accent = alert.severity === 'urgent' ? colors.attention : alert.severity === 'action' ? colors.accent : colors.calm;
  return (
    <View style={[styles.alert, { borderLeftColor: accent }]} accessibilityRole="alert">
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{alert.title}</Text>
        <Caption style={{ marginTop: 4 }}>{alert.body}</Caption>
        {alert.handled ? (
          <View style={styles.handled}>
            <Ionicons name="checkmark" size={14} color={colors.calm} style={{ marginTop: 2, marginRight: 6 }} />
            <Caption style={{ flex: 1 }} color={colors.textPrimary}>
              {alert.handled}
            </Caption>
          </View>
        ) : null}
        {alert.action && onAction ? (
          <View style={{ marginTop: spacing.sm }}>
            <TextLink label={alert.action.label} onPress={onAction} />
          </View>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={12} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 14, paddingHorizontal: spacing.lg, borderRadius: radii.pill, alignItems: 'center' },
  buttonPrimary: { backgroundColor: colors.surfaceInverse },
  buttonQuiet: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  buttonInverse: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textInverseMuted },
  link: { flexDirection: 'row', alignItems: 'center' },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center' },
  chipSelected: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  segments: { paddingHorizontal: spacing.gutter, gap: spacing.lg },
  segment: { paddingTop: spacing.xs },
  segmentRule: { height: 1, marginTop: spacing.xs, backgroundColor: 'transparent' },
  alert: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderLeftWidth: 2,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  handled: { flexDirection: 'row', marginTop: spacing.xs },
});
