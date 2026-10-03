import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Caption, Card, Divider, EmptyNote, Eyebrow, FactRow, InlineError, MediaFrame, Section, Text } from '@/components';
import { colors, spacing } from '@/theme';
import type { OverviewModel, PortModel, VoyageSectionKey } from '../voyageModel';
import { BookingRow, FactList, SuggestionRow } from './Rows';

// ─── Overview ──────────────────────────────────────────────────────────────

export function OverviewSection({ model, onOpen }: { model: OverviewModel; onOpen: (s: VoyageSectionKey) => void }) {
  return (
    <>
      <Section>
        <MediaFrame media={model.media} height={200}>
          <View style={styles.mediaCaption}>
            <Eyebrow color={colors.textInverseMuted}>{model.dateRange}</Eyebrow>
            <Text variant="title" color={colors.textInverse} style={{ marginTop: 2 }}>
              {model.route}
            </Text>
          </View>
        </MediaFrame>
        <View style={{ marginTop: spacing.lg }}>
          <FactRow facts={model.stats} />
        </View>
      </Section>
      <Section eyebrow="At a glance">
        <Card>
          <FactList facts={model.facts} />
        </Card>
      </Section>
      <Section eyebrow="Your voyage, section by section">
        <Card style={{ paddingVertical: spacing.xs }}>
          {model.shortcuts.map((s, i) => (
            <View key={s.section}>
              {i > 0 && <Divider />}
              <Pressable onPress={() => onOpen(s.section)} accessibilityRole="button" accessibilityLabel={`${s.label}: ${s.detail}`} style={styles.shortcut}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{s.label}</Text>
                  <Caption color={s.attention ? colors.attention : colors.textSecondary}>{s.detail}</Caption>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </Card>
      </Section>
    </>
  );
}

// ─── Itinerary ─────────────────────────────────────────────────────────────

export function ItinerarySection({ ports, bookingsError, onRetry }: { ports: PortModel[]; bookingsError?: unknown; onRetry: () => void }) {
  return (
    <>
      {bookingsError ? (
        <Section>
          <InlineError error={bookingsError} onRetry={onRetry} />
        </Section>
      ) : null}
      {ports.map((p) => (
        <PortCard key={p.id} port={p} />
      ))}
    </>
  );
}

export function PortCard({ port }: { port: PortModel }) {
  return (
    <Section eyebrow={`Day ${port.day} · ${port.dateLabel}${port.isToday ? ' · Today' : ''}`}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <MediaFrame media={port.media} height={170} rounded={false}>
          <View style={styles.mediaCaption}>
            <Eyebrow color={colors.textInverseMuted}>
              {port.country} · {port.typeLabel}
            </Eyebrow>
            <Text variant="display" color={colors.textInverse} style={{ marginTop: 2 }}>
              {port.name}
            </Text>
          </View>
        </MediaFrame>
        <View style={{ padding: spacing.lg }}>
          <Text>{port.summary}</Text>
          {port.times.length > 0 ? (
            <View style={{ marginTop: spacing.md }}>
              <FactRow facts={port.times} />
            </View>
          ) : null}
          <Caption style={{ marginTop: spacing.sm }}>Local time {port.localTime}</Caption>

          <Divider />
          <Eyebrow>Booked for you</Eyebrow>
          {port.booked.length === 0 ? (
            <EmptyNote body="Nothing booked here yet. Your day is open." />
          ) : (
            port.booked.map((b, i) => (
              <View key={b.id}>
                {i > 0 && <Divider />}
                <BookingRow booking={b} />
              </View>
            ))
          )}

          {port.recommended.length > 0 ? (
            <>
              <Divider />
              <Eyebrow>Chosen for you</Eyebrow>
              {port.recommended.map((r) => (
                <SuggestionRow key={r.id} item={r} />
              ))}
            </>
          ) : null}
        </View>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  mediaCaption: { flex: 1, justifyContent: 'flex-end', padding: spacing.lg },
  shortcut: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
});
