/// <reference types="node" />
/**
 * Analytics checks.  Run: `npm run check:analytics`
 *
 * The ten product events; the allow-list and the privacy filter (never a
 * passport, payment, private concierge text, medical detail or token);
 * consent; envelopes without a guest; batching; replaceable providers; and
 * the service taps, end to end over the mock services.
 */
import type { AnalyticsEnvelope, AnalyticsEventName } from '@/domain';
import { devDataset as d, IDS } from '@/data/fixtures';
import type { AnalyticsProvider, Services } from '@/services/contracts';
import { PrivacyAnalyticsService } from '@/services/analytics/PrivacyAnalyticsService';
import { FanOutAnalyticsProvider, MemoryAnalyticsProvider, NoopAnalyticsProvider } from '@/services/analytics/providers';
import { ANALYTICS_EVENTS, ANALYTICS_SCHEMA, FORBIDDEN_KEY, neverRule, sanitize, screenPattern } from '@/services/analytics/schema';
import { withAnalytics } from '@/services/analytics/withAnalytics';
import { MockConciergeService } from '@/services/mock/MockConciergeService';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestRecordSource, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockServiceRequestService } from '@/services/mock/MockServiceRequestService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { personalize } from '../supabase/functions/_shared/personalization/engine';
import { buildPersonalizationInput } from '@/services/personalization/buildInput';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`);
};

const G = IDS.guest;
const R = IDS.reservation;
const APP = { version: '0.1.0', platform: 'web', mode: 'mock' };
const clock = { now: () => new Date('2027-05-19T10:42:37.123Z') };
const tick = () => new Promise((r) => setTimeout(r, 0));

// Things that must never appear in anything sent.
const PASSPORT = 'X12345678';
const CARD = '4111 1111 1111 1111';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJndWVzdCJ9.c2lnbmF0dXJl';
const PRIVATE = 'My passport is X12345678, my card 4111 1111 1111 1111, and I take insulin for diabetes';

function service(provider: AnalyticsProvider = new MemoryAnalyticsProvider(), batch?: number) {
  return new PrivacyAnalyticsService(provider, { clock, app: APP, batch });
}

async function main() {
  // ─── The events ──────────────────────────────────────────────────────────
  const expected: AnalyticsEventName[] = [
    'screen_viewed',
    'experience_viewed',
    'experience_saved',
    'experience_booked',
    'concierge_opened',
    'concierge_request_submitted',
    'service_request_created',
    'recommendation_viewed',
    'recommendation_accepted',
    'preference_updated',
  ];
  check('the ten events, and only those', ANALYTICS_EVENTS.slice().sort().join() === expected.slice().sort().join(), ANALYTICS_EVENTS);
  const keys = ANALYTICS_EVENTS.flatMap((e) => Object.keys(ANALYTICS_SCHEMA[e]));
  check('no declared property could carry something private', keys.every((k) => !FORBIDDEN_KEY.test(k)), keys.filter((k) => FORBIDDEN_KEY.test(k)));

  // ─── The filter ──────────────────────────────────────────────────────────
  const ok = sanitize('experience_booked', { experience_id: 'dev_exp_wine_masterclass', category: 'dining', party_size: 2, source: 'app' });
  check('a well-formed event passes whole', JSON.stringify(ok) === JSON.stringify({ props: { experience_id: 'dev_exp_wine_masterclass', category: 'dining', party_size: 2, source: 'app' }, dropped: [] }), ok);
  const extra = sanitize('experience_booked', { experience_id: 'dev_exp_jazz', category: 'dining', note: 'Window, please', guest_id: G, passport_number: PASSPORT, card_number: CARD } as never);
  check('undeclared properties are dropped by name', extra.dropped.sort().join() === 'card_number,guest_id,note,passport_number' && Object.keys(extra.props).join() === 'experience_id,category', extra);
  const smuggled: [string, string][] = [
    ['passport', PASSPORT],
    ['card', CARD],
    ['card', '4111111111111111'],
    ['jwt', JWT],
    ['bearer', `Bearer ${JWT}`],
    ['push-token', 'ExponentPushToken[abcdef123456]'],
    ['email', 'alexander@example.com'],
    ['phone', '+1 305 555 0142'],
    ['free-text', 'I take insulin'],
  ];
  for (const [what, value] of smuggled) {
    const r = sanitize('experience_saved', { experience_id: value, category: value, saved: 'yes' } as never);
    check(`a ${what} in any property never passes`, !('experience_id' in r.props) && !('category' in r.props) && r.props.saved === 'yes' && JSON.stringify(r).indexOf(value) === -1, r);
    check(`and is recognised as a ${what} or rejected by shape`, neverRule(value) === what || what === 'card' || what === 'bearer', neverRule(value));
  }
  check('labels are short and lower-case', sanitize('concierge_opened', { entry: 'Chat With Elena' }).dropped.join() === 'entry' && sanitize('concierge_opened', { entry: 'chat' }).props.entry === 'chat');
  check('counts are small integers', sanitize('recommendation_viewed', { recommendation_id: 'rec_x', surface: 'home', position: 2.5 }).dropped.join() === 'position' && sanitize('recommendation_viewed', { recommendation_id: 'rec_x', surface: 'home', position: -1 }).dropped.join() === 'position');
  check('values must be strings or numbers as declared', sanitize('preference_updated', { group: { dining: 'window' } as never }).dropped.join() === 'group');

  // Real ids from the app pass (or the instrumentation would be useless).
  const recs = personalize(
    buildPersonalizationInput({
      profile: d.guest.profile,
      membership: d.guest.membership,
      relationship: d.guest.relationship,
      pastVoyages: d.voyage.pastVoyages,
      voyage: d.voyage.voyage,
      yachtName: d.voyage.yacht.name,
      catalogue: d.experiences.catalogue,
      availability: d.experiences.availability,
      bookings: d.experiences.bookings,
      signals: d.personalization.signals,
      voyageHistory: d.voyageHistory.records,
    }),
    { now: new Date(d.meta.referenceNow).toISOString(), limit: 100, includeBooked: true },
  );
  const badRec = recs.filter((r) => 'recommendation_id' in sanitize('recommendation_viewed', { recommendation_id: r.id, surface: 'home' }).props === false);
  check('every recommendation id passes', recs.length > 0 && badRec.length === 0, badRec.map((r) => r.id));
  const badExp = d.experiences.catalogue.filter((e) => sanitize('experience_viewed', { experience_id: e.id, category: e.category }).dropped.length);
  check('every experience id and category passes', badExp.length === 0, badExp.map((e) => `${e.id}:${e.category}`));

  // ─── Screens: patterns, not places ───────────────────────────────────────
  check('screens: route groups and ids removed', screenPattern('/(tabs)/history/dev_vyg_2024_adriatic') === '/history/[id]' && screenPattern('/requests/7b0c2d4e-1f2a-4b3c-9d8e-0f1a2b3c4d5e?from=home') === '/requests/[id]' && screenPattern('/history/[id]') === '/history/[id]' && screenPattern('/') === '/');
  check('screens: an email or a query never survives', sanitize('screen_viewed', { screen: '/profile?email=alexander@example.com' }).props.screen === '/profile' && sanitize('screen_viewed', { screen: '/concierge/alexander@example.com' }).props.screen === '/concierge/[id]');

  // ─── Consent ─────────────────────────────────────────────────────────────
  {
    const p = new MemoryAnalyticsProvider();
    const a = service(p);
    a.track('concierge_opened', { entry: 'chat' });
    await a.flush();
    check('consent unknown: nothing is sent, events wait', p.sent.length === 0);
    a.setConsent(true);
    await tick();
    check('consent given: what waited is sent', p.sent.length === 1 && p.sent[0]!.event === 'concierge_opened');
    a.setConsent(false);
    a.track('concierge_opened', { entry: 'chat' });
    a.setConsent(true);
    await a.flush();
    check('consent withdrawn: nothing kept meanwhile', p.sent.length === 1);
  }
  {
    const p = new MemoryAnalyticsProvider();
    const a = service(p);
    a.track('concierge_opened', { entry: 'chat' });
    a.setConsent(false);
    a.setConsent(true);
    await a.flush();
    check('consent refused: what waited is discarded, never sent later', p.sent.length === 0);
  }
  {
    const p = new MemoryAnalyticsProvider();
    const a = service(p);
    for (let i = 0; i < 150; i++) a.track('preference_updated', { group: 'dining' });
    a.setConsent(true);
    await tick();
    check('waiting is bounded', p.sent.length === 100, p.sent.length);
  }

  // ─── Envelopes ───────────────────────────────────────────────────────────
  {
    const p = new MemoryAnalyticsProvider();
    const a = service(p);
    a.setConsent(true);
    a.track('experience_viewed', { experience_id: 'dev_exp_jazz', category: 'dining', surface: 'discover' });
    a.track('experience_viewed', { experience_id: 'dev_exp_jazz', category: 'dining', guest_name: 'Alexander' } as never);
    await a.flush();
    const [e1, e2] = p.sent as [AnalyticsEnvelope, AnalyticsEnvelope];
    check('envelope: time to the minute', e1.at === '2027-05-19T10:42:00.000Z', e1.at);
    check('envelope: app, and a session id that is not the guest', JSON.stringify(e1.app) === JSON.stringify(APP) && e1.session_id.length >= 8 && e1.session_id !== G && e1.session_id === e2.session_id);
    check('envelope: no guest, reservation or name anywhere', !JSON.stringify(p.sent).includes(G) && !JSON.stringify(p.sent).includes(R) && !JSON.stringify(p.sent).includes('Alexander'));
    check('envelope: what was dropped, by name only', e2.dropped?.join() === 'guest_name' && e1.dropped === undefined);
    check('two sessions are not linkable', service().constructor === a.constructor && (service() as unknown as { sessionId: string }).sessionId !== (a as unknown as { sessionId: string }).sessionId);
  }

  // ─── Screens, batches, failures ──────────────────────────────────────────
  {
    const p = new MemoryAnalyticsProvider();
    const a = service(p, 3);
    a.setConsent(true);
    a.screen('/discover');
    a.screen('/discover');
    a.screen('/history/dev_vyg_2024_adriatic');
    a.screen('/history/dev_vyg_2023_caribbean');
    await tick();
    check('a re-render (or another id on the same screen) is not a second view; screens are patterns', p.sent.length === 0 && (await a.flush(), p.sent.map((e) => e.props.screen).join() === '/discover,/history/[id]'), p.sent.map((e) => e.props.screen));
    for (let i = 0; i < 3; i++) a.track('preference_updated', { group: 'spa' });
    await tick();
    check('a full batch is sent without waiting', p.sent.length === 5, p.sent.length);
  }
  {
    let calls = 0;
    const failing: AnalyticsProvider = {
      name: 'failing',
      send: async () => {
        calls += 1;
        throw new Error('vendor down');
      },
    };
    const a = service(failing);
    a.setConsent(true);
    a.track('concierge_opened', { entry: 'chat' });
    let threw = false;
    try {
      await a.flush();
      a.track('concierge_opened', { entry: 'chat' });
      await a.flush();
    } catch {
      threw = true;
    }
    check('a failing vendor never surfaces, and loses only its batch', !threw && calls === 2);
    const mem = new MemoryAnalyticsProvider();
    const fan = new FanOutAnalyticsProvider([failing, mem, new NoopAnalyticsProvider()]);
    const b = service(fan);
    b.setConsent(true);
    b.track('concierge_opened', { entry: 'chat' });
    await b.flush();
    check('fan-out: one vendor failing does not stop the others', mem.sent.length === 1 && fan.name === 'failing+memory+noop');
    let thrown = false;
    try {
      service().track('nonsense' as never, {} as never);
    } catch {
      thrown = true;
    }
    check('a malformed call never throws', !thrown);
  }

  // ─── The service taps, over the mock services ────────────────────────────
  {
    (globalThis as { location?: { search: string } }).location = { search: '' };
    const p = new MemoryAnalyticsProvider();
    const analytics = service(p, 1000);
    const voyage = new MockVoyageService();
    const experience = new MockExperienceService();
    const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore()));
    const requests = new MockServiceRequestService({ voyage });
    const concierge = new MockConciergeService({ voyage, experience, loyalty: new MockLoyaltyService(), profile, personalization: new MockPersonalizationService() });
    const base = { voyage, experience, profile, requests, concierge } as unknown as Services;
    const s = withAnalytics(base, analytics);

    check('taps leave the originals untouched', s.concierge !== concierge && concierge.sendMessage === MockConciergeService.prototype.sendMessage && s.voyage === voyage && s.analytics === analytics);
    const prefs = await s.profile.getPreferences(G);
    const consent = () => (analytics as unknown as { consent: boolean | undefined }).consent;
    check('consent follows the guest’s privacy preference (off, in the fixtures)', prefs.preferences.privacy.analytics === false && consent() === false);
    await s.profile.updatePreferences(G, { privacy: { ...prefs.preferences.privacy, analytics: true } }, { expectedVersion: prefs.version });
    await tick();
    check('the guest switching analytics on turns consent on', consent() === true);

    const { conversationId } = await s.concierge.openConversation(R);
    const ctx = { guestRef: 'pseudonym', preferredName: 'Alexander', phase: 'prepare' as const, tierLabel: 'Titanium Elite', upcomingBookingIds: [], occasionsThisVoyage: [], locale: 'en-US' };
    const replies = await s.concierge.sendMessage(conversationId, PRIVATE, ctx);
    check('the concierge still answers through the tap', replies.length > 0);
    await s.concierge.escalateToHuman({ reservationId: R, conversationId, reason: PRIVATE, team: 'medical' } as never).catch(() => undefined);
    await s.concierge.createServiceRequest(R, { type: 'medical', summary: PRIVATE, details: `${PRIVATE} ${JWT}`, priority: 'urgent' });
    await s.requests.submit({ reservationId: R, category: 'spa', description: `${PRIVATE} Card ${CARD}`, priority: 'routine' });
    const before = await s.profile.getPreferences(G);
    await s.profile.updatePreferences(G, { spa: { ...before.preferences.spa, pressure: 'medium' }, accessibility: { ...before.preferences.accessibility, notes: PRIVATE } } as never, { expectedVersion: before.version });
    await tick();
    await tick();
    await analytics.flush();

    const events = p.sent.map((e) => e.event);
    const sent = JSON.stringify(p.sent);
    check('a concierge message is recorded by kind', p.sent.some((e) => e.event === 'concierge_request_submitted' && e.props.kind === 'message' && Object.keys(e.props).join() === 'kind'), events);
    check('service requests from both places, by category', p.sent.filter((e) => e.event === 'service_request_created').map((e) => `${e.props.source}:${e.props.category}:${e.props.priority}`).sort().join() === 'concierge:special-assistance:urgent,requests:spa:routine', p.sent.filter((e) => e.event === 'service_request_created'));
    check('preferences: which groups, never the values', p.sent.filter((e) => e.event === 'preference_updated').map((e) => e.props.group).sort().join() === 'accessibility,spa' && !sent.includes('medium'), p.sent.filter((e) => e.event === 'preference_updated'));
    for (const [what, value] of [
      ['private concierge text', 'insulin'],
      ['medical details', 'diabetes'],
      ['passport', PASSPORT],
      ['payment card', '4111'],
      ['authentication token', JWT],
      ['the guest', G],
    ] as const) check(`nothing sent contains ${what}`, !sent.includes(value));

    // Booking, through the tap.
    const p2 = new MemoryAnalyticsProvider();
    const a2 = service(p2);
    a2.setConsent(true);
    // The guest's analytics switch, as the profile tap would set it.
    const s2 = withAnalytics({ ...base, experience: new MockExperienceService() } as Services, a2);
    await s2.experience.requestBooking(R, 'dev_exp_jazz', '2027-05-17T21:30:00+02:00', 2, `${PRIVATE}`);
    await tick();
    await a2.flush();
    check('a booking is recorded: the experience, its category and party, not the note', p2.sent.length === 1 && p2.sent[0]!.event === 'experience_booked' && p2.sent[0]!.props.experience_id === 'dev_exp_jazz' && p2.sent[0]!.props.party_size === 2 && !JSON.stringify(p2.sent).includes('insulin'), p2.sent);
    let failed = false;
    await s2.experience.requestBooking(R, 'dev_exp_nope', '2027-05-17T21:30:00+02:00', 2).catch(() => (failed = true));
    await tick();
    await a2.flush();
    check('a failed call is not an event, and still fails', failed && p2.sent.length === 1);
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Analytics: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Analytics: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
