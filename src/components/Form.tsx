/**
 * Form controls in the house style: quiet labels, chips rather than drop-downs,
 * hairline inputs, and errors in words beneath the field.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii, spacing } from '@/theme';
import { Chip } from './Controls';
import { Caption, Eyebrow, Text } from './Typography';

export interface ChoiceOption {
  value: string;
  label: string;
}

function FieldShell({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Eyebrow>{label}</Eyebrow>
      {hint ? <Caption style={{ marginTop: 2 }}>{hint}</Caption> : null}
      <View style={{ marginTop: spacing.xs }}>{children}</View>
      {error ? (
        <Caption color={colors.attention} style={{ marginTop: spacing.xxs }} accessibilityRole="alert">
          {error}
        </Caption>
      ) : null}
    </View>
  );
}

export function ChoiceGroup({ label, options, value, onChange, error }: { label: string; options: ChoiceOption[]; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <FieldShell label={label} error={error}>
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(value === o.value ? '' : o.value)} />
        ))}
      </View>
    </FieldShell>
  );
}

export function MultiChoiceGroup({ label, options, values, onChange, allowCustom, error }: { label: string; options: ChoiceOption[]; values: string[]; onChange: (v: string[]) => void; allowCustom?: boolean; error?: string }) {
  const [custom, setCustom] = useState('');
  const extra = values.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v }));
  const add = () => {
    const v = custom.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setCustom('');
  };
  return (
    <FieldShell label={label} error={error}>
      <View style={styles.wrap} accessibilityLabel={label}>
        {[...options, ...extra].map((o) => {
          const on = values.includes(o.value);
          return <Chip key={o.value} label={o.label} selected={on} onPress={() => onChange(on ? values.filter((x) => x !== o.value) : [...values, o.value])} />;
        })}
      </View>
      {allowCustom ? (
        <View style={styles.addRow}>
          <TextInput
            value={custom}
            onChangeText={setCustom}
            onSubmitEditing={add}
            placeholder="Add your own"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { flex: 1, minWidth: 0 }]}
            accessibilityLabel={`Add to ${label}`}
            maxLength={60}
            returnKeyType="done"
          />
          <Pressable onPress={add} accessibilityRole="button" accessibilityLabel={`Add to ${label}`} disabled={!custom.trim()} style={[styles.addButton, !custom.trim() && { opacity: 0.4 }]}>
            <Ionicons name="add" size={18} color={colors.textInverse} />
          </Pressable>
        </View>
      ) : null}
    </FieldShell>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? <Caption>{hint}</Caption> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.border, true: colors.calm }}
        thumbColor={colors.surfaceElevated}
      />
    </View>
  );
}

/** Keyboard and autofill hints, e.g. for e-mail addresses and one-time codes. */
export type TextFieldInputProps = Pick<TextInputProps, 'keyboardType' | 'autoComplete' | 'textContentType' | 'autoCapitalize' | 'autoCorrect' | 'onSubmitEditing' | 'returnKeyType'>;

export function TextField({ label, value, onChange, placeholder, max, multiline, error, input, showCount = true }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max: number; multiline?: boolean; error?: string; input?: TextFieldInputProps; showCount?: boolean }) {
  return (
    <FieldShell label={label} error={error}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        maxLength={showCount ? undefined : max}
        style={[styles.input, multiline && { minHeight: 84, textAlignVertical: 'top' }]}
        accessibilityLabel={label}
        {...input}
      />
      {showCount ? (
        <Caption align="right" color={value.length > max ? colors.attention : colors.textMuted} style={{ marginTop: 2 }}>
          {value.length} / {max}
        </Caption>
      ) : null}
    </FieldShell>
  );
}

export function Stepper({ label, value, min, max, step, unit, onChange, error }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; error?: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <FieldShell label={label} error={error}>
      <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={`${label}: ${value} ${unit}`} accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
      >
        <Pressable onPress={() => set(value - step)} disabled={value <= min} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} style={styles.stepButton}>
          <Ionicons name="remove" size={18} color={value <= min ? colors.textMuted : colors.textPrimary} />
        </Pressable>
        <Text variant="title" style={{ minWidth: 72, textAlign: 'center' }}>
          {value} {unit}
        </Text>
        <Pressable onPress={() => set(value + step)} disabled={value >= max} accessibilityRole="button" accessibilityLabel={`Increase ${label}`} style={styles.stepButton}>
          <Ionicons name="add" size={18} color={value >= max ? colors.textMuted : colors.textPrimary} />
        </Pressable>
      </View>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  input: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  addButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceInverse, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepButton: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
