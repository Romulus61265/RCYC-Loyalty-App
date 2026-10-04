/** Home: the arrival update, headline first, then each change in a line. */
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Caption, Card, Section, Text, TextLink } from '@/components';
import { colors, spacing } from '@/theme';
import type { ArrivalCardModel } from '../arrivalModel';

export function ArrivalCard({ card, onOpen, onConcierge }: { card: ArrivalCardModel; onOpen: () => void; onConcierge: () => void }) {
  return (
    <Section eyebrow="Your arrival">
      <Card style={styles.card} accessibilityLabel={`${card.headline} ${card.lines.map((l) => `${l.label}${l.value ? ` ${l.value}` : ''}`).join('. ')}`}>
        <Text variant="title" accessibilityRole="header">
          {card.headline}
        </Text>
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {card.lines.map((l) => (
            <View key={l.label} style={styles.line}>
              <Ionicons name={l.icon} size={18} color={l.pending ? colors.textSecondary : colors.accentText} />
              <Text style={{ flex: 1, marginLeft: spacing.sm }}>{l.label}</Text>
              {l.value ? <Text variant="bodyStrong">{l.value}</Text> : null}
            </View>
          ))}
        </View>
        {card.demoNote ? <Caption style={{ marginTop: spacing.md }}>{card.demoNote}</Caption> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.md }}>
          <TextLink label="See what changed" onPress={onOpen} />
          <TextLink label="Talk to the concierge" onPress={onConcierge} />
        </View>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderColor: colors.accent, borderWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center' },
});
