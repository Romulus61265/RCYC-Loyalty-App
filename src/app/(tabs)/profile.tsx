import { StyleSheet, View } from 'react-native';
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
  Text,
} from '@/components';
import { useServices } from '@/services/ServiceProvider';
import { useJourney } from '@/hooks/useJourney';
import { useAsync } from '@/hooks/useAsync';
import { colors, radii, spacing } from '@/theme';
import { formatDateRange, formatShortDate } from '@/utils/format';

/** A failure here is contained to this tab; the tab bar stays usable. */
export { ErrorFallback as ErrorBoundary } from '@/components';

export default function ProfileScreen() {
  const services = useServices();
  const { guestId, voyageId, reservationId } = useJourney();

  const { data, loading, error, reload } = useAsync(async () => {
    const [profile, recognition, past, overview] = await Promise.all([
      services.profile.getProfile(guestId),
      services.loyalty.getRecognition(guestId, voyageId),
      services.voyage.getPastVoyages(guestId),
      services.voyage.getOverview(reservationId),
    ]);
    return { profile, recognition, past, overview };
  }, [guestId, voyageId, reservationId]);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const { profile, recognition, past, overview } = data;
  const { guest, preferences: p, companions, occasions } = profile;
  const { membership, relationship, privileges } = recognition;

  return (
    <Screen>
      <PageHeader eyebrow="Profile" title={`${guest.firstName} ${guest.lastName}`} subtitle={`Our guest since ${new Date(guest.guestSince).getFullYear()}`} />

      {/* Bonvoy identity — status first, points intentionally secondary */}
      <View style={{ paddingHorizontal: spacing.gutter }}>
        <View style={styles.memberCard}>
          <Eyebrow color={colors.textInverseMuted}>Marriott Bonvoy</Eyebrow>
          <Text variant="display" color={colors.textInverse} style={{ marginTop: spacing.xs }}>
            {membership.tierLabel}
          </Text>
          {membership.lifetimeStatus ? <Text variant="subtitle" color={colors.accentSoft}>{membership.lifetimeStatus}</Text> : null}
          <View style={styles.memberMeta}>
            <View>
              <Eyebrow color={colors.textInverseMuted}>Member</Eyebrow>
              <Caption color={colors.textInverse}>{membership.memberNumberMasked}</Caption>
            </View>
            <View>
              <Eyebrow color={colors.textInverseMuted}>Since</Eyebrow>
              <Caption color={colors.textInverse}>{new Date(membership.memberSince).getFullYear()}</Caption>
            </View>
            {membership.pointsBalance !== undefined && (
              <View>
                <Eyebrow color={colors.textInverseMuted}>Points</Eyebrow>
                <Caption color={colors.textInverse}>{membership.pointsBalance.toLocaleString('en-GB')}</Caption>
              </View>
            )}
          </View>
        </View>
      </View>

      <Section eyebrow="With the Yacht Collection">
        <View style={styles.facts}>
          <Fact value={String(relationship.voyagesCompleted)} label="Voyages" />
          <Fact value={String(relationship.nightsSailed)} label="Nights" />
          <Fact value={String(relationship.yachtsSailed.length)} label="Yachts" />
        </View>
      </Section>

      <Section eyebrow="Your privileges this voyage">
        <Card>
          {privileges.map((pr, i) => (
            <View key={pr.id}>
              {i > 0 && <Divider />}
              <Text variant="bodyStrong">{pr.title}</Text>
              <Caption style={{ marginTop: 2 }}>{pr.description}</Caption>
            </View>
          ))}
        </Card>
      </Section>

      <Section eyebrow="Voyages">
        <Eyebrow color={colors.accent} style={{ marginBottom: spacing.sm }}>Upcoming</Eyebrow>
        <View style={styles.voyageRow}>
          <MediaFrame media={overview.voyage.hero} height={64} style={{ width: 64 }} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text variant="bodyStrong">{overview.voyage.name}</Text>
            <Caption>{overview.yacht.name} · {formatDateRange(overview.voyage.startDate, overview.voyage.endDate)}</Caption>
          </View>
        </View>
        <Eyebrow style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>Remembered</Eyebrow>
        {past.map((v) => (
          <View key={v.id} style={styles.voyageRow}>
            <MediaFrame media={v.hero} height={64} style={{ width: 64 }} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text variant="bodyStrong">{v.name}</Text>
              <Caption>{formatDateRange(v.startDate, v.endDate)} · {v.nights} nights</Caption>
            </View>
          </View>
        ))}
      </Section>

      <Section eyebrow="Personal">
        <Card>
          <DetailRow label="Address as" value={guest.salutation} />
          <DetailRow label="E-mail" value={guest.emailMasked} />
          {guest.phoneMasked ? <DetailRow label="Telephone" value={guest.phoneMasked} /> : null}
          {guest.homeCity ? <DetailRow label="Home" value={guest.homeCity} /> : null}
        </Card>
      </Section>

      <Section eyebrow="Travelling with you">
        <Card>
          {companions.map((c) => (
            <DetailRow key={c.id} label={capitalise(c.relationship)} value={`${c.firstName} ${c.lastName}`} detail={c.notes} />
          ))}
        </Card>
      </Section>

      <Section eyebrow="Occasions">
        <Card>
          {occasions.map((o) => (
            <DetailRow key={o.id} label={formatShortDate(o.date)} value={o.label} detail={o.recognition === 'discreet' ? 'Acknowledged with discretion' : o.recognition === 'private' ? 'Kept private' : 'Celebrate with us'} />
          ))}
        </Card>
      </Section>

      <Section eyebrow="Preferences" title="What we’ve learned">
        <PrefGroup label="Destinations" values={p.preferredDestinations} />
        <PrefGroup label="Dining" values={[...p.dining.cuisines, p.dining.preferredSeating ?? ''].filter(Boolean)} note={p.dining.notes} />
        <PrefGroup
          label="Dietary"
          values={[...p.dietary.restrictions, ...p.dietary.allergies.map((a) => `${a.allergen} (${a.severity})`)]}
        />
        <PrefGroup label="Wine & beverage" values={[...p.beverage.wine, ...p.beverage.spirits, ...p.beverage.nonAlcoholic]} note={p.beverage.welcomeAmenity ? `Welcome amenity: ${p.beverage.welcomeAmenity}` : undefined} />
        <PrefGroup
          label="Suite"
          values={[p.suite.pillow, p.suite.bedConfiguration && `${capitalise(p.suite.bedConfiguration)} bed`, p.suite.temperatureCelsius && `${p.suite.temperatureCelsius}°C`, ...(p.suite.newspapers ?? [])].filter((v): v is string => Boolean(v))}
          note={p.suite.turndown ? `Turndown: ${p.suite.turndown}` : undefined}
        />
        <PrefGroup label="Interests" values={p.activityInterests} />
      </Section>

      <Section eyebrow="Communication">
        <Card>
          <DetailRow
            label="Channels"
            value={Object.entries(p.communication.channels).filter(([, on]) => on).map(([k]) => (k === 'whatsapp' ? 'WhatsApp' : k === 'sms' ? 'SMS' : capitalise(k))).join(', ')}
          />
          {p.communication.quietHours ? <DetailRow label="Quiet hours" value={`${p.communication.quietHours.start} – ${p.communication.quietHours.end}`} detail="Only urgent matters will reach you" /> : null}
          <DetailRow label="Offers" value={p.communication.marketingConsent ? 'Welcome' : 'Only what concerns my voyages'} />
        </Card>
      </Section>
    </Screen>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text variant="display">{value}</Text>
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
}

function PrefGroup({ label, values, note }: { label: string; values: string[]; note?: string }) {
  if (values.length === 0 && !note) return null;
  return (
    <View style={styles.prefGroup}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={{ marginTop: 4 }}>{values.join(' · ')}</Text>
      {note ? <Caption style={{ marginTop: 2 }}>{note}</Caption> : null}
    </View>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  memberCard: { backgroundColor: colors.surfaceInverse, borderRadius: radii.lg, padding: spacing.lg, paddingTop: spacing.xl },
  memberMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(251,249,246,0.2)' },
  facts: { flexDirection: 'row', paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  voyageRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  prefGroup: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
