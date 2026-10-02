/**
 * Service registry — the single composition root.
 *
 * Swapping a mock for an enterprise adapter happens here (and only here),
 * selected by `EXPO_PUBLIC_SERVICE_MODE`. Adapters can be mixed: e.g. real
 * Bonvoy loyalty with mock shipboard services during a phased rollout.
 */
import { env, type ServiceMode } from '@/config/env';
import { secureStorage } from '@/security/secureStorage';
import type { Services } from './contracts';
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
    audit: new ConsoleAuditService(),
    clock: { now: mockNow },
  };
}

export function createServices(mode: ServiceMode = env.serviceMode): Services {
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
