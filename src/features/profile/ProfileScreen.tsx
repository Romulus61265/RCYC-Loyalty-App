/**
 * Profile: eight sections behind quiet tabs, bound to the URL
 * (`/profile?section=preferences`). Preferences, Communication and Privacy
 * are editable in place; one group at a time.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ErrorState, LoadingState, PageHeader, Screen, SegmentedTabs } from '@/components';
import { colors } from '@/theme';
import {
  BonvoySection,
  CommunicationSection,
  CompanionsSection,
  HistorySection,
  OccasionsSection,
  PersonalSection,
  PreferencesSection,
  PrivacySection,
} from './components/ProfileSections';
import type { GroupKey } from './preferenceSchema';
import { parseProfileSection, PROFILE_SECTIONS, type ProfileSectionKey } from './profileModel';
import { useProfileArea } from './useProfileArea';

const TABS = PROFILE_SECTIONS.map((s) => ({ value: s.key, label: s.label }));

export function ProfileScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const section = parseProfileSection(params.section);
  const [editing, setEditing] = useState<GroupKey | null>(null);
  const { model, preferences, loading, error, reload, save, requestData } = useProfileArea();

  if (loading && !model) return <LoadingState label="Opening your profile…" />;
  if (error || !model || !preferences) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  const open = (s: ProfileSectionKey) => {
    setEditing(null);
    router.setParams({ section: s });
  };
  const editingProps = { preferences, editing, onEdit: setEditing, onSave: save };
  const toConcierge = () => router.push('/concierge');

  return (
    <Screen>
      <PageHeader eyebrow="Profile" title={model.name} subtitle={model.subtitle} />
      <SegmentedTabs options={TABS} value={section} onChange={open} />
      {section === 'personal' && <PersonalSection model={model.personal} onConcierge={toConcierge} />}
      {section === 'bonvoy' && <BonvoySection model={model.bonvoy} />}
      {section === 'preferences' && <PreferencesSection groups={model.preferences} saved={model.saved} {...editingProps} />}
      {section === 'companions' && <CompanionsSection items={model.companions} />}
      {section === 'occasions' && <OccasionsSection items={model.occasions} shared={model.occasionsShared} onPrivacy={() => open('privacy')} />}
      {section === 'history' && <HistorySection model={model.history} />}
      {section === 'communication' && <CommunicationSection summary={model.communication} {...editingProps} />}
      {section === 'privacy' && <PrivacySection summary={model.privacy} saved={model.saved} onRequest={requestData} {...editingProps} />}
    </Screen>
  );
}
