import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Caption, Card, Divider, Eyebrow, MediaFrame, StatusLine, Text } from '@/components';
import { colors, spacing } from '@/theme';
import type { ExperienceCardModel } from '../discoverModel';

/**
 * One marketplace experience. Shows every decision-relevant fact at a
 * glance; the full description and inclusions expand on request.
 */
export function ExperienceCard({ card, onRequest }: { card: ExperienceCardModel; onRequest: (card: ExperienceCardModel) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <MediaFrame media={card.media} height={150} rounded={false}>
        <View style={styles.mediaCaption}>
          <Eyebrow color={colors.textInverseMuted}>
            {card.categoryLabel} · {card.destination}
          </Eyebrow>
        </View>
      </MediaFrame>
      <View style={{ padding: spacing.lg }}>
        <Text variant="title">{card.title}</Text>
        <Caption style={{ marginTop: 2 }}>{card.subtitle}</Caption>

        {card.recommendation ? (
          <View style={styles.reason} accessibilityLabel={`Why we suggest it: ${card.recommendation.reason}`}>
            <Ionicons name="sparkles-outline" size={14} color={colors.accent} style={{ marginTop: 3 }} />
            <Text variant="subtitle" style={styles.reasonText} color={colors.textSecondary}>
              {card.recommendation.reason}
            </Text>
          </View>
        ) : null}

        <View style={styles.facts}>
          <Fact icon="time-outline" text={card.durationLabel} />
          <Fact icon={card.isPrivate ? 'person-outline' : 'people-outline'} text={card.formatLabel} />
          <Fact icon="pricetag-outline" text={`${card.priceLabel} · ${card.inclusionLabel}`} />
        </View>

        <Divider />
        <View style={styles.statusRow}>
          <View style={{ flex: 1, paddingRight: spacing.sm }}>
            <Eyebrow>Availability</Eyebrow>
            <StatusLine label={card.availability.label} tone={card.availability.tone} style={{ marginTop: 2 }} />
            {card.availability.detail ? <Caption style={{ marginTop: 2 }}>{card.availability.detail}</Caption> : null}
            {card.availability.nextTimes.length > 0 && !card.reservation.reserved ? <Caption style={{ marginTop: 2 }}>{card.availability.nextTimes.join(' · ')}</Caption> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Eyebrow>Your reservation</Eyebrow>
            <StatusLine label={card.reservation.label} tone={card.reservation.reserved ? card.reservation.tone : 'pending'} style={{ marginTop: 2 }} />
            {card.reservation.detail ? <Caption style={{ marginTop: 2 }}>{card.reservation.detail}</Caption> : null}
          </View>
        </View>

        {open ? (
          <View style={{ marginTop: spacing.md }}>
            <Text>{card.description}</Text>
            {card.includes.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <Eyebrow>Includes</Eyebrow>
                {card.includes.map((i) => (
                  <View key={i} style={styles.include}>
                    <Ionicons name="checkmark" size={13} color={colors.accent} style={{ marginTop: 3 }} />
                    <Caption color={colors.textPrimary} style={{ flex: 1, marginLeft: 6 }}>
                      {i}
                    </Caption>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" aria-expanded={open} accessibilityState={{ expanded: open }} hitSlop={10}>
            <Eyebrow color={colors.textPrimary}>{open ? 'Fewer details' : 'Details'}</Eyebrow>
          </Pressable>
          {!card.reservation.reserved ? (
            <Pressable onPress={() => onRequest(card)} accessibilityRole="button" accessibilityLabel={`Ask the concierge about ${card.title}`} hitSlop={10}>
              <Eyebrow color={colors.accent}>{card.availability.status === 'unavailable' ? 'Ask the concierge' : 'Request'}</Eyebrow>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function Fact({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={14} color={colors.textMuted} style={{ marginTop: 3 }} />
      <Caption color={colors.textPrimary} style={{ flex: 1, marginLeft: 6 }}>
        {text}
      </Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  mediaCaption: { flex: 1, justifyContent: 'flex-end', padding: spacing.md },
  reason: { flexDirection: 'row', marginTop: spacing.sm },
  reasonText: { flex: 1, marginLeft: 6, fontSize: 16, lineHeight: 22 },
  facts: { marginTop: spacing.md, gap: 4 },
  fact: { flexDirection: 'row' },
  statusRow: { flexDirection: 'row' },
  include: { flexDirection: 'row', marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
});
