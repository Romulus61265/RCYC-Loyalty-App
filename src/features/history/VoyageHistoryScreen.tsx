/** Voyage history: every past voyage, newest first. */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Caption, Card, EmptyNote, ErrorState, Eyebrow, LoadingState, MediaFrame, Screen, Section, Text } from '@/components';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, spacing } from '@/theme';
import { historySummary, placesLine, voyageLine } from './historyModel';
import { useVoyageHistory } from './useHistory';

export function VoyageHistoryScreen() {
  const { data, loading, error, reload } = useVoyageHistory();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  if (loading && !data) return <LoadingState label="One moment…" />;
  if (error || !data) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }
  return (
    <Screen>
      <BackBar onBack={back} />
      <View style={styles.head}>
        <Eyebrow>Voyage history</Eyebrow>
        <Text variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          Where you have sailed with us
        </Text>
        {data.length ? <Caption style={{ marginTop: spacing.sm }}>{historySummary(data)}</Caption> : null}
      </View>
      <Section>
        {data.length ? (
          <View style={{ gap: spacing.md }}>
            {data.map((e) => (
              <Pressable key={e.voyageId} onPress={() => router.push(`/history/${e.voyageId}`)} accessibilityRole="link" accessibilityLabel={`${e.name}. ${voyageLine(e)}. Open the voyage`}>
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <MediaFrame media={e.hero} height={110} rounded={false} />
                  <View style={{ padding: spacing.lg }}>
                    <View style={styles.row}>
                      <Text variant="title" style={{ flex: 1 }}>
                        {e.name}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </View>
                    <Caption style={{ marginTop: 2 }}>{voyageLine(e)}</Caption>
                    {e.destinations.length ? <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>{placesLine(e)}</Text> : null}
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyNote body="Your past voyages will appear here, with the places, the suite and the moments you loved." />
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
