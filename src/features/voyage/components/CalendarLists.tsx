import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { CalendarEntryKind } from '@/domain';
import { Caption, Card, Divider, EmptyNote, Eyebrow, InlineError, Section, StatusLine, Text } from '@/components';
import { colors, radii, spacing } from '@/theme';
import type { CalendarDayModel, CategorySectionModel, DocumentLine } from '../voyageModel';
import { BookingRow, SuggestionRow } from './Rows';

type IconName = ComponentProps<typeof Ionicons>['name'];

const KIND_ICON: Record<CalendarEntryKind, IconName> = {
  'yacht-event': 'boat-outline',
  dining: 'restaurant-outline',
  spa: 'leaf-outline',
  excursion: 'map-outline',
  private: 'sparkles-outline',
  transport: 'car-outline',
  flight: 'airplane-outline',
  port: 'navigate-outline',
};

type Filter = 'all' | 'yacht' | 'dining' | 'spa' | 'excursions' | 'private' | 'transport';
const FILTERS: { key: Filter; label: string; kinds: CalendarEntryKind[] }[] = [
  { key: 'all', label: 'All', kinds: [] },
  { key: 'yacht', label: 'Yacht', kinds: ['yacht-event', 'port'] },
  { key: 'dining', label: 'Dining', kinds: ['dining'] },
  { key: 'spa', label: 'Spa', kinds: ['spa'] },
  { key: 'excursions', label: 'Excursions', kinds: ['excursion'] },
  { key: 'private', label: 'Private', kinds: ['private'] },
  { key: 'transport', label: 'Travel', kinds: ['transport', 'flight'] },
];

// ─── Calendar ──────────────────────────────────────────────────────────────

