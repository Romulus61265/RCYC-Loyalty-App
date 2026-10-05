/** Notification settings: per type, how it reaches you; times; reminders; push on this device. */
import { View } from 'react-native';
import { router } from 'expo-router';
import { announce } from '@/hooks/useAnnounce';
import { Button, Caption, Chip, ChipGroup, ChoiceGroup, InlineError, LoadingState, PageHeader, Screen, ScreenError, Section, Text, TextLink } from '@/components';
import { BackBar } from '@/features/requests/components/RequestParts';
import { colors, spacing } from '@/theme';
import { useNotificationSettings } from './useNotifications';

export function NotificationSettingsScreen() {
  const { view, loading, error, reload, update, saving, saveError, enablePush, pushNote, removeDevice } = useNotificationSettings();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/notifications'));

  if (loading && !view) return <LoadingState label="One moment…" />;
  if (error || !view) {
    return (
      <ScreenError error={error} onRetry={reload} />
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
            <View key={r.type}>
              <Text variant="bodyStrong">{r.label}</Text>
              <Caption style={{ marginBottom: spacing.xs }}>{r.description}</Caption>
              {r.locked ? (
                <Caption color={colors.accentText}>{r.locked}</Caption>
              ) : (
                <ChipGroup label={`${r.label}: how`} kind="radio">
                  {r.options.map((o) => (
                    <Chip key={o.value} kind="radio" label={o.label} selected={r.value === o.value} onPress={() => !saving && r.value !== o.value && void update({ delivery: { ...p.delivery, [r.type]: o.value } })} />
                  ))}
                </ChipGroup>
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
            {view.devices.map((d) => {
              const name = d.name ?? (d.platform === 'ios' ? 'iPhone' : d.platform === 'android' ? 'Android phone' : 'Browser');
              return (
                <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text>{name}</Text>
                  <TextLink
                    label="Remove"
                    role="button"
                    accessibilityLabel={`Remove ${name}`}
                    onPress={() => void removeDevice(d.id).then(() => announce(`${name} removed`, { everywhere: true }))}
                  />
                </View>
              );
            })}
          </View>
        ) : null}
        <Button label={view.supported ? 'Turn on push notifications' : 'About push notifications'} variant="quiet" onPress={() => void enablePush()} />
        {pushNote ? <Caption style={{ marginTop: spacing.sm }} accessibilityRole="alert">{pushNote}</Caption> : null}
      </Section>
    </Screen>
  );
}
