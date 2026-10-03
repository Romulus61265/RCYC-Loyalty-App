import type { GuestNotification, ID, JourneyAlert, JourneyEvent, PersonalizedRecommendation, Recommendation, RecommendationSurface } from '@/domain';
import type {
  AuditEntry,
  AuditService,
  AuthService,
  AuthSession,
  ExperienceService,
  GuestProfileService,
  JourneyEventService,
  LoyaltyService,
  PersonalizationService,
  Unsubscribe,
  VoyageService,
} from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { logger } from '@/core/logging';
import type { GuestRecordSource } from '@/services/profile/RepositoryGuestProfileService';
import { curatedFor, fromPersonalized, mergeRecommendations } from '@/services/shared/recommendations';
import { buildPersonalizationInput } from '@/services/personalization/buildInput';
import { personalize, toGuestSafe } from '../../../supabase/functions/_shared/personalization/engine';
import { MockExperienceService } from './MockExperienceService';
import { MockLoyaltyService } from './MockLoyaltyService';
import { MockVoyageService } from './MockVoyageService';
import { data, failIf, isEmptyScenario, latency, mockId, mockNow } from './support';

const LEAD_GUEST_ID = data.guest.profile.guest.id;
const guestProfile = data.guest.profile;
const { alerts, notifications } = data.communication;
const { recommendations, signals } = data.personalization;

/** Pre-authenticated demo session. Real auth: Supabase Auth + Bonvoy OIDC. */
export class MockAuthService implements AuthService {
  private session: AuthSession | null = {
    userId: 'usr_demo',
    guestId: LEAD_GUEST_ID,
    roles: ['guest'],
    expiresAt: '2099-01-01T00:00:00Z',
    mfaVerified: true,
  };
  private listeners = new Set<(s: AuthSession | null) => void>();

