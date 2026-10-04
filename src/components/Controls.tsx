import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { JourneyAlert } from '@/domain';
import { colors, radii, spacing } from '@/theme';
import { Caption, Eyebrow, Text } from './Typography';

/** `hint` says what the button does, or why it cannot yet ("Turn on the acknowledgement above to send"). */
export function Button({ label, onPress, variant = 'primary', disabled, hint, ref }: { label: string; onPress: () => void; variant?: 'primary' | 'quiet' | 'inverse'; disabled?: boolean; hint?: string; ref?: Ref<View> }) {
  const primary = variant === 'primary';
  const inverse = variant === 'inverse';
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      accessibilityHint={hint}
      // The web has no hint: it follows the name, which still starts with the visible words.
      accessibilityLabel={Platform.OS === 'web' && hint ? `${label}. ${hint}` : undefined}
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

/** Understated text link with a hairline arrow. `role="button"` when it acts rather than goes somewhere. */
export function TextLink({ label, onPress, role = 'link', accessibilityLabel }: { label: string; onPress: () => void; role?: 'link' | 'button'; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole={role} accessibilityLabel={accessibilityLabel} hitSlop={14} style={styles.link}>
      <Eyebrow color={colors.accentText}>{label}</Eyebrow>
      <Ionicons name="arrow-forward" size={12} color={colors.accentText} style={{ marginLeft: 6 }} aria-hidden />
    </Pressable>
  );
}

/** A link's look without its behaviour: the cue inside a card that is itself the link (never a control within a control). */
export function LinkCue({ label }: { label: string }) {
  return (
    <View style={styles.link} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Eyebrow color={colors.accentText}>{label}</Eyebrow>
      <Ionicons name="arrow-forward" size={12} color={colors.accentText} style={{ marginLeft: 6 }} />
    </View>
  );
}

export function SegmentedTabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string; accessibilityLabel?: string }[]; value: T; onChange: (v: T) => void }) {
  // Keep the selected tab in view (e.g. a deep link to a later section),
  // scrolling only when it would otherwise sit beyond the visible edge.
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);
  const reduceMotion = useReducedMotion();
  const reveal = (key: string, animated: boolean) => {
    const l = layouts.current.get(key);
    if (!l || !viewport.current) return;
    if (l.x + l.width + spacing.gutter > viewport.current) scrollRef.current?.scrollTo({ x: Math.max(0, l.x - spacing.gutter), animated });
  };
  useEffect(() => {
    reveal(value, !reduceMotion);
  }, [value, reduceMotion]);

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
            accessibilityLabel={o.accessibilityLabel}
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

export type ChipKind = 'toggle' | 'radio' | 'checkbox';

/**
 * Selectable pill. Announces what it is and whether it is chosen:
 * `radio` (one of a group), `checkbox` (any of a group) or `toggle`
 * (a filter that is on or off; a pressed button on the web).
 * Put radios and checkboxes in a `ChipGroup`, which names the group.
 */
export function Chip({ label, selected, onPress, hint, accessibilityLabel, kind = 'toggle', disabled }: { label: string; selected: boolean; onPress: () => void; hint?: string; accessibilityLabel?: string; kind?: ChipKind; disabled?: boolean }) {
  const checkable = kind !== 'toggle';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      role={checkable ? kind : 'button'}
      accessibilityState={checkable ? { checked: selected, disabled } : { selected, disabled }}
      aria-checked={checkable ? selected : undefined}
      aria-pressed={checkable ? undefined : selected}
      accessibilityLabel={accessibilityLabel ?? (hint ? `${label}, ${hint}` : label)}
      // 36 high plus 4 above and below: a 44-point target that never overlaps the next row.
      hitSlop={4}
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

/** A named group of chips: a radio group for one choice, a group for several. */
export function ChipGroup({ label, kind, children, style, invalid, describedBy }: { label: string; kind: 'radio' | 'checkbox'; children: ReactNode; style?: StyleProp<ViewStyle>; invalid?: boolean; describedBy?: string }) {
  return (
    <View role={kind === 'radio' ? 'radiogroup' : 'group'} aria-label={label} accessibilityLabel={label} aria-invalid={kind === 'radio' ? invalid : undefined} aria-describedby={describedBy} style={[styles.chipRow, style]}>
      {children}
    </View>
  );
}

/** Journey alert — calm wording; shows what has already been handled. */
export function AlertNote({ alert, onDismiss, onAction }: { alert: JourneyAlert; onDismiss?: () => void; onAction?: () => void }) {
  const accent = alert.severity === 'urgent' ? colors.attention : alert.severity === 'action' ? colors.accentText : colors.calm;
  return (
    // Only urgent news interrupts; the rest is read in its place.
    <View style={[styles.alert, { borderLeftColor: accent }]} accessibilityRole={alert.severity === 'urgent' ? 'alert' : undefined}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{alert.title}</Text>
        <Caption style={{ marginTop: 4 }}>{alert.body}</Caption>
        {alert.handled ? (
          <View style={styles.handled}>
            <Ionicons name="checkmark" size={14} color={colors.calm} style={{ marginTop: 2, marginRight: 6 }} aria-hidden />
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
        <Pressable onPress={onDismiss} hitSlop={14} accessibilityRole="button" accessibilityLabel={`Dismiss: ${alert.title}`}>
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
  chip: { minHeight: 36, justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
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
