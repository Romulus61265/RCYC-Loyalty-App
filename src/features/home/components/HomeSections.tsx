/**
 * Presentational Home sections. Each receives a slice of HomeViewModel and
 * callbacks; none fetches data or knows about services.
 */
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ExperienceCategory, JourneyAlert } from '@/domain';
import {
  AlertNote,
  Button,
  Caption,
  Card,
  Divider,
  EmptyNote,
  Eyebrow,
  FactRow,
  InlineError,
  MediaFrame,
  LinkCue,
  MediaTile,
  Section,
  StatusLine,
  Text,
  TextLink,
} from '@/components';
import { colors, spacing } from '@/theme';
import type {
  ActivityModel,
  ArrangedModel,
  EmbarkationModel,
  RecognitionModel,
  RecommendationModel,
  SuiteModel,
  TransferModel,
  YachtModel,
} from '../homeModel';

type IconName = ComponentProps<typeof Ionicons>['name'];

const CATEGORY_ICON: Partial<Record<ExperienceCategory, IconName>> = {
  dining: 'restaurant-outline',
  spa: 'leaf-outline',
  excursion: 'map-outline',
  culture: 'library-outline',
  private: 'sparkles-outline',
  wine: 'wine-outline',
  marina: 'water-outline',
  transfer: 'car-outline',
  entertainment: 'musical-notes-outline',
};
const KIND_ICON: Record<ArrangedModel['kind'], IconName> = { dining: 'restaurant-outline', shore: 'map-outline', spa: 'leaf-outline' };

// ─── Recognition ───────────────────────────────────────────────────────────

export function RecognitionStrip({ model, onPrivileges }: { model: RecognitionModel; onPrivileges: () => void }) {
  return (
    <View style={styles.recognition}>
      <View style={styles.recognitionInner}>
        <View style={{ flex: 1, paddingRight: spacing.md }}>
          <Eyebrow color={colors.accentText}>
            {model.programme} {model.tierLabel}
          </Eyebrow>
          <Text variant="subtitle" style={{ marginTop: spacing.xxs }}>
            {model.line}
          </Text>
          {model.lifetimeStatus ? <Caption style={{ marginTop: 2 }}>{model.lifetimeStatus}</Caption> : null}
        </View>
        <TextLink label={`${model.privilegeCount} privileges`} onPress={onPrivileges} />
      </View>
    </View>
  );
}

// ─── Attention ─────────────────────────────────────────────────────────────

export function AttentionSection({
  alerts,
  error,
  onAction,
  onDismiss,
  onRetry,
  recovery,
}: {
  alerts: JourneyAlert[];
  error?: unknown;
  onAction: (alert: JourneyAlert) => void;
  onDismiss: (alert: JourneyAlert) => void;
  onRetry: () => void;
  /** A disruption the guest has been told about, with alternatives to choose from. */
  recovery?: { eyebrow: string; title: string; line: string; cta: string; onOpen: () => void } | null;
}) {
  const needsAction = alerts.filter((a) => a.severity === 'action' || a.severity === 'urgent');
  return (
    <Section eyebrow="For your attention">
      {recovery ? (
        <Card onPress={recovery.onOpen} accessibilityRole="link" accessibilityLabel={`${recovery.title}. ${recovery.line} ${recovery.cta}`} style={{ padding: spacing.lg, marginBottom: spacing.md, borderColor: colors.accent, borderWidth: StyleSheet.hairlineWidth }}>
          <Eyebrow>{recovery.eyebrow}</Eyebrow>
          <Text variant="bodyStrong" style={{ marginTop: spacing.xs }}>
            {recovery.title}
          </Text>
          <Caption style={{ marginTop: spacing.xs }}>{recovery.line}</Caption>
          <View style={{ marginTop: spacing.md }}>
            <LinkCue label={recovery.cta} />
          </View>
        </Card>
      ) : null}
      {error ? (
        <InlineError error={error} onRetry={onRetry} />
      ) : alerts.length === 0 && recovery ? null : alerts.length === 0 ? (
        <View style={styles.allClear}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.calm} />
          <Caption style={{ marginLeft: spacing.xs, flex: 1 }} color={colors.textPrimary}>
            Nothing needs your attention. Everything is in hand.
          </Caption>
        </View>
      ) : (
        <>
          {needsAction.length > 0 ? (
            <Caption style={{ marginBottom: spacing.sm }}>
              {needsAction.length === 1 ? 'One small thing needs you.' : `${countWord(needsAction.length)} small things need you.`} The rest is in hand.
            </Caption>
          ) : null}
          {alerts.map((a) => (
            <AlertNote key={a.id} alert={a} onAction={a.action ? () => onAction(a) : undefined} onDismiss={() => onDismiss(a)} />
          ))}
        </>
      )}
    </Section>
  );
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);

