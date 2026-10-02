import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DaySchedule, ExperienceBooking, ExperienceCategory, TravelDocument, VoyageOverview } from '@/domain';
import {
  Caption,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  Eyebrow,
  LoadingState,
  MediaFrame,
  PageHeader,
  Screen,
  Section,
  SegmentedTabs,
  Text,
} from '@/components';
import { useServices } from '@/services/ServiceProvider';
import { useJourney } from '@/hooks/useJourney';
import { useAsync } from '@/hooks/useAsync';
import { colors, radii, spacing } from '@/theme';
import { formatDateRange, formatLongDate, formatShortDate, formatTime } from '@/utils/format';

type Tab = 'itinerary' | 'day' | 'reservations' | 'suite' | 'travel';

const TABS: { value: Tab; label: string }[] = [
  { value: 'itinerary', label: 'Itinerary' },
  { value: 'day', label: 'Day by day' },
  { value: 'reservations', label: 'Reservations' },
  { value: 'suite', label: 'Suite & yacht' },
  { value: 'travel', label: 'Travel' },
];

export default function VoyageScreen() {
  const services = useServices();
  const { reservationId } = useJourney();
  const [tab, setTab] = useState<Tab>('itinerary');

  const { data, loading, error, reload } = useAsync(async () => {
    const [overview, bookings, days] = await Promise.all([
      services.voyage.getOverview(reservationId),
      services.experience.listBookings(reservationId),
      services.experience.listDaySchedules(reservationId),
    ]);
    return { overview, bookings, days };
  }, [reservationId]);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState onRetry={reload} />;
  const { overview, bookings, days } = data;

  return (
    <Screen>
      <PageHeader
        eyebrow={`${overview.yacht.name} · ${formatDateRange(overview.voyage.startDate, overview.voyage.endDate)}`}
        title={overview.voyage.name}
        subtitle={`${overview.voyage.nights} nights · Barcelona to Rome`}
      />
      <SegmentedTabs options={TABS} value={tab} onChange={setTab} />
      {tab === 'itinerary' && <Itinerary overview={overview} />}
      {tab === 'day' && <DayByDay days={days} overview={overview} />}
      {tab === 'reservations' && <Reservations bookings={bookings} days={days} />}
      {tab === 'suite' && <SuiteAndYacht overview={overview} />}
      {tab === 'travel' && <Travel overview={overview} bookings={bookings} />}
    </Screen>
  );
}

function Itinerary({ overview }: { overview: VoyageOverview }) {
  return (
    <Section>
      {overview.voyage.itinerary.map((pc, i) => (
        <View key={pc.id} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View style={[styles.dot, (pc.type === 'embark' || pc.type === 'disembark') && { backgroundColor: colors.accent }]} />
            {i < overview.voyage.itinerary.length - 1 && <View style={styles.rail} />}
          </View>
          <View style={{ flex: 1, paddingBottom: spacing.xl }}>
            <Eyebrow>Day {pc.day} · {formatShortDate(pc.date)}</Eyebrow>
            <Text variant="title" style={{ marginTop: 2 }}>{pc.portName}</Text>
            <Caption>{pc.country}{pc.type === 'overnight' ? ' · Overnight' : pc.type === 'tender' ? ' · By tender' : ''}</Caption>
            <Text style={{ marginTop: spacing.xs }}>{pc.summary}</Text>
            <Caption style={{ marginTop: spacing.xs }}>
              {[pc.arrival && `Arrive ${formatTime(pc.arrival)}`, pc.allAboard && `All aboard ${formatTime(pc.allAboard)}`, pc.departure && `Depart ${formatTime(pc.departure)}`]
                .filter(Boolean)
                .join('  ·  ')}
            </Caption>
          </View>
        </View>
      ))}
    </Section>
  );
}

