import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GuestPreferences } from '@/domain';
import { router } from 'expo-router';
import { liveRegion, readAs } from '@/hooks/useAnnounce';
import { useFocusOnChange } from '@/hooks/useFocusOnChange';
import { Button, Caption, Card, DetailRow, Divider, EmptyNote, Eyebrow, FactRow, MediaFrame, Section, StatusLine, Text, TextLink, meaningfulIcon } from '@/components';
import { colors, radii, spacing } from '@/theme';
import type { GroupSummary, ProfileModel } from '../profileModel';
import { groupByKey, type FormValues, type GroupKey } from '../preferenceSchema';
import type { SaveResult } from '../useProfileArea';
import { PreferenceEditor } from './PreferenceEditor';

// ─── Personal ──────────────────────────────────────────────────────────────

export function PersonalSection({ model, onConcierge, onSignOut }: { model: ProfileModel['personal']; onConcierge: () => void; onSignOut: () => Promise<void> }) {
  const [signingOut, setSigningOut] = useState(false);
  const signOut = () => {
    setSigningOut(true);
    onSignOut().catch(() => setSigningOut(false));
  };
  return (
    <>
      <Section eyebrow="Personal information">
        <Card>
          {model.rows.map((r) => (
            <DetailRow key={r.label} label={r.label} value={r.value} detail={r.detail} />
          ))}
        </Card>
        <Caption style={{ marginTop: spacing.md }}>{model.note}</Caption>
        <Pressable onPress={onConcierge} accessibilityRole="button" hitSlop={14} style={{ marginTop: spacing.sm }}>
          <Eyebrow color={colors.accentText}>Ask the concierge</Eyebrow>
        </Pressable>
      </Section>
      <Section eyebrow="This device">
        <Button label={signingOut ? 'Signing out…' : 'Sign out'} variant="quiet" onPress={signOut} disabled={signingOut} />
        <Caption style={{ marginTop: spacing.sm }}>Signing out ends your session on this device. Your preferences are kept.</Caption>
      </Section>
    </>
  );
}

// ─── Bonvoy ────────────────────────────────────────────────────────────────

export function BonvoySection({ model }: { model: ProfileModel['bonvoy'] }) {
  return (
    <>
      <Section>
        <View style={styles.memberCard} {...readAs(`Marriott Bonvoy ${model.tierLabel}${model.lifetimeStatus ? `, ${model.lifetimeStatus}` : ''}. Member ${model.memberNumber}, since ${model.since}${model.points ? `, ${model.points} points` : ''}`)}>
          <Eyebrow color={colors.textInverseMuted}>Marriott Bonvoy</Eyebrow>
          <Text variant="display" color={colors.textInverse} style={{ marginTop: spacing.xs }}>
            {model.tierLabel}
          </Text>
          {model.lifetimeStatus ? (
            <Text variant="subtitle" color={colors.accentSoft}>
              {model.lifetimeStatus}
            </Text>
          ) : null}
          <View style={styles.memberMeta}>
            <View>
              <Eyebrow color={colors.textInverseMuted}>Member</Eyebrow>
              <Caption color={colors.textInverse}>{model.memberNumber}</Caption>
            </View>
            <View>
              <Eyebrow color={colors.textInverseMuted}>Since</Eyebrow>
              <Caption color={colors.textInverse}>{model.since}</Caption>
            </View>
            {model.points ? (
              <View>
                <Eyebrow color={colors.textInverseMuted}>Points</Eyebrow>
                <Caption color={colors.textInverse}>{model.points}</Caption>
              </View>
            ) : null}
          </View>
        </View>
        <Text variant="subtitle" style={{ marginTop: spacing.lg }}>
          {model.line}
        </Text>
      </Section>
      <Section eyebrow="With the Yacht Collection">
        <FactRow facts={model.stats} />
      </Section>
      <Section eyebrow="Your privileges this voyage">
        <Card>
          {model.privileges.map((p, i) => (
            <View key={p.title}>
              {i > 0 && <Divider />}
              <Text variant="bodyStrong">{p.title}</Text>
              <Caption style={{ marginTop: 2 }}>{p.description}</Caption>
            </View>
          ))}
        </Card>
        <Caption style={{ marginTop: spacing.sm }}>Privileges shown in this preview are illustrative.</Caption>
      </Section>
    </>
  );
}

