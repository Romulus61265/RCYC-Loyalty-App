/**
 * Requests: what is in hand (submitted, acknowledged, in progress) and the
 * history (resolved, closed). The tab lives in the URL: /requests?view=history.
 */
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, EmptyNote, ErrorState, LoadingState, PageHeader, Screen, SegmentedTabs } from '@/components';
import { colors, spacing } from '@/theme';
import { BackBar, RequestRow } from './components/RequestParts';
import { useRequestsList } from './useRequests';

type View_ = 'active' | 'history';

export function RequestsScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const view: View_ = params.view === 'history' ? 'history' : 'active';
  const { data: model, loading, error, reload } = useRequestsList();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (loading && !model) return <LoadingState label="Gathering your requests…" />;
  if (error || !model) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  const rows = view === 'active' ? model.active : model.history;
  return (
    <Screen>
      <BackBar onBack={back} />
      <PageHeader eyebrow="Service requests" title="Your requests" subtitle={model.attention ? `${model.attention === 1 ? 'One needs' : `${model.attention} need`} your reply.` : 'Anything you need, aboard or before you sail.'} />
      <View style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.md }}>
        <Button label="Make a request" onPress={() => router.push('/requests/new')} />
      </View>
      <SegmentedTabs
        options={[
          { value: 'active', label: `Active · ${model.active.length}`, accessibilityLabel: `Active, ${model.active.length}` },
          { value: 'history', label: `History · ${model.history.length}`, accessibilityLabel: `History, ${model.history.length}` },
        ]}
        value={view}
        onChange={(v) => router.setParams({ view: v })}
      />
      <View style={{ marginTop: spacing.md }}>
        {rows.length ? (
          rows.map((r) => <RequestRow key={r.id} row={r} onOpen={() => router.push(`/requests/${r.id}`)} />)
        ) : (
          <View style={{ paddingHorizontal: spacing.gutter }}>
            <EmptyNote body={view === 'active' ? 'Nothing is open. Everything you have asked for is complete.' : 'Resolved and closed requests will appear here.'} />
          </View>
        )}
      </View>
    </Screen>
  );
}
