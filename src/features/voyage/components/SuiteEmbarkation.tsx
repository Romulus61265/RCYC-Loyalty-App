import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Caption, Card, Divider, Eyebrow, FactRow, MediaFrame, Section, StatusLine, Text } from '@/components';
import { colors, spacing } from '@/theme';
import type { EmbarkationSectionModel, SuiteSectionModel } from '../voyageModel';
import { FactList } from './Rows';

// ─── My Suite ──────────────────────────────────────────────────────────────

export function SuiteSection({ model, onContact }: { model: SuiteSectionModel; onContact: () => void }) {
  return (
    <>
      <Section eyebrow={`${model.categoryLabel} · ${model.deck} · Suite ${model.number}`} title={model.title}>
        <MediaFrame media={model.media} height={220} />
        <View style={{ marginTop: spacing.lg }}>
          <FactRow facts={model.size} />
        </View>
      </Section>
      <Section eyebrow="In your suite">
        <Card>
          {model.amenities.map((a, i) => (
            <View key={a} style={[styles.amenity, i > 0 && { marginTop: spacing.sm }]}>
              <Ionicons name="checkmark" size={14} color={colors.accentText} style={{ marginTop: 4 }} />
              <Text style={{ flex: 1, marginLeft: spacing.sm }}>{a}</Text>
            </View>
          ))}
        </Card>
      </Section>
      <Section eyebrow="Prepared to your preferences">
        <Card>
          <FactList facts={model.preferences} />
        </Card>
      </Section>
      {model.ambassador ? (
        <Section eyebrow="Your Suite Ambassador">
          <Card>
            <Text variant="title">{model.ambassador.name}</Text>
            <Caption>{model.ambassador.title}</Caption>
            <Divider />
            <FactList
              facts={[
                { label: 'Available', value: model.ambassador.availability },
                ...(model.ambassador.telephone ? [{ label: 'Telephone', value: model.ambassador.telephone }] : []),
                ...(model.ambassador.languages ? [{ label: 'Languages', value: model.ambassador.languages }] : []),
                { label: 'Reach her by', value: model.ambassador.channels.join(' · ') },
              ]}
            />
            <View style={{ marginTop: spacing.md }}>
              <Button label={`Message ${model.ambassador.name.split(' ')[0]}`} onPress={onContact} />
            </View>
          </Card>
        </Section>
      ) : null}
    </>
  );
}

// ─── Embarkation ───────────────────────────────────────────────────────────

export function EmbarkationSection({ model, onDocuments }: { model: EmbarkationSectionModel; onDocuments: () => void }) {
  return (
    <>
      <Section eyebrow={`${model.port} · ${model.dateLabel}`} title={`Your arrival window, ${model.arrivalWindow}`}>
        <Card>
          <Eyebrow>Terminal</Eyebrow>
          <Text variant="bodyStrong" style={{ marginTop: 2 }}>
            {model.terminal}
          </Text>
          <Caption>{model.address}</Caption>
          <Divider />
          <FactRow facts={model.timings} />
          {model.notes.map((n) => (
            <Caption key={n} color={colors.textPrimary} style={{ marginTop: spacing.sm }}>
              {n}
            </Caption>
          ))}
        </Card>
      </Section>

      <Section eyebrow="Transfer">
        {model.transfer ? (
          <Card>
            <Text variant="bodyStrong">{model.transfer.title}</Text>
            <Caption>
              {model.transfer.whenLabel} · {model.transfer.venue}
            </Caption>
            <StatusLine label={model.transfer.status.label} tone={model.transfer.status.tone} style={{ marginTop: spacing.xs }} />
            {model.transfer.flight ? <Caption style={{ marginTop: spacing.xs }}>{model.transfer.flight}</Caption> : null}
            {model.transfer.note ? (
              <Caption color={colors.textPrimary} style={{ marginTop: spacing.xs }}>
                {model.transfer.note}
              </Caption>
            ) : null}
          </Card>
        ) : (
          <Caption>No transfer arranged. Your concierge can arrange a car from the airport or your hotel.</Caption>
        )}
      </Section>

      {model.luggage ? (
        <Section eyebrow="Luggage">
          <Card>
            <Text>{model.luggage.summary}</Text>
            <View style={{ marginTop: spacing.md }}>
              <FactList facts={model.luggage.facts} />
            </View>
          </Card>
        </Section>
      ) : null}

      <Section eyebrow="Documentation">
        <Card onPress={onDocuments} accessibilityRole="link">
          <View style={styles.between}>
            <Text variant="bodyStrong">
              {model.documents.complete} of {model.documents.total} complete
            </Text>
            <StatusLine label={model.documents.status.label} tone={model.documents.status.tone} />
          </View>
          {model.documents.outstanding.map((d) => (
            <Caption key={d} color={colors.textPrimary} style={{ marginTop: spacing.xs }}>
              Still needed: {d}
            </Caption>
          ))}
        </Card>
      </Section>

      <Section eyebrow="Online check-in">
        <Card>
          <StatusLine label={model.checkIn.status.label} tone={model.checkIn.status.tone} />
          <View style={{ marginTop: spacing.sm }}>
            {model.checkIn.steps.map((s) => (
              <View key={s.label} style={styles.step} accessible accessibilityLabel={`${s.label}: ${s.done ? 'done' : 'to do'}`}>
                <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={s.done ? colors.calm : colors.accentText} />
                <Text style={{ marginLeft: spacing.sm, flex: 1 }} color={s.done ? colors.textSecondary : colors.textPrimary}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  amenity: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
});
