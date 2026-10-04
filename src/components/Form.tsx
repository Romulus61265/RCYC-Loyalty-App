/**
 * Form controls in the house style: quiet labels, chips rather than drop-downs,
 * hairline inputs, and errors in words beneath the field.
 */
import { useId, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { announce, useAnnounce } from '@/hooks/useAnnounce';
import { colors, fonts, radii, spacing } from '@/theme';
import { Chip, ChipGroup } from './Controls';
import { Caption, Eyebrow, Text } from './Typography';

export interface ChoiceOption {
  value: string;
  label: string;
}

/** What ties a control to its label, hint and error, for assistive technology. */
interface FieldA11y {
  /** The field's spoken name: its label, and "required" when it is. */
  name: string;
  invalid: boolean;
  /** Ids of the hint and error, for aria-describedby on the web. */
  describedBy?: string;
  /** Native: read after the name (the error, else the hint). */
  hint?: string;
}

function FieldShell({ label, error, children, hint, required }: { label: string; error?: string; hint?: string; required?: boolean; children: (a11y: FieldA11y) => React.ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // Announced as it appears (iOS); Android and the web read the alert themselves.
  useAnnounce(error ? `${label}: ${error}` : undefined);
  const a11y: FieldA11y = {
    name: required ? `${label}, required` : label,
    invalid: Boolean(error),
    describedBy: [errorId, hintId].filter(Boolean).join(' ') || undefined,
    hint: error ?? hint,
  };
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Eyebrow style={{ flexShrink: 1 }}>{label}</Eyebrow>
        {required ? (
          <Caption color={colors.textMuted} style={{ fontSize: 11, lineHeight: 16 }} aria-hidden accessibilityElementsHidden importantForAccessibility="no">
            Required
          </Caption>
        ) : null}
      </View>
      {hint ? (
        <Caption nativeID={hintId} style={{ marginTop: 2 }}>
          {hint}
        </Caption>
      ) : null}
      <View style={{ marginTop: spacing.xs }}>{children(a11y)}</View>
      {error ? (
        <View style={styles.error} nativeID={errorId} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {/* Not colour alone: a mark, and the words. */}
          <Ionicons name="alert-circle-outline" size={14} color={colors.attention} style={{ marginTop: 2, marginRight: 4 }} aria-hidden />
          <Caption color={colors.attention} style={{ flex: 1 }}>
            {error}
          </Caption>
        </View>
      ) : null}
    </View>
  );
}

export function ChoiceGroup({ label, options, value, onChange, error, required, hint }: { label: string; options: ChoiceOption[]; value: string; onChange: (v: string) => void; error?: string; required?: boolean; hint?: string }) {
  return (
    <FieldShell label={label} error={error} required={required} hint={hint}>
      {(a11y) => (
        <ChipGroup label={a11y.name} kind="radio" invalid={a11y.invalid} describedBy={a11y.describedBy}>
          {options.map((o) => (
            <Chip key={o.value} kind="radio" label={o.label} selected={value === o.value} onPress={() => onChange(value === o.value ? '' : o.value)} />
          ))}
        </ChipGroup>
      )}
    </FieldShell>
  );
}

export function MultiChoiceGroup({ label, options, values, onChange, allowCustom, error }: { label: string; options: ChoiceOption[]; values: string[]; onChange: (v: string[]) => void; allowCustom?: boolean; error?: string }) {
  const [custom, setCustom] = useState('');
  const extra = values.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v }));
  const add = () => {
    const v = custom.trim();
    if (v && !values.includes(v)) {
      onChange([...values, v]);
      announce(`${v} added`, { everywhere: true });
    }
    setCustom('');
  };
  return (
    <FieldShell label={label} error={error}>
      {(a11y) => (
        <>
        <ChipGroup label={a11y.name} kind="checkbox" invalid={a11y.invalid} describedBy={a11y.describedBy}>
          {[...options, ...extra].map((o) => {
            const on = values.includes(o.value);
            return <Chip key={o.value} kind="checkbox" label={o.label} selected={on} onPress={() => onChange(on ? values.filter((x) => x !== o.value) : [...values, o.value])} />;
          })}
        </ChipGroup>
        {allowCustom ? (
          <View style={styles.addRow}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              onSubmitEditing={add}
              placeholder="Add your own"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { flex: 1, minWidth: 0 }]}
              accessibilityLabel={`Your own: ${label}`}
              maxLength={60}
              returnKeyType="done"
            />
            <Pressable onPress={add} hitSlop={3} accessibilityRole="button" accessibilityLabel={`Add to ${label}`} disabled={!custom.trim()} style={[styles.addButton, !custom.trim() && { opacity: 0.4 }]}>
              <Ionicons name="add" size={18} color={colors.textInverse} />
            </Pressable>
          </View>
        ) : null}
        </>
      )}
    </FieldShell>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      {/* The switch carries the name and hint; the words beside it are not read twice. */}
      <View style={{ flex: 1, paddingRight: spacing.md }} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="bodyStrong">{label}</Text>
        {hint ? <Caption>{hint}</Caption> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={Platform.OS === 'web' && hint ? `${label}. ${hint}` : label}
        accessibilityHint={hint}
        trackColor={{ false: colors.border, true: colors.calm }}
        thumbColor={colors.surfaceElevated}
      />
    </View>
  );
}

