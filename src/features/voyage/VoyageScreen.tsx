/**
 * Voyage area: nine sections behind quiet text tabs. The selected section
 * lives in the URL (`/voyage?section=documents`) so Home, alerts and push
 * notifications can link straight to it.
 */
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ErrorState, LoadingState, PageHeader, Screen, SegmentedTabs } from '@/components';
import { colors } from '@/theme';
import { CalendarSection, CategorySection, DocumentsSection } from './components/CalendarLists';
import { ItinerarySection, OverviewSection } from './components/OverviewItinerary';
import { EmbarkationSection, SuiteSection } from './components/SuiteEmbarkation';
import { useVoyageArea } from './useVoyageArea';
import { parseSection, VOYAGE_SECTIONS, type VoyageSectionKey } from './voyageModel';

const TAB_OPTIONS = VOYAGE_SECTIONS.map((s) => ({ value: s.key, label: s.label }));

export function VoyageScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const section = parseSection(params.section);
  const { data: model, loading, error, reload } = useVoyageArea();

  const open = (s: VoyageSectionKey) => router.setParams({ section: s });
  const toConcierge = () => router.push('/concierge');

  if (loading && !model) return <LoadingState label="Gathering your voyage…" />;
  if (error || !model) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  return (
    <Screen>
      <PageHeader eyebrow={`${model.overview.yachtName} · ${model.overview.dateRange}`} title={model.overview.name} subtitle={model.overview.stats[0] ? `${model.overview.stats[0].value} nights · ${model.overview.route}` : model.overview.route} />
      <SegmentedTabs options={TAB_OPTIONS} value={section} onChange={open} />
      {section === 'overview' && <OverviewSection model={model.overview} onOpen={open} />}
      {section === 'itinerary' && <ItinerarySection ports={model.itinerary} bookingsError={model.errors.bookings} onRetry={reload} />}
      {section === 'suite' && <SuiteSection model={model.suite} onContact={toConcierge} />}
      {section === 'embarkation' && <EmbarkationSection model={model.embarkation} onDocuments={() => open('documents')} />}
      {section === 'calendar' && <CalendarSection days={model.calendar} error={model.errors.calendar} onRetry={reload} />}
      {section === 'dining' && <CategorySection model={model.dining} error={model.errors.bookings} onArrange={toConcierge} onRetry={reload} />}
      {section === 'spa' && <CategorySection model={model.spa} error={model.errors.bookings} onArrange={toConcierge} onRetry={reload} />}
      {section === 'experiences' && <CategorySection model={model.experiences} error={model.errors.bookings} onArrange={toConcierge} onRetry={reload} />}
      {section === 'documents' && <DocumentsSection summary={model.documents.summary} items={model.documents.items} onHelp={toConcierge} />}
    </Screen>
  );
}
