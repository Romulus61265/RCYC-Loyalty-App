import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ConciergeMessage, GuestContext, ServiceRequest } from '@/domain';
import { Caption, ErrorState, Eyebrow, LoadingState, Text } from '@/components';
import { reportError } from '@/core/errors';
import { useServices } from '@/services/ServiceProvider';
import { useJourney } from '@/hooks/useJourney';
import { useAsync } from '@/hooks/useAsync';
import { colors, fonts, radii, spacing } from '@/theme';
import { formatShortDate } from '@/utils/format';

const STATUS_LABEL: Record<ServiceRequest['status'], string> = {
  received: 'Received',
  in_progress: 'Being arranged',
  awaiting_guest: 'Awaiting you',
  confirmed: 'Confirmed',
  completed: 'Completed',
  declined: 'Unavailable',
  cancelled: 'Cancelled',
};

/** A failure here is contained to this tab; the tab bar stays usable. */
export { ErrorFallback as ErrorBoundary } from '@/components';

export default function ConciergeScreen() {
  const services = useServices();
  const journey = useJourney();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // Messages added this session (guest, AI replies, human pushes), shown after the loaded history.
  const [appended, setAppended] = useState<ConciergeMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [handoff, setHandoff] = useState<string>();
  const [sendFailed, setSendFailed] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [conversation, requests, profile, recognition, overview] = await Promise.all([
      services.concierge.openConversation(journey.reservationId),
      services.concierge.listServiceRequests(journey.reservationId),
      services.profile.getProfile(journey.guestId),
      services.loyalty.getRecognition(journey.guestId, journey.voyageId),
      services.voyage.getOverview(journey.reservationId),
    ]);
    // Minimised, pseudonymous context for the AI — no raw PII leaves here.
    const context: GuestContext = {
      guestRef: journey.guestId,
      preferredName: profile.guest.preferredName ?? profile.guest.firstName,
      phase: journey.phase,
      tierLabel: recognition.membership.tierLabel,
      voyageName: overview.voyage.name,
      upcomingBookingIds: [],
      dietarySummary: profile.preferences.dietary.allergies.length ? 'Has a declared allergy' : undefined,
      occasionsThisVoyage: profile.occasions.filter((o) => o.date >= overview.voyage.startDate && o.date <= overview.voyage.endDate).map((o) => o.type),
      locale: profile.preferences.communication.language,
    };
    return { conversation, requests, context, ambassador: overview.reservation.suiteAmbassador ?? 'your Suite Ambassador' };
  }, [journey.reservationId]);

  const conversationId = data?.conversation.conversationId;
  useEffect(() => {
    if (!conversationId) return;
    return services.concierge.subscribe(conversationId, (m) => setAppended((prev) => [...prev, m]));
  }, [conversationId, services]);

  const messages = data ? [...data.conversation.messages, ...appended] : appended;

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, sending]);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} onRetry={reload} />;

  const send = async (body: string) => {
    const text = body.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    setSendFailed(false);
    setAppended((prev) => [...prev, optimisticMessage(data.conversation.conversationId, text)]);
    try {
      const replies = await services.concierge.sendMessage(data.conversation.conversationId, text, data.context);
      setAppended((prev) => [...prev, ...replies]);
      services.audit.record({ action: 'concierge.message', resource: 'conversation', resourceId: data.conversation.conversationId, outcome: 'success', metadata: { intent: replies[0]?.intent ?? 'unknown' } });
    } catch (e) {
      reportError(e, { source: 'concierge.send' });
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  };

  const escalate = async () => {
    try {
      const result = await services.concierge.escalateToHuman({ conversationId: data.conversation.conversationId, reason: 'guest-request', preferredChannel: 'chat' });
      setHandoff(`${result.agentName} will join within ${result.expectedResponseMinutes} minutes.`);
      services.audit.record({ action: 'concierge.escalate', resource: 'conversation', resourceId: data.conversation.conversationId, outcome: 'success' });
    } catch (e) {
      reportError(e, { source: 'concierge.escalate' });
      setHandoff('We couldn’t reach your Suite Ambassador just now. Please call guest services from your suite telephone.');
    }
  };

  const lastSuggestions = [...messages].reverse().find((m) => m.author !== 'guest')?.suggestions ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Concierge</Eyebrow>
          <Text variant="title">At your service</Text>
        </View>
        <Pressable onPress={escalate} style={styles.human} accessibilityRole="button" accessibilityLabel={`Speak with ${data.ambassador}`}>
          <Ionicons name="person-circle-outline" size={18} color={colors.textPrimary} />
          <Eyebrow color={colors.textPrimary} style={{ marginLeft: 6 }}>{data.ambassador.split(' ')[0]}</Eyebrow>
        </Pressable>
      </View>

      {data.requests.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.requestStrip} contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.sm }}>
          {data.requests.map((r) => (
            <View key={r.id} style={styles.request}>
              <Caption color={colors.textPrimary} numberOfLines={1}>{r.summary}</Caption>
              <Caption color={colors.accent}>
                {STATUS_LABEL[r.status]}{r.assignedTo ? ` · ${r.assignedTo.split(',')[0]}` : ''}{r.nextUpdateBy ? ` · update by ${formatShortDate(r.nextUpdateBy)}` : ''}
              </Caption>
            </View>
          ))}
        </ScrollView>
      )}

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.gutter, paddingBottom: spacing.lg }}>
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {sending && <Caption style={{ marginTop: spacing.xs }}>The concierge is writing…</Caption>}
        {sendFailed && (
          <Caption style={{ marginTop: spacing.xs }} color={colors.attention}>
            Your message didn’t reach us. Please try again in a moment.
          </Caption>
        )}
        {handoff && (
          <View style={styles.handoff}>
            <Ionicons name="checkmark" size={14} color={colors.calm} />
            <Caption style={{ marginLeft: 6, flex: 1 }} color={colors.textPrimary}>{handoff}</Caption>
          </View>
        )}
        {!sending && lastSuggestions.length > 0 && (
          <View style={styles.suggestions}>
            {lastSuggestions.map((s) => (
              <Pressable key={s} onPress={() => send(s)} style={styles.suggestion} accessibilityRole="button">
                <Caption color={colors.textPrimary}>{s}</Caption>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: spacing.sm }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask for anything…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onSubmitEditing={() => send(draft)}
          returnKeyType="send"
          accessibilityLabel="Message the concierge"
        />
        <Pressable onPress={() => send(draft)} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send" style={styles.send}>
          <Ionicons name="arrow-up" size={18} color={colors.textInverse} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

let localSeq = 0;

/** Guest message shown immediately, before the service confirms it. */
function optimisticMessage(conversationId: string, body: string): ConciergeMessage {
  localSeq += 1;
  return { id: `local_${localSeq}`, conversationId, author: 'guest', body, createdAt: new Date().toISOString() };
}

function Bubble({ message }: { message: ConciergeMessage }) {
  const mine = message.author === 'guest';
  const human = message.author === 'human';
  return (
    <View style={[styles.bubbleWrap, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
      {!mine && <Eyebrow style={{ marginBottom: 4 }} color={human ? colors.accent : colors.textMuted}>{human ? message.authorName : 'Concierge'}</Eyebrow>}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, human && { borderColor: colors.accent }]}>
        <Text color={mine ? colors.textInverse : colors.textPrimary}>{message.body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.gutter, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  human: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  requestStrip: { flexGrow: 0, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  request: { maxWidth: 280, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, backgroundColor: colors.surfaceElevated, borderRadius: radii.sm },
  bubbleWrap: { marginBottom: spacing.md },
  bubble: { maxWidth: '88%', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.lg },
  bubbleMine: { backgroundColor: colors.surfaceInverse, borderBottomRightRadius: radii.sm },
  bubbleTheirs: { backgroundColor: colors.surfaceElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderBottomLeftRadius: radii.sm },
  handoff: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  suggestion: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  composer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong, backgroundColor: colors.surface },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  send: { marginLeft: spacing.sm, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceInverse, alignItems: 'center', justifyContent: 'center' },
});
