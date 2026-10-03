/**
 * The conversation: messages, day dividers and the cards replies carry
 * (schedule, action, confirmation, hand-off, privileges, request status).
 * Presentational only: everything shown comes from the view model.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ConciergeAction } from '@/domain';
import { Caption, Eyebrow, MediaFrame, StatusLine, Text } from '@/components';
import { colors, radii, spacing } from '@/theme';
import type { ActionButton, Card, Paragraph, RequestCardModel, ThreadItem } from '../conciergeModel';

export function Avatar({ initials, tone = 'person', size = 28 }: { initials?: string; tone?: 'person' | 'concierge'; size?: number }) {
  const concierge = tone === 'concierge';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, concierge ? styles.avatarConcierge : styles.avatarPerson]} accessibilityElementsHidden importantForAccessibility="no">
      {concierge ? <Ionicons name="sparkles-outline" size={size * 0.46} color={colors.accent} /> : <Text variant="caption" color={colors.textInverse} style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>{initials}</Text>}
    </View>
  );
}

function Body({ paragraphs, inverse }: { paragraphs: Paragraph[]; inverse?: boolean }) {
  const color = inverse ? colors.textInverse : colors.textPrimary;
  return (
    <View style={{ gap: spacing.sm }}>
      {paragraphs.map((p, i) =>
        p.type === 'text' ? (
          <Text key={i} color={color}>
            {p.text}
          </Text>
        ) : (
          <View key={i} style={{ gap: 6 }}>
            {p.heading ? <Text variant="bodyStrong" color={color}>{p.heading}</Text> : null}
            {p.items.map((it, j) => (
              <View key={j} style={styles.listRow}>
                {it.time ? (
                  <Text variant="bodyStrong" color={inverse ? colors.accentSoft : colors.accent} style={styles.listTime}>
                    {it.time}
                  </Text>
                ) : (
                  <Text color={inverse ? colors.accentSoft : colors.accent} style={styles.listDot}>
                    ·
                  </Text>
                )}
                <Text color={color} style={{ flex: 1 }}>
                  {it.text}
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

function Message({ item }: { item: Extract<ThreadItem, { kind: 'message' }> }) {
  if (item.side === 'guest') {
    return (
      <View style={[styles.row, { justifyContent: 'flex-end' }]} accessible accessibilityLabel={`You, ${item.time}: ${plain(item.paragraphs)}`}>
        <View style={[styles.bubble, styles.guestBubble]}>
          <Body paragraphs={item.paragraphs} inverse />
          <Caption color={colors.textInverseMuted} align="right" style={{ marginTop: 4 }}>
            {item.time}
          </Caption>
        </View>
      </View>
    );
  }
  const person = item.side === 'person';
  return (
    <View style={styles.row} accessible accessibilityLabel={`${item.name}, ${item.time}: ${plain(item.paragraphs)}`}>
      <Avatar initials={item.initials} tone={person ? 'person' : 'concierge'} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <View style={styles.byline}>
          <Eyebrow color={person ? colors.accent : colors.textMuted}>{item.note ? `${item.name} · ${item.note}` : item.name}</Eyebrow>
          <Caption color={colors.textMuted}>{item.time}</Caption>
        </View>
        <View style={[styles.bubble, styles.theirBubble, person && { borderColor: colors.accent }]}>
          <Body paragraphs={item.paragraphs} />
        </View>
      </View>
    </View>
  );
}

const plain = (ps: Paragraph[]) => ps.map((p) => (p.type === 'text' ? p.text : [p.heading, ...p.items.map((i) => `${i.time ?? ''} ${i.text}`)].filter(Boolean).join('. '))).join(' ');

function ActionButtons({ buttons, onAction }: { buttons: ActionButton[]; onAction: (a: ConciergeAction) => void }) {
  return (
    <View style={styles.buttons}>
      {buttons.map((b, i) => {
        const done = b.state === 'done';
        const disabled = b.state !== 'idle';
        const primary = i === 0 && b.state === 'idle';
        return (
          <Pressable
            key={b.key}
            onPress={() => onAction(b.action)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={done ? `${b.label}, done` : b.label}
            accessibilityState={{ disabled, busy: b.state === 'busy' }}
            style={({ pressed }) => [styles.action, primary ? styles.actionPrimary : styles.actionQuiet, done && styles.actionDone, (pressed || b.state === 'disabled') && { opacity: 0.55 }]}
          >
            {b.state === 'busy' ? <ActivityIndicator size="small" color={primary ? colors.textInverse : colors.textPrimary} style={{ marginRight: 6 }} /> : null}
            {done ? <Ionicons name="checkmark" size={14} color={colors.calm} style={{ marginRight: 4 }} /> : null}
            <Eyebrow color={primary ? colors.textInverse : done ? colors.calm : colors.textPrimary}>{b.label}</Eyebrow>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RequestCard({ request, onAsk }: { request: RequestCardModel; onAsk?: () => void }) {
  return (
    <View style={styles.card} accessible={!onAsk} accessibilityLabel={`${request.title}. ${request.status.label}.`}>
      <View style={styles.between}>
        <Eyebrow>{request.typeLabel}</Eyebrow>
        <StatusLine label={request.status.label} tone={request.status.tone} />
      </View>
      <Text variant="bodyStrong" style={{ marginTop: spacing.xs }}>
        {request.title}
      </Text>
      {request.details ? <Caption style={{ marginTop: 2 }}>{request.details}</Caption> : null}
      <View style={styles.steps} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {request.steps.map((st, i) => (
          <View key={st.label} style={styles.step}>
            <View style={[styles.stepDot, st.state === 'done' && styles.stepDone, st.state === 'current' && { borderColor: request.status.tone === 'attention' ? colors.attention : colors.accent }]} />
            {i < request.steps.length - 1 ? <View style={[styles.stepLine, st.state === 'done' && { backgroundColor: colors.calm }]} /> : null}
            <Caption color={st.state === 'todo' ? colors.textMuted : colors.textPrimary} style={styles.stepLabel} numberOfLines={1}>
              {st.label}
            </Caption>
          </View>
        ))}
      </View>
      <Caption color={colors.textSecondary} style={{ marginTop: spacing.xs }}>
        {[request.owner, request.nextUpdate ?? request.opened].filter(Boolean).join(' · ')}
      </Caption>
      {onAsk && request.open ? (
        <Pressable onPress={onAsk} accessibilityRole="button" accessibilityLabel={`Ask about ${request.title}`} style={{ marginTop: spacing.sm }}>
          <Eyebrow color={colors.accent}>Ask about this</Eyebrow>
        </Pressable>
      ) : null}
    </View>
  );
}

function CardView({ card, onAction }: { card: Card; onAction: (a: ConciergeAction) => void }) {
  switch (card.type) {
    case 'schedule':
      return (
        <View style={styles.card}>
          <Eyebrow color={colors.accent}>{card.title}</Eyebrow>
          <Caption style={{ marginTop: 2, marginBottom: spacing.sm }}>{card.subtitle}</Caption>
          {card.rows.map((r) => (
            <View key={r.key} style={styles.scheduleRow}>
              <Text variant="bodyStrong" style={styles.listTime}>
                {r.time}
              </Text>
              <View style={{ flex: 1 }}>
                <Text color={r.suggestion ? colors.textSecondary : colors.textPrimary}>{r.title}</Text>
                <Caption>{r.suggestion ? `Suggested for you · ${r.location}` : r.location}</Caption>
              </View>
              {r.status && r.status.tone !== 'calm' ? <StatusLine label={r.status.label} tone={r.status.tone} /> : null}
            </View>
          ))}
          {card.footer.length ? (
            <View style={styles.footer}>
              {card.footer.map((f) => (
                <Caption key={f}>{f}</Caption>
              ))}
            </View>
          ) : null}
        </View>
      );
    case 'action':
      return (
        <View style={[styles.card, card.resolved && { opacity: 0.85 }]}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {card.media ? <MediaFrame media={card.media} height={56} style={{ width: 56 }} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong">{card.title}</Text>
              {card.detail ? <Caption style={{ marginTop: 2 }}>{card.detail}</Caption> : null}
            </View>
          </View>
          {card.status ? <StatusLine label={card.status.label} tone={card.status.tone} style={{ marginTop: spacing.xs }} /> : null}
          <ActionButtons buttons={card.buttons} onAction={onAction} />
        </View>
      );
    case 'confirmation':
      return (
        <View style={[styles.card, styles.confirmation]} accessible accessibilityLabel={`${card.statusLabel}: ${card.title}. ${card.detail}`}>
          <View style={styles.between}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={card.tone === 'calm' ? 'checkmark-circle' : 'time-outline'} size={16} color={card.tone === 'calm' ? colors.calm : colors.accent} />
              <Eyebrow color={card.tone === 'calm' ? colors.calm : colors.accent}>{card.statusLabel}</Eyebrow>
            </View>
            {card.reference ? <Caption color={colors.textMuted}>{card.reference}</Caption> : null}
          </View>
          <Text variant="title" style={{ marginTop: spacing.xs }}>
            {card.title}
          </Text>
          <Caption>{card.detail}</Caption>
        </View>
      );
    case 'handoff':
      return (
        <View style={[styles.card, styles.handoff]} accessible accessibilityLabel={`${card.agentName} has been asked to join. ${card.line}.`}>
          <Avatar initials={card.initials} size={36} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Eyebrow color={colors.accent}>{card.teamLabel}</Eyebrow>
            <Text variant="bodyStrong">{card.agentName.split(',')[0]} has been asked to join</Text>
            <Caption>{card.line}</Caption>
          </View>
        </View>
      );
    case 'privileges':
      return (
        <View style={styles.card}>
          <Eyebrow color={colors.accent}>Your privileges this voyage</Eyebrow>
          {card.items.map((p) => (
            <View key={p.id} style={{ marginTop: spacing.sm }}>
              <Text variant="bodyStrong">{p.title}</Text>
              <Caption>{p.description}</Caption>
              <Caption color={colors.textMuted}>{p.basis}</Caption>
            </View>
          ))}
        </View>
      );
    case 'request':
      return <RequestCard request={card.request} />;
  }
}

export function ThreadView({ items, onAction }: { items: ThreadItem[]; onAction: (a: ConciergeAction) => void }) {
  return (
    <View>
      {items.map((item) => {
        if (item.kind === 'divider') {
          return (
            <View key={item.key} style={styles.divider} accessibilityRole="header">
              <View style={styles.dividerLine} />
              <Caption color={colors.textMuted} style={{ marginHorizontal: spacing.sm }}>
                {item.label}
              </Caption>
              <View style={styles.dividerLine} />
            </View>
          );
        }
        if (item.kind === 'message') return <Message key={item.key} item={item} />;
        return (
          <View key={item.key} style={styles.cardWrap}>
            <CardView card={item.card} onAction={onAction} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  byline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  bubble: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.lg },
  guestBubble: { maxWidth: '86%', backgroundColor: colors.surfaceInverse, borderBottomRightRadius: radii.sm },
  theirBubble: { backgroundColor: colors.surfaceElevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderTopLeftRadius: radii.sm },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarPerson: { backgroundColor: colors.accent },
  avatarConcierge: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent, backgroundColor: colors.surface },
  listRow: { flexDirection: 'row', alignItems: 'flex-start' },
  listTime: { width: 52 },
  listDot: { width: 16 },
  cardWrap: { marginLeft: 28 + spacing.sm, marginBottom: spacing.md },
  card: { backgroundColor: colors.surfaceElevated, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.md },
  confirmation: { borderColor: colors.calm, backgroundColor: colors.surface },
  handoff: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.accent },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  scheduleRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: spacing.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 14, borderRadius: radii.pill },
  actionPrimary: { backgroundColor: colors.surfaceInverse },
  actionQuiet: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  actionDone: { borderColor: colors.calm },
  steps: { flexDirection: 'row', marginTop: spacing.sm },
  step: { flex: 1, alignItems: 'flex-start' },
  stepDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surfaceElevated, zIndex: 1 },
  stepDone: { backgroundColor: colors.calm, borderColor: colors.calm },
  stepLine: { position: 'absolute', top: 4, left: 10, right: 0, height: 1.5, backgroundColor: colors.border },
  stepLabel: { marginTop: 4, paddingRight: 4 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, marginTop: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
});
