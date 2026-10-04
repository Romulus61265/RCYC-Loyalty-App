/**
 * Records the events that happen in services, whichever screen led there:
 * a booking request, a service request, a concierge message or action (its
 * kind, never its words), a preference change (which group, never the
 * values). Wraps the services the app composes; returns them unchanged in
 * behaviour. Consent follows the guest's privacy preference.
 */
import type { ServiceRequestType } from '@/domain';
import type { AnalyticsService, Services } from '@/services/contracts';

const CATEGORY_OF_TYPE: Record<ServiceRequestType, string> = {
  'dining-change': 'dining',
  transport: 'transportation',
  occasion: 'concierge',
  suite: 'suite',
  excursion: 'excursion',
  medical: 'special-assistance',
  general: 'concierge',
};

/**
 * A copy of `source` whose `method` calls the original (on the original
 * instance, so its state is its own) and then `after` with the result, once
 * the call succeeds. Failures are not events; `after` never breaks the call.
 */
function tap<T extends object, K extends keyof T>(wrapper: T, source: T, method: K, after: (result: never, args: never) => void): void {
  const original = source[method] as unknown as (...a: unknown[]) => unknown;
  (wrapper as Record<K, unknown>)[method] = (...args: unknown[]) => {
    const out = original.apply(source, args);
    if (out && typeof (out as Promise<unknown>).then === 'function') {
      void (out as Promise<unknown>).then(
        (r) => {
          try {
            after(r as never, args as never);
          } catch {
            /* never break the call */
          }
        },
        () => undefined,
      );
    }
    return out;
  };
}

/** A view of `service`: methods set on it are its own; everything else runs on the original. */
function view<T extends object>(service: T): T {
  const own: Record<PropertyKey, unknown> = {};
  return new Proxy(service, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(own, prop)) return own[prop];
      const v = Reflect.get(target, prop, target) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(_target, prop, value) {
      own[prop] = value;
      return true;
    },
  });
}

export function withAnalytics(services: Services, analytics: AnalyticsService): Services {
  const s = { ...services };
  // Views, so the originals stay untouched and keep their own state.
  const experience = view(services.experience);
  const requests = view(services.requests);
  const concierge = view(services.concierge);
  const profile = view(services.profile);

  tap(experience, services.experience, 'requestBooking', (b: { experienceId: string; category: string; partySize: number }) =>
    analytics.track('experience_booked', { experience_id: b.experienceId, category: b.category, party_size: b.partySize, source: 'app' }),
  );
  tap(requests, services.requests, 'submit', (r: { category: string; priority: string }) => analytics.track('service_request_created', { category: r.category, priority: r.priority, source: 'requests' }));
  tap(concierge, services.concierge, 'createServiceRequest', (r: { type: ServiceRequestType; priority: string }) =>
    analytics.track('service_request_created', { category: CATEGORY_OF_TYPE[r.type] ?? 'concierge', priority: r.priority, source: 'concierge' }),
  );
  tap(concierge, services.concierge, 'sendMessage', () => analytics.track('concierge_request_submitted', { kind: 'message' }));
  tap(concierge, services.concierge, 'performAction', (_r: unknown, args: [string, { kind: string }]) => analytics.track('concierge_request_submitted', { kind: 'action', action: args[1]?.kind }));
  tap(concierge, services.concierge, 'escalateToHuman', (r: { team?: string }) => analytics.track('concierge_request_submitted', { kind: 'handoff', ...(r?.team ? { team: r.team } : {}) }));
  tap(profile, services.profile, 'updatePreferences', (r: { preferences: { privacy: { analytics: boolean } } }, args: [string, Record<string, unknown>]) => {
    for (const group of Object.keys(args[1] ?? {})) analytics.track('preference_updated', { group: group.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`) });
    // The guest's own switch.
    if (args[1] && 'privacy' in args[1]) analytics.setConsent(r.preferences.privacy.analytics === true);
  });
  tap(profile, services.profile, 'getPreferences', (r: { preferences: { privacy: { analytics: boolean } } }) => analytics.setConsent(r.preferences.privacy.analytics === true));

  Object.assign(s, { experience, requests, concierge, profile, analytics });
  return s;
}