/** Keyboard and autofill hints, e.g. for e-mail addresses and one-time codes. */
export type TextFieldInputProps = Pick<TextInputProps, 'keyboardType' | 'autoComplete' | 'textContentType' | 'autoCapitalize' | 'autoCorrect' | 'onSubmitEditing' | 'returnKeyType'>;

export function TextField({ label, value, onChange, placeholder, max, multiline, error, input, showCount = true, required, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max: number; multiline?: boolean; error?: string; input?: TextFieldInputProps; showCount?: boolean; required?: boolean; hint?: string }) {
  const over = value.length > max;
  return (
    <FieldShell label={label} error={error} required={required} hint={hint}>
      {(a11y) => (
        <>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          maxLength={showCount ? undefined : max}
          style={[styles.input, multiline && { minHeight: 84, textAlignVertical: 'top' }, a11y.invalid && { borderColor: colors.attention }]}
          accessibilityLabel={a11y.name}
          accessibilityHint={a11y.hint}
          aria-invalid={a11y.invalid}
          aria-required={required}
          aria-describedby={a11y.describedBy}
          {...input}
        />
        {showCount ? (
          // Read as words ("120 of 1,000 characters"), not as a slash.
          <Caption align="right" color={over ? colors.attention : colors.textMuted} style={{ marginTop: 2 }} accessibilityLabel={over ? `${value.length - max} characters over the limit of ${max}` : `${value.length} of ${max} characters`}>
            {value.length} / {max}
          </Caption>
        ) : null}
        </>
      )}
    </FieldShell>
  );
}

export function Stepper({ label, value, min, max, step, unit, onChange, error }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; error?: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <FieldShell label={label} error={error}>
      {() => (
        // Native: one adjustable element (swipe up or down). The web: a named group of two buttons and a live value.
        <View
          style={styles.stepper}
          {...(Platform.OS === 'web'
            ? { role: 'group' as const, 'aria-label': label }
            : {
                accessible: true,
                accessibilityRole: 'adjustable' as const,
                accessibilityLabel: label,
                accessibilityValue: { min, max, now: value, text: `${value} ${unit}` },
                accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
                onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step)),
              })}
        >
          <Pressable onPress={() => set(value - step)} disabled={value <= min} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} style={styles.stepButton}>
            <Ionicons name="remove" size={18} color={value <= min ? colors.textMuted : colors.textPrimary} />
          </Pressable>
          <Text variant="title" style={{ minWidth: 72, textAlign: 'center' }} aria-live="polite">
            {value} {unit}
          </Text>
          <Pressable onPress={() => set(value + step)} disabled={value >= max} accessibilityRole="button" accessibilityLabel={`Increase ${label}`} style={styles.stepButton}>
            <Ionicons name="add" size={18} color={value >= max ? colors.textMuted : colors.textPrimary} />
          </Pressable>
        </View>
      )}
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  error: { flexDirection: 'row', marginTop: spacing.xxs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  input: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    // A full pixel: a hairline at 3× is too faint to find the field by.
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  addButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceInverse, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepButton: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderInput, alignItems: 'center', justifyContent: 'center' },
});
