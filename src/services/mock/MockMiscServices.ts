import type { GuestNotification, ID, JourneyAlert, JourneyEvent, Recommendation, RecommendationSurface } from '@/domain';
import type {
  AuditEntry,
  AuditService,
  AuthService,
  AuthSession,
  GuestProfileService,
  JourneyEventService,
  PersonalizationService,
  Unsubscribe,
} from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { logger } from '@/core/logging';
import { data, failIf, isEmptyScenario, latency, mockId, mockNow } from './support';

const LEAD_GUEST_ID = data.guest.profile.guest.id;
const guestProfile = data.guest.profile;
const { alerts, notifications } = data.communication;
const { recommendations } = data.personalization;

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

export class MockGuestProfileService implements GuestProfileService {
  private profile = guestProfile;

  getProfile(_guestId: ID) {
    return latency(this.profile);
  }
  async updatePreferences(_guestId: ID, patch: Parameters<GuestProfileService['updatePreferences']>[1]) {
    this.profile = { ...this.profile, preferences: { ...this.profile.preferences, ...patch } };
    return latency(this.profile.preferences, 400);
  }
  listCompanions(_guestId: ID) {
    return latency(this.profile.companions);
  }
  listOccasions(_guestId: ID) {
    return latency(this.profile.occasions);
  }
}

export class MockPersonalizationService implements PersonalizationService {
  getRecommendations(_guestId: ID, surface: RecommendationSurface, opts?: { limit?: number }) {
    failIf('optional', 'recommendations');
    if (isEmptyScenario()) return latency<Recommendation[]>([]);
    // Guest app must never receive crew-only opportunities.
    const list = recommendations
      .filter((r) => r.audience === 'guest')
      // Discover and Voyage draw on every guest recommendation; other surfaces on their own.
      .filter((r) => surface === 'discover' || surface === 'voyage' || r.surface === surface)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts?.limit ?? 3);
    return latency(list);
  }
  async recordFeedback() {
    await latency(undefined, 50);
  }
}

export class MockJourneyEventService implements JourneyEventService {
  private alerts: JourneyAlert[] = [...alerts];

  listAlerts(_reservationId: ID) {
    failIf('optional', 'alerts');
    if (isEmptyScenario()) return latency<JourneyAlert[]>([]);
    return latency(this.alerts.filter((a) => !a.acknowledged));
  }
  listNotifications(guestId: ID, opts?: { includeScheduled?: boolean; now?: Date }): Promise<GuestNotification[]> {
    const now = (opts?.now ?? mockNow()).getTime();
    return latency(
      notifications
        .filter((n) => n.guestId === guestId)
        .filter((n) => opts?.includeScheduled || Date.parse(n.scheduledFor) <= now)
        .sort((a, b) => Date.parse(b.scheduledFor) - Date.parse(a.scheduledFor)),
    );
  }
  async acknowledge(alertId: ID) {
    this.alerts = this.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a));
    await latency(undefined, 100);
  }
  subscribe(_reservationId: ID, _listener: (event: JourneyEvent, alert?: JourneyAlert) => void): Unsubscribe {
    // Production: Supabase Realtime channel `journey:<reservationId>` fed by the event bus.
    return () => undefined;
  }
}

/** Dev audit sink: writes to the logger. Production forwards to the `audit-log` Edge Function. */
export class ConsoleAuditService implements AuditService {
  private readonly log = logger.child('audit');

  record(entry: AuditEntry) {
    this.log.info(entry.action, { resource: entry.resource, resourceId: entry.resourceId, outcome: entry.outcome, ...entry.metadata });
  }
}
