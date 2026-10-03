/**
 * Every service backed by Supabase, selected by EXPO_PUBLIC_SERVICE_MODE=supabase.
 *
 * The client uses only the public URL and anon key: everything it can read
 * or write is decided by Row Level Security for the signed-in guest.
 */
import type { ClockService, Services } from '@/services/contracts';
import { logger } from '@/core/logging';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { SupabasePreferencesRepository } from '@/services/remote/SupabasePreferencesRepository';
import { SupabaseAuthService } from './SupabaseAuthService';
import { SupabaseConciergeService } from './SupabaseConciergeService';
import { SupabaseExperienceService } from './SupabaseExperienceService';
import { SupabaseJourneyEventService, SupabasePersonalizationService } from './SupabaseJourneyAndPersonalization';
import { SupabaseGuestRecordSource, SupabaseLoyaltyService } from './SupabaseProfileAndLoyalty';
import { SupabaseScheduleService } from './SupabaseScheduleService';
import { SupabaseVoyageService } from './SupabaseVoyageService';
import type { Db } from './support';

export function createSupabaseServices(db: Db, clock: ClockService = { now: () => new Date() }): Services {
  const deps = { db, clock };
  const voyage = new SupabaseVoyageService(deps);
  const experience = new SupabaseExperienceService(deps);
  const audit = logger.child('audit');
  return {
    auth: new SupabaseAuthService(db),
    profile: new RepositoryGuestProfileService(new SupabaseGuestRecordSource(deps), new SupabasePreferencesRepository(db)),
    loyalty: new SupabaseLoyaltyService(deps),
    voyage,
    experience,
    concierge: new SupabaseConciergeService(deps),
    personalization: new SupabasePersonalizationService(deps),
    journeyEvents: new SupabaseJourneyEventService(deps),
    schedule: new SupabaseScheduleService(voyage, experience),
    // Advisory only: the authoritative trail is written by database triggers
    // and Edge Functions, which the client cannot alter.
    audit: { record: (entry) => audit.info(entry.action, { resource: entry.resource, resourceId: entry.resourceId, outcome: entry.outcome, ...entry.metadata }) },
    clock,
  };
}

export { SupabaseAuthService, SupabaseConciergeService, SupabaseExperienceService, SupabaseGuestRecordSource, SupabaseJourneyEventService, SupabaseLoyaltyService, SupabasePersonalizationService, SupabaseScheduleService, SupabaseVoyageService };
