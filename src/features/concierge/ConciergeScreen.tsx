/**
 * Concierge: a conversation with the digital concierge, with a person always
 * a tap away, and the status of every request (`/concierge?view=requests`).
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { liveRegion, useAnnounce } from '@/hooks/useAnnounce';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Caption, ErrorState, LoadingState, SegmentedTabs, StatusLine, TextLink } from '@/components';
import { colors, spacing } from '@/theme';
import { Composer, Header, PeoplePanel, QuickReplies, RequestsList } from './components/Chrome';
import { ThreadView } from './components/Thread';
import { useServices } from '@/services/ServiceProvider';
import { useConcierge } from './useConcierge';

type View_ = 'conversation' | 'requests';

export function ConciergeScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const view: View_ = params.view === 'requests' ? 'requests' : 'conversation';
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const c = useConcierge();
  const count = c.model?.thread.length ?? 0;
  const services = useServices();
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    services.analytics.track('concierge_opened', { entry: view });
  }, [services, view]);

  useEffect(() => {
    if (view !== 'conversation') return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: !reduceMotion }), 60);
    return () => clearTimeout(t);
  }, [count, c.sending, view, reduceMotion]);

  useAnnounce(c.notice);
  // A reply that arrives is read out (the first, already-present thread is not).
  const latest = [...(c.model?.thread ?? [])].reverse().find((i) => i.kind === 'message' && i.side !== 'guest');
  const latestKey = latest?.key;
  const seenReply = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!latest || latest.kind !== 'message') return;
    const first = seenReply.current === undefined;
    seenReply.current = latest.key;
    if (first || Platform.OS === 'web') return; // The web reads the thread's live region.
    const words = latest.paragraphs.map((p) => (p.type === 'text' ? p.text : [p.heading, ...p.items.map((x) => x.text)].filter(Boolean).join('. '))).join(' ');
    AccessibilityInfo.announceForAccessibility(`${latest.name}: ${words}`.slice(0, 600));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announce once per new reply
  }, [latestKey]);

  if (c.loading) return <LoadingState label="Your concierge is joining…" />;
  if (c.error || !c.model) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={c.error} onRetry={c.reload} />
      </View>
    );
  }
  const model = c.model;
  const setView = (v: View_) => router.setParams({ view: v });
  const openCount = model.requests.open.length;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header model={model} peopleOpen={peopleOpen} onPeople={() => setPeopleOpen((o) => !o)} topInset={insets.top} />
      {peopleOpen ? (
        <PeoplePanel
          model={model}
          busy={false}
          onChoose={(to, label) => {
            setPeopleOpen(false);
            setView('conversation');
            void c.escalate(to, label);
          }}
        />
      ) : null}
      <View style={styles.tabs}>
        <SegmentedTabs
          options={[
            { value: 'conversation', label: 'Conversation' },
            { value: 'requests', label: `Requests${openCount ? ` · ${openCount}` : ''}`, accessibilityLabel: openCount ? `Requests, ${openCount} open` : 'Requests' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === 'conversation' ? (
        <>
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
            <View aria-live="polite">
              <ThreadView items={model.thread} onAction={(a) => void c.perform(a)} />
            </View>
            {/* Always present, so its changes are read (a live region that appears with its words often is not). */}
            <View {...liveRegion('polite')}>
              {c.sending ? <Caption style={styles.typing}>The concierge is writing…</Caption> : null}
              {c.notice ? <StatusLine label={c.notice} tone="attention" style={styles.typing} /> : null}
            </View>
          </ScrollView>
          <QuickReplies replies={model.quickReplies} onPick={(r) => void c.send(r)} />
          <Composer onSend={c.send} sending={c.sending} bottomInset={0} />
        </>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.requests}>
          <View style={styles.requestLinks}>
            <TextLink label="Make a request" onPress={() => router.push('/requests/new')} />
            <TextLink label="All requests and history" onPress={() => router.push('/requests')} />
          </View>
          <RequestsList
            open={model.requests.open}
            closed={model.requests.closed}
            unavailable={c.requestsUnavailable}
            onAsk={(r) => {
              setView('conversation');
              void c.send(`What is the status of ${r.title}?`);
            }}
          />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  requestLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginBottom: spacing.lg },
  tabs: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  thread: { padding: spacing.gutter, paddingBottom: spacing.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  typing: { marginLeft: 28 + spacing.sm, marginTop: spacing.xs },
  requests: { padding: spacing.gutter, paddingBottom: spacing.xxl, maxWidth: 760, width: '100%', alignSelf: 'center' },
});