// ─── Preference groups (Preferences, Communication, Privacy) ───────────────

export interface EditingProps {
  preferences: GuestPreferences;
  editing: GroupKey | null;
  onEdit: (k: GroupKey | null) => void;
  onSave: (k: GroupKey, v: FormValues) => Promise<SaveResult>;
}

export function GroupCard({ summary, editing, preferences, onEdit, onSave }: { summary: GroupSummary } & EditingProps) {
  // Closing the editor (saved or cancelled) returns to this group's Edit button.
  const editRef = useFocusOnChange<View>(editing === summary.key);
  if (editing === summary.key) {
    return <PreferenceEditor group={groupByKey(summary.key)} preferences={preferences} onSave={(v) => onSave(summary.key, v)} onClose={() => onEdit(null)} />;
  }
  return (
    <Card>
      <View style={styles.groupHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="bodyStrong">{summary.label}</Text>
            {summary.sensitive ? <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} {...meaningfulIcon('Sensitive')} /> : null}
          </View>
          {summary.lines.map((l) => (
            <Caption key={l} color={colors.textPrimary} style={{ marginTop: 2 }}>
              {l}
            </Caption>
          ))}
          <Caption style={{ marginTop: spacing.xxs }}>{summary.usedBy}</Caption>
        </View>
        <Pressable ref={editRef} onPress={() => onEdit(summary.key)} accessibilityRole="button" accessibilityLabel={`Edit ${summary.label}`} hitSlop={14} disabled={editing !== null}>
          <Eyebrow color={editing !== null ? colors.textMuted : colors.accentText}>Edit</Eyebrow>
        </Pressable>
      </View>
    </Card>
  );
}

export function PreferencesSection({ groups, saved, ...editing }: { groups: GroupSummary[]; saved: ProfileModel['saved'] } & EditingProps) {
  return (
    <Section eyebrow="Your preferences" title="Prepared before you arrive">
      <Caption style={{ marginBottom: spacing.md }}>
        {saved.source === 'From your reservation' ? saved.label : `${saved.label} · ${saved.source}`}
      </Caption>
      <View style={{ gap: spacing.sm }}>
        {groups.map((g) => (
          <GroupCard key={g.key} summary={g} {...editing} />
        ))}
      </View>
    </Section>
  );
}

// ─── Companions & occasions ────────────────────────────────────────────────

export function CompanionsSection({ items }: { items: ProfileModel['companions'] }) {
  return (
    <Section eyebrow="Travelling with you">
      {items.length === 0 ? (
        <EmptyNote body="No companions on your profile." />
      ) : (
        <Card>
          {items.map((c, i) => (
            <View key={c.id}>
              {i > 0 && <Divider />}
              <Text variant="title">{c.name}</Text>
              <Caption>{c.relationship}</Caption>
              {c.notes ? (
                <Caption color={colors.textPrimary} style={{ marginTop: spacing.xs }}>
                  {c.notes}
                </Caption>
              ) : null}
            </View>
          ))}
        </Card>
      )}
      <Caption style={{ marginTop: spacing.md }}>Companions manage their own preferences from their own invitation.</Caption>
    </Section>
  );
}

export function OccasionsSection({ items, shared, onPrivacy }: { items: ProfileModel['occasions']; shared: boolean; onPrivacy: () => void }) {
  return (
    <Section eyebrow="Special occasions">
      <Card>
        {items.map((o, i) => (
          <View key={o.id}>
            {i > 0 && <Divider />}
            <View style={styles.between}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {o.label}
              </Text>
              {o.thisVoyage ? <StatusLine label="During this voyage" tone="pending" /> : null}
            </View>
            <Caption>{o.date}</Caption>
            <Caption color={colors.textPrimary} style={{ marginTop: 2 }}>
              {o.recognition}
            </Caption>
          </View>
        ))}
      </Card>
      <Caption style={{ marginTop: spacing.md }}>
        {shared ? 'Your crew may quietly prepare for these occasions.' : 'Your crew won’t be told about these occasions.'}
      </Caption>
      <Pressable onPress={onPrivacy} accessibilityRole="button" hitSlop={14} style={{ marginTop: spacing.xs }}>
        <Eyebrow color={colors.accentText}>Change in Privacy</Eyebrow>
      </Pressable>
    </Section>
  );
}

