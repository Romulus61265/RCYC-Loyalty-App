/** Concierge header, the "speak with a person" panel, quick replies, composer and the requests list. */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EscalationTarget } from '@/domain';
import { Caption, EmptyNote, Eyebrow, Text } from '@/components';
import { colors, fonts, radii, spacing } from '@/theme';
import type { ConciergeModel, RequestCardModel } from '../conciergeModel';
import { Avatar, RequestCard } from './Thread';

export function Header({ model, peopleOpen, onPeople, topInset }: { model: ConciergeModel; peopleOpen: boolean; onPeople: () => void; topInset: number }) {
  const a = model.header.ambassador;
  return (
    <View style={[styles.header, { paddingTop: topInset + spacing.md }]}>
      <View style={{ flex: 1, marginRight: spacing.sm }}>
        <Eyebrow>Concierge</Eyebrow>
        <Text variant="title">{model.header.title}</Text>
        <Caption numberOfLines={2}>{model.header.subtitle}</Caption>
      </View>
      <Pressable
        onPress={onPeople}
        style={[styles.ambassador, peopleOpen && { borderColor: colors.accent }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: peopleOpen }}
        accessibilityLabel={`Speak with a person: ${a.firstName}, your ${a.title}, or the team`}
      >
        <Avatar initials={a.initials} size={26} />
        <View style={{ marginLeft: 6 }}>
          <Eyebrow color={colors.textPrimary}>{a.firstName}</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={styles.online} />
            <Caption color={colors.textSecondary} style={{ fontSize: 11, lineHeight: 14 }}>
              {peopleOpen ? 'Close' : 'A person'}
            </Caption>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export function PeoplePanel({ model, onChoose, busy }: { model: ConciergeModel; onChoose: (to: EscalationTarget, label: string) => void; busy: boolean }) {
  return (
    <View style={styles.people}>
      <Eyebrow style={{ marginBottom: spacing.xs }}>Speak with a person</Eyebrow>
      {model.people.map((p) => (
        <Pressable
          key={p.to}
          onPress={() => onChoose(p.to, p.label)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${p.label}. ${p.detail}`}
          style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name={p.to === 'suite-ambassador' ? 'person-outline' : p.to === 'medical' ? 'medkit-outline' : 'people-outline'} size={18} color={colors.accent} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text variant="bodyStrong">{p.title}</Text>
            {p.detail ? <Caption>{p.detail}</Caption> : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
      <Caption color={colors.attention} style={{ marginTop: spacing.xs }}>
        {model.emergencyNote}
      </Caption>
    </View>
  );
}

export function QuickReplies({ replies, onPick }: { replies: string[]; onPick: (s: string) => void }) {
  if (!replies.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.replies} style={styles.repliesBar}>
      {replies.map((r) => (
        <Pressable key={r} onPress={() => onPick(r)} style={({ pressed }) => [styles.reply, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`Ask: ${r}`}>
          <Caption color={colors.textPrimary}>{r}</Caption>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function Composer({ onSend, sending, bottomInset }: { onSend: (text: string) => Promise<boolean>; sending: boolean; bottomInset: number }) {
  const [draft, setDraft] = useState('');
  const submit = async () => {
    const text = draft;
    if (!text.trim() || sending) return;
    setDraft('');
    // Give the words back if they didn't reach us.
    if (!(await onSend(text))) setDraft(text);
  };
  const empty = !draft.trim();
  return (
    <View style={[styles.composer, { paddingBottom: spacing.sm + bottomInset }]}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Ask for anything…"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        multiline
        numberOfLines={1}
        maxLength={2000}
        onSubmitEditing={() => void submit()}
        submitBehavior="submit"
        returnKeyType="send"
        accessibilityLabel="Message the concierge"
      />
      <Pressable onPress={() => void submit()} disabled={empty || sending} accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: empty || sending }} style={[styles.send, (empty || sending) && { opacity: 0.4 }]}>
        <Ionicons name="arrow-up" size={18} color={colors.textInverse} />
      </Pressable>
    </View>
  );
}

export function RequestsList({ open, closed, onAsk, unavailable }: { open: RequestCardModel[]; closed: RequestCardModel[]; onAsk: (r: RequestCardModel) => void; unavailable: boolean }) {
  if (unavailable) return <EmptyNote body="Your requests can’t be shown just now. Your concierge can tell you where each one stands." />;
  return (
    <View style={{ gap: spacing.md }}>
      <Eyebrow>In hand · {open.length}</Eyebrow>
      {open.length ? open.map((r) => <RequestCard key={r.id} request={r} onAsk={() => onAsk(r)} />) : <EmptyNote body="Nothing is open. Everything you have asked for is complete." />}
      {closed.length ? (
        <>
          <Eyebrow style={{ marginTop: spacing.md }}>Completed · {closed.length}</Eyebrow>
          {closed.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.gutter, paddingBottom: spacing.sm },
  ambassador: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  online: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.calm },
  people: { marginHorizontal: spacing.gutter, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent },
  person: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  repliesBar: { flexGrow: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background },
  replies: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm, gap: spacing.xs },
  reply: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, maxHeight: 120, fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radii.lg, backgroundColor: colors.surfaceElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  send: { marginLeft: spacing.sm, marginBottom: 2, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceInverse, alignItems: 'center', justifyContent: 'center' },
});
