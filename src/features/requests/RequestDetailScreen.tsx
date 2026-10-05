/** One request: where it stands, who has it, and what was done. */
import { useState } from 'react';
import { View, type Text as RNText, type View as RNView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { focusTarget, useFocusOnChange } from '@/hooks/useFocusOnChange';
import { useAnnounce } from '@/hooks/useAnnounce';
import { Button, Caption, FactRow, InlineError, LoadingState, PageHeader, Screen, ScreenError, Section, StatusLine, Text } from '@/components';
import { colors, spacing } from '@/theme';
import { BackBar, StatusSteps } from './components/RequestParts';
import { useRequestDetail } from './useRequests';

export function RequestDetailScreen() {
  const params = useLocalSearchParams<{ id: string; submitted?: string }>();
  const id = String(params.id ?? '');
  const { data: model, loading, error, reload, close, closing, notice, closeError } = useRequestDetail(id);
  const [confirming, setConfirming] = useState(false);
  // Asking to confirm goes to the question; "Keep it" returns to the button.
  const confirmRef = useFocusOnChange<RNText>(confirming);
  const closeRef = useFocusOnChange<RNView>(confirming);
  useAnnounce(params.submitted ? 'Sent. You will see each update here.' : undefined);
  useAnnounce(notice);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/requests'));

  if (loading && !model) return <LoadingState label="One moment…" />;
  if (error || !model) {
    return (
      <ScreenError error={error} onRetry={reload} />
    );
  }

  return (
    <Screen>
      <BackBar label="Your requests" onBack={back} />
      <PageHeader eyebrow={model.category} title={model.title} />
      <View style={{ paddingHorizontal: spacing.gutter }}>
        {params.submitted ? (
          <Caption color={colors.calm} style={{ marginBottom: spacing.sm }} accessibilityRole="alert">
            Sent. You will see each update here.
          </Caption>
        ) : null}
        <StatusLine label={model.status.label} tone={model.status.tone} />
        {model.nextUpdate ? <Caption style={{ marginTop: spacing.xxs }}>{model.nextUpdate}</Caption> : null}
      </View>

      <Section eyebrow="Status">
        <StatusSteps steps={model.steps} />
      </Section>

      {model.resolution ? (
        <Section eyebrow="Resolution">
          <Text>{model.resolution}</Text>
        </Section>
      ) : null}

      <Section eyebrow="Your request">
        <View style={{ gap: spacing.sm }}>
          {model.description.map((p, i) => (
            <Text key={i}>{p}</Text>
          ))}
        </View>
      </Section>

      <Section eyebrow="Details">
        <FactRow facts={model.facts} />
      </Section>

      <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.lg }}>
        {notice ? (
          <Caption color={colors.calm} accessibilityRole="alert">
            {notice}
          </Caption>
        ) : null}
        {closeError ? <InlineError error={closeError} onRetry={reload} /> : null}
        {model.close && !notice ? (
          confirming ? (
            <View style={{ gap: spacing.sm }}>
              <Text ref={confirmRef} {...focusTarget}>
                {model.close.confirm}
              </Text>
              <Button
                label={closing ? 'One moment…' : 'Yes'}
                disabled={closing}
                onPress={() => {
                  void close(model.close!.done).then(() => setConfirming(false));
                }}
              />
              <Button label="Keep it" variant="quiet" onPress={() => setConfirming(false)} />
            </View>
          ) : (
            <Button ref={closeRef} label={model.close.label} variant="quiet" onPress={() => setConfirming(true)} />
          )
        ) : null}
      </View>
    </Screen>
  );
}
