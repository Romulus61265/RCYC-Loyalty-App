/**
 * The arrival update in full: what was detected, what has been moved (and
 * whether each change is done or only requested), the new times, and the
 * concierge.
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { readAs } from '@/hooks/useAnnounce';
import { Button, Caption, Card, EmptyNote, ErrorState, Eyebrow, LoadingState, Screen, Section, StatusLine, Text } from '@/components';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, spacing } from '@/theme';
import { useArrival } from './useArrival';

export function ArrivalScreen() {
  const { data: model, loading, error, reload } = useArrival();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (loading && model === undefined) return <LoadingState label="One moment…" />;
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }
  if (!model) {
    return (
      <Screen>
        <BackBar onBack={back} />
        <Section eyebrow="Your arrival" level={1}>
          <EmptyNote body="Your travel to the yacht is on schedule. If anything changes, you will see it here." actionLabel="View your voyage" onAction={() => router.push('/voyage')} />
        </Section>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackBar onBack={back} />
      <View style={styles.letter}>
        <Eyebrow>Your arrival</Eyebrow>
        <Text variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          {model.headline}
        </Text>
        <Text variant="subtitle" style={{ marginTop: spacing.md }}>
          {model.intro}
        </Text>
        {model.attention ? (
          <Text color={colors.attention} style={{ marginTop: spacing.sm }}>
            {model.attention}
          </Text>
        ) : null}
      </View>

      <Section eyebrow="What we have done">
        <Card style={{ paddingVertical: spacing.sm }}>
          {model.steps.map((s, i) => (
            <View key={s.kind} style={[styles.step, i > 0 && styles.divider]} {...readAs(`${s.label}${s.value ? `, ${s.value}` : ''}. ${s.detail}${s.status ? ` ${s.status.label}.` : ''}`)}>
              <Ionicons name={s.icon} size={20} color={colors.accentText} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={styles.head}>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {s.label}
                  </Text>
                  {s.value ? <Text variant="title">{s.value}</Text> : null}
                </View>
                <Text color={colors.textSecondary} style={{ marginTop: 2 }}>
                  {s.detail}
                </Text>
                {s.status ? (
                  <View style={{ marginTop: spacing.xs }}>
                    <StatusLine label={s.status.label} tone={s.status.tone} />
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      </Section>

      {model.alsoAffected.length ? (
        <Section eyebrow="Also moving with your flight">
          <View style={{ gap: spacing.md }}>
            {model.alsoAffected.map((a) => (
              <Card key={a.title} style={{ padding: spacing.lg }}>
                <Text variant="bodyStrong">{a.title}</Text>
                <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
                  {a.detail}
                </Text>
                <View style={{ marginTop: spacing.sm }}>
                  <StatusLine label={a.status.label} tone={a.status.tone} />
                </View>
              </Card>
            ))}
          </View>
        </Section>
      ) : null}

      <View style={styles.footer}>
        <Button label={`Talk to ${model.ambassador}`} onPress={() => router.push('/concierge')} />
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Your embarkation details" variant="quiet" onPress={() => router.push({ pathname: '/voyage', params: { section: 'embarkation' } })} />
        </View>
        {model.demoNote ? <Caption style={{ marginTop: spacing.md }}>{model.demoNote}</Caption> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  letter: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
  step: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  footer: { paddingHorizontal: spacing.gutter, marginTop: spacing.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