// ─── Next ──────────────────────────────────────────────────────────────────

export function NextActivity({ activity, onOpen }: { activity: ActivityModel | null; onOpen: () => void }) {
  if (!activity) {
    return (
      <Section eyebrow="Next on your journey">
        <EmptyNote body="Nothing is scheduled just yet. Your programme will appear here as plans are made." actionLabel="View your voyage" onAction={onOpen} />
      </Section>
    );
  }
  return (
    <Section eyebrow={activity.heading}>
      <Card onPress={onOpen} accessibilityRole="link" accessibilityLabel={`${activity.title}, ${activity.whenLabel}, ${activity.where}${activity.note ? `. ${activity.note}` : ''}${activity.status ? `. ${activity.status.label}` : ''}`}>
        <View style={{ flexDirection: 'row' }}>
          <Ionicons name={(activity.category && CATEGORY_ICON[activity.category]) || 'time-outline'} size={20} color={colors.accentText} style={{ marginTop: 4 }} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Caption>{activity.whenLabel}</Caption>
            <Text variant="title" style={{ marginTop: 2 }}>
              {activity.title}
            </Text>
            <Caption style={{ marginTop: 2 }}>{activity.where}</Caption>
            {activity.note ? (
              <Caption color={colors.textPrimary} style={{ marginTop: spacing.sm }}>
                {activity.note}
              </Caption>
            ) : null}
            {activity.status ? <StatusLine label={activity.status.label} tone={activity.status.tone} style={{ marginTop: spacing.sm }} /> : null}
          </View>
        </View>
      </Card>
    </Section>
  );
}

// ─── Arrival: embarkation + transfer ───────────────────────────────────────

export function ArrivalSection({ embarkation, transfer, isNext = false, onOpen }: { embarkation: EmbarkationModel | null; transfer: TransferModel | null; isNext?: boolean; onOpen: () => void }) {
  if (!embarkation && !transfer) return null;
  return (
    <Section
      eyebrow={
        !embarkation && transfer?.direction === 'departure'
          ? isNext
            ? 'Next on your journey · going home'
            : 'Your journey home'
          : isNext
            ? 'Next on your journey · your arrival'
            : 'Your arrival'
      }
      title={embarkation ? `${embarkation.dateLabel}, ${embarkation.windowLabel}` : undefined}>
      {transfer ? <TransferCard transfer={transfer} /> : null}
      {embarkation ? (
        <Card style={transfer ? { marginTop: spacing.sm } : undefined} onPress={onOpen} accessibilityRole="link">
          <Eyebrow>Embarkation</Eyebrow>
          <Text variant="bodyStrong" style={{ marginTop: 2 }}>
            {embarkation.terminal}
          </Text>
          <Caption>{embarkation.address}</Caption>
          <Divider />
          <FactRow facts={embarkation.timings} />
          <StatusLine label={embarkation.checkIn.label} tone={embarkation.checkIn.tone} style={{ marginTop: spacing.md }} />
          {embarkation.notes.map((n) => (
            <Caption key={n} color={colors.textPrimary} style={{ marginTop: spacing.xs }}>
              {n}
            </Caption>
          ))}
        </Card>
      ) : null}
    </Section>
  );
}