export function CalendarSection({ days, error, onRetry }: { days: CalendarDayModel[]; error?: unknown; onRetry: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const kinds = FILTERS.find((f) => f.key === filter)!.kinds;
  const visible = days
    .map((d) => ({ ...d, entries: filter === 'all' ? d.entries : d.entries.filter((e) => kinds.includes(e.kind)) }))
    .filter((d) => d.entries.length > 0);

  if (error) {
    return (
      <Section>
        <InlineError error={error} onRetry={onRetry} />
      </Section>
    );
  }
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginTop: spacing.lg }}>
        <View role="radiogroup" aria-label="Show" accessibilityLabel="Show" style={styles.chipRow}>
          {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} role="radio" accessibilityState={{ checked: active }} aria-checked={active} hitSlop={6} style={[styles.chip, active && styles.chipActive]}>
              <Caption color={active ? colors.textInverse : colors.textPrimary}>{f.label}</Caption>
            </Pressable>
          );
          })}
        </View>
      </ScrollView>
      {visible.length === 0 ? (
        <Section>
          <EmptyNote body={days.length === 0 ? 'Your calendar will fill as your voyage takes shape.' : 'Nothing of this kind is planned. Your concierge can arrange it.'} />
        </Section>
      ) : (
        visible.map((d) => (
          <Section key={d.date} eyebrow={`${d.subheading}${d.isToday ? ' · Today' : ''}`} title={d.heading}>
            {d.meta ? <Caption style={{ marginBottom: spacing.sm }}>{d.meta}</Caption> : null}
            <Card style={{ paddingVertical: spacing.sm }}>
              {d.entries.map((e, i) => (
                <View key={e.id}>
                  {i > 0 && <Divider />}
                  <View style={styles.entry} accessible accessibilityLabel={`${e.time}, ${e.title}, ${e.location}${e.status ? `, ${e.status.label}` : ''}`}>
                    <Text variant="bodyStrong" style={styles.time}>
                      {e.time}
                    </Text>
                    <Ionicons name={KIND_ICON[e.kind]} size={16} color={e.suggestion ? colors.textMuted : colors.accentText} style={{ marginTop: 3 }} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text color={e.suggestion ? colors.textSecondary : colors.textPrimary}>{e.title}</Text>
                      <Caption>
                        {e.location}
                        {e.endTime ? ` · until ${e.endTime.replace(/^lands /, '')}` : ''}
                      </Caption>
                      {e.status ? <StatusLine label={e.status.label} tone={e.status.tone} style={{ marginTop: 2 }} /> : null}
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          </Section>
        ))
      )}
    </>
  );
}

// ─── Dining / Spa / Experiences ────────────────────────────────────────────

export function CategorySection({ model, error, onArrange, onRetry }: { model: CategorySectionModel; error?: unknown; onArrange: () => void; onRetry: () => void }) {
  return (
    <>
      {model.intro ? (
        <Section>
          <Text variant="subtitle" color={colors.textSecondary}>
            {model.intro}
          </Text>
        </Section>
      ) : null}
      <Section eyebrow="Reserved">
        {error ? (
          <InlineError error={error} onRetry={onRetry} />
        ) : model.booked.length === 0 ? (
          <EmptyNote body={`No ${model.title.toLowerCase()} reservations yet.`} actionLabel="Ask the concierge" onAction={onArrange} />
        ) : (
          model.booked.map((g) => (
            <View key={g.dayLabel} style={{ marginBottom: spacing.md }}>
              <Eyebrow style={{ marginBottom: spacing.xs }}>{g.dayLabel}</Eyebrow>
              <Card style={{ paddingVertical: spacing.xs }}>
                {g.items.map((b, i) => (
                  <View key={b.id}>
                    {i > 0 && <Divider />}
                    <BookingRow booking={b} />
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </Section>
      {model.available.length > 0 ? (
        <Section eyebrow="Also available to you">
          {model.available.map((s) => (
            <SuggestionRow key={s.id} item={s} />
          ))}
          <View style={{ marginTop: spacing.md }}>
            <Pressable onPress={onArrange} accessibilityRole="button" hitSlop={14}>
              <Eyebrow color={colors.accentText}>Arrange through the concierge</Eyebrow>
            </Pressable>
          </View>
        </Section>
      ) : null}
    </>
  );
}

// ─── Documents ─────────────────────────────────────────────────────────────

export function DocumentsSection({ summary, items, onHelp }: { summary: string; items: DocumentLine[]; onHelp: () => void }) {
  return (
    <>
      <Section>
        <Text variant="subtitle" color={colors.textSecondary}>
          {summary}
        </Text>
      </Section>
      <Section eyebrow="Travel documents">
        <Card>
          {items.map((d, i) => (
            <View key={d.id}>
              {i > 0 && <Divider />}
              <View style={styles.doc}>
                <Ionicons
                  name={d.status.tone === 'calm' ? 'checkmark-circle-outline' : d.status.tone === 'pending' ? 'time-outline' : 'ellipse-outline'}
                  size={18}
                  color={d.status.tone === 'calm' ? colors.calm : d.status.tone === 'pending' ? colors.textMuted : colors.accentText}
                />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text variant="bodyStrong">{d.label}</Text>
                  <Caption>{d.detail}</Caption>
                </View>
                <StatusLine label={d.status.label} tone={d.status.tone} />
              </View>
            </View>
          ))}
        </Card>
        <Caption style={{ marginTop: spacing.md }}>
          Document numbers are never shown in the app. For help with any document, your concierge is a message away.
        </Caption>
        <Pressable onPress={onHelp} accessibilityRole="button" hitSlop={14} style={{ marginTop: spacing.sm }}>
          <Eyebrow color={colors.accentText}>Ask for help</Eyebrow>
        </Pressable>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: spacing.gutter, gap: spacing.xs },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  chipRow: { flexDirection: 'row', gap: spacing.xs },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  entry: { flexDirection: 'row', paddingVertical: spacing.xs },
  time: { width: 52 },
  doc: { flexDirection: 'row', alignItems: 'center' },
});