// ─── Voyage history ────────────────────────────────────────────────────────

export function HistorySection({ model }: { model: ProfileModel['history'] }) {
  return (
    <>
      <Section eyebrow="Upcoming">
        {model.upcoming ? <VoyageRow line={model.upcoming} /> : <EmptyNote body="No voyage booked. Your concierge would love to help you choose." />}
      </Section>
      <Section eyebrow="Remembered">
        {model.past.map((v) => (
          <Pressable key={v.id} onPress={() => router.push(`/history/${v.id}`)} accessibilityRole="link" accessibilityLabel={`${v.name}, ${v.detail}. Open the voyage`}>
            <VoyageRow line={v} chevron />
          </Pressable>
        ))}
        {model.past.length ? (
          <Pressable onPress={() => router.push('/history')} accessibilityRole="link" hitSlop={14} style={{ marginTop: spacing.sm }}>
            <Eyebrow color={colors.accentText}>Your voyage history</Eyebrow>
          </Pressable>
        ) : null}
        <View style={{ marginTop: spacing.md }}>
          <FactRow facts={model.totals} />
        </View>
      </Section>
    </>
  );
}

function VoyageRow({ line, chevron }: { line: { name: string; detail: string; media: ProfileModel['history']['past'][number]['media'] }; chevron?: boolean }) {
  return (
    <View style={styles.voyage}>
      <MediaFrame media={line.media} height={64} style={{ width: 64 }} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text variant="bodyStrong">{line.name}</Text>
        <Caption>{line.detail}</Caption>
      </View>
      {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </View>
  );
}

// ─── Communication & privacy ───────────────────────────────────────────────

export function CommunicationSection({ summary, ...editing }: { summary: GroupSummary } & EditingProps) {
  return (
    <Section eyebrow="Communication preferences" title="How and when we reach you">
      <GroupCard summary={summary} {...editing} />
      <Caption style={{ marginTop: spacing.md }}>Urgent matters, such as a change to your embarkation, always reach you, even during quiet hours.</Caption>
      <View style={{ marginTop: spacing.md }}>
        <TextLink label="Notification settings" onPress={() => router.push('/notifications/settings')} />
      </View>
    </Section>
  );
}

export function PrivacySection({ summary, saved, onRequest, ...editing }: { summary: GroupSummary; saved: ProfileModel['saved']; onRequest: (k: 'copy' | 'erasure') => Promise<boolean> } & EditingProps) {
  const [sent, setSent] = useState<'copy' | 'erasure' | 'failed' | null>(null);
  const request = async (k: 'copy' | 'erasure') => setSent((await onRequest(k)) ? k : 'failed');
  return (
    <>
      <Section eyebrow="Privacy" title="What you share, and with whom">
        <GroupCard summary={summary} {...editing} />
      </Section>
      <Section eyebrow="Your data">
        <Card>
          <Text>Dietary and accessibility details are treated as sensitive. They are shared only with the people who need them to look after you, and only as you allow.</Text>
          <Caption style={{ marginTop: spacing.sm }}>Where your preferences are kept: {saved.source.toLowerCase()}.</Caption>
          <Divider />
          <View style={{ gap: spacing.sm }}>
            <Button label="Request a copy of my data" variant="quiet" onPress={() => void request('copy')} />
            <Button label="Ask us to delete my data" variant="quiet" onPress={() => void request('erasure')} />
          </View>
          {/* Always present, so the outcome is read when it arrives. */}
          <View {...liveRegion('polite')}>
            {sent ? (
              <StatusLine
                label={sent === 'failed' ? 'We couldn’t send that just now. Please try again.' : 'Sent to our privacy team. We’ll confirm by e-mail.'}
                tone={sent === 'failed' ? 'attention' : 'calm'}
                live
                style={{ marginTop: spacing.md }}
              />
            ) : null}
          </View>
        </Card>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  memberCard: { backgroundColor: colors.surfaceInverse, borderRadius: radii.lg, padding: spacing.lg, paddingTop: spacing.xl },
  memberMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(251,249,246,0.2)', flexWrap: 'wrap', gap: spacing.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  voyage: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
});
