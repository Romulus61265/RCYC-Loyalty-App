/**
 * Service registry — the single composition root.
 *
 * Implementations are chosen here (and only here) by `EXPO_PUBLIC_SERVICE_MODE`:
 *   mock        fictional fixtures, pinned demo clock (default)
 *   supabase    every service on Supabase (Auth, Postgres + RLS, Realtime, Edge Functions)
 *   enterprise  mocks plus enterprise adapters (Bonvoy via the BFF), phased in
 * Screens never know which is in use.
 */
import { env, SECRET_IN_BUNDLE, validateEnv, type ServiceMode } from '@/config/env';
import { AppError } from '@/core/errors/AppError';
import { logger } from '@/core/logging';
import { secureStorage } from '@/security/secureStorage';
import type { Services } from './contracts';
import { instrumentServices } from './instrument';
import { MockConciergeService } from './mock/MockConciergeService';
import { MockExperienceService } from './mock/MockExperienceService';
import { MockLoyaltyService } from './mock/MockLoyaltyService';
import {
  ConsoleAuditService,
  MockAuthService,
  MockGuestRecordSource,
  MockJourneyEventService,
  MockPersonalizationService,
} from './mock/MockMiscServices';
import { RepositoryGuestProfileService } from './profile/RepositoryGuestProfileService';
import { asyncStorageStore } from './repositories/asyncStorageStore';
import { MemoryKeyValueStore, resilientStore } from './repositories/KeyValueStore';
import { LocalPreferencesRepository, type PreferencesRepository } from './repositories/PreferencesRepository';
import { getSupabaseClient } from './remote/supabaseClient';
import { MockScheduleService } from './mock/MockScheduleService';
import { MockServiceRequestService } from './mock/MockServiceRequestService';
import { MockRequestStore } from './mock/requestStore';
import { ComposedOccasionService } from './occasions/ComposedOccasionService';
import { Platform } from 'react-native';
import { UnsupportedPushRegistrar } from '@/services/push/PushRegistrar';
import { ComposedNotificationService } from './notifications/ComposedNotificationService';
import { MemoryNotificationState } from './notifications/state';
import { MockVoyageService } from './mock/MockVoyageService';
import { data, mockDemo, mockNow } from './mock/support';
import { ComposedRecoveryService } from './recovery/ComposedRecoveryService';
import { MemoryRecoveryStore } from './recovery/store';
import { MockContinuityService } from './mock/MockContinuityService';
import { MockTravelDisruptionService } from './mock/MockTravelDisruptionService';
import { MockTransferService } from './mock/MockTransferService';
import { ConsoleAnalyticsProvider, NoopAnalyticsProvider, silentAnalytics } from './analytics/providers';
import { PrivacyAnalyticsService } from './analytics/PrivacyAnalyticsService';
import { withAnalytics } from './analytics/withAnalytics';
import { ComposedPostVoyageService } from './postVoyage/ComposedPostVoyageService';
import { MemoryPostVoyageStore } from './postVoyage/store';
import { ComposedVoyageHistoryService, MemoryVoyageHistoryStore } from './history/ComposedVoyageHistoryService';
import { InMemoryEventService } from './events/InMemoryEventService';
import { flightDelayedEvent, registerFlightDelayHandlers } from './events/flightDelay';
import { ApiClient } from './remote/apiClient';
import { MarriottBonvoyService } from './remote/MarriottBonvoyService';
import { createSupabaseServices } from './supabase';

export const ACCESS_TOKEN_KEY = 'rcyc.session.access';

/** Reported with analytics (no build metadata beyond this). */
const APP_VERSION = '0.1.0';

/**
 * Where edited preferences persist outside Supabase mode: device storage.
 * (Supabase mode uses SupabasePreferencesRepository — see services/supabase.)
 */
function preferencesRepository(): PreferencesRepository {
  const store = resilientStore(asyncStorageStore, new MemoryKeyValueStore(), (e) =>
    logger.child('storage').warn('Device storage unavailable; preferences kept for this session only', { reason: e instanceof Error ? e.message : 'unknown' }),
  );
  // Real clock for "saved at", even when the demo clock is pinned.
  return new LocalPreferencesRepository(store);
}

/**
 * The device side of push. Unsupported until expo-notifications is added to
 * the native builds (see docs/13-notifications.md); the server side is ready.
 */