export function TransferCard({ transfer }: { transfer: TransferModel }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row' }}>
        <Ionicons name="car-outline" size={20} color={colors.accentText} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Eyebrow>Transfer</Eyebrow>
          <Text variant="bodyStrong" style={{ marginTop: 2 }}>
            {transfer.title}
          </Text>
          <Caption>
            {transfer.whenLabel} · {transfer.venue}
          </Caption>
          <StatusLine label={transfer.status.label} tone={transfer.status.tone} style={{ marginTop: spacing.sm }} />
          {transfer.flight ? (
            <View style={{ marginTop: spacing.xs }}>
              <Caption color={colors.textPrimary}>{transfer.flight.label}</Caption>
              <StatusLine label={transfer.flight.status} tone={transfer.flight.tone} />
            </View>
          ) : null}
          {transfer.detail ? (
            <Caption color={colors.textPrimary} style={{ marginTop: spacing.sm }}>
              {transfer.detail}
            </Caption>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

// ─── Arranged for you ──────────────────────────────────────────────────────

export function ArrangedSection({ items, error, onOpen, onArrange, onRetry }: { items: ArrangedModel[]; error?: unknown; onOpen: () => void; onArrange: () => void; onRetry: () => void }) {
  return (
    <Section eyebrow="Arranged for you" action={error ? undefined : <TextLink label="All reservations" onPress={onOpen} />}>
      {error ? (
        <InlineError error={error} onRetry={onRetry} />
      ) : (
        <Card>
          {items.map((r, i) => (
            <View key={r.kind}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: 'row' }}>
                <Ionicons name={KIND_ICON[r.kind]} size={18} color={colors.accentText} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Eyebrow>{r.label}</Eyebrow>
                  {r.item ? (
                    <>
                      <Text variant="bodyStrong" style={{ marginTop: 2 }}>
                        {r.item.title}
                      </Text>
                      <Caption>
                        {r.item.whenLabel} · {r.item.venue}
                      </Caption>
                      <View style={styles.arrangedMeta}>
                        <StatusLine label={r.item.status.label} tone={r.item.status.tone} />
                        {r.more > 0 ? <Caption>+{r.more} more</Caption> : null}
                      </View>
                    </>
                  ) : (
                    <EmptyNote body={`Nothing reserved yet. ${r.emptyHint}`} actionLabel="Ask the concierge" onAction={onArrange} />
                  )}
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Section>
  );
}

// ─── Your voyage: yacht + suite ────────────────────────────────────────────

export function VoyageSection({ yacht, suite, onOpen }: { yacht: YachtModel; suite: SuiteModel; onOpen: () => void }) {
  const { width } = useWindowDimensions();
  const twoUp = width >= 700;
  return (
    <Section eyebrow="Your voyage">
      <View style={[styles.voyageGrid, twoUp && { flexDirection: 'row' }]}>
        <Card style={[styles.voyageTile, twoUp && { flex: 1 }]} onPress={onOpen} accessibilityRole="link">
          <MediaFrame media={yacht.media} height={140} style={styles.tileMedia} />
          <Eyebrow>The yacht</Eyebrow>
          <Text variant="title" style={{ marginTop: 2 }}>
            {yacht.name}
          </Text>
          <Caption style={{ marginTop: 2, marginBottom: spacing.md }}>{yacht.tagline}</Caption>
          <FactRow facts={yacht.facts} />
        </Card>
        <Card style={[styles.voyageTile, twoUp && { flex: 1 }]} onPress={onOpen} accessibilityRole="link">
          <MediaFrame media={suite.media} height={140} style={styles.tileMedia} />
          <Eyebrow>Your suite · {suite.location}</Eyebrow>
          <Text variant="title" style={{ marginTop: 2 }}>
            {suite.title}
          </Text>
          {suite.highlight ? <Caption style={{ marginTop: 2 }}>{suite.highlight}</Caption> : null}
          {suite.ambassador ? (
            <Caption color={colors.textPrimary} style={{ marginTop: 2, marginBottom: spacing.md }}>
              Suite Ambassador: {suite.ambassador}
            </Caption>
          ) : (
            <View style={{ height: spacing.md }} />
          )}
          <FactRow facts={suite.facts} />
        </Card>
      </View>
    </Section>
  );
}

// ─── Chosen for you ────────────────────────────────────────────────────────

export function RecommendationRail({ items, error, onRetry, onOpen }: { items: RecommendationModel[]; error?: unknown; onRetry: () => void; onOpen?: (item: RecommendationModel, position: number) => void }) {
  const { width } = useWindowDimensions();
  const tileWidth = Math.min(280, Math.max(220, width * 0.68));
  return (
    <Section eyebrow="Chosen for you" title="With you in mind">
      {error ? (
        <InlineError error={error} onRetry={onRetry} />
      ) : items.length === 0 ? (
        <EmptyNote body="As we get to know you better, we’ll suggest moments we think you’ll love." />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -spacing.gutter }}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, gap: spacing.md }}
        >
          {items.map((r, i) => (
            <Pressable key={r.id} onPress={onOpen ? () => onOpen(r, i) : undefined} disabled={!onOpen} accessibilityRole={onOpen ? 'link' : undefined} accessibilityLabel={`${r.title}. ${r.rationale}`}>
              <MediaTile media={r.media} eyebrow={r.eyebrow} title={r.title} caption={r.rationale} width={tileWidth} height={Math.round(tileWidth * 1.2)} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Section>
  );
}

// ─── Concierge ─────────────────────────────────────────────────────────────

export function ConciergeInvitation({ ambassador, prompt, onOpen }: { ambassador: string; prompt: string; onOpen: () => void }) {
  return (
    <Section>
      <Card style={{ backgroundColor: colors.surfaceInverse }}>
        <Eyebrow color={colors.textInverseMuted}>At your service</Eyebrow>
        <Text variant="title" color={colors.textInverse} style={{ marginTop: spacing.xs }}>
          {prompt}
        </Text>
        <Caption color={colors.textInverseMuted} style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
          The concierge answers at any hour, and {ambassador} personally whenever you prefer.
        </Caption>
        <Button label="Speak with the concierge" variant="inverse" onPress={onOpen} />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  recognition: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  recognitionInner: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 720 - spacing.gutter * 2, alignSelf: 'center' },
  allClear: { flexDirection: 'row', alignItems: 'center' },
  arrangedMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  voyageGrid: { gap: spacing.sm },
  voyageTile: { padding: spacing.md },
  tileMedia: { marginBottom: spacing.md },
});

/** A quiet line: make a request, or see where your requests stand. */
export function RequestsLine({ onNew, onAll }: { onNew: () => void; onAll: () => void }) {
  return (
    <Section eyebrow="Anything you need">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
        <TextLink label="Make a request" onPress={onNew} />
        <TextLink label="Your requests" onPress={onAll} />
      </View>
    </Section>
  );
}

/** The next celebration on the voyage: a quiet card into its plan. */
export function CelebrationCard({ card, onOpen }: { card: { eyebrow: string; title: string; line: string; cta: string }; onOpen: () => void }) {
  return (
    <Section eyebrow={card.eyebrow}>
      <Card onPress={onOpen} accessibilityRole="link" accessibilityLabel={`${card.title}. ${card.line} ${card.cta}`} style={{ padding: spacing.lg, borderColor: colors.accent, borderWidth: StyleSheet.hairlineWidth }}>
        <Text variant="title">{card.title}</Text>
        <Caption style={{ marginTop: spacing.xs }}>{card.line}</Caption>
        <View style={{ marginTop: spacing.md }}>
          <LinkCue label={card.cta} />
        </View>
      </Card>
    </Section>
  );
}

/** After the voyage: the way into the voyage remembered, and the reflections. */
export function WelcomeHomeCard({ card, onOpen }: { card: { title: string; line: string; cta: string; reflections: string }; onOpen: () => void }) {
  return (
    <Section eyebrow="After your voyage">
      <Card onPress={onOpen} accessibilityRole="link" accessibilityLabel={`${card.title}. ${card.line} ${card.reflections} ${card.cta}`} style={{ padding: spacing.lg, borderColor: colors.accent, borderWidth: StyleSheet.hairlineWidth }}>
        <Text variant="title">{card.title}</Text>
        <Text color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
          {card.line}
        </Text>
        <Caption style={{ marginTop: spacing.sm }}>{card.reflections}</Caption>
        <View style={{ marginTop: spacing.md }}>
          <LinkCue label={card.cta} />
        </View>
      </Card>
    </Section>
  );
}

/** The bell in the hero: notifications, with the unread count. */
export function NotificationBell({ unread, onOpen }: { unread: number; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} hitSlop={12} style={{ padding: 4 }}>
      <Ionicons name="notifications-outline" size={22} color={colors.textInverse} />
      {unread ? (
        <View style={{ position: 'absolute', top: -2, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accentText, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Caption color={colors.textInverse} style={{ fontSize: 11, lineHeight: 14 }}>
            {unread > 9 ? '9+' : String(unread)}
          </Caption>
        </View>
      ) : null}
    </Pressable>
  );
}
