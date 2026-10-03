/** Row-level building blocks shared by the Voyage sections. Presentational only. */
import { StyleSheet, View } from 'react-native';
import { Caption, Eyebrow, StatusLine, Text } from '@/components';
import { colors, radii, spacing } from '@/theme';
import type { BookingLine, Fact, SuggestionLine } from '../voyageModel';

export function BookingRow({ booking, showWhen = true }: { booking: BookingLine; showWhen?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${booking.title}, ${booking.whenLabel}, ${booking.status.label}`}>
      {showWhen ? <Caption>{booking.whenLabel}</Caption> : null}
      <Text variant="bodyStrong" style={{ marginTop: showWhen ? 2 : 0 }}>
        {booking.title}
      </Text>
      <Caption>
        {booking.venue} · {booking.partyLabel}
      </Caption>
      {booking.note ? (
        <Caption color={colors.textPrimary} style={{ marginTop: spacing.xxs }}>
          {booking.note}
        </Caption>
      ) : null}
      <StatusLine label={booking.status.label} tone={booking.status.tone} style={{ marginTop: spacing.xs }} />
    </View>
  );
}

export function SuggestionRow({ item }: { item: SuggestionLine }) {
  return (
    <View style={styles.suggestion}>
      <Eyebrow color={colors.accent}>{item.where}</Eyebrow>
      <Text variant="bodyStrong" style={{ marginTop: 2 }}>
        {item.title}
      </Text>
      <Caption>{item.subtitle}</Caption>
      {item.reason ? (
        <Text variant="subtitle" style={{ fontSize: 16, lineHeight: 22, marginTop: spacing.xxs }} color={colors.textSecondary}>
          {item.reason}
        </Text>
      ) : null}
      <Caption style={{ marginTop: spacing.xxs }}>{item.priceLabel}</Caption>
    </View>
  );
}

/** Vertical label / value list ("Pillows — Feather-free"). */
export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <View>
      {facts.map((f, i) => (
        <View key={`${f.label}-${i}`} style={[styles.fact, i > 0 && styles.factDivider]}>
          <Caption style={styles.factLabel}>{f.label}</Caption>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{f.value}</Text>
            {f.detail ? <Caption style={{ marginTop: 2 }}>{f.detail}</Caption> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.sm },
  suggestion: { padding: spacing.md, borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, marginTop: spacing.sm },
  fact: { flexDirection: 'row', paddingVertical: spacing.sm },
  factDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  factLabel: { width: 110, paddingTop: 2, paddingRight: spacing.sm },
});
