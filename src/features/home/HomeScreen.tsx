/**
 * Home: the guest's luxury dashboard.
 *
 * Reading order answers, in turn:
 *   Where am I in my journey?           → hero (phase, countdown / today's port, journey line)
 *   Do they know me?                    → Bonvoy recognition
 *   Does anything need my attention?    → a disruption and its alternatives, journey alerts (or a reassuring all-clear)
 *   What happens next?                  → next activity, then arrival (transfer + embarkation)
 *   What has been arranged for me?      → dining, ashore, spa
 *   Where will I be?                    → yacht and suite
 *   What might I enjoy?                 → personalised recommendations
 *   Who can help?                       → concierge invitation
 *
 * Data comes only from `useHomeDashboard`; components are presentational.
 */
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, Screen } from '@/components';
import { colors } from '@/theme';
import { HomeHero } from './components/HomeHero';
import { HomeSkeleton } from './components/HomeSkeleton';
import {
  CelebrationCard,
  NotificationBell,
  RequestsLine,
  ArrangedSection,
  ArrivalSection,
  AttentionSection,
  ConciergeInvitation,
  NextActivity,
  RecognitionStrip,
  RecommendationRail,
  VoyageSection,
} from './components/HomeSections';
import { useHomeDashboard } from './useHomeDashboard';
import { celebrationHref } from '@/features/celebrations/celebrationModel';
import { useNextCelebration } from '@/features/celebrations/useCelebrations';
import { useUnreadCount } from '@/features/notifications/useNotifications';
import { recoveryHref } from '@/features/recovery/recoveryModel';
import { useOpenRecovery } from '@/features/recovery/useRecovery';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { model, loading, error, reload, dismissAlert } = useHomeDashboard();
  const celebration = useNextCelebration();
  const unread = useUnreadCount();
  const recovery = useOpenRecovery();

  if (loading && !model) return <HomeSkeleton topInset={insets.top} />;
  if (error || !model) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background, paddingTop: insets.top }}>
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  const toVoyage = (section: 'overview' | 'embarkation' | 'calendar' | 'suite' = 'overview') => router.push({ pathname: '/voyage', params: { section } });
  const toConcierge = () => router.push('/concierge');

  return (
    <Screen edgeToEdge>
      <HomeHero hero={model.hero} topInset={insets.top} accessory={<NotificationBell unread={unread} onOpen={() => router.push('/notifications')} />} />
      <RecognitionStrip model={model.recognition} onPrivileges={() => router.push('/profile')} />
      <AttentionSection
        alerts={model.alerts}
        error={model.errors.alerts}
        onAction={(a) => a.action && router.push(a.action.route as Href)}
        onDismiss={(a) => dismissAlert(a.id)}
        onRetry={reload}
        recovery={recovery ? { ...recovery, onOpen: () => router.push(recoveryHref(recovery.id) as Href) } : null}
      />
      {celebration ? <CelebrationCard card={celebration} onOpen={() => router.push(celebrationHref(celebration.key) as Href)} /> : null}
      {model.nextIsArrival || !model.nextKnown ? null : <NextActivity activity={model.next} onOpen={() => toVoyage('calendar')} />}
      <ArrivalSection embarkation={model.embarkation} transfer={model.transfer} isNext={model.nextIsArrival} onOpen={() => toVoyage('embarkation')} />
      <ArrangedSection items={model.arranged} error={model.errors.arranged} onOpen={() => toVoyage('calendar')} onArrange={toConcierge} onRetry={reload} />
      <VoyageSection yacht={model.yacht} suite={model.suite} onOpen={() => toVoyage('suite')} />
      <RecommendationRail items={model.recommendations} error={model.errors.recommendations} onRetry={reload} />
      <ConciergeInvitation ambassador={model.concierge.ambassador} prompt={model.concierge.prompt} onOpen={toConcierge} />
      <RequestsLine onNew={() => router.push('/requests/new')} onAll={() => router.push('/requests')} />
    </Screen>
  );
}
