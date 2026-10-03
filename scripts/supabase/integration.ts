/// <reference types="node" />
/**
 * End-to-end check of the Supabase services against a real database.
 *
 *   supabase-js (the app's services) → PostgREST → PostgreSQL with RLS
 *
 * Started by scripts/supabase/run-integration.sh, which loads the migrations
 * and seed into a scratch database and runs PostgREST. Reads are compared
 * with the mock services (the same fictional dataset), after mapping seeded
 * UUIDs back to fixture IDs. Writes and refusals are exercised as the
 * signed-in guest, a second guest and the anon key.
 *
 * Env: PGRST_URL (PostgREST), JWT_SECRET, GUEST_USER_ID, OTHER_USER_ID.
 */
import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { devDataset as d, IDS } from '@/data/fixtures';
import { MockConciergeService } from '@/services/mock/MockConciergeService';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestRecordSource, MockJourneyEventService, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockScheduleService } from '@/services/mock/MockScheduleService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { createSupabaseServices } from '@/services/supabase';
import { SupabasePreferencesRepository } from '@/services/remote/SupabasePreferencesRepository';
import { buildSeedRows, fixtureIdFor, uuidFor } from './seedRows';

const PGRST_URL = process.env.PGRST_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const GUEST_USER_ID = process.env.GUEST_USER_ID;
const OTHER_USER_ID = process.env.OTHER_USER_ID;
if (!PGRST_URL || !JWT_SECRET || !GUEST_USER_ID || !OTHER_USER_ID) {
  console.error('Run via scripts/supabase/run-integration.sh');
  process.exit(2);
}

