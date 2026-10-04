/**
 * One past voyage: yacht, dates, destinations, suite, what they did ashore
 * and at the table, the preferences we kept, memories, and a place for
 * photographs.
 */
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readAs } from '@/hooks/useAnnounce';
import { Caption, Card, ErrorState, Eyebrow, FactRow, LoadingState, MediaFrame, Screen, Section, StatusLine, Text } from '@/components';
import type { PastVoyageMoment } from '@/domain';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, spacing } from '@/theme';
import { formatShortDate } from '@/utils/format';
import { isFavourite, placesLine } from './historyModel';
import { usePastVoyage } from './useHistory';

export function PastVoyageScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { data: e, loading, error, reload } = usePastVoyage(String(params.id ?? ''));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/history'));
  if (loading && !e) return <LoadingState label="One moment…" />;
  if (error || !e) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }
  return (
    <Screen>
      <BackBar onBack={back} />
      <MediaFrame media={e.hero} height={170} style={styles.hero} />
      <View style={styles.head}>
        <Eyebrow>{e.region}</Eyebrow>
        <Text variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          {e.name}
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <FactRow facts={[{ label: 'Yacht', value: e.yachtName || '—' }, { label: 'Dates', value: e.dates }, { label: 'Suite', value: e.suite || '—' }]} />
        </View>
      </View>

      <Section eyebrow="Destinations">
        <Text>{placesLine(e) || 'Not recorded.'}</Text>
        {e.destinations.length ? <Caption style={{ marginTop: 2 }}>{[...new Set(e.destinations.map((d) => d.country))].join(' · ')}</Caption> : null}
      </Section>

      <Section eyebrow="Experiences">
        {e.experiences.length ? <Moments list={e.experiences} /> : <Caption>Nothing ashore was recorded on this voyage.</Caption>}
      </Section>

      <Section eyebrow="Dining highlights">
        {e.dining.length ? <Moments list={e.dining} /> : <Caption>No dining highlights were recorded on this voyage.</Caption>}
      </Section>

      <Section eyebrow="Saved preferences">
        <Card style={{ padding: spacing.lg }}>
          {e.savedPreferences.length ? (
            e.savedPreferences.map((p, i) => (
              <View key={p.id} style={[styles.pref, i > 0 && { marginTop: spacing.sm }]}>
                <Text style={{ flex: 1 }}>{p.label}</Text>
                <StatusLine label={p.status === 'kept' ? 'Kept' : 'Noted'} tone={p.status === 'kept' ? 'calm' : 'pending'} />
              </View>
            ))
          ) : (
            <Caption>Nothing new was learned on this voyage.</Caption>
          )}
          <Caption style={{ marginTop: spacing.md }}>Kept means it is still in your preferences today. Change any of them in Profile.</Caption>
        </Card>
      </Section>

      {e.memories.length ? (
        <Section eyebrow="Memories">
          <View style={{ gap: spacing.xs }}>
            {e.memories.map((m) => (
              <Text key={m} variant="subtitle" color={colors.textSecondary}>
                {m}
              </Text>
            ))}
          </View>
        </Section>
      ) : null}

      <Section eyebrow="Photographs">
        <View style={styles.photos} {...readAs(e.photos.count ? `${e.photos.count} photographs` : e.photos.placeholder)}>
          <Ionicons name="images-outline" size={22} color={colors.textMuted} />
          <Caption style={{ marginTop: spacing.xs, textAlign: 'center' }}>{e.photos.count ? `${e.photos.count} photographs` : e.photos.placeholder}</Caption>
        </View>
      </Section>
    </Screen>
  );
}

function Moments({ list }: { list: PastVoyageMoment[] }) {
  return (
    <Card style={{ padding: spacing.lg }}>
      {list.map((m, i) => (
        <View key={m.id} style={[styles.moment, i > 0 && { marginTop: spacing.md }]} {...readAs(`${m.title}${isFavourite(m.rating) ? ', a favourite' : ''}. ${[m.place, formatShortDate(m.date)].filter(Boolean).join(', ')}${m.note ? `. ${m.note}` : ''}`)}>
          <Ionicons name={isFavourite(m.rating) ? 'heart' : 'ellipse-outline'} size={isFavourite(m.rating) ? 14 : 8} color={colors.accentText} style={{ marginTop: isFavourite(m.rating) ? 4 : 7, width: 14 }} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text>{m.title}</Text>
            <Caption>{[m.place, formatShortDate(m.date)].filter(Boolean).join(' · ')}</Caption>
            {m.note ? <Caption style={{ marginTop: 2 }}>{m.note}</Caption> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: spacing.gutter, maxWidth: 720, alignSelf: 'stretch' },
  head: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  pref: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  moment: { flexDirection: 'row' },
  photos: { alignItems: 'center', padding: spacing.xl, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 12 },
});
