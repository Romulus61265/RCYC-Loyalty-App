/**
 * Service registry — the single composition root.
 *
 * Swapping a mock for an enterprise adapter happens here (and only here),
 * selected by `EXPO_PUBLIC_SERVICE_MODE`. Adapters can be mixed: e.g. real
 * Bonvoy loyalty with mock shipboard services during a phased rollout.
 */
import { env, validateEnv, type ServiceMode } from '@/config/env';
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
  MockGuestProfileService,
  MockJourneyEventService,
  MockPersonalizationService,
} from './mock/MockMiscServices';
import { MockScheduleService } from './mock/MockScheduleService';
import { MockVoyageService } from './mock/MockVoyageService';
import { mockNow } from './mock/support';
import { ApiClient } from './remote/apiClient';
import { MarriottBonvoyService } from './remote/MarriottBonvoyService';

export const ACCESS_TOKEN_KEY = 'rcyc.session.access';

function createMockServices(): Services {
  return {
    auth: new MockAuthService(),
    profile: new MockGuestProfileService(),
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
  // Remote modes cannot run without their endpoints — fail loudly, the root ErrorBoundary shows calm copy.
  if (mode !== 'mock' && issues.some((i) => /API_BASE_URL|SUPABASE_URL|ANON_KEY/.test(i))) {
    throw new AppError('config', `Service mode "${mode}" is missing configuration`, { severity: 'fatal' });
  }
  log.info('services ready', { mode, appEnv: env.appEnv });
  return instrumentServices(compose(mode), log);
}

function compose(mode: ServiceMode): Services {
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
