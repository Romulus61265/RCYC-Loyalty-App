/**
 * The presenter's script for a demonstration (DEMO_MODE, docs/23): every step
 * in order, a way to jump to it, the one step the presenter performs (the
 * flight delay), and a reset that puts everything back to its first moment.
 * Reached from the Demo button; absent outside a demonstration.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Caption, Card, Eyebrow, PageHeader, Screen, Section, StatusLine, Text } from '@/components';
import type { DemoStep } from '@/services/contracts';
import { announce } from '@/hooks/useAnnounce';
import { useAsync } from '@/hooks/useAsync';
import { BackBar } from '@/features/requests/components/RequestParts';
import { useServices } from '@/services/ServiceProvider';
import { colors, spacing } from '@/theme';

export function PresenterScreen() {
  const { demo } = useServices();
  const [busy, setBusy] = useState<'delay' | 'reset' | null>(null);
  const status = useAsync(() => demo.status(), [demo]);
  const delayed = status.data?.inboundDelayed ?? false;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!demo.mode) {
    return (
      <Screen>
        <BackBar onBack={back} />
        <PageHeader title="No demonstration" subtitle="Demo mode is off. Set EXPO_PUBLIC_DEMO_MODE=executive on mock services." />
      </Screen>
    );
  }

  const go = (route: string) => router.navigate(route as never);
  const delay = async () => {
    setBusy('delay');
    try {
      await demo.simulateInboundDelay();
      status.reload();
      announce('Flight delay reported. Arrangements adjusted.');
      router.navigate('/');
    } finally {
      setBusy(null);
    }
  };
  const reset = async () => {
    setBusy('reset');
    await demo.reset();
    router.replace('/');
  };

  return (
    <Screen>
      <BackBar onBack={back} />
      <PageHeader eyebrow="Executive demonstration · fictional data" title="Presenter" subtitle="Fifteen steps, the same every time. Jump to any of them, then come back here." />

      <Section eyebrow="The journey">
        {demo.script().map((s) => (
          <Step key={s.n} step={s} delayed={delayed} busy={busy === 'delay'} onGo={go} onDelay={delay} />
        ))}
      </Section>

      <Section eyebrow="Start again">
        <Card style={{ padding: spacing.lg }}>
          <Text>Puts every booking, message and request back as it was, and clears this device.</Text>
          <View style={{ marginTop: spacing.md }}>
            <Button label={busy === 'reset' ? 'Resetting…' : 'Reset the demonstration'} variant="quiet" onPress={() => void reset()} disabled={busy !== null} />
          </View>
        </Card>
      </Section>
    </Screen>
  );
}

function Step({ step, delayed, busy, onGo, onDelay }: { step: DemoStep; delayed: boolean; busy: boolean; onGo: (route: string) => void; onDelay: () => void }) {
  return (
    <Card style={styles.step}>
      <Eyebrow color={colors.accentText}>Step {step.n}</Eyebrow>
      <Text variant="bodyStrong" accessibilityRole="header" aria-level={3} style={{ marginTop: 2 }}>
        {step.title}
      </Text>
      <Caption style={{ marginTop: spacing.xxs }}>{step.cue}</Caption>
      <View style={{ marginTop: spacing.sm }}>
        {step.action === 'inbound-delay' ? (
          delayed ? (
            <StatusLine label="Reported: AA 7412 two hours late" tone="calm" />
          ) : (
            <Button label={busy ? 'Reporting…' : 'Report the flight delay'} onPress={onDelay} disabled={busy} />
          )
        ) : step.route ? (
          <Button label={`Go to step ${step.n}`} variant="quiet" onPress={() => onGo(step.route!)} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  step: { padding: spacing.lg, marginBottom: spacing.sm },
});
