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
import { MockVoyageService } from './mock/MockVoyageService';
import { mockNow } from './mock/support';
import { ApiClient } from './remote/apiClient';
import { MarriottBonvoyService } from './remote/MarriottBonvoyService';
import { createSupabaseServices } from './supabase';

export const ACCESS_TOKEN_KEY = 'rcyc.session.access';

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

function createMockServices(): Services {
  return {
    auth: new MockAuthService(),
    profile: new RepositoryGuestProfileService(new MockGuestRecordSource(), preferencesRepository()),
    loyalty: new MockLoyaltyService(),
    voyage: new MockVoyageService(),
    experience: new MockExperienceService(),
    concierge: new MockConciergeService(),
    personalization: new MockPersonalizationService(),
    journeyEvents: new MockJourneyEventService(),
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
  return instrumentServices(compose(mode), log);
}

function compose(mode: ServiceMode): Services {
  if (mode === 'supabase') return createSupabaseServices(getSupabaseClient, { now: () => new Date() });
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
