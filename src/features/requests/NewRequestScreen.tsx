/** Make a request: what it is about, in your words, and how soon. */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { ServiceRequestCategory, ServiceRequestPriority } from '@/domain';
import { Button, Caption, ChoiceGroup, InlineError, PageHeader, Screen, TextField } from '@/components';
import { DESCRIPTION_MAX, validateNewRequest, type NewRequestErrors } from '@/services/shared/serviceRequests';
import { colors, spacing } from '@/theme';
import { BackBar } from './components/RequestParts';
import { CATEGORY_OPTIONS, categoryHelp, PRIORITY_OPTIONS, URGENT_NOTE } from './requestsModel';
import { useSubmitRequest } from './useRequests';

export function NewRequestScreen() {
  const [category, setCategory] = useState<ServiceRequestCategory | ''>('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ServiceRequestPriority>('routine');
  const [errors, setErrors] = useState<NewRequestErrors>({});
  const { submit, submitting, error } = useSubmitRequest();
  const help = categoryHelp(category);

  const send = async () => {
    const input = { category: category || undefined, description, priority };
    const found = validateNewRequest(input);
    setErrors(found);
    if (Object.keys(found).length || !category) return;
    const created = await submit({ category, description: description.trim(), priority });
    if (created) router.replace(`/requests/${created.id}?submitted=1`);
  };

  return (
    <Screen>
      <BackBar label="Cancel" onBack={() => (router.canGoBack() ? router.back() : router.replace('/requests'))} />
      <PageHeader eyebrow="Service requests" title="Make a request" subtitle="Tell us what you need; the right team will take it from here." />
      <View style={{ paddingHorizontal: spacing.gutter }}>
        <ChoiceGroup label="What is it about?" options={CATEGORY_OPTIONS} value={category} onChange={(v) => setCategory(v as ServiceRequestCategory | '')} error={errors.category} />
        {help.hint ? <Caption style={{ marginTop: -spacing.xs, marginBottom: spacing.sm }}>{help.hint}</Caption> : null}
        <TextField label="Your request" value={description} onChange={setDescription} placeholder={help.placeholder} max={DESCRIPTION_MAX} multiline error={errors.description} />
        <ChoiceGroup label="How soon?" options={PRIORITY_OPTIONS} value={priority} onChange={(v) => setPriority((v || 'routine') as ServiceRequestPriority)} error={errors.priority} />
        {priority === 'urgent' ? (
          <Caption color={colors.attention} style={{ marginBottom: spacing.md }} accessibilityRole="alert">
            {URGENT_NOTE}
          </Caption>
        ) : null}
        {error ? <InlineError error={error} /> : null}
        <View style={{ marginTop: spacing.md }}>
          <Button label={submitting ? 'Sending…' : 'Send request'} onPress={() => void send()} disabled={submitting} />
        </View>
        <Caption style={{ marginTop: spacing.sm }}>Nothing is charged by sending a request. If something has a cost, the team will confirm it with you first.</Caption>
      </View>
    </Screen>
  );
}
