/** Notification settings: per type, how it reaches you; times; reminders; push on this device. */
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Caption, Chip, ChoiceGroup, ErrorState, InlineError, LoadingState, PageHeader, Screen, Section, Text, TextLink } from '@/components';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, spacing } from '@/theme';
import { useNotificationSettings } from './useNotifications';

export function NotificationSettingsScreen() {
  const { view, loading, error, reload, update, saving, saveError, enablePush, pushNote, removeDevice } = useNotificationSettings();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/notifications'));

  if (loading && !view) return <LoadingState label="One moment…" />;
  if (error || !view) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }
  const p = view.settings.preferences;

  return (
    <Screen>
      <BackBar label="Notifications" onBack={back} />
      <PageHeader eyebrow="Notifications" title="Settings" subtitle="Choose what reaches you, and how." />
      {saveError ? (
        <View style={{ paddingHorizontal: spacing.gutter }}>
          <InlineError error={saveError} />
        </View>
      ) : null}

      <Section eyebrow="What reaches you">
        <View style={{ gap: spacing.md }}>
          {view.rows.map((r) => (
            <View key={r.type} accessibilityLabel={`${r.label}: ${r.value}`}>
              <Text variant="bodyStrong">{r.label}</Text>
              <Caption style={{ marginBottom: spacing.xs }}>{r.description}</Caption>
              {r.locked ? (
                <Caption color={colors.accent}>{r.locked}</Caption>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }} accessibilityRole="radiogroup" accessibilityLabel={`${r.label}: how`}>
                  {r.options.map((o) => (
                    <Chip key={o.value} label={o.label} selected={r.value === o.value} onPress={() => !saving && r.value !== o.value && void update({ delivery: { ...p.delivery, [r.type]: o.value } })} />
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </Section>

      <Section eyebrow="Timing">
        <ChoiceGroup label="Times in notifications" options={[{ value: '12h', label: '7:30 PM' }, { value: '24h', label: '19:30' }]} value={p.timeFormat} onChange={(v) => v && void update({ timeFormat: v as '12h' | '24h' })} />
        <ChoiceGroup label="Reminders" options={[{ value: 'standard', label: 'At the usual time' }, { value: 'early', label: 'A little earlier' }]} value={p.reminderLead} onChange={(v) => v && void update({ reminderLead: v as 'standard' | 'early' })} />
        <Caption>{view.quietLine}</Caption>
        {view.pushLine ? <Caption style={{ marginTop: spacing.xs }}>{view.pushLine}</Caption> : null}
        <View style={{ marginTop: spacing.sm }}>
          <TextLink label="Quiet hours and channels in your profile" onPress={() => router.push({ pathname: '/profile', params: { section: 'communication' } })} />
        </View>
      </Section>

      <Section eyebrow="This device">
        {view.devices.length ? (
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            {view.devices.map((d) => (
              <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>{d.name ?? (d.platform === 'ios' ? 'iPhone' : d.platform === 'android' ? 'Android phone' : 'Browser')}</Text>
                <TextLink label="Remove" onPress={() => void removeDevice(d.id)} />
              </View>
            ))}
          </View>
        ) : null}
        <Button label={view.supported ? 'Turn on push notifications' : 'About push notifications'} variant="quiet" onPress={() => void enablePush()} />
        {pushNote ? <Caption style={{ marginTop: spacing.sm }} accessibilityRole="alert">{pushNote}</Caption> : null}
      </Section>
    </Screen>
  );
}