// ─── Harness ───────────────────────────────────────────────────────────────

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};
async function rejects(p: Promise<unknown>, code: string): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    const got = (e as { code?: string }).code;
    if (got !== code) console.error(`   expected ${code}, got ${got}: ${(e as Error).message}`);
    return got === code;
  }
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(claims: Record<string, unknown>): string {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ ...claims, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = createHmac('sha256', JWT_SECRET!).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/** Recursively replaces seeded UUIDs (also inside derived IDs like `cal_<uuid>`) with their fixture IDs. */
function toFixtureIds<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_k, v: unknown) => (typeof v === 'string' ? v.replace(UUID_IN_TEXT, (u) => fixtureIdFor(u) ?? u) : v)) as T;
}
/** JSON with sorted keys and no undefined, for structural comparison. */
function canon(value: unknown): string {
  return JSON.stringify(JSON.parse(JSON.stringify(value)), (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}
function same(name: string, supabase: unknown, mock: unknown) {
  const a = canon(toFixtureIds(supabase));
  const b = canon(mock);
  if (a === b) return check(name, true);
  // Show the first difference.
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  check(name, false, `supabase …${a.slice(Math.max(0, i - 60), i + 80)}\n    mock     …${b.slice(Math.max(0, i - 60), i + 80)}`);
}
const byId = <T extends { id: string }>(list: T[]) => [...list].sort((x, y) => x.id.localeCompare(y.id));
const instant = (iso?: string) => (iso ? new Date(iso).toISOString() : iso);

// A local gateway: /rest/v1 → PostgREST; /functions/v1/concierge-respond → stub.
async function gateway(): Promise<{ url: string; close: () => void; calls: { body: unknown; auth?: string }[] }> {
  const calls: { body: unknown; auth?: string }[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    if (req.url?.startsWith('/functions/v1/concierge-respond')) {
      const parsed = JSON.parse(body.toString() || '{}') as { conversationId: string; body: string };
      calls.push({ body: parsed, auth: req.headers.authorization });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ escalated: false, messages: [{ id: '00000000-0000-4000-8000-000000000001', conversation_id: parsed.conversationId, author: 'ai', author_name: null, body: 'Of course.', intent: 'general', attachments: [], suggestions: ['Thank you'], created_at: '2027-05-11T13:00:00+00:00' }] }));
      return;
    }
    const path = (req.url ?? '/').replace(/^\/rest\/v1/, '');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && !['host', 'content-length', 'connection'].includes(k)) headers[k] = v;
    const upstream = await fetch(`${PGRST_URL}${path}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : body });
    const out = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, Object.fromEntries([...upstream.headers.entries()].filter(([k]) => !['content-encoding', 'transfer-encoding', 'connection'].includes(k))));
    res.end(out);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close(), calls };
}

const ANON_KEY = jwt({ role: 'anon' });
const clientFor = (url: string, userId?: string): SupabaseClient =>
  userId
    ? createClient(url, ANON_KEY, { accessToken: async () => jwt({ sub: userId, role: 'authenticated', aud: 'authenticated' }) })
    : createClient(url, ANON_KEY, { auth: { persistSession: false } });

// ─── Run ───────────────────────────────────────────────────────────────────

async function main() {
  buildSeedRows(); // fills the UUID → fixture ID map
  const gw = await gateway();
  const now = new Date(d.meta.referenceNow);
  const clock = { now: () => now };
  const guestDb = clientFor(gw.url, GUEST_USER_ID);
  const sb = createSupabaseServices(() => guestDb, clock);

  const G = IDS.guest;
  const R = IDS.reservation;
  const V = IDS.voyage;
  const g = uuidFor(G);
  const r = uuidFor(R);
  const v = uuidFor(V);

  const mock = {
    profile: new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore())),
    loyalty: new MockLoyaltyService(),
    voyage: new MockVoyageService(),
    experience: new MockExperienceService(),
    schedule: new MockScheduleService(),
    journey: new MockJourneyEventService(),
    personalization: new MockPersonalizationService(),
    concierge: new MockConciergeService(),
  };

  // ── Profile & loyalty ──
  const profile = await sb.profile.getProfile(g);
  const mockProfile = await mock.profile.getProfile(G);
  // Date of birth is deliberately never read by the app in Supabase mode.
  const { dateOfBirth: _dob, ...mockGuest } = mockProfile.guest;
  same('guest record', profile.guest, mockGuest);
  same('saved preferences', profile.preferences, mockProfile.preferences);
  same('companions', profile.companions, mockProfile.companions);
  same('occasions', profile.occasions, mockProfile.occasions);
  const prefs = await sb.profile.getPreferences(g);
  check('preferences come from the account', prefs.source === 'supabase' && prefs.version === 1, prefs.source);

  same('membership', await sb.loyalty.getMembership(g), await mock.loyalty.getMembership(G));
  const { valueSegment: _seg, ...mockRelationship } = await mock.loyalty.getRelationship(G);
  same('relationship (without internal segment)', await sb.loyalty.getRelationship(g), mockRelationship);
  same('privileges for the voyage', await sb.loyalty.getPrivileges(g, v), await mock.loyalty.getPrivileges(G, V));
  const recognition = await sb.loyalty.getRecognition(g, v);
  check('recognition line', recognition.recognitionLine === (await mock.loyalty.getRecognition(G, V)).recognitionLine, recognition.recognitionLine);
  check('Bonvoy linking needs the server', await rejects(sb.loyalty.linkMembership(g, 'code'), 'unavailable'));

  // ── Voyage ──
  same('reservations', await sb.voyage.listReservations(g), await mock.voyage.listReservations(G));
  same('upcoming reservation', await sb.voyage.getUpcomingReservation(g), await mock.voyage.getUpcomingReservation(G));
  same('past voyages', await sb.voyage.getPastVoyages(g), await mock.voyage.getPastVoyages(G));
  const overview = await sb.voyage.getOverview(r);
  const mockOverview = await mock.voyage.getOverview(R);
  same('overview: voyage and itinerary', overview.voyage, mockOverview.voyage);
  same('overview: yacht', overview.yacht, mockOverview.yacht);
  same('overview: suite', overview.suite, mockOverview.suite);
  same('overview: reservation', overview.reservation, mockOverview.reservation);
  same('overview: embarkation', overview.embarkation, mockOverview.embarkation);
  same('overview: documents', byId(toFixtureIds(overview.documents)), byId(mockOverview.documents));
  same('overview: flights', overview.flights, mockOverview.flights);
  for (const at of ['2027-05-11T09:00:00-04:00', '2027-05-15T12:00:00+02:00', '2027-05-20T10:00:00+02:00', '2027-05-23T10:00:00+02:00']) {
    check(`journey phase at ${at}`, (await sb.voyage.getJourneyPhase(r, new Date(at))) === (await mock.voyage.getJourneyPhase(R, new Date(at))));
  }
  check('unknown voyage is not_found', await rejects(sb.voyage.getVoyage('not-a-uuid'), 'not_found'));

  // ── Experiences ──
  same('catalogue', await sb.experience.listCatalogue(v), await mock.experience.listCatalogue(V));
  same('catalogue: spa filter', await sb.experience.listCatalogue(v, { category: 'spa' }), await mock.experience.listCatalogue(V, { category: 'spa' }));
  same('catalogue: port filter', await sb.experience.listCatalogue(v, { portCallId: uuidFor('dev_pc_5') }), await mock.experience.listCatalogue(V, { portCallId: 'dev_pc_5' }));
  same('experience', await sb.experience.getExperience(uuidFor('dev_exp_classic_sail')), await mock.experience.getExperience('dev_exp_classic_sail'));
  same('collections', await sb.experience.listCollections(v), await mock.experience.listCollections(V));
  same('destinations', await sb.experience.listDestinations(v), await mock.experience.listDestinations(V));
  const avail = toFixtureIds(await sb.experience.listAvailability(v));
  const mockAvail = await mock.experience.listAvailability(V);
  same('availability', [...avail].sort((a, b) => a.experienceId.localeCompare(b.experienceId)), [...mockAvail].sort((a, b) => a.experienceId.localeCompare(b.experienceId)));
  const slots = await sb.experience.checkAvailability({ experienceId: uuidFor('dev_exp_deep_tissue'), date: '2027-05-17', partySize: 1 });
  check('availability for a date', slots.length === 3 && slots.every((s) => s.start.startsWith('2027-05-17') && s.remaining >= 1), slots);
  same('bookings', await sb.experience.listBookings(r), await mock.experience.listBookings(R));
  same('bookings: dining', await sb.experience.listBookings(r, { category: 'dining' }), await mock.experience.listBookings(R, { category: 'dining' }));
  same('next booking', await sb.experience.getNextBooking(r, undefined, now), await mock.experience.getNextBooking(R, undefined, now));
  same('day schedules', await sb.experience.listDaySchedules(r), await mock.experience.listDaySchedules(R));
  same('day 6', await sb.experience.getDaySchedule(r, 6), await mock.experience.getDaySchedule(R, 6));
  same('combined calendar', await sb.schedule.getCalendar(r), await mock.schedule.getCalendar(R));

  // ── Journey events & personalization ──
  const alertsNorm = (list: { createdAt: string; expiresAt?: string }[]) => list.map((a) => ({ ...a, createdAt: instant(a.createdAt), expiresAt: instant(a.expiresAt) }));
  same('alerts', alertsNorm(await sb.journeyEvents.listAlerts(r)), alertsNorm(await mock.journey.listAlerts(R)));
  same('notifications (sent)', await sb.journeyEvents.listNotifications(g, { now }), await mock.journey.listNotifications(G, { now }));
  same('notifications (with scheduled)', await sb.journeyEvents.listNotifications(g, { now, includeScheduled: true }), await mock.journey.listNotifications(G, { now, includeScheduled: true }));
  for (const surface of ['home', 'discover', 'voyage'] as const) {
    same(`recommendations: ${surface}`, await sb.personalization.getRecommendations(g, surface, { limit: 50 }), await mock.personalization.getRecommendations(G, surface, { limit: 50 }));
  }
  const home = await sb.personalization.getRecommendations(g, 'home');
  await sb.personalization.recordFeedback(g, home[0]!.id, 'viewed');
  check('feedback recorded', true);

  // ── Concierge ──
  const convo = await sb.concierge.openConversation(r);
  const mockConvo = await mock.concierge.openConversation(R);
  const history = (list: { createdAt: string; conversationId: string }[]) => list.map(({ conversationId: _c, ...m }) => ({ ...m, createdAt: instant(m.createdAt) }));
  same('conversation history', history(convo.messages.slice(0, -1)), history(mockConvo.messages.slice(0, -1)));
  check('greeting composed on the device', convo.messages.at(-1)?.body.includes('Alexander') === true && convo.messages.at(-1)!.id.startsWith('greeting_'), convo.messages.at(-1));
  check('same conversation on reopen', (await sb.concierge.openConversation(r)).conversationId === convo.conversationId);
  const requests = toFixtureIds(await sb.concierge.listServiceRequests(r));
  same('service requests', byId(requests), byId(await mock.concierge.listServiceRequests(R)));
  const replies = await sb.concierge.sendMessage(convo.conversationId, ' Could you book a table? ', { guestRef: 'x', preferredName: 'x', phase: 'prepare', tierLabel: 'x', upcomingBookingIds: [], occasionsThisVoyage: [], locale: 'en' });
  check('reply from the concierge function', replies.length === 1 && replies[0]?.author === 'ai' && replies[0].suggestions?.[0] === 'Thank you', replies);
  check('function receives only conversation and text', canon(gw.calls[0]?.body) === canon({ conversationId: convo.conversationId, body: 'Could you book a table?' }), gw.calls[0]);
  check('function call carries the user token', gw.calls[0]?.auth?.startsWith('Bearer ') === true && gw.calls[0].auth !== `Bearer ${ANON_KEY}`);
  check('empty message refused', await rejects(sb.concierge.sendMessage(convo.conversationId, '   ', {} as never), 'validation'));
  const raised = await sb.concierge.createServiceRequest(r, { type: 'suite', summary: 'Extra pillows, feather-free' });
  check('service request raised', raised.status === 'received' && raised.assignedTeam === 'suite-ambassador' && raised.priority === 'routine', raised);
  const handoff = await sb.concierge.escalateToHuman({ conversationId: convo.conversationId, reason: 'guest-request', preferredChannel: 'chat' });
  check('hand-off to the Suite Ambassador', handoff.agentName === 'Elena, Suite Ambassador' && handoff.team === 'suite-ambassador', handoff);

  // ── Writes as the guest ──
  const booked = await sb.experience.requestBooking(r, uuidFor('dev_exp_wine_masterclass'), '2027-05-17T15:00:00+02:00', 2, 'Window, please');
  check('booking requested', booked.status === 'received' && booked.category === 'wine' && booked.start === '2027-05-17T15:00:00+02:00' && booked.venue === 'Aboard Evrima', booked);
  const changed = await sb.experience.requestChange(booked.id, { partySize: 3 });
  check('change requested', changed.status === 'in_progress' && changed.partySize === 3, changed);
  await sb.experience.cancelBooking(booked.id);
  check('cancelled booking leaves the list', !(await sb.experience.listBookings(r)).some((b) => b.id === booked.id));
  check('cancelling twice is refused', await rejects(sb.experience.cancelBooking(booked.id), 'validation'));
  check('party size is validated', await rejects(sb.experience.requestBooking(r, uuidFor('dev_exp_thalasso'), '2027-05-17T08:00:00+02:00', 0), 'validation'));

  const alerts = await sb.journeyEvents.listAlerts(r);
  await sb.journeyEvents.acknowledge(alerts[0]!.id);
  check('acknowledged alert leaves the list', (await sb.journeyEvents.listAlerts(r)).length === alerts.length - 1);

  const repo = new SupabasePreferencesRepository(() => guestDb);
  const saved = await sb.profile.updatePreferences(g, { suite: { ...profile.preferences.suite, temperatureCelsius: 20 } }, { expectedVersion: 1 });
  check('preferences saved with version 2', saved.version === 2 && saved.preferences.suite.temperatureCelsius === 20, saved.version);
  check('stale preferences refused', await rejects(sb.profile.updatePreferences(g, { suite: profile.preferences.suite }, { expectedVersion: 1 }), 'conflict'));
  check('repository reads the new version', (await repo.load(g))?.version === 2);

  // Direct writes the guest is not allowed to make.
  const direct = async (q: PromiseLike<{ error: { code?: string } | null }>) => (await q).error?.code;
  check('cannot insert a confirmed booking', (await direct(guestDb.from('experience_bookings').insert({ reservation_id: r, experience_id: uuidFor('dev_exp_jazz'), starts_at: '2027-05-17T21:30:00+02:00', party_size: 2, status: 'confirmed' }))) === '42501');
  check('cannot self-assign a request', (await direct(guestDb.from('service_requests').insert({ reservation_id: r, type: 'general', summary: 'x', assigned_to_name: 'Captain' }))) === '42501');
  check('cannot rewrite a notification', (await direct(guestDb.from('notifications').update({ title: 'Changed' }).eq('id', uuidFor('dev_ntf_01')))) === '42501');
  check('can mark a notification read', (await direct(guestDb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', uuidFor('dev_ntf_05')))) === undefined);
  check('cannot change reference data', (await direct(guestDb.from('experiences').update({ price_minor: 1 }).eq('id', uuidFor('dev_exp_bridge')))) === '42501');
  check('cannot write the audit log', (await direct(guestDb.from('audit_log').insert({ action: 'x', resource: 'y', outcome: 'success' }))) === '42501');
  check('cannot grant themselves a role', (await direct(guestDb.from('user_roles').insert({ user_id: GUEST_USER_ID, role: 'admin' }))) === '42501');
  const crewRecs = await guestDb.from('recommendations').select('id').eq('audience', 'crew');
  check('crew opportunities stay hidden', !crewRecs.error && (crewRecs.data ?? []).length === 0);
  const pii = await guestDb.schema('private' as 'public').from('guest_pii').select('email');
  check('private schema is not exposed', !!pii.error);

  // ── Another guest ──
  const otherDb = clientFor(gw.url, OTHER_USER_ID);
  const other = createSupabaseServices(() => otherDb, clock);
  check('other guest: no reservations', (await other.voyage.listReservations(uuidFor(G))).length === 0);
  check('other guest: no bookings', (await other.experience.listBookings(r)).length === 0);
  check('other guest: reservation not found', await rejects(other.voyage.getOverview(r), 'not_found'));
  check('other guest: no notifications', (await other.journeyEvents.listNotifications(g, { now, includeScheduled: true })).length === 0);
  check('other guest: cannot book on it', await rejects(other.experience.requestBooking(r, uuidFor('dev_exp_jazz'), '2027-05-17T21:30:00+02:00', 2), 'not_found'));
  check('other guest: cannot cancel', await rejects(other.experience.cancelBooking(changed.id), 'not_found'));
  check('other guest: cannot open the conversation', await rejects(other.concierge.openConversation(r), 'forbidden'));
  check('other guest: no membership', (await other.loyalty.getMembership(g)) === null);

  // ── anon key ──
  const anon = clientFor(gw.url);
  for (const table of ['guests', 'reservations', 'experiences', 'notifications', 'experience_bookings_local']) {
    const res = await anon.from(table).select('*').limit(1);
    check(`anon cannot read ${table}`, res.error?.code === '42501', res.error ?? res.data);
  }
  const rpc = await anon.rpc('my_relationship');
  check('anon cannot call functions', rpc.error?.code === '42501', rpc.error);

  gw.close();
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Supabase integration: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Supabase integration: all ${passed} checks passed.`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
