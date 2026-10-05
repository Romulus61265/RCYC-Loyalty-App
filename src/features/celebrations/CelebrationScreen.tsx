/**
 * A celebration during the voyage: a personal message, then the day's ideas.
 * What is already in hand says so; each idea is only ever requested after the
 * guest reads exactly what will be sent and confirms it (and, where there is
 * a cost, acknowledges it).
 */
import { useState } from 'react';
import { StyleSheet, View, type Text as RNText } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { focusTarget, useFocusOnChange } from '@/hooks/useFocusOnChange';
import { useAnnounce } from '@/hooks/useAnnounce';
import { Button, Caption, Card, Eyebrow, InlineError, LoadingState, Screen, ScreenError, Section, StatusLine, Text, TextField, TextLink, ToggleRow } from '@/components';
import type { AppError } from '@/core/errors';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, radii, spacing } from '@/theme';
import type { CelebrationStepModel } from './celebrationModel';
import { useCelebration } from './useCelebrations';

export function CelebrationScreen() {
  const params = useLocalSearchParams<{ key: string }>();
  const key = decodeURIComponent(String(params.key ?? ''));
  const { data: model, loading, error, reload, approve, busy, errors, done } = useCelebration(key);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (loading && !model) return <LoadingState label="One moment…" />;
  if (error || !model) {
    return (
      <ScreenError error={error} onRetry={reload} />
    );
  }

  return (
    <Screen>
      <BackBar onBack={back} />
      <View style={styles.letter}>
        <Eyebrow>{model.eyebrow}</Eyebrow>
        <Text variant="display" accessibilityRole="header" style={{ marginTop: spacing.xs }}>
          {model.title}
        </Text>
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {model.body.map((p, i) => (
            <Text key={i} variant={i === 0 ? 'subtitle' : 'body'} color={i === 0 ? colors.textPrimary : colors.textSecondary}>
              {p}
            </Text>
          ))}
        </View>
        <Text variant="subtitle" color={colors.textSecondary} style={{ marginTop: spacing.md }}>
          {model.signature}
        </Text>
      </View>

      <Section eyebrow={model.inHand ? `For the day · ${model.inHand} in hand` : 'For the day'}>
        <View style={{ gap: spacing.md }}>
          {model.steps.map((s) => (
            <StepCard key={s.id} step={s} busy={busy === s.id} error={errors[s.id]} justDone={s.id in done} onApprove={(opts) => approve(s.id, opts)} />
          ))}
        </View>
      </Section>

      <View style={styles.footer}>
        <Caption>{model.assurance}</Caption>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.md }}>
          <TextLink label="Talk it through in the concierge" onPress={() => router.push('/concierge')} />
          <TextLink label="Your requests" onPress={() => router.push('/requests')} />
        </View>
      </View>
    </Screen>
  );
}

function StepCard({ step, busy, error, justDone, onApprove }: { step: CelebrationStepModel; busy: boolean; error?: AppError; justDone: boolean; onApprove: (o: { acknowledgedCharge?: boolean; note?: string }) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState('');
  const a = step.action;
  // Opening the approval goes to it; closing it returns to the step.
  const focusRef = useFocusOnChange<RNText>(open);
  useAnnounce(justDone && step.status ? 'Sent. You will see each update in Your requests.' : undefined);
  return (
    <Card style={styles.card}>
      <Eyebrow>{step.heading}</Eyebrow>
      <Text ref={open ? undefined : focusRef} {...focusTarget} variant="bodyStrong" accessibilityRole="header" aria-level={3} style={{ marginTop: spacing.xs }}>
        {step.title}
      </Text>
      {step.meta ? <Caption style={{ marginTop: 2 }}>{step.meta}</Caption> : null}
      <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
        {step.detail}
      </Text>

      {step.status ? (
        <View style={styles.row}>
          <StatusLine label={step.status.label} tone={step.status.tone} />
          {step.requestId ? <TextLink label="Details" onPress={() => router.push(`/requests/${step.requestId}`)} /> : null}
        </View>
      ) : null}
      {justDone && step.status ? (
        <Caption color={colors.calm} style={{ marginTop: spacing.xs }} accessibilityRole="alert">
          Sent. You will see each update in Your requests.
        </Caption>
      ) : null}

      {a && !open ? (
        <View style={{ marginTop: spacing.md }}>
          {a.price ? <Caption style={{ marginBottom: spacing.sm }}>{a.price}</Caption> : null}
          <Button label={a.label} variant="quiet" onPress={() => setOpen(true)} />
        </View>
      ) : null}

      {a && open ? (
        <View style={styles.approval}>
          <Eyebrow ref={focusRef} {...focusTarget} accessibilityRole="header" aria-level={4}>
            Before we send it
          </Eyebrow>
          <Text style={{ marginTop: spacing.xs }}>{a.summary}</Text>
          {a.price ? <Caption style={{ marginTop: spacing.xs }}>{a.price}</Caption> : null}
          {a.acknowledgement ? <ToggleRow label={a.acknowledgement} value={ack} onChange={setAck} /> : null}
          <TextField label="Anything to add? (optional)" value={note} onChange={setNote} max={500} multiline placeholder="No flowers, please." />
          {error ? <InlineError error={error} /> : null}
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              label={busy ? 'Sending…' : a.confirmLabel}
              disabled={busy || (a.chargeable && !ack)}
              hint={a.chargeable && !ack ? 'Turn on the acknowledgement above to send' : undefined}
              onPress={() => {
                void onApprove({ acknowledgedCharge: a.chargeable ? ack : undefined, note: note.trim() || undefined }).then((ok) => ok && setOpen(false));
              }}
            />
            <Button label="Not now" variant="quiet" onPress={() => setOpen(false)} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  letter: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { padding: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  approval: { marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
  footer: { paddingHorizontal: spacing.gutter, marginTop: spacing.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
