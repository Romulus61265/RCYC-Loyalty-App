/**
 * Notifications: what has reached the guest, newest first and grouped by
 * day, with what is coming up. Tapping one marks it read and opens it.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readAs } from '@/hooks/useAnnounce';
import { Caption, Chip, ChipGroup, EmptyNote, ErrorState, Eyebrow, LoadingState, PageHeader, Screen, Section, Text, TextLink } from '@/components';
import type { NotificationType } from '@/domain';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, radii, spacing } from '@/theme';
import type { InboxItemModel } from './notificationsModel';
import { useInbox } from './useNotifications';

export function NotificationsScreen() {
  const [filter, setFilter] = useState<NotificationType | 'all'>('all');
  const { model, loading, error, reload, markRead, markAllRead } = useInbox(filter);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (loading && !model) return <LoadingState label="One moment…" />;
  if (error || !model) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  const open = (item: InboxItemModel) => {
    void markRead([item.key]);
    if (item.route) router.push(item.route as Href);
  };

  return (
    <Screen>
      <BackBar onBack={back} />
      <PageHeader eyebrow="Notifications" title="For you" subtitle={model.unread ? `${model.unread} unread` : 'All read.'} />
      <View style={styles.links}>
        {model.unread ? <TextLink label="Mark all as read" role="button" onPress={() => void markAllRead()} /> : null}
        <TextLink label="Settings" onPress={() => router.push('/notifications/settings')} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <ChipGroup label="Show" kind="radio" style={{ flexWrap: 'nowrap' }}>
          {model.types.map((t) => (
            <Chip key={t.value} kind="radio" label={t.label} selected={filter === t.value} onPress={() => setFilter(t.value)} />
          ))}
        </ChipGroup>
      </ScrollView>

      {model.upcoming.length && filter === 'all' ? (
        <Section eyebrow="Coming up">
          <View style={{ gap: spacing.xs }}>
            {model.upcoming.map((u) => (
              <View key={u.key} {...readAs(`${u.title}, ${u.when}`)}>
                <Text>{u.title}</Text>
                <Caption>{u.when}</Caption>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {model.groups.length ? (
        model.groups.map((g) => (
          <Section key={g.label} eyebrow={g.label}>
            <View style={{ gap: spacing.sm }}>
              {g.items.map((n) => (
                <Item key={n.key} item={n} onOpen={() => open(n)} />
              ))}
            </View>
          </Section>
        ))
      ) : (
        <Section>
          <EmptyNote body="Nothing yet. We will let you know when something needs you." />
        </Section>
      )}
    </Screen>
  );
}

function Item({ item, onOpen }: { item: InboxItemModel; onOpen: () => void }) {
  const urgent = item.type === 'urgent';
  return (
    <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={item.accessibilityLabel} style={({ pressed }) => [styles.item, urgent && styles.urgent, pressed && { opacity: 0.8 }]}>
      <Ionicons name={item.icon as never} size={18} color={urgent ? colors.attention : colors.accentText} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <View style={styles.row}>
          <Eyebrow color={urgent ? colors.attention : colors.textMuted}>{item.typeLabel}</Eyebrow>
          <Caption>{item.time}</Caption>
        </View>
        <Text variant={item.unread ? 'bodyStrong' : 'body'} style={{ marginTop: 2 }}>
          {item.title}
        </Text>
        <Caption style={{ marginTop: 2 }}>{item.body}</Caption>
      </View>
      {item.unread ? <View style={styles.dot} accessibilityElementsHidden /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.gutter, marginBottom: spacing.sm },
  filters: { paddingHorizontal: spacing.gutter, gap: spacing.xs, paddingVertical: spacing.xs },
  item: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  urgent: { borderColor: colors.attention },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginLeft: spacing.sm, marginTop: 6 },
});
