/**
 * After the voyage: "Welcome home." The voyage remembered day by day, where
 * the guest has been, the moments they loved, a note from the Suite
 * Ambassador, Bonvoy (a placeholder until connected), reflections, and the
 * voyages that might come next.
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Caption, Card, EmptyNote, ErrorState, Eyebrow, LoadingState, MediaFrame, Screen, Section, StatusLine, Text, TextLink } from '@/components';
import type { RecapMemory, VoyageRecommendation } from '@/domain';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, spacing } from '@/theme';
import { useRecap } from './usePostVoyage';
import { shared } from './welcomeHomeModel';

const ICON: Record<RecapMemory['kind'], 'sparkles-outline' | 'restaurant-outline' | 'compass-outline'> = { occasion: 'sparkles-outline', dining: 'restaurant-outline', experience: 'compass-outline' };

export function WelcomeHomeScreen() {
  const { data: recap, loading, error, reload } = useRecap();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (loading && recap === undefined) return <LoadingState label="One moment…" />;
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }
  if (!recap) {
    return (
      <Screen>
        <BackBar onBack={back} />
        <Section eyebrow="After your voyage">
          <EmptyNote body="When your voyage is over, you will find it remembered here: the days, the places and the moments you loved." actionLabel="Back to Home" onAction={back} />
        </Section>
      </Screen>
    );
  }

  const f = recap.feedback;
  const n = shared(f);
  return (
    <Screen>
      <BackBar onBack={back} />
      <View style={styles.letter}>
        <Eyebrow>{recap.welcome.eyebrow}</Eyebrow>
        <Text variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          {recap.welcome.title}
        </Text>
        <Text variant="subtitle" style={{ marginTop: spacing.md }}>
          {recap.welcome.line}
        </Text>
        <Caption style={{ marginTop: spacing.md }}>{recap.summary.line}</Caption>
      </View>

      <Section eyebrow="Voyage memories">
        <Card style={{ paddingVertical: spacing.sm }}>
          {recap.days.map((d, i) => (
            <View key={d.dayNumber} style={[styles.day, i > 0 && styles.divider]}>
              <Eyebrow>
                Day {d.dayNumber} · {d.place}
              </Eyebrow>
              {d.memories.length ? (
                d.memories.map((m) => (
                  <View key={m.id} style={styles.memory}>
                    <Ionicons name={ICON[m.kind]} size={16} color={colors.accent} style={{ marginTop: 3 }} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text variant={m.kind === 'occasion' ? 'bodyStrong' : 'body'}>{m.title}</Text>
                      <Caption>{m.line}</Caption>
                    </View>
                  </View>
                ))
              ) : (
                <Caption style={{ marginTop: spacing.xs }}>{d.dayNumber === recap.days.length ? 'Farewells, and the journey home.' : 'A day of your own.'}</Caption>
              )}
            </View>
          ))}
        </Card>
      </Section>

      <Section eyebrow="Destinations visited">
        <View style={{ gap: spacing.sm }}>
          {recap.destinations.map((d) => (
            <View key={d.portName} style={styles.place} accessibilityLabel={`${d.portName}, ${d.country}, ${d.when}. ${d.standfirst ?? ''}`}>
              <View style={styles.placeHead}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {d.portName}
                </Text>
                <Caption>{d.when}</Caption>
              </View>
              <Caption>{d.country}</Caption>
              {d.standfirst ? <Text color={colors.textSecondary} style={{ marginTop: 2 }}>{d.standfirst}</Text> : null}
            </View>
          ))}
        </View>
      </Section>

      <Section eyebrow={recap.favourites.chosen ? 'Your favourite moments' : 'Favourite experiences'}>
        <Card style={styles.card}>
          {!recap.favourites.chosen ? <Caption style={{ marginBottom: spacing.sm }}>Perhaps these? Tell us your own in your reflections.</Caption> : null}
          {recap.favourites.memories.map((m) => (
            <View key={m.id} style={styles.memory}>
              <Ionicons name="heart-outline" size={16} color={colors.accent} style={{ marginTop: 3 }} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text>{m.title}</Text>
                <Caption>{m.line}</Caption>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section eyebrow="Marriott Bonvoy">
        <Card style={styles.card} accessibilityLabel={`Marriott Bonvoy. ${recap.bonvoy.tierLabel ?? ''}. ${recap.bonvoy.note}`}>
          {recap.bonvoy.tierLabel ? <Text variant="bodyStrong">{recap.bonvoy.tierLabel}</Text> : null}
          {recap.bonvoy.lifetimeStatus ? <Caption>{recap.bonvoy.lifetimeStatus}</Caption> : null}
          <Text color={colors.textSecondary} style={{ marginTop: spacing.sm }}>
            {recap.bonvoy.note}
          </Text>
          <Caption style={{ marginTop: spacing.xs }}>Not yet connected to Marriott Bonvoy.</Caption>
        </Card>
      </Section>

      <Section eyebrow={recap.thankYou.title}>
        <Card style={styles.card}>
          {recap.thankYou.body.map((p, i) => (
            <Text key={i} variant={i === 0 ? 'subtitle' : 'body'} style={{ marginTop: i ? spacing.sm : 0 }}>
              {p}
            </Text>
          ))}
          <Text variant="subtitle" color={colors.textSecondary} style={{ marginTop: spacing.md }}>
            {recap.thankYou.signature}
          </Text>
        </Card>
      </Section>

      <Section eyebrow="Your reflections">
        <Card style={styles.card}>
          {f.status === 'sent' ? (
            <>
              <Text variant="bodyStrong">Thank you.</Text>
              <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
                Your reflections are with {recap.thankYou.signature.split(' ')[0]}, who will read every word.
              </Text>
              <View style={{ marginTop: spacing.sm }}>
                <StatusLine label="Sent" tone="calm" />
              </View>
            </>
          ) : (
            <>
              <Text variant="bodyStrong">A few words, when you are ready</Text>
              <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
                Five short questions, each one optional. No ratings; just your voyage, in your words.
              </Text>
              {n ? <Caption style={{ marginTop: spacing.xs }}>{n} of 5 begun, saved as you go.</Caption> : null}
              <View style={{ marginTop: spacing.md }}>
                <Button label={n ? 'Continue your reflections' : 'Share your reflections'} variant="quiet" onPress={() => router.push('/welcome-home/reflections')} />
              </View>
            </>
          )}
        </Card>
      </Section>

      <Section eyebrow="For your next voyage">
        <View style={{ gap: spacing.md }}>
          {recap.recommendations.map((r) => (
            <Recommendation key={r.inspirationId} r={r} />
          ))}
        </View>
      </Section>

      {recap.inspiration ? (
        <Section eyebrow={recap.inspiration.eyebrow}>
          <Card style={{ overflow: 'hidden' }} accessibilityLabel={`${recap.inspiration.title}. ${recap.inspiration.standfirst}`}>
            <MediaFrame media={recap.inspiration.voyage.hero} height={180} rounded={false} />
            <View style={styles.card}>
              <Text variant="title">{recap.inspiration.title}</Text>
              <Caption style={{ marginTop: 2 }}>{recap.inspiration.voyage.when}</Caption>
              <Text style={{ marginTop: spacing.sm }}>{recap.inspiration.standfirst}</Text>
              <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
                {recap.inspiration.voyage.highlight}
              </Text>
              <Caption style={{ marginTop: spacing.sm }}>{recap.inspiration.voyage.ports.join(' · ')}</Caption>
              <Text color={colors.textSecondary} style={{ marginTop: spacing.md }}>
                {recap.inspiration.closing}
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <Button label={`Ask ${recap.thankYou.signature.split(' ')[0]} about this voyage`} onPress={() => router.push('/concierge')} />
              </View>
            </View>
          </Card>
          <Caption style={{ marginTop: spacing.sm }}>Voyages shown here are illustrative in this preview.</Caption>
        </Section>
      ) : null}

      <View style={styles.footer}>
        <TextLink label="Talk to the concierge" onPress={() => router.push('/concierge')} />
      </View>
    </Screen>
  );
}

function Recommendation({ r }: { r: VoyageRecommendation }) {
  return (
    <Card style={styles.card} accessibilityLabel={`${r.name}. ${r.when}. ${r.reason}`}>
      <Text variant="bodyStrong">{r.name}</Text>
      <Caption style={{ marginTop: 2 }}>{r.when}</Caption>
      <Text style={{ marginTop: spacing.sm }}>{r.reason}</Text>
      {r.because ? <Caption style={{ marginTop: spacing.xs }}>Because you enjoyed {r.because}.</Caption> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  letter: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { padding: spacing.lg },
  day: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  memory: { flexDirection: 'row', marginTop: spacing.sm },
  place: { paddingVertical: spacing.xs },
  placeHead: { flexDirection: 'row', alignItems: 'baseline' },
  footer: { paddingHorizontal: spacing.gutter, marginTop: spacing.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
