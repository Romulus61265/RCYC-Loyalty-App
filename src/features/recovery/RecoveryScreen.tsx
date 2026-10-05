/**
 * A disruption, as the guest is told about it: calmly, then why (when it is
 * known), then comparable alternatives, then a person to help. Each
 * alternative is only ever requested after the guest reads exactly what will
 * be sent and confirms it (and, where there is a cost, acknowledges it).
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
import type { RecoveryAlternativeModel } from './recoveryModel';
import { useRecovery } from './useRecovery';

export function RecoveryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = decodeURIComponent(String(params.id ?? ''));
  const { data: model, loading, error, reload, accept, askForHelp, busy, errors, sent } = useRecovery(id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // The chosen alternative replaces the list: say what happened.
  useAnnounce(sent && sent !== 'assist' ? model?.accepted?.line : undefined);

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
        {model.explanation ? (
          <View style={styles.reason}>
            <Eyebrow>The reason</Eyebrow>
            <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
              {model.explanation}
            </Text>
          </View>
        ) : null}
        <Text variant="subtitle" color={colors.textSecondary} style={{ marginTop: spacing.md }}>
          {model.signature}
        </Text>
      </View>

      {model.accepted ? (
        <Section eyebrow="Your choice">
          <Card style={styles.card}>
            <Text variant="bodyStrong">{model.accepted.title}</Text>
            <View style={styles.row}>
              <StatusLine label="Requested" tone="pending" />
              {model.accepted.requestId ? <TextLink label="Details" onPress={() => router.push(`/requests/${model.accepted!.requestId}`)} /> : null}
            </View>
            <Caption style={{ marginTop: spacing.xs }} color={sent && sent !== 'assist' ? colors.calm : undefined} accessibilityRole={sent && sent !== 'assist' ? 'alert' : undefined}>
              {model.accepted.line}
            </Caption>
          </Card>
        </Section>
      ) : model.alternatives.length ? (
        <Section eyebrow="Comparable alternatives">
          <View style={{ gap: spacing.md }}>
            {model.alternatives.map((a) => (
              <AlternativeCard key={a.id} alt={a} busy={busy === a.id} error={errors[a.id]} onAccept={(opts) => accept(a.id, opts)} />
            ))}
          </View>
        </Section>
      ) : null}

      <Section eyebrow="Concierge assistance">
        <AssistCard assistance={model.assistance} busy={busy === 'assist'} error={errors.assist} justSent={sent === 'assist'} onAsk={askForHelp} />
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

function AlternativeCard({ alt, busy, error, onAccept }: { alt: RecoveryAlternativeModel; busy: boolean; error?: AppError; onAccept: (o: { acknowledgedCharge?: boolean; note?: string }) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState('');
  // Opening the approval goes to it; closing it returns to the alternative.
  const focusRef = useFocusOnChange<RNText>(open);
  return (
    <Card style={styles.card}>
      <Text ref={open ? undefined : focusRef} {...focusTarget} variant="bodyStrong" accessibilityRole="header" aria-level={3}>
        {alt.title}
      </Text>
      {alt.meta ? <Caption style={{ marginTop: 2 }}>{alt.meta}</Caption> : null}
      <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
        {alt.detail}
      </Text>
      {!open ? (
        <View style={{ marginTop: spacing.md }}>
          {alt.price ? <Caption style={{ marginBottom: spacing.sm }}>{alt.price}</Caption> : null}
          <Button label={alt.label} variant="quiet" onPress={() => setOpen(true)} />
        </View>
      ) : (
        <View style={styles.approval}>
          <Eyebrow ref={focusRef} {...focusTarget} accessibilityRole="header" aria-level={4}>
            Before we send it
          </Eyebrow>
          <Text style={{ marginTop: spacing.xs }}>{alt.summary}</Text>
          {alt.price ? <Caption style={{ marginTop: spacing.xs }}>{alt.price}</Caption> : null}
          {alt.acknowledgement ? <ToggleRow label={alt.acknowledgement} value={ack} onChange={setAck} /> : null}
          <TextField label="Anything to add? (optional)" value={note} onChange={setNote} max={500} multiline placeholder="A later start, if possible." />
          {error ? <InlineError error={error} /> : null}
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              label={busy ? 'Sending…' : alt.confirmLabel}
              disabled={busy || (alt.chargeable && !ack)}
              hint={alt.chargeable && !ack ? 'Turn on the acknowledgement above to send' : undefined}
              onPress={() => {
                void onAccept({ acknowledgedCharge: alt.chargeable ? ack : undefined, note: note.trim() || undefined }).then((ok) => ok && setOpen(false));
              }}
            />
            <Button label="Not now" variant="quiet" onPress={() => setOpen(false)} />
          </View>
        </View>
      )}
    </Card>
  );
}

function AssistCard({
  assistance,
  busy,
  error,
  justSent,
  onAsk,
}: {
  assistance: { label: string; requested: boolean; requestId?: string; line: string };
  busy: boolean;
  error?: AppError;
  justSent: boolean;
  onAsk: (note?: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const focusRef = useFocusOnChange<RNText>(open);
  useAnnounce(justSent && assistance.requested ? 'Sent. You will see each update in Your requests.' : undefined);
  return (
    <Card style={styles.card}>
      <Text ref={focusRef} {...focusTarget} color={colors.textSecondary}>
        {assistance.line}
      </Text>
      {assistance.requested ? (
        <View style={styles.row}>
          <StatusLine label="In hand" tone="calm" />
          {assistance.requestId ? <TextLink label="Details" onPress={() => router.push(`/requests/${assistance.requestId}`)} /> : null}
        </View>
      ) : !open ? (
        <View style={{ marginTop: spacing.md }}>
          <Button label={assistance.label} variant="quiet" onPress={() => setOpen(true)} />
        </View>
      ) : (
        <View style={styles.approval}>
          <TextField label="What would you like? (optional)" value={note} onChange={setNote} max={500} multiline placeholder="Something quiet ashore, perhaps." />
          {error ? <InlineError error={error} /> : null}
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Button label={busy ? 'Sending…' : assistance.label} disabled={busy} onPress={() => void onAsk(note.trim() || undefined).then((ok) => ok && setOpen(false))} />
            <Button label="Not now" variant="quiet" onPress={() => setOpen(false)} />
          </View>
        </View>
      )}
      {justSent && assistance.requested ? (
        <Caption color={colors.calm} style={{ marginTop: spacing.xs }} accessibilityRole="alert">
          Sent. You will see each update in Your requests.
        </Caption>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  letter: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
  reason: { marginTop: spacing.lg, paddingLeft: spacing.md, borderLeftWidth: 2, borderLeftColor: colors.accent },
  card: { padding: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  approval: { marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
  footer: { paddingHorizontal: spacing.gutter, marginTop: spacing.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