function DayByDay({ days, overview }: { days: DaySchedule[]; overview: VoyageOverview }) {
  const [selected, setSelected] = useState(1);
  const day = days.find((d) => d.dayNumber === selected) ?? days[0];
  const port = overview.voyage.itinerary.find((p) => p.id === day?.portCallId);
  if (!day) return null;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {days.map((d) => {
          const active = d.dayNumber === selected;
          return (
            <Pressable key={d.dayNumber} onPress={() => setSelected(d.dayNumber)} style={[styles.dayChip, active && styles.dayChipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <Eyebrow color={active ? colors.textInverse : colors.textMuted}>Day {d.dayNumber}</Eyebrow>
              <Text variant="bodyStrong" color={active ? colors.textInverse : colors.textPrimary}>{formatShortDate(d.date)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Section eyebrow={formatLongDate(day.date)} title={day.headline}>
        {port && <MediaFrame media={port.hero} height={160} style={{ marginBottom: spacing.lg }} />}
        <Caption>
          {[day.dressCode && `Dress: ${day.dressCode}`, day.sunset && `Sunset ${formatTime(day.sunset)}`].filter(Boolean).join('  ·  ')}
        </Caption>
        <View style={{ marginTop: spacing.md }}>
          {day.items.map((item) => (
            <View key={item.id} style={styles.scheduleRow}>
              <Text variant="bodyStrong" style={styles.scheduleTime}>{formatTime(item.start)}</Text>
              <View style={{ flex: 1 }}>
                <Text color={item.kind === 'recommendation' ? colors.textSecondary : colors.textPrimary}>{item.title}</Text>
                <Caption>{item.location}{item.kind === 'recommendation' ? ' · Suggested for you' : item.kind === 'booking' ? ' · Reserved' : ''}</Caption>
              </View>
            </View>
          ))}
        </View>
      </Section>
    </>
  );
}

const RESERVATION_GROUPS: { label: string; categories: ExperienceCategory[] }[] = [
  { label: 'Restaurants', categories: ['dining'] },
  { label: 'Spa', categories: ['spa'] },
  { label: 'Shore excursions', categories: ['excursion', 'private', 'culture', 'wine'] },
  { label: 'Transfers', categories: ['transfer'] },
];

function Reservations({ bookings, days }: { bookings: ExperienceBooking[]; days: DaySchedule[] }) {
  const shipEvents = days.flatMap((d) => d.items.filter((i) => i.kind === 'ship-event' && (i.category === 'marina' || i.category === 'entertainment' || /Champagne/.test(i.title))));
  return (
    <>
      {RESERVATION_GROUPS.map((g) => {
        const list = bookings.filter((b) => g.categories.includes(b.category));
        return (
          <Section key={g.label} eyebrow={g.label}>
            {list.length === 0 ? (
              <Caption>Nothing reserved yet — the concierge can arrange this for you.</Caption>
            ) : (
              <Card>
                {list.map((b, i) => (
                  <View key={b.id}>
                    {i > 0 && <Divider />}
                    <View style={{ flexDirection: 'row' }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong">{b.title}</Text>
                        <Caption>{formatLongDate(b.start)} · {formatTime(b.start)} · {b.venue}</Caption>
                      </View>
                      <StatusMark status={b.status} />
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </Section>
        );
      })}
      <Section eyebrow="Marina & special events">
        <Card>
          {shipEvents.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <Divider />}
              <Text variant="bodyStrong">{e.title}</Text>
              <Caption>{formatLongDate(e.start)} · {formatTime(e.start)} · {e.location}</Caption>
            </View>
          ))}
        </Card>
      </Section>
    </>
  );
}

function StatusMark({ status }: { status: ExperienceBooking['status'] }) {
  const confirmed = status === 'confirmed';
  return (
    <Caption color={confirmed ? colors.calm : colors.accent} style={{ marginLeft: spacing.sm }}>
      {confirmed ? 'Confirmed' : 'Being arranged'}
    </Caption>
  );
}

function SuiteAndYacht({ overview }: { overview: VoyageOverview }) {
  const { suite, yacht, reservation } = overview;
  return (
    <>
      <Section eyebrow={`Suite ${suite.number} · Deck ${suite.deck}`} title={suite.name}>
        <MediaFrame media={suite.hero} height={220} style={{ marginBottom: spacing.lg }} />
        <DetailRow label="Living" value={`${suite.areaSqm} m²`} detail={suite.terraceSqm ? `Plus ${suite.terraceSqm} m² terrace` : undefined} />
        <DetailRow label="Ambassador" value={reservation.suiteAmbassador ?? 'To be assigned'} detail="Your dedicated point of contact, aboard and ashore" />
        <Divider />
        {suite.features.map((f) => (
          <Text key={f} style={{ marginBottom: spacing.xs }}>— {f}</Text>
        ))}
      </Section>
      <Section eyebrow="The yacht" title={yacht.name}>
        <Text variant="subtitle" color={colors.textSecondary}>{yacht.tagline}</Text>
        <View style={styles.facts}>
          <Fact value={`${yacht.suites}`} label="Suites" />
          <Fact value={`${yacht.guestCapacity}`} label="Guests" />
          <Fact value={`${yacht.crew}`} label="Crew" />
          <Fact value={`${yacht.lengthMeters} m`} label="Length" />
        </View>
        {yacht.highlights.map((h) => (
          <Text key={h} style={{ marginBottom: spacing.xs }}>— {h}</Text>
        ))}
      </Section>
    </>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text variant="title">{value}</Text>
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
}

const DOC_STATUS: Record<TravelDocument['status'], { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  verified: { label: 'Complete', color: colors.calm, icon: 'checkmark-circle-outline' },
  submitted: { label: 'Under review', color: colors.textMuted, icon: 'time-outline' },
  required: { label: 'Required', color: colors.accent, icon: 'ellipse-outline' },
  expired: { label: 'Expired', color: colors.attention, icon: 'alert-circle-outline' },
  'not-required': { label: 'Not required', color: colors.textMuted, icon: 'remove-outline' },
};

function Travel({ overview, bookings }: { overview: VoyageOverview; bookings: ExperienceBooking[] }) {
  const { embarkation, documents } = overview;
  const transfers = bookings.filter((b) => b.category === 'transfer');
  return (
    <>
      <Section eyebrow="Embarkation" title={embarkation.terminalName}>
        <Card>
          <DetailRow label="Address" value={embarkation.address} />
          <DetailRow label="Your arrival" value={`${formatTime(embarkation.arrivalWindowStart)} – ${formatTime(embarkation.arrivalWindowEnd)}`} detail={formatLongDate(embarkation.arrivalWindowStart)} />
          <DetailRow label="Suite ready" value={formatTime(embarkation.suiteReadyAt)} />
          <DetailRow label="All aboard" value={formatTime(embarkation.allAboard)} detail={`Sailing at ${formatTime(embarkation.departure)}`} />
          <Divider />
          {embarkation.notes.map((n) => (
            <Caption key={n} color={colors.textPrimary} style={{ marginBottom: spacing.xs }}>{n}</Caption>
          ))}
        </Card>
      </Section>
      <Section eyebrow="Transfers">
        {transfers.map((t) => (
          <Card key={t.id} style={{ marginBottom: spacing.sm }}>
            <Text variant="bodyStrong">{t.title}</Text>
            <Caption>{formatLongDate(t.start)} · {formatTime(t.start)} · {t.venue}</Caption>
            {t.note ? <Caption color={colors.textPrimary} style={{ marginTop: spacing.xs }}>{t.note}</Caption> : null}
          </Card>
        ))}
      </Section>
      <Section eyebrow="Travel documents">
        <Card>
          {documents.map((d, i) => {
            const s = DOC_STATUS[d.status];
            return (
              <View key={d.id}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name={s.icon} size={18} color={s.color} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text variant="bodyStrong">{d.label}</Text>
                    <Caption>{d.detail ?? (d.dueBy ? `Due by ${formatShortDate(d.dueBy)}` : s.label)}</Caption>
                  </View>
                  <Caption color={s.color}>{s.label}</Caption>
                </View>
              </View>
            );
          })}
        </Card>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  timelineRow: { flexDirection: 'row' },
  timelineRail: { width: 24, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.borderStrong, marginTop: 4 },
  rail: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginTop: 4 },
  dayStrip: { paddingHorizontal: spacing.gutter, gap: spacing.xs, paddingTop: spacing.lg },
  dayChip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, alignItems: 'center' },
  dayChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  scheduleRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  scheduleTime: { width: 64 },
  facts: { flexDirection: 'row', marginVertical: spacing.lg, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
});
