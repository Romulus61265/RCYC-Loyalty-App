/** Building blocks for the Requests screens. Presentational only. */
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Caption, Card, Eyebrow, StatusLine, Text } from '@/components';
import { colors, spacing } from '@/theme';
import type { RequestRowModel, StepModel } from '../requestsModel';

/** A quiet way back, for screens outside the tab bar. */
export function BackBar({ label = 'Back', onBack }: { label?: string; onBack: () => void }) {
  return (
    <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={label} hitSlop={12} style={styles.back}>
      <Ionicons name="chevron-back" size={16} color={colors.accent} />
      <Eyebrow color={colors.accent} style={{ marginLeft: 4 }}>
        {label}
      </Eyebrow>
    </Pressable>
  );
}

export function RequestRow({ row, onOpen }: { row: RequestRowModel; onOpen: () => void }) {
  return (
    <Card onPress={onOpen} accessibilityLabel={row.accessibilityLabel} style={styles.row}>
      <View style={styles.rowTop}>
        <Eyebrow>{row.category}</Eyebrow>
        <StatusLine label={row.status.label} tone={row.status.tone} />
      </View>
      <Text variant="bodyStrong" style={{ marginTop: spacing.xs }}>
        {row.title}
      </Text>
      <Caption style={{ marginTop: 2 }}>{row.meta}</Caption>
      {row.note ? (
        <Caption color={colors.textSecondary} style={{ marginTop: spacing.xs }} numberOfLines={2}>
          {row.note}
        </Caption>
      ) : null}
    </Card>
  );
}

/** Submitted → Acknowledged → In progress → Resolved → Closed. */
export function StatusSteps({ steps }: { steps: StepModel[] }) {
  return (
    <View accessibilityRole="list" accessibilityLabel="Request status">
      {steps.map((s, i) => {
        const done = s.state === 'done';
        const current = s.state === 'current';
        const last = i === steps.length - 1;
        return (
          <View key={s.status} style={styles.step} accessibilityLabel={`${s.label}${current ? ', current' : done ? ', done' : ', not yet'}${s.when ? `, ${s.when}` : ''}`}>
            <View style={styles.rail}>
              <View style={[styles.node, (done || current) && styles.nodeDone]}>{done || current ? <Ionicons name="checkmark" size={10} color={colors.textInverse} /> : null}</View>
              {!last ? <View style={[styles.line, done && steps[i + 1]?.state !== 'todo' && { backgroundColor: colors.accent }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.md }}>
              <Text variant={current ? 'bodyStrong' : 'body'} color={s.state === 'todo' ? colors.textMuted : colors.textPrimary}>
                {s.label}
              </Text>
              {s.when ? <Caption>{s.when}</Caption> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.gutter, marginBottom: spacing.sm, alignSelf: 'flex-start' },
  row: { marginHorizontal: spacing.gutter, marginBottom: spacing.sm, padding: spacing.md },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { flexDirection: 'row' },
  rail: { width: 28, alignItems: 'center' },
  node: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  nodeDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  line: { flex: 1, width: 1, backgroundColor: colors.border, marginVertical: 2 },
});