  getSession() {
    return latency(this.session, 50);
  }
  async signInWithOtp(_email: string) {
    return latency({ challengeId: mockId('otp') });
  }
  async verifyOtp(_challengeId: ID, code: string) {
    if (code.length !== 6) throw new ServiceError('validation', 'Invalid code');
    return this.signInWithBonvoy();
  }
  async signInWithBonvoy() {
    this.session = { userId: 'usr_demo', guestId: LEAD_GUEST_ID, roles: ['guest'], expiresAt: '2099-01-01T00:00:00Z', mfaVerified: true };
    this.listeners.forEach((l) => l(this.session));
    return latency(this.session);
  }
  async signOut() {
    this.session = null;
    this.listeners.forEach((l) => l(null));
  }
  onSessionChange(listener: (s: AuthSession | null) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Read-only guest record (CRM stand-in): identity, companions, occasions and
 * the default preferences. Edits go through the PreferencesRepository.
 */
export class MockGuestRecordSource implements GuestRecordSource {
  getProfile(_guestId: ID) {
    failIf('core', 'guest record');
    return latency(guestProfile);
  }
  listCompanions(_guestId: ID) {
    return latency(guestProfile.companions);
  }
  listOccasions(_guestId: ID) {
    return latency(guestProfile.occasions);
  }
}

/**
 * The engine over the untouched fixture dataset, synchronously (for the seed,
 * which materialises it as the server-side job would).
 */
export function scoreFixtures(): PersonalizedRecommendation[] {
  const v = data.voyage;
  const input = buildPersonalizationInput({
    profile: guestProfile,
    membership: data.guest.membership,
    relationship: data.guest.relationship,
    pastVoyages: v.pastVoyages,
    voyage: v.voyage,
    yachtName: v.yacht.name,
    catalogue: data.experiences.catalogue,
    availability: data.experiences.availability,
    bookings: data.experiences.bookings,
    signals,
  });
  return toGuestSafe(personalize(input, { limit: 1000, includeBooked: true, maxPerCategory: 1000, now: new Date(data.meta.referenceNow).toISOString() }));
}

/** What the mock engine reads; the app passes its shared service instances. */
export interface MockPersonalizationDeps {
  profile: Pick<GuestProfileService, 'getProfile'>;
  loyalty: Pick<LoyaltyService, 'getMembership' | 'getRelationship'>;
  voyage: Pick<VoyageService, 'getOverview' | 'getPastVoyages'>;
  experience: Pick<ExperienceService, 'listCatalogue' | 'listAvailability' | 'listBookings'>;
}

/**
 * Runs the rules-based engine (supabase/functions/_shared/personalization)
 * on the device over the mock services. Here every input is available,
 * including history and the internal value segment, as it is server-side in
 * production; internal signals are still stripped from what is returned.
 */
export class MockPersonalizationService implements PersonalizationService {
  private readonly deps: MockPersonalizationDeps;

  constructor(deps?: Partial<MockPersonalizationDeps>) {
    this.deps = {
      profile: deps?.profile ?? { getProfile: () => latency(guestProfile) },
      loyalty: deps?.loyalty ?? new MockLoyaltyService(),
      voyage: deps?.voyage ?? new MockVoyageService(),
      experience: deps?.experience ?? new MockExperienceService(),
    };
  }

  private async engine(guestId: ID, reservationId: ID, opts: { limit?: number; includeBooked?: boolean; maxPerCategory?: number }) {
    const { profile, loyalty, voyage, experience } = this.deps;
    const overview = await voyage.getOverview(reservationId);
    const [p, membership, relationship, pastVoyages, catalogue, availability, bookings] = await Promise.all([
      profile.getProfile(guestId),
      loyalty.getMembership(guestId).catch(() => null),
      loyalty.getRelationship(guestId).catch(() => undefined),
      voyage.getPastVoyages(guestId).catch(() => []),
      experience.listCatalogue(overview.voyage.id),
      experience.listAvailability(overview.voyage.id).catch(() => []),
      experience.listBookings(reservationId),
    ]);
    const input = buildPersonalizationInput({ profile: p, membership, relationship, pastVoyages, voyage: overview.voyage, yachtName: overview.yacht.name, catalogue, availability, bookings, signals });
    return toGuestSafe(personalize(input, { ...opts, now: mockNow().toISOString() }));
  }

  async getPersonalizedRecommendations(guestId: ID, reservationId: ID, opts?: { limit?: number; includeBooked?: boolean }) {
    failIf('optional', 'recommendations');
    if (isEmptyScenario()) return latency<PersonalizedRecommendation[]>([]);
    return this.engine(guestId, reservationId, { limit: opts?.limit ?? 10, includeBooked: opts?.includeBooked });
  }

  async getRecommendations(guestId: ID, surface: RecommendationSurface, opts?: { reservationId?: ID; limit?: number }) {
    failIf('optional', 'recommendations');
    if (isEmptyScenario()) return latency<Recommendation[]>([]);
    const curated = recommendations.filter((r) => r.audience === 'guest');
    // Home keeps its curated picks; Discover and Voyage explain every
    // experience with the engine (booked ones too), merged with the curated set.
    if (surface !== 'discover' && surface !== 'voyage') return latency(curatedFor(curated, surface).slice(0, opts?.limit ?? 3));
    const all = await this.engine(guestId, opts?.reservationId ?? data.voyage.reservation.id, { limit: 1000, includeBooked: true, maxPerCategory: 1000 });
    // Catalogue order first, so equal scores rank as they do everywhere else.
    const order = new Map(data.experiences.catalogue.map((e, i) => [e.id, i]));
    const byCatalogue = [...all].sort((a, b) => (order.get(a.experienceId) ?? Infinity) - (order.get(b.experienceId) ?? Infinity));
    return mergeRecommendations(byCatalogue.map((r) => fromPersonalized(r, 'discover')), curated).slice(0, opts?.limit ?? 3);
  }

  async recordFeedback() {
    await latency(undefined, 50);
  }
}

export class MockJourneyEventService implements JourneyEventService {
  private alerts: JourneyAlert[] = [...alerts];
  private sent: GuestNotification[] = [...notifications];
  private listeners = new Set<{ reservationId: ID; fn: (event: JourneyEvent, alert?: JourneyAlert) => void }>();

  /**
   * Mock-only: the outbound message a handler sends the guest (in production
   * the server records it in `notifications` and pushes it). Once per dedupe key.
   */
  deliver(n: GuestNotification): 'sent' | 'duplicate' {
    if (n.dedupeKey && this.sent.some((x) => x.dedupeKey === n.dedupeKey && x.guestId === n.guestId)) return 'duplicate';
    this.sent.push(n);
    const event: JourneyEvent = { id: n.id, type: 'service.request_updated', reservationId: n.reservationId ?? '', guestIds: [n.guestId], occurredAt: n.scheduledFor, severity: 'info', source: 'mock', payload: {}, dedupeKey: n.dedupeKey ?? n.id };
    for (const l of this.listeners) if (!n.reservationId || l.reservationId === n.reservationId) l.fn(event);
    return 'sent';
  }

  listAlerts(_reservationId: ID) {
    failIf('optional', 'alerts');
    if (isEmptyScenario()) return latency<JourneyAlert[]>([]);
    return latency(this.alerts.filter((a) => !a.acknowledged));
  }
  listNotifications(guestId: ID, opts?: { includeScheduled?: boolean; now?: Date }): Promise<GuestNotification[]> {
    const now = (opts?.now ?? mockNow()).getTime();
    return latency(
      this.sent
        .filter((n) => n.guestId === guestId)
        .filter((n) => opts?.includeScheduled || Date.parse(n.scheduledFor) <= now)
        .sort((a, b) => Date.parse(b.scheduledFor) - Date.parse(a.scheduledFor)),
    );
  }
  async acknowledge(alertId: ID) {
    this.alerts = this.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a));
    await latency(undefined, 100);
  }
  subscribe(reservationId: ID, listener: (event: JourneyEvent, alert?: JourneyAlert) => void): Unsubscribe {
    // Production: Supabase Realtime channel `journey:<reservationId>` fed by the event bus.
    const l = { reservationId, fn: listener };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** Dev audit sink: writes to the logger. Production forwards to the `audit-log` Edge Function. */
export class ConsoleAuditService implements AuditService {
  private readonly log = logger.child('audit');

  record(entry: AuditEntry) {
    this.log.info(entry.action, { resource: entry.resource, resourceId: entry.resourceId, outcome: entry.outcome, ...entry.metadata });
  }
}
