import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Experience, ExperienceCategory } from '@/domain';
import {
  Caption,
  ErrorState,
  LoadingState,
  MediaTile,
  PageHeader,
  Screen,
  Section,
  SegmentedTabs,
  Text,
} from '@/components';
import { useServices } from '@/services/ServiceProvider';
import { useJourney } from '@/hooks/useJourney';
import { useAsync } from '@/hooks/useAsync';
import { colors, spacing } from '@/theme';
import { formatMoney } from '@/utils/format';

type Filter = 'all' | 'destination' | ExperienceCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'destination', label: 'Destinations' },
  { value: 'private', label: 'Private' },
  { value: 'dining', label: 'Culinary' },
  { value: 'wine', label: 'Wine' },
  { value: 'spa', label: 'Spa' },
  { value: 'marina', label: 'Marina' },
  { value: 'entertainment', label: 'Evenings' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'culture', label: 'Culture' },
  { value: 'transfer', label: 'Transport' },
];

export default function DiscoverScreen() {
  const services = useServices();
  const { guestId, voyageId, reservationId } = useJourney();
  const [filter, setFilter] = useState<Filter>('all');

  const { data, loading, error, reload } = useAsync(async () => {
    const [catalogue, collections, destinations, recs] = await Promise.all([
      services.experience.listCatalogue(voyageId),
      services.experience.listCollections(voyageId),
      services.experience.listDestinations(voyageId),
      services.personalization.getRecommendations(guestId, 'discover', { reservationId, limit: 4 }),
    ]);
    return { catalogue, collections, destinations, recs };
  }, [voyageId, guestId, reservationId]);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState onRetry={reload} />;
  const { catalogue, collections, destinations, recs } = data;
  const byId = (id: string) => catalogue.find((e) => e.id === id);

  const showDestinations = filter === 'all' || filter === 'destination';
  const visibleCollections =
    filter === 'all'
      ? collections
      : filter === 'private'
        ? collections.filter((c) => c.category === 'private')
        : collections.filter((c) => c.category === filter || c.experienceIds.some((id) => byId(id)?.category === filter));

  return (
    <Screen>
      <PageHeader eyebrow="Discover" title="The Riviera, curated" subtitle="Seven ports, chosen moments — arranged around you." />
      <SegmentedTabs options={FILTERS} value={filter} onChange={setFilter} />

      {filter === 'all' && (
        <Section eyebrow="Chosen for you" title="With you in mind">
          <Carousel>
            {recs.map((r) => {
              const exp = r.experienceId ? byId(r.experienceId) : undefined;
              return exp ? <MediaTile key={r.id} media={exp.hero} eyebrow={exp.destination ?? 'Aboard'} title={exp.title} caption={r.rationale} /> : null;
            })}
          </Carousel>
        </Section>
      )}

      {showDestinations && (
        <Section eyebrow="Destinations" title="Where you’ll be">
          <Carousel>
            {destinations.map((d) => (
              <MediaTile key={d.id} media={d.hero} eyebrow={d.country} title={d.name} caption={d.standfirst} width={220} height={280} />
            ))}
          </Carousel>
        </Section>
      )}

      {filter !== 'destination' &&
        visibleCollections.map((c) => {
          const items = c.experienceIds
            .map(byId)
            .filter((e): e is Experience => Boolean(e))
            .filter((e) => filter === 'all' || filter === 'private' ? true : e.category === filter || c.category === filter);
          if (items.length === 0) return null;
          return (
            <Section key={c.id} eyebrow={c.title} title={c.standfirst}>
              <Carousel>
                {items.map((e) => (
                  <View key={e.id} style={{ width: 260 }}>
                    <MediaTile media={e.hero} eyebrow={e.destination ?? 'Aboard Aurelia'} title={e.title} />
                    <Text variant="caption" color={colors.textSecondary} style={{ marginTop: spacing.sm }} numberOfLines={2}>
                      {e.subtitle}
                    </Text>
                    <Caption color={colors.textMuted} style={{ marginTop: 2 }}>
                      {e.inclusive ? 'Included' : e.price ? `From ${formatMoney(e.price.amountMinor, e.price.currency)}` : 'On request'}
                      {e.privateAvailable ? ' · Private available' : ''}
                    </Caption>
                  </View>
                ))}
              </Carousel>
            </Section>
          );
        })}
    </Screen>
  );
}

function Carousel({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing.gutter }}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.md }}
    >
      {children}
    </ScrollView>
  );
}
