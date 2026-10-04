/**
 * Generic editor for one preference group, rendered from its schema.
 * Holds only the draft; validation and saving go through `onSave`.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type Text as RNText } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { announce } from '@/hooks/useAnnounce';
import { focusTarget, useFocusOnChange } from '@/hooks/useFocusOnChange';
import type { GuestPreferences } from '@/domain';
import { guestMessage, type AppError } from '@/core/errors';
import { Button, Caption, Card, Chip, ChipGroup, ChoiceGroup, Divider, Eyebrow, MultiChoiceGroup, StatusLine, Stepper, Text, TextField, ToggleRow, meaningfulIcon } from '@/components';
import { colors, fonts, radii, spacing } from '@/theme';
import type { SaveResult } from '../useProfileArea';
import { isDirty, type Allergy, type Field, type FormValues, type PreferenceGroup } from '../preferenceSchema';

const SEVERITIES: { value: Allergy['severity']; label: string }[] = [
  { value: 'intolerance', label: 'Intolerance' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'anaphylactic', label: 'Severe' },
];

export function PreferenceEditor({ group, preferences, onSave, onClose }: { group: PreferenceGroup; preferences: GuestPreferences; onSave: (v: FormValues) => Promise<SaveResult>; onClose: () => void }) {
  // Opening the editor takes the screen reader to it.
  const titleRef = useFocusOnChange<RNText>(group.key, { onMount: true });
  const [values, setValues] = useState<FormValues>(() => group.read(preferences));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<AppError>();
  const [saving, setSaving] = useState(false);
  const set = (key: string, v: FormValues[string]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };
  const dirty = isDirty(group, preferences, values);

  const submit = async () => {
    setSaving(true);
    setFailure(undefined);
    const r = await onSave(values);
    setSaving(false);
    if (r.ok) {
      announce(`${group.label} saved`, { everywhere: true });
      return onClose();
    }
    if (r.fieldErrors) setErrors(r.fieldErrors);
    if (r.error) setFailure(r.error);
  };

  return (
    <Card>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Eyebrow color={colors.accentText}>Editing</Eyebrow>
          <Text ref={titleRef} {...focusTarget} variant="title" accessibilityRole="header" accessibilityLabel={`Editing ${group.label}`}>
            {group.label}
          </Text>
          <Caption>{group.usedBy}</Caption>
        </View>
        {group.sensitive ? <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} {...meaningfulIcon('Sensitive information')} /> : null}
      </View>
      <Divider />
      {group.fields(preferences).map((f) => (
        <FieldControl key={f.key} field={f} value={values[f.key]} error={errors[f.key] || undefined} onChange={(v) => set(f.key, v)} />
      ))}

      {failure ? (
        <View style={styles.failure} accessibilityRole="alert">
          <Text variant="bodyStrong">{failure.code === 'conflict' ? 'These were changed on another device' : guestMessage(failure).title}</Text>
          <Caption style={{ marginTop: 2 }}>
            {failure.code === 'conflict' ? 'We’ve loaded the latest version. Please review and save again.' : guestMessage(failure).body}
          </Caption>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable onPress={onClose} accessibilityRole="button" hitSlop={14} disabled={saving}>
          <Eyebrow color={colors.textPrimary}>Cancel</Eyebrow>
        </Pressable>
        <View style={{ minWidth: 150 }}>
          <Button label={saving ? 'Saving…' : 'Save'} onPress={submit} disabled={saving || !dirty} hint={!dirty && !saving ? 'No changes yet' : undefined} />
        </View>
      </View>
      {!dirty ? <StatusLine label="No changes yet" tone="pending" style={{ alignSelf: 'flex-end', marginTop: spacing.xs }} /> : null}
    </Card>
  );
}

function FieldControl({ field, value, error, onChange }: { field: Field; value: FormValues[string] | undefined; error?: string; onChange: (v: FormValues[string]) => void }) {
  switch (field.kind) {
    case 'single':
      return <ChoiceGroup label={field.label} options={field.options} value={typeof value === 'string' ? value : ''} onChange={onChange} error={error} />;
    case 'multi':
      return <MultiChoiceGroup label={field.label} options={field.options} values={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} allowCustom={field.allowCustom} error={error} />;
    case 'toggle':
      return <ToggleRow label={field.label} hint={field.hint} value={value === true} onChange={onChange} />;
    case 'text':
      return <TextField label={field.label} value={typeof value === 'string' ? value : ''} onChange={onChange} placeholder={field.placeholder} max={field.max} multiline={field.multiline} error={error} />;
    case 'number':
      return <Stepper label={field.label} value={typeof value === 'number' ? value : field.min} min={field.min} max={field.max} step={field.step} unit={field.unit} onChange={onChange} error={error} />;
    case 'allergies':
      return <AllergyList label={field.label} value={Array.isArray(value) ? (value as Allergy[]) : []} onChange={onChange} error={error} />;
  }
}

function AllergyList({ label, value, onChange, error }: { label: string; value: Allergy[]; onChange: (v: Allergy[]) => void; error?: string }) {
  const update = (i: number, patch: Partial<Allergy>) => onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Eyebrow>{label}</Eyebrow>
      {value.length === 0 ? <Caption style={{ marginTop: 2 }}>None recorded.</Caption> : null}
      {value.map((a, i) => (
        <View key={i} style={styles.allergy}>
          <View style={styles.allergyTop}>
            <TextInput
              value={a.allergen}
              onChangeText={(t) => update(i, { allergen: t })}
              placeholder="e.g. Tree nuts"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel={`Allergy ${i + 1}`}
              maxLength={60}
            />
            <Pressable onPress={() => onChange(value.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove ${a.allergen || 'allergy'}`} hitSlop={13}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <ChipGroup label={`How severe: ${a.allergen || `allergy ${i + 1}`}`} kind="radio" style={styles.severity}>
            {SEVERITIES.map((s) => (
              <Chip key={s.value} kind="radio" label={s.label} selected={a.severity === s.value} onPress={() => update(i, { severity: s.value })} />
            ))}
          </ChipGroup>
        </View>
      ))}
      <Pressable onPress={() => onChange([...value, { allergen: '', severity: 'allergy' }])} accessibilityRole="button" hitSlop={14} style={{ marginTop: spacing.sm }}>
        <Eyebrow color={colors.accentText}>Add an allergy</Eyebrow>
      </Pressable>
      {error ? (
        <Caption color={colors.attention} style={{ marginTop: spacing.xxs }} accessibilityRole="alert">
          {error}
        </Caption>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  failure: { padding: spacing.md, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.attention, marginBottom: spacing.sm },
  allergy: { marginTop: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  allergyTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  severity: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  // minWidth 0 lets the input shrink beside its remove button on narrow screens (web inputs have an intrinsic width).
  input: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.surface },
});
