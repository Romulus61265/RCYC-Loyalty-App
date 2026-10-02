import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ExperienceBooking, ExperienceCategory } from '@/domain';
import {
  AlertNote,
  Button,
  Caption,
  Card,
  Divider,
  ErrorState,
  Eyebrow,
  Hero,
  LoadingState,
  MediaTile,
  Screen,
  Section,
  Text,
  TextLink,
} from '@/components';
import { useServices } from '@/services/ServiceProvider';
import { useJourney } from '@/hooks/useJourney';
import { useAsync } from '@/hooks/useAsync';
import { colors, spacing } from '@/theme';
import { daysUntil, formatDateRange, formatLongDate, formatTime, greeting } from '@/utils/format';

const RESERVED: { category: ExperienceCategory; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { category: 'dining', label: 'Dining', icon: 'restaurant-outline' },
  { category: 'excursion', label: 'Ashore', icon: 'map-outline' },
  { category: 'spa', label: 'Spa', icon: 'leaf-outline' },
];

export default function HomeScreen() {
  const services = useServices();
  const { guestId, reservationId, voyageId } = useJourney();
  const insets = useSafeAreaInsets();
  const now = services.clock.now();

  const { data, loading, error, reload } = useAsync(async () => {
    const [profile, recognition, overview, bookings, alerts, recs, catalogue] = await Promise.all([
      services.profile.getProfile(guestId),
      services.loyalty.getRecognition(guestId, voyageId),
      services.voyage.getOverview(reservationId),
      services.experience.listBookings(reservationId),
      services.journeyEvents.listAlerts(reservationId),
      services.personalization.getRecommendations(guestId, 'home', { reservationId, limit: 3 }),
      services.experience.listCatalogue(voyageId),
    ]);
    return { profile, recognition, overview, bookings, alerts, recs, catalogue };
  }, [guestId, reservationId, voyageId]);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState onRetry={reload} />;

  const { profile, recognition, overview, bookings, alerts, recs, catalogue } = data;
  const { voyage, yacht, suite, embarkation } = overview;
  const name = profile.guest.preferredName ?? profile.guest.firstName;
  const days = daysUntil(embarkation.arrivalWindowStart, now);
  const upcoming = bookings.filter((b) => Date.parse(b.start) >= now.getTime());
  const next = upcoming[0];
  const firstOf = (c: ExperienceCategory) => upcoming.find((b) => b.category === c);

  return (
    <Screen edgeToEdge>
      <Hero
        media={voyage.hero}
        topInset={insets.top}
        eyebrow={`${greeting(now)}, ${name}`}
        title={days > 1 ? `${days} days until Barcelona` : days === 1 ? 'Tomorrow, Barcelona' : 'Welcome aboard'}
        subtitle={voyage.name}
      />

      {/* Recognition — a quiet line, not a points dashboard */}
      <View style={styles.recognition}>
        <View style={{ flex: 1 }}>
          <Eyebrow color={colors.accent}>Marriott Bonvoy {recognition.membership.tierLabel}</Eyebrow>
          <Text variant="subtitle" style={{ marginTop: spacing.xxs }}>
            {recognition.recognitionLine}
          </Text>
        </View>
        <TextLink label="Privileges" onPress={() => router.push('/profile')} />
      </View>

      {alerts.length > 0 && (
        <Section eyebrow="For your attention">
          {alerts.map((a) => (
            <AlertNote
              key={a.id}
              alert={a}
              onAction={a.action ? () => router.push(a.action!.route as '/voyage') : undefined}
              onDismiss={() => services.journeyEvents.acknowledge(a.id).then(reload)}
            />
          ))}
        </Section>
      )}

      <Section eyebrow="Your voyage" title={`${yacht.name} · ${suite.name} ${suite.number}`}>
        <Card onPress={() => router.push('/voyage')} accessibilityLabel="Open voyage details">
          <Caption>{formatDateRange(voyage.startDate, voyage.endDate)} · {voyage.nights} nights</Caption>
          <Divider />
          <Eyebrow>Embarkation</Eyebrow>
          <Text variant="bodyStrong" style={{ marginTop: spacing.xxs }}>
            {formatLongDate(embarkation.arrivalWindowStart)}, {formatTime(embarkation.arrivalWindowStart)}–{formatTime(embarkation.arrivalWindowEnd)}
          </Text>
          <Caption style={{ marginTop: 2 }}>{embarkation.terminalName}</Caption>
          <Caption style={{ marginTop: spacing.sm }} color={colors.textPrimary}>
            Your suite will be ready from {formatTime(embarkation.suiteReadyAt)}. {overview.reservation.suiteAmbassador} will greet you at the gangway.
          </Caption>
        </Card>
      </Section>

      {next && (
        <Section eyebrow="Next on your journey">
          <BookingLine booking={next} emphasis />
        </Section>
      )}

      <Section eyebrow="Reserved for you">
        <Card>
          {RESERVED.map((r, i) => {
            const b = firstOf(r.category) ?? (r.category === 'excursion' ? firstOf('private') : undefined);
            return (
              <View key={r.category}>
                {i > 0 && <Divider />}
                <View style={styles.reservedRow}>
                  <Ionicons name={r.icon} size={18} color={colors.accent} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Eyebrow>{r.label}</Eyebrow>
                    {b ? (
                      <>
                        <Text variant="bodyStrong" style={{ marginTop: 2 }}>{b.title}</Text>
                        <Caption>{formatLongDate(b.start)} · {formatTime(b.start)}</Caption>
                      </>
                    ) : (
                      <Caption style={{ marginTop: 2 }}>Nothing reserved yet</Caption>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section eyebrow="Chosen for you" title="For this voyage">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.gutter }} contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.md }}>
          {recs.map((r) => {
            const exp = catalogue.find((e) => e.id === r.experienceId);
            return exp ? <MediaTile key={r.id} media={exp.hero} eyebrow={exp.destination ?? 'Aboard'} title={exp.title} caption={r.rationale} /> : null;
          })}
        </ScrollView>
      </Section>

      <Section>
        <Card style={{ backgroundColor: colors.surfaceInverse }}>
          <Eyebrow color={colors.textInverseMuted}>At your service</Eyebrow>
          <Text variant="title" color={colors.textInverse} style={{ marginTop: spacing.xs }}>
            Anything you wish, before or during your voyage.
          </Text>
          <Caption color={colors.textInverseMuted} style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
            Ask the concierge, or speak with {overview.reservation.suiteAmbassador}, your Suite Ambassador.
          </Caption>
          <Button label="Open concierge" variant="inverse" onPress={() => router.push('/concierge')} />
        </Card>
      </Section>
    </Screen>
  );
}

function BookingLine({ booking, emphasis }: { booking: ExperienceBooking; emphasis?: boolean }) {
  return (
    <Card>
      <Caption>{formatLongDate(booking.start)} · {formatTime(booking.start)}</Caption>
      <Text variant={emphasis ? 'title' : 'bodyStrong'} style={{ marginTop: spacing.xxs }}>{booking.title}</Text>
      <Caption style={{ marginTop: 2 }}>{booking.venue}</Caption>
      {booking.note ? <Caption style={{ marginTop: spacing.sm }} color={colors.textPrimary}>{booking.note}</Caption> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  recognition: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  reservedRow: { flexDirection: 'row' },
});
