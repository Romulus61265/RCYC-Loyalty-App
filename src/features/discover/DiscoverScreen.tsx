/**
 * Discover: a curated marketplace. Category lives in the URL
 * (`/discover?category=wine`); refinements are local UI state. Filtering is
 * a pure function over the view model, so no data logic lives here.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ErrorState, InlineError, LiveAnnouncer, LoadingState, PageHeader, Screen, SegmentedTabs, Section } from '@/components';
import { colors } from '@/theme';
import { DestinationList, ExperienceResults, FilterPanel, RecommendedRail, RefineBar } from './components/DiscoverSections';
import {
  activeFilterCount,
  applyDiscoverFilters,
  DEFAULT_FILTERS,
  DISCOVER_CATEGORIES,
  type DiscoverCategoryKey,
  type DiscoverFilters,
} from './discoverModel';
import { useDiscover } from './useDiscover';

const TABS = DISCOVER_CATEGORIES.map((c) => ({ value: c.key, label: c.label }));

function parseCategory(v: unknown): DiscoverCategoryKey {
  const s = Array.isArray(v) ? v[0] : v;
  return DISCOVER_CATEGORIES.some((c) => c.key === s) ? (s as DiscoverCategoryKey) : 'all';
}

export function DiscoverScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const category = parseCategory(params.category);
  const [refine, setRefine] = useState<Omit<DiscoverFilters, 'category'>>(DEFAULT_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const { data: model, loading, error, reload, saved, toggleSave, viewed, requested } = useDiscover();

  if (loading && !model) return <LoadingState label="Curating your experiences…" />;
  if (error || !model) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  const filters: DiscoverFilters = { ...refine, category };
  const count = activeFilterCount(filters);
  const setCategory = (c: DiscoverCategoryKey) => router.setParams({ category: c });
  const setFilters = (f: DiscoverFilters) => {
    const { category: c, ...rest } = f;
    setRefine(rest);
    if (c !== category) setCategory(c);
  };
  const clear = () => setRefine(DEFAULT_FILTERS);
  const request = (card?: { recommendation?: unknown } & Parameters<typeof requested>[0]) => {
    if (card) requested(card);
    router.push('/concierge');
  };
  const results = applyDiscoverFilters(model.cards, filters);
  const heading = DISCOVER_CATEGORIES.find((c) => c.key === category)?.label ?? 'All';

  return (
    <Screen>
      <PageHeader eyebrow="Discover" title={model.title} subtitle={model.subtitle} />
      <SegmentedTabs options={TABS} value={category} onChange={setCategory} />
      {category !== 'destinations' ? (
        <>
          <RefineBar count={count} open={panelOpen} privateOnly={refine.privateOnly} onToggle={() => setPanelOpen((v) => !v)} onPrivate={() => setRefine({ ...refine, privateOnly: !refine.privateOnly })} onClear={clear} />
          {panelOpen ? <FilterPanel model={model} filters={filters} onChange={setFilters} /> : null}
        </>
      ) : null}

      {category === 'all' && count === 0 ? <RecommendedRail items={model.recommended} error={model.errors.recommendations} onRetry={reload} /> : null}
      {model.errors.availability ? (
        <Section>
          <InlineError error={model.errors.availability} onRetry={reload} />
        </Section>
      ) : null}

      {/* Filters change the list in place: say how many there are now. */}
      <LiveAnnouncer message={category === 'destinations' ? `${model.destinations.length} destinations` : `${results.length} ${results.length === 1 ? 'experience' : 'experiences'}`} />
      {category === 'destinations' ? (
        <DestinationList
          items={model.destinations}
          onOpen={(d) => {
            setRefine({ ...DEFAULT_FILTERS, port: d.portKey });
            setPanelOpen(true);
            setCategory('all');
          }}
        />
      ) : (
        <ExperienceResults cards={results} heading={category === 'all' ? (count ? 'Your selection' : 'Every experience') : heading} onRequest={request} onClear={clear} saved={saved} onSave={toggleSave} onView={viewed} />
      )}
    </Screen>
  );
}
