/**
 * One port of call, in full: the day's times, what is booked, and what has
 * been chosen for the guest there, each with what it is and why. Opened
 * from the Voyage itinerary (`/port/<portCallId>`).
 */
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Caption, Card, Divider, EmptyNote, Eyebrow, FactRow, LoadingState, MediaFrame, Screen, ScreenError, Section, Text } from '@/components';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, spacing } from '@/theme';
import { BookingRow } from './components/Rows';
import { useVoyageArea } from './useVoyageArea';
import type { SuggestionLine } from './voyageModel';

export function PortScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { data: model, loading, error, reload } = useVoyageArea();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/voyage?section=itinerary'));
  const port = model?.itinerary.find((p) => p.id === String(params.id ?? ''));

  if (loading && !model) return <LoadingState label="One moment…" />;
  if (error || !model || !port) {
    return (
      <ScreenError error={error ?? new Error('This port is not on your voyage')} onRetry={reload} />
    );
  }

  return (
    <Screen>
      <BackBar onBack={back} />
      <MediaFrame media={port.media} height={190} style={styles.hero} />
      <View style={styles.head}>
        <Eyebrow>
          Day {port.day} · {port.dateLabel} · {port.country}
        </Eyebrow>
        <Text variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          {port.name}
        </Text>
        <Text style={{ marginTop: spacing.sm }}>{port.summary}</Text>
        {port.times.length ? (
          <View style={{ marginTop: spacing.md }}>
            <FactRow facts={port.times} />
          </View>
        ) : null}
        <Caption style={{ marginTop: spacing.sm }}>
          {port.typeLabel} · Local time {port.localTime}
        </Caption>
      </View>

      <Section eyebrow="Chosen for you">
        {port.recommended.length ? (
          port.recommended.map((r) => <Chosen key={r.id} item={r} onArrange={() => router.push('/concierge')} />)
        ) : (
          <EmptyNote body="Nothing more to suggest here: your day is as you planned it." />
        )}
      </Section>

      <Section eyebrow="Booked for you">
        <Card style={{ padding: spacing.lg }}>
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
        </Card>
      </Section>
    </Screen>
  );
}

function Chosen({ item, onArrange }: { item: SuggestionLine; onArrange: () => void }) {
  return (
    <Card style={{ padding: spacing.lg, marginBottom: spacing.md }}>
      <Eyebrow color={colors.accentText}>{item.isPrivate ? `Private · ${item.where}` : item.where}</Eyebrow>
      <Text variant="title" accessibilityRole="header" aria-level={3} style={{ marginTop: spacing.xxs }}>
        {item.title}
      </Text>
      <Caption>{item.subtitle}</Caption>
      {item.reason ? (
        <Text variant="subtitle" color={colors.textSecondary} style={{ marginTop: spacing.sm }}>
          {item.reason}
        </Text>
      ) : null}
      {item.description ? <Text style={{ marginTop: spacing.sm }}>{item.description}</Text> : null}
      {item.includes?.length ? (
        <View style={{ marginTop: spacing.sm }}>
          {item.includes.map((x) => (
            <Caption key={x} color={colors.textPrimary}>
              · {x}
            </Caption>
          ))}
        </View>
      ) : null}
      <Caption style={{ marginTop: spacing.sm }}>{item.priceLabel}</Caption>
      <View style={{ marginTop: spacing.md }}>
        <Button label="Arrange with the concierge" onPress={onArrange} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: spacing.gutter, maxWidth: 720, alignSelf: 'stretch' },
  head: { paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