function devicePush() {
  return new UnsupportedPushRegistrar(Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web');
}

function createMockServices(): Services {
  const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), preferencesRepository());
  const loyalty = new MockLoyaltyService();
  const voyage = new MockVoyageService();
  const experience = new MockExperienceService();
  // Shares the instances above: bookings and preference edits count at once.
  const personalization = new MockPersonalizationService({ profile, loyalty, voyage, experience });
  const requestStore = new MockRequestStore();
  const journeyEvents = new MockJourneyEventService();
  // On board, a crew member picks a new request up within moments.
  const requests = new MockServiceRequestService({ store: requestStore, voyage, simulateCrew: { acknowledgeMs: 8_000, startMs: 25_000 } });
  const clock = { now: mockNow };
  // Stands in for the server: records each disruption with the shared handler.
  const recoveryStore = new MemoryRecoveryStore(
    { profile, loyalty, voyage, experience, requests, clock },
    {
      rules: data.recovery.goodwillRules,
      prepare:
        mockDemo() === 'disruption'
          ? async (store) => {
              // Recorded as the event arrives; the operator's cancellation reaches the booking too.
              const d = data.recovery.demoDisruption;
              await store.report(d);
              if (d.subject.bookingId) await experience.cancelBooking(d.subject.bookingId);
            }
          : undefined,
    },
  );
  // Shares the instances above: what the concierge arranges shows everywhere.
  const concierge = new MockConciergeService({ voyage, experience, loyalty, profile, personalization, requests: requestStore });

  // The internal event bus, with the delayed-flight handlers.
  const events = new InMemoryEventService(clock);
  // The flight-status source is a mock: no flight-data integration exists.
  const travel = new MockTravelDisruptionService();
  const continuity = new MockContinuityService({ profile, loyalty, voyage, experience, travel, clock }, { listen: false });
  const { reservation } = data.voyage;
  registerFlightDelayHandlers(
    events,
    {
      voyage,
      continuity,
      transfers: new MockTransferService(experience),
      outbox: journeyEvents,
      concierge,
      profile,
      ambassador: async () => ({ firstName: (reservation.suiteAmbassadorContact?.name ?? 'Elena').split(' ')[0]!, title: reservation.suiteAmbassadorContact?.title ?? 'Suite Ambassador' }),
    },
    reservation.id,
  );
  travel.subscribe((u) => {
    const event = flightDelayedEvent(u, { guest_id: reservation.leadGuestId, voyage_id: reservation.voyageId, reservation_id: reservation.id });
    if (event) void events.publish(event).catch((e: unknown) => logger.child('events').warn('publish failed', { reason: e instanceof Error ? e.message : 'unknown' }));
  });
  if (mockDemo() === 'flight-delay') {
    // Arrives while the guest is looking, as a live update would.
    setTimeout(() => travel.simulateDelay(data.voyage.flights.find((f) => f.direction === 'inbound')!.id, 120), 2500);
  }
  return {
    auth: new MockAuthService(),
    profile,
    loyalty,
    voyage,
    experience,
    concierge,
    personalization,
    requests,
    occasions: new ComposedOccasionService({ profile, loyalty, voyage, experience, requests, clock: { now: mockNow } }),
    notifications: new ComposedNotificationService({ profile, voyage, experience, requests, journeyEvents, personalization, clock: { now: mockNow } }, new MemoryNotificationState({ [data.guest.profile.guest.id]: data.communication.readNotificationKeys })),
    continuity,
    analytics: silentAnalytics,
    history: new ComposedVoyageHistoryService({ voyage, profile }, new MemoryVoyageHistoryStore(data.voyageHistory.records)),
    postVoyage: new ComposedPostVoyageService({ profile, loyalty, voyage, experience, requests, clock }, new MemoryPostVoyageStore(data.postVoyage.voyageInspirations)),
    recovery: new ComposedRecoveryService({ profile, loyalty, voyage, experience, requests, clock }, recoveryStore),
    journeyEvents,
    push: devicePush(),
    schedule: new MockScheduleService(),
    audit: new ConsoleAuditService(),
    clock: { now: mockNow },
  };
}

const log = logger.child('services');

export function createServices(mode: ServiceMode = env.serviceMode): Services {
  const issues = validateEnv();
  issues.forEach((issue) => log.warn(issue));
  if (issues.some((i) => i.startsWith(SECRET_IN_BUNDLE))) {
    throw new AppError('config', 'A secret key is configured in the app bundle', { severity: 'fatal' });
  }
  // Remote modes cannot run without their endpoints, and never with a secret
  // key — fail loudly; the root ErrorBoundary shows calm copy.
  if (mode !== 'mock' && issues.some((i) => /API_BASE_URL|SUPABASE_URL|ANON_KEY/.test(i))) {
    throw new AppError('config', `Service mode "${mode}" is missing configuration`, { severity: 'fatal' });
  }
  log.info('services ready', { mode, appEnv: env.appEnv });
  const services = compose(mode);
  // Product analytics: a vendor adapter replaces the provider; until one is chosen, production sends nothing.
  const analytics = new PrivacyAnalyticsService(env.appEnv === 'production' ? new NoopAnalyticsProvider() : new ConsoleAnalyticsProvider(logger.child('analytics')), {
    clock: services.clock,
    app: { version: APP_VERSION, platform: Platform.OS, mode },
  });
  return instrumentServices(withAnalytics(services, analytics), log);
}

function compose(mode: ServiceMode): Services {
  if (mode === 'supabase') return createSupabaseServices(getSupabaseClient, { now: () => new Date() }, devicePush());
  const mocks = createMockServices();
  if (mode === 'mock') return mocks;

  const api = new ApiClient(() => secureStorage.getItem(ACCESS_TOKEN_KEY));
  return {
    ...mocks,
    clock: { now: () => new Date() },
    // Adapters are introduced one bounded context at a time.
    loyalty: new MarriottBonvoyService(api),
  };
}
