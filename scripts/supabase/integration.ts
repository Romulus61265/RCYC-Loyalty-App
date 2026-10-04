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
 * Env: PGRST_URL (PostgREST), JWT_SECRET, GUEST_USER_ID, OTHER_USER_ID,
 * CREW_USER_ID (a Suite Ambassador), SHORE_USER_ID (shore operations).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { devDataset as d, IDS } from '@/data/fixtures';
import { MockConciergeService } from '@/services/mock/MockConciergeService';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestRecordSource, MockJourneyEventService, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockScheduleService } from '@/services/mock/MockScheduleService';
import { MockServiceRequestService } from '@/services/mock/MockServiceRequestService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { createSupabaseServices } from '@/services/supabase';
import { coalescingFetch } from '@/services/remote/coalescingFetch';
import { SupabasePreferencesRepository } from '@/services/remote/SupabasePreferencesRepository';
import { buildSeedRows, fixtureIdFor, uuidFor } from './seedRows';
import { claimsChange } from '../../supabase/functions/_shared/concierge/guard.ts';
import { DEFAULT_CONFIG, handleConcierge } from '../../supabase/functions/_shared/concierge/pipeline.ts';
import { MockLLMProvider } from '../../supabase/functions/_shared/concierge/providers/mock.ts';
import { callerFor, supabasePorts } from '../../supabase/functions/_shared/concierge/supabasePorts.ts';
import { handleNextBest } from '../../supabase/functions/_shared/personalization/handler.ts';
import { dispatch, DryRunPushSender } from '../../supabase/functions/_shared/notifications/dispatch.ts';
import { supabaseDispatchPorts } from '../../supabase/functions/_shared/notifications/supabaseDispatch.ts';
import { ComposedNotificationService } from '@/services/notifications/ComposedNotificationService';
import { ComposedVoyageHistoryService, MemoryVoyageHistoryStore } from '@/services/history/ComposedVoyageHistoryService';
import type { VoyageHistoryEntry } from '@/domain';
import { MemoryNotificationState } from '@/services/notifications/state';
import { SupabaseRecoveryOperations } from '@/services/supabase/SupabaseRecovery';
import { processDisruption, scanReservation } from '../../supabase/functions/_shared/recovery/handler.ts';
import { supabaseRecoveryPorts } from '../../supabase/functions/_shared/recovery/supabaseRecovery.ts';
import { handleFlightUpdate } from '../../supabase/functions/_shared/continuity/orchestrator.ts';
import { supabaseContinuityPorts } from '../../supabase/functions/_shared/continuity/supabaseContinuity.ts';

const PGRST_URL = process.env.PGRST_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const GUEST_USER_ID = process.env.GUEST_USER_ID;
const OTHER_USER_ID = process.env.OTHER_USER_ID;
const CREW_USER_ID = process.env.CREW_USER_ID;
const SHORE_USER_ID = process.env.SHORE_USER_ID;
if (!PGRST_URL || !JWT_SECRET || !GUEST_USER_ID || !OTHER_USER_ID || !CREW_USER_ID || !SHORE_USER_ID) {
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

/**
 * concierge-respond as the Edge Function runs it, minus Deno: the same
 * pipeline and Supabase ports, a user client carrying the caller's JWT and a
 * service-role client, with the mock model (no LLM, no credentials).
 */
async function conciergeRespond(url: string, raw: string, auth: string | undefined, clock: () => Date) {
  if (!auth?.startsWith('Bearer ')) return { status: 401, body: { error: 'unauthenticated' } };
  const sub = (JSON.parse(Buffer.from(auth.slice(7).split('.')[1] ?? '', 'base64url').toString() || '{}') as { sub?: string }).sub;
  if (!sub) return { status: 401, body: { error: 'unauthenticated' } };
  const user = createClient(url, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const service = createClient(url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
  return handleConcierge(raw, await callerFor(user, sub), supabasePorts(user, service, clock), { ...DEFAULT_CONFIG, provider: new MockLLMProvider() });
}

/** personalization-next-best as the Edge Function runs it: the shared handler and engine. */
async function nextBest(url: string, raw: string, auth: string | undefined, clock: () => Date) {
  if (!auth?.startsWith('Bearer ')) return { status: 401, body: { error: 'unauthenticated' } };
  const sub = (JSON.parse(Buffer.from(auth.slice(7).split('.')[1] ?? '', 'base64url').toString() || '{}') as { sub?: string }).sub;
  if (!sub) return { status: 401, body: { error: 'unauthenticated' } };
  const user = createClient(url, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const service = createClient(url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
  const caller = await callerFor(user, sub);
  return handleNextBest(raw, caller, {
    user,
    service,
    now: clock,
    audit: async (e) => void (await service.from('audit_log').insert({ actor_id: e.actorId, actor_roles: e.actorRoles, action: e.action, resource: e.resource, resource_id: e.resourceId, outcome: e.outcome, metadata: e.metadata })),
  });
}

// A local gateway: /rest/v1 → PostgREST; /functions/v1/* → the shared handlers.
async function gateway(clock: () => Date): Promise<{ url: string; close: () => void; calls: { body: unknown; auth?: string }[] }> {
  const calls: { body: unknown; auth?: string }[] = [];
  let self = '';
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    if (req.url?.startsWith('/functions/v1/concierge-respond')) {
      const raw = body.toString();
      calls.push({ body: JSON.parse(raw || '{}'), auth: req.headers.authorization });
      const result = await conciergeRespond(self, raw, req.headers.authorization, clock).catch((e: unknown) => {
        console.error('   concierge-respond:', e);
        return { status: 500, body: { error: 'internal' } };
      });
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
      return;
    }
    if (req.url?.startsWith('/functions/v1/personalization-next-best')) {
      const result = await nextBest(self, body.toString(), req.headers.authorization, clock).catch((e: unknown) => {
        console.error('   personalization-next-best:', e);
        return { status: 500, body: { error: 'internal' } };
      });
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
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
  self = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url: self, close: () => server.close(), calls };
}

const ANON_KEY = jwt({ role: 'anon' });
// Through the app's coalescing fetch (as getSupabaseClient does), so every check here also proves
// that shared reads never hide a write. `global` replaces it (request-profile.ts).
const clientFor = (url: string, userId?: string, global: { fetch: typeof fetch } = { fetch: coalescingFetch(fetch) }): SupabaseClient =>
  userId
    ? createClient(url, ANON_KEY, { accessToken: async () => jwt({ sub: userId, role: 'authenticated', aud: 'authenticated' }), global })
    : createClient(url, ANON_KEY, { auth: { persistSession: false }, global });

// ─── Run ───────────────────────────────────────────────────────────────────

async function main() {
  buildSeedRows(); // fills the UUID → fixture ID map
  const now = new Date(d.meta.referenceNow);
  const gw = await gateway(() => now);
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

  // ── Notifications (before anything below changes the data) ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    const voyageMock = new MockVoyageService();
    const mockNotifications = new ComposedNotificationService(
      { profile: mock.profile, voyage: voyageMock, experience: new MockExperienceService(), requests: new MockServiceRequestService({ voyage: voyageMock }), journeyEvents: new MockJourneyEventService(), personalization: new MockPersonalizationService(), clock },
      new MemoryNotificationState({ [G]: d.communication.readNotificationKeys }),
    );
    const served = toFixtureIds(await sb.notifications.list(g, r));
    const local = await mockNotifications.list(G, R);
    same('notifications: the inbox matches (same engine, same data)', served.map((n) => [n.key, n.type, n.title, n.at, n.read]), local.map((n) => [n.key, n.type, n.title, n.at, n.read]));
    same('notifications: what is coming up matches', toFixtureIds(await sb.notifications.upcoming(g, r, { limit: 5 })), await mockNotifications.upcoming(G, R, { limit: 5 }));
    const unread = await sb.notifications.unreadCount(g, r);
    const first = (await sb.notifications.list(g, r)).find((n) => !n.read)!;
    await sb.notifications.markRead(g, [first.key]);
    check('notifications: read state is kept', (await sb.notifications.unreadCount(g, r)) === unread - 1);
    await sb.notifications.markRead(g, [first.key]);
    check('notifications: reading twice is harmless', (await sb.notifications.unreadCount(g, r)) === unread - 1);
    const otherDbN = clientFor(gw.url, OTHER_USER_ID);
    const otherN = createSupabaseServices(() => otherDbN, clock);
    const theirReceipts = await otherDbN.from('notification_receipts').select('notification_key');
    check('notifications: another guest sees no receipts', (theirReceipts.data ?? []).length === 0, theirReceipts);
    const forged = await otherDbN.from('notification_receipts').insert({ guest_id: g, notification_key: 'x' });
    check('notifications: … nor writes them', Boolean(forged.error), forged.error);

    const token = 'ExponentPushToken[integration0001]';
    const device = await sb.notifications.registerDevice(g, { token, platform: 'ios', name: 'iPhone' });
    check('push: device registered', device.platform === 'ios' && (await sb.notifications.listDevices(g)).length === 1);
    check('push: re-registering is the same device', (await sb.notifications.registerDevice(g, { token, platform: 'ios' })).id === device.id && (await sb.notifications.listDevices(g)).length === 1);
    const tokenRead = await guestDb.from('push_devices').select('token');
    check('push: the token cannot be read back', Boolean(tokenRead.error), tokenRead);
    const direct = await guestDb.from('push_devices').insert({ guest_id: g, user_id: GUEST_USER_ID, token: 'ExponentPushToken[forgedforged01]', platform: 'ios' });
    check('push: devices only through registration', Boolean(direct.error), direct.error);
    check('push: another guest sees no devices', (await otherN.notifications.listDevices(uuidFor('dev_guest_other')).catch(() => [])).length === 0);
    check('push: bad tokens refused', await rejects(sb.notifications.registerDevice(g, { token: 'not-a-token', platform: 'ios' }), 'validation'));

    // The dispatcher, as the scheduled Edge Function runs it (dry run).
    const window = { since: new Date('2027-05-15T09:30:00+02:00'), until: new Date('2027-05-15T09:45:00+02:00') };
    const dry = new DryRunPushSender();
    const run1 = await dispatch(supabaseDispatchPorts(service), dry, window);
    check('push: the driver and the 09:45 reminder go out', run1.sent === 2 && dry.sent.every((m) => m.to === token) && dry.sent.some((m) => m.title === 'Your transfer driver will arrive in 20 minutes.'), run1);
    const rowsSent = (await service.from('notifications').select('type, dedupe_key, push_status, channel, time_zone').eq('guest_id', g).not('dedupe_key', 'is', null)).data as { type: string; dedupe_key: string; push_status: string; channel: string; time_zone: string }[] | null;
    check('push: each recorded once, with its key, type and zone', (rowsSent ?? []).filter((x) => x.push_status === 'dry-run').length >= 2 && (rowsSent ?? []).some((x) => x.type === 'service-update' && x.channel === 'push' && x.time_zone === 'Europe/Madrid'), rowsSent);
    const run2 = await dispatch(supabaseDispatchPorts(service), dry, window);
    check('push: a second run sends nothing again (sent ones are now stored)', run2.sent === 0 && run2.due === 0 && dry.sent.length === 2, run2);
    const later = createSupabaseServices(() => guestDb, { now: () => new Date('2027-05-15T09:50:00+02:00') });
    const inboxAfter = toFixtureIds(await later.notifications.list(g, r));
    check('push: the inbox shows the sent notification once', inboxAfter.filter((n) => n.key === 'transfer:dev_bkg_transfer_bcn:arriving').length === 1);
    const deadSender = { name: 'expo', send: async (m: { to: string }[]) => m.map(() => ({ status: 'error' as const, message: 'gone', error: 'DeviceNotRegistered' })) };
    await dispatch(supabaseDispatchPorts(service), deadSender, { since: new Date('2027-05-15T18:15:00+02:00'), until: new Date('2027-05-15T18:30:00+02:00') });
    const deviceRow = (await service.from('push_devices').select('enabled, disabled_reason').eq('token', token).maybeSingle()).data as { enabled: boolean; disabled_reason: string } | null;
    check('push: a dead token is disabled', deviceRow?.enabled === false && deviceRow.disabled_reason === 'DeviceNotRegistered', deviceRow);
  }

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
  check('reply from the concierge function', replies.length === 1 && replies[0]?.author === 'ai' && replies[0].classification === 'information', replies);
  check('… unsure, so it offers a person', replies[0]?.attachments?.some((a) => a.kind === 'actions' && a.actions.some((x) => x.kind === 'escalate')) === true, replies[0]?.attachments);
  const sent = gw.calls[0]?.body as { requestId?: string } | undefined;
  check('function receives only conversation, text and a request ID', canon({ ...sent, requestId: 'x' }) === canon({ conversationId: convo.conversationId, body: 'Could you book a table?', requestId: 'x' }) && /^[0-9a-f-]{36}$/.test(sent?.requestId ?? ''), gw.calls[0]);
  check('function call carries the user token', gw.calls[0]?.auth?.startsWith('Bearer ') === true && gw.calls[0].auth !== `Bearer ${ANON_KEY}`);
  check('empty message refused', await rejects(sb.concierge.sendMessage(convo.conversationId, '   ', {} as never), 'validation'));
  const raised = await sb.concierge.createServiceRequest(r, { type: 'suite', summary: 'Extra pillows, feather-free' });
  check('service request raised', raised.status === 'received' && raised.assignedTeam === 'suite-ambassador' && raised.priority === 'routine', raised);
  const handoff = await sb.concierge.escalateToHuman({ conversationId: convo.conversationId, reason: 'guest-request', preferredChannel: 'chat' });
  check('hand-off to the Suite Ambassador', handoff.agentName === 'Elena, Suite Ambassador' && handoff.team === 'suite-ambassador', handoff);

  // ── Concierge actions ──
  const bridgeReq = toFixtureIds(await sb.concierge.getServiceRequest(uuidFor('dev_srq_bridge')));
  check('request links to its experience', bridgeReq.experienceId === 'dev_exp_bridge', bridgeReq);
  const carDone = await sb.concierge.performAction(convo.conversationId, { kind: 'service-request', label: 'Arrange it', type: 'transport', summary: 'Private car in Portofino, 21 May', details: 'Sedan, no music' });
  const carConf = carDone[0]?.attachments?.[0];
  check('action: service request raised and confirmed as received', carConf?.kind === 'confirmation' && carConf.status === 'received' && Boolean(carConf.requestId), carDone);
  const moveDone = await sb.concierge.performAction(convo.conversationId, { kind: 'change-booking', label: 'Move to 21:00', bookingId: uuidFor('dev_bkg_dinner_1'), start: '2027-05-15T21:00:00+02:00' });
  const moveConf = moveDone[0]?.attachments?.[0];
  check('action: dinner change requested through the database function', moveConf?.kind === 'confirmation' && moveConf.status === 'in_progress', moveDone);
  const linked = toFixtureIds(await sb.concierge.listServiceRequests(r)).find((q) => q.bookingId === 'dev_bkg_dinner_1');
  check('… and recorded as a request linked to the booking', Boolean(linked), linked);
  const teamDone = await sb.concierge.performAction(convo.conversationId, { kind: 'escalate', label: 'Speak with the team', to: 'concierge-team', reason: 'guest-request' });
  const teamCard = teamDone[0]?.attachments?.[0];
  check('action: hand-off to the concierge team', teamCard?.kind === 'handoff' && teamCard.to === 'concierge-team' && teamCard.team === 'shoreside-concierge', teamDone);
  check('open actions are refused by the service (navigation is the app’s)', await rejects(sb.concierge.performAction(convo.conversationId, { kind: 'open', label: 'x', route: '/voyage' }), 'validation'));
  const spoof = await guestDb.from('service_requests').insert({ reservation_id: r, type: 'general', summary: 'x', booking_id: uuidFor('dev_bkg_dinner_1'), experience_id: '00000000-0000-4000-8000-000000000999' });
  check('a request cannot link an unknown experience', spoof.error?.code === '42501' || spoof.error?.code === '23503', spoof.error);

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

  // ── Personalization engine, server-side (Edge Function handler, service-role inputs) ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    const served = await sb.personalization.getPersonalizedRecommendations(g, r, { limit: 10 });
    const local = await mock.personalization.getPersonalizedRecommendations(G, R, { limit: 10 });
    check('personalization: the server returns recommendations', served.length > 0, served.length);
    same('personalization: same engine, same data, same recommendations', toFixtureIds(served).map((x) => [x.experienceId, x.reason, x.voyageDate, x.destination, x.action.kind, x.relevanceScore]), local.map((x) => [x.experienceId, x.reason, x.voyageDate, x.destination, x.action.kind, x.relevanceScore]));
    check('personalization: no internal signals reach the guest', served.every((x) => x.sourceSignals.every((s) => s.visibility === 'guest' && s.kind !== 'value-segment')));
    const raw = await guestDb.functions.invoke<{ recommendations: { sourceSignals: { kind: string }[] }[] }>('personalization-next-best', { body: { guestId: g, reservationId: r, limit: 20 } });
    check('personalization: … not even on the wire', !JSON.stringify(raw.data).includes('value-segment') && !JSON.stringify(raw.data).includes('distinguished'), raw.error);
    const explained = await sb.personalization.getPersonalizedRecommendations(g, r, { limit: 50, includeBooked: true });
    check('personalization: booked experiences only when asked, marked booked', explained.some((x) => x.booked) && !served.some((x) => x.booked));
    const status = async (body: Record<string, unknown>, db: SupabaseClient = guestDb) => ((await db.functions.invoke('personalization-next-best', { body })).error as { context?: { status?: number } } | null)?.context?.status ?? 200;
    check('personalization: another guest is refused', [403, 404].includes(await status({ guestId: g, reservationId: r }, otherDb)));
    check('personalization: unknown fields refused', (await status({ guestId: g, reservationId: r, debug: true })) === 422);
    check('personalization: limit is bounded', (await status({ guestId: g, reservationId: r, limit: 500 })) === 422);
    check('personalization: anon is refused', (await status({ guestId: g, reservationId: r }, clientFor(gw.url))) === 401);
    const logged = (await service.from('audit_log').select('metadata').eq('action', 'personalization.next_best').eq('outcome', 'success')).data ?? [];
    const text = JSON.stringify(logged);
    check('personalization: audited with rules and signal kinds, no reasons', logged.length >= 2 && text.includes('rules-v1') && !text.includes('Recommended because') && !text.includes('distinguished'), logged.length);
  }

  // ── Concierge pipeline end to end (mock model, real RLS and services) ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    // The seeded thread is dated in the voyage's future (2027); real writes carry the wall clock,
    // so the seeded messages would sort as the latest. Remove them so history is in true order.
    await service.from('concierge_messages').delete().eq('conversation_id', convo.conversationId).gt('created_at', new Date().toISOString());
    const say = async (text: string, requestId = randomUUID(), db: SupabaseClient = guestDb) => {
      const { data, error } = await db.functions.invoke<{ messages: { body: string; classification: string; attachments: { kind: string; actions?: { kind: string; start?: string; bookingId?: string }[]; status?: string }[] }[]; replayed?: boolean; escalated?: boolean }>('concierge-respond', {
        body: { conversationId: convo.conversationId, body: text, requestId },
      });
      return { data, status: (error as { context?: { status?: number } } | null)?.context?.status ?? 200, requestId };
    };
    const dinnerBefore = (await guestDb.from('experience_bookings_local').select('id, start_local, status').eq('reservation_id', r).eq('category', 'dining').order('starts_at')).data ?? [];

    const move = await say('Move my dinner reservation.');
    const ai = move.data?.messages?.[0];
    const offer = ai?.attachments.find((a) => a.kind === 'actions')?.actions?.[0];
    check('pipeline: “move my dinner” is transactional with a real slot to confirm', ai?.classification === 'transactional' && offer?.kind === 'change-booking' && Boolean(offer.start), ai);
    check('pipeline: the reply claims nothing', ai !== undefined && !claimsChange(ai.body), ai?.body);
    const dinnerAfterOffer = (await guestDb.from('experience_bookings_local').select('id, start_local, status').eq('reservation_id', r).eq('category', 'dining').order('starts_at')).data ?? [];
    check('pipeline: an offer changes no booking', canon(dinnerAfterOffer) === canon(dinnerBefore));
    const run1 = (await service.from('concierge_ai_runs').select('*').eq('request_id', move.requestId).maybeSingle()).data as Record<string, unknown> | null;
    check('pipeline: run recorded (provider, prompt version, slices, offered transaction)', run1?.provider === 'mock' && typeof run1.prompt_version === 'string' && (run1.context_slices as string[]).includes('bookings') && (run1.transaction as { status: string }).status === 'offered', run1);
    const stored = (await guestDb.from('concierge_messages').select('author, body, classification').in('id', (run1?.message_ids as string[]) ?? [])).data ?? [];
    check('pipeline: guest and AI messages stored, AI one classified', stored.some((m) => m.author === 'guest' && m.classification === null) && stored.some((m) => m.author === 'ai' && m.classification === 'transactional'), stored);
    const guestRuns = await guestDb.from('concierge_ai_runs').select('id');
    check('pipeline: guests cannot read run records', (guestRuns.data ?? []).length === 0, guestRuns);
    const forge = await guestDb.from('concierge_messages').insert({ conversation_id: convo.conversationId, author: 'ai', body: 'Your table has been moved.', classification: 'transactional' });
    check('pipeline: guests cannot write concierge answers', Boolean(forge.error), forge.error);
    const forgeRun = await guestDb.from('concierge_ai_runs').insert({ request_id: randomUUID(), conversation_id: convo.conversationId, reservation_id: r, actor_user_id: GUEST_USER_ID, provider: 'x', model: 'x', prompt_version: 'x', classification: 'information' });
    check('pipeline: guests cannot write run records', Boolean(forgeRun.error), forgeRun.error);

    const replay = await say('Move my dinner reservation.', move.requestId);
    const runs = (await service.from('concierge_ai_runs').select('id').eq('request_id', move.requestId)).data ?? [];
    check('pipeline: a retried request is replayed, not answered twice', replay.data?.replayed === true && runs.length === 1, replay.data);

    const time = offer?.start?.slice(11, 16) ?? '';
    const yes = await say(`${time}, please`);
    const done = yes.data?.messages?.[0];
    const moved = (await guestDb.from('experience_bookings_local').select('start_local, status').eq('id', offer?.bookingId ?? '').maybeSingle()).data as { start_local: string; status: string } | null;
    check('pipeline: accepting the offer changes the booking through the database function', moved?.start_local.slice(0, 16) === offer?.start?.slice(0, 16), { moved, offer });
    check('pipeline: the reply reports what the service reported', done?.attachments.some((a) => a.kind === 'confirmation' && a.status === moved?.status) === true && (moved?.status === 'confirmed' ? /confirmed/ : /passed this on/).test(done?.body ?? ''), done);

    const urgent = await say('My husband has chest pain');
    check('pipeline: emergencies go straight to the Medical Centre', urgent.data?.escalated === true && urgent.data.messages?.[0]?.attachments.some((a) => a.kind === 'handoff') === true, urgent.data);
    const medical = (await guestDb.from('service_requests').select('assigned_team, priority').eq('reservation_id', r).eq('type', 'medical').order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
    check('… as an urgent medical request', medical?.assigned_team === 'medical' && medical.priority === 'urgent', medical);

    const all = (await guestDb.from('concierge_messages').select('body, attachments').eq('conversation_id', convo.conversationId).eq('author', 'ai')).data ?? [];
    const unbacked = all.filter((m) => claimsChange(m.body) && !(m.attachments as { kind: string }[]).some((a) => a.kind === 'confirmation'));
    check('pipeline: no stored answer claims a change without a service confirmation', unbacked.length === 0, unbacked);
    const audits = (await service.from('audit_log').select('metadata').eq('action', 'concierge.respond')).data ?? [];
    check('pipeline: answers audited without message text', audits.length >= 4 && !JSON.stringify(audits).includes('chest pain') && !JSON.stringify(audits).includes('Move my dinner'), audits.length);

    const otherTry = await say('What is planned tomorrow?', randomUUID(), otherDb);
    check('pipeline: another guest cannot use this conversation', otherTry.status === 403 || otherTry.status === 404, otherTry);
    const bad = await guestDb.functions.invoke('concierge-respond', { body: { conversationId: convo.conversationId, body: 'hi', requestId: randomUUID(), guestId: randomUUID() } });
    check('pipeline: a guestId that is not the caller’s is refused', (bad.error as { context?: { status?: number } } | null)?.context?.status === 403, bad.error);
  }

  // ── Guest service requests ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    const mockRequests = new MockServiceRequestService({ voyage: new MockVoyageService() });
    same('requests: history as the guest sees it', toFixtureIds(await sb.requests.listHistory(r)), await mockRequests.listHistory(R));
    const fixtureActive = toFixtureIds(await sb.requests.listActive(r)).filter((x) => x.id.startsWith('dev_srq_'));
    same('requests: active fixture requests as the guest sees them', fixtureActive, (await mockRequests.listActive(R)).filter((x) => fixtureActive.some((y) => y.id === x.id)));

    const created = await sb.requests.submit({ reservationId: r, category: 'maintenance', description: 'The terrace door is difficult to close.', priority: 'priority' });
    check('requests: submitted, routed to Engineering, raised by the guest', created.status === 'submitted' && created.category === 'maintenance' && created.assignedTeam.label === 'Engineering' && created.guest.id === g && created.priority === 'priority', created);
    const dbRow = (await service.from('service_requests').select('guest_id, category, type, status, acknowledged_at').eq('id', created.id).maybeSingle()).data as Record<string, unknown> | null;
    check('requests: the trigger stamps the guest; category kept', dbRow?.guest_id === g && dbRow.category === 'maintenance' && dbRow.type === 'general' && dbRow.acknowledged_at === null, dbRow);
    for (const [label, extra] of [
      ['a resolved status', { status: 'completed' }],
      ['resolution notes', { resolution_notes: 'Fixed' }],
      ['an acknowledgement', { acknowledged_at: new Date().toISOString() }],
      ['another guest', { guest_id: uuidFor(IDS.companion) }],
    ] as const) {
      const forged = await guestDb.from('service_requests').insert({ reservation_id: r, type: 'general', category: 'suite', summary: 'x', ...extra });
      check(`requests: a guest cannot insert ${label}`, Boolean(forged.error), forged.error);
    }
    const bad = await guestDb.from('service_requests').insert({ reservation_id: r, type: 'general', category: 'yachts', summary: 'x' });
    check('requests: unknown categories refused', Boolean(bad.error));
    await guestDb.from('service_requests').update({ status: 'completed', resolution_notes: 'Done' }).eq('id', created.id);
    check('requests: a guest cannot change status or notes', (await sb.requests.get(created.id)).status === 'submitted');

    // The crew side (service role here): every change is stamped by the trigger.
    await service.from('service_requests').update({ assigned_to_name: 'Engineering team' }).eq('id', created.id);
    const ack = await sb.requests.get(created.id);
    check('requests: assignment acknowledges it', ack.status === 'acknowledged' && ack.assignedTeam.person === 'Engineering team' && ack.timeline.some((t) => t.status === 'acknowledged'), ack);
    await service.from('service_requests').update({ status: 'in_progress' }).eq('id', created.id);
    const started = await sb.requests.get(created.id);
    check('requests: in progress, with its moment', started.status === 'in_progress' && started.timeline.map((t) => t.status).join() === 'submitted,acknowledged,in_progress', started.timeline);
    check('requests: in progress cannot be withdrawn', await rejects(sb.requests.close(created.id), 'conflict'));
    const direct = await guestDb.rpc('close_service_request', { p_request: created.id });
    check('requests: … not even by calling the database directly', direct.error?.code === '22023', direct.error);
    await service.from('service_requests').update({ status: 'completed', resolution_notes: 'The door has been rehung and closes softly.' }).eq('id', created.id);
    const resolved = await sb.requests.get(created.id);
    check('requests: resolved, with notes', resolved.status === 'resolved' && resolved.resolutionNotes === 'The door has been rehung and closes softly.' && resolved.canClose);
    const closed = await sb.requests.close(created.id);
    check('requests: the guest closes a resolved request', closed.status === 'closed' && closed.timeline.map((t) => t.status).join() === 'submitted,acknowledged,in_progress,resolved,closed', closed.timeline);
    check('requests: closed ones are history', (await sb.requests.listHistory(r)).some((x) => x.id === created.id) && !(await sb.requests.listActive(r)).some((x) => x.id === created.id));

    const second = await sb.requests.submit({ reservationId: r, category: 'spa', description: 'A later time for the massage, please.' });
    const withdrawn = await sb.requests.close(second.id);
    check('requests: withdrawn before work starts', withdrawn.status === 'closed' && withdrawn.resolutionNotes === 'Withdrawn by the guest.' && withdrawn.timeline.map((t) => t.status).join() === 'submitted,closed', withdrawn);
    check('requests: cannot close twice', await rejects(sb.requests.close(second.id), 'conflict'));

    check('requests: another guest cannot list them', (await rejects(other.requests.listActive(r), 'not_found')) && (await rejects(other.requests.listHistory(r), 'not_found')));
    check('requests: … nor one by its ID', await rejects(other.requests.get(created.id), 'not_found'));
    const theirs = await otherDb.rpc('close_service_request', { p_request: second.id });
    check('requests: … nor close it', theirs.error?.code === 'P0002', theirs.error);
  }

  // ── Special occasions on Supabase (the same orchestration over these services) ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    const plans = await sb.occasions.listCelebrations(g, r);
    const p = plans[0];
    check('occasions: the anniversary is detected from the database', plans.length === 1 && p?.celebration.kind === 'anniversary' && p.celebration.date === '2027-05-20' && p.celebration.port === 'Monte Carlo', plans.map((x) => x.celebration));
    check('occasions: the personal message', p?.message.title === 'Twenty years' && /your second day in Monte Carlo/.test(p.message.body[0] ?? '') && p.message.signature === 'Elena, your Suite Ambassador', p?.message);
    const state = (k: string) => p?.steps.find((s) => s.kind === k);
    check('occasions: what is in hand is recognised', state('private-dining')?.inHand?.label === 'Being arranged' && state('wine')?.inHand?.label === 'Arranged' && state('private-shore')?.inHand?.label === 'Confirmed' && state('spa')?.inHand?.label === 'Confirmed', p?.steps.map((s) => [s.kind, s.state, s.inHand?.label]));
    const amenity = state('suite-amenity')!;
    const count = async () => (await service.from('service_requests').select('id', { count: 'exact', head: true }).eq('reservation_id', r)).count ?? 0;
    const n = await count();
    check('occasions: no approval, no request', (await rejects(sb.occasions.approveStep(g, r, p!.celebration.key, { stepId: amenity.id } as never), 'validation')) && (await count()) === n);
    const ok = await sb.occasions.approveStep(g, r, p!.celebration.key, { stepId: amenity.id, approved: true, note: 'White flowers, please.' });
    const row = (await service.from('service_requests').select('category, occasion_step, details, status').eq('id', ok.requestId ?? '').maybeSingle()).data as Record<string, unknown> | null;
    check('occasions: approved → a suite request, tagged with its step', (await count()) === n + 1 && row?.category === 'suite' && row.occasion_step === amenity.id && row.status === 'received' && /White flowers/.test(String(row.details)), row);
    check('occasions: the plan now shows it requested', (await sb.occasions.getPlan(g, r, p!.celebration.key)).steps.find((s) => s.id === amenity.id)?.inHand?.label === 'Requested');
    check('occasions: another guest gets nothing for this reservation', (await other.occasions.listCelebrations(g, r).catch(() => [])).length === 0);
  }

  // ── Service recovery: recorded server-side, read and answered by the guest, decided by crew ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    const ports = supabaseRecoveryPorts(service);
    const fixture = d.recovery.demoDisruption;
    const disruption = { ...fixture, reservationId: r, guestIds: fixture.guestIds.map(uuidFor), subject: { bookingId: uuidFor(fixture.subject.bookingId!) } };
    check('recovery: the guest sees no notices before', (await sb.recovery.listNotices(g, r)).length === 0);
    const recorded = await processDisruption(ports, disruption, { now });
    check('recovery: recorded by the server, with its alternatives and a proposal', recorded.status === 'recorded' && recorded.severity === 'high' && recorded.alternatives === 3 && recorded.proposals === 1, recorded);
    check('recovery: once per disruption', (await processDisruption(ports, disruption, { now })).status === 'duplicate');
    const audited = (await service.from('audit_log').select('metadata').eq('action', 'service_recovery.record')).data as { metadata: Record<string, unknown> }[] | null;
    check('recovery: audited with counts, not words', audited?.length === 1 && audited[0]!.metadata.kind === 'excursion-cancellation' && !JSON.stringify(audited).includes('mistral'), audited);
    const event = (await service.from('service_recovery_events').select('plan, disruption').eq('disruption_key', fixture.key).maybeSingle()).data as { plan: { message: { title: string; body: string[] }; alternatives: { id: string }[] }; disruption: { subject: { title?: string } } } | null;

    const [notice] = await sb.recovery.listNotices(g, r);
    check('recovery: the guest’s notice, under RLS', notice?.title === 'Under sail on a 1930s classic yacht will not go ahead' && notice.explanation === fixture.reason?.guest && notice.status === 'open', notice);
    check('recovery: server and app agree to the word', !!event && event.plan.message.title === notice?.title && JSON.stringify(event.plan.message.body) === JSON.stringify(notice?.body) && JSON.stringify(event.plan.alternatives.map((a) => a.id)) === JSON.stringify(notice?.alternatives.map((a) => a.id)), { server: event?.plan.alternatives.map((a) => a.id), app: notice?.alternatives.map((a) => a.id) });
    check('recovery: the first alternative is the private walk that morning', toFixtureIds(notice?.alternatives[0]?.experienceId) === 'dev_exp_tropez_village' && notice?.alternatives[0]?.time === '10:00');
    const row = (await guestDb.from('recovery_notices').select('disruption').eq('id', notice!.id).maybeSingle()).data as { disruption: Record<string, unknown> } | null;
    check('recovery: the stored notice carries no internal reason or guest ids', !!row && !JSON.stringify(row).includes('35 knots') && !('guestIds' in row.disruption), row);
    check('recovery: guests cannot read the recorded event or proposals', ((await guestDb.from('service_recovery_events').select('id')).data ?? []).length === 0 && ((await guestDb.from('goodwill_proposals').select('id')).data ?? []).length === 0);
    check('recovery: guests cannot write notices', !!(await guestDb.from('recovery_notices').update({ status: 'resolved' }).eq('id', notice!.id).select('id')).error || ((await guestDb.from('recovery_notices').select('status').eq('id', notice!.id).maybeSingle()).data as { status: string } | null)?.status === 'open');
    const leaky = await service.from('recovery_notices').insert({ recovery_event_id: recorded.eventId, reservation_id: r, disruption: { reason: { internal: 'x' } }, title: 'x', occurred_at: now.toISOString() });
    check('recovery: a notice with an internal reason is refused by the database', !!leaky.error);
    check('recovery: another guest sees nothing', (await other.recovery.listNotices(g, r).catch(() => [])).length === 0);
    check('recovery: another guest cannot answer it', !!(await otherDb.rpc('respond_to_recovery_notice', { p_notice: notice!.id, p_kind: 'assistance', p_request: null })).error);

    // The operator cancels the booking at source; the notice reads the same.
    await service.from('experience_bookings').update({ status: 'cancelled' }).eq('id', disruption.subject.bookingId);
    const again = (await sb.recovery.getNotice(g, r, notice!.id));
    check('recovery: after the booking is cancelled, the notice still reads the same', again.title === notice!.title && again.subject.title === event?.disruption.subject.title && again.alternatives.length === 3);

    const village = again.alternatives[0]!;
    check('recovery: no approval, nothing requested', await rejects(sb.recovery.acceptAlternative(g, r, notice!.id, { alternativeId: village.id } as never), 'validation'));
    check('recovery: the price must be acknowledged', await rejects(sb.recovery.acceptAlternative(g, r, notice!.id, { alternativeId: village.id, approved: true }), 'validation'));
    const chosen = await sb.recovery.acceptAlternative(g, r, notice!.id, { alternativeId: village.id, approved: true, acknowledgedCharge: true });
    const booking = (await service.from('experience_bookings').select('status, experience_id, party_size, note').eq('id', chosen.bookingId ?? '').maybeSingle()).data as { status: string; experience_id: string; party_size: number; note: string } | null;
    check('recovery: accepted → a booking request (received), never a booking', booking?.status === 'received' && toFixtureIds(booking.experience_id) === 'dev_exp_tropez_village' && booking.party_size === 2 && /^In place of/.test(booking.note), booking);
    check('recovery: the choice is recorded on the notice', chosen.notice.accepted?.bookingId === chosen.bookingId && chosen.notice.status === 'resolved' && chosen.notice.alternatives.length === 0, chosen.notice);
    check('recovery: once only', await rejects(sb.recovery.acceptAlternative(g, r, notice!.id, { alternativeId: again.alternatives[1]!.id, approved: true, acknowledgedCharge: true }), 'conflict'));
    const helped = await sb.recovery.requestAssistance(g, r, notice!.id, 'Something quiet later.');
    const helpRow = (await service.from('service_requests').select('category, occasion_step, status').eq('id', helped.requestId ?? '').maybeSingle()).data as Record<string, unknown> | null;
    check('recovery: assistance → a request tagged to the notice', helpRow?.category === 'excursion' && helpRow.occasion_step === `recovery:${notice!.id}:assist` && helpRow.status === 'received' && helped.notice.assistance.requested, helpRow);
    check('recovery: the event is now in hand', ((await service.from('service_recovery_events').select('status').eq('id', recorded.eventId!).maybeSingle()).data as { status: string } | null)?.status === 'in-hand');

    // The crew's side.
    const crewDb = clientFor(gw.url, CREW_USER_ID);
    const shoreDb = clientFor(gw.url, SHORE_USER_ID);
    const crew = new SupabaseRecoveryOperations({ db: () => crewDb, clock });
    const shore = new SupabaseRecoveryOperations({ db: () => shoreDb, clock });
    const [rec] = await crew.listRecords(r);
    check('crew: the recorded event, with its brief', rec?.kind === 'excursion-cancellation' && rec.assessment.severity === 'high' && rec.assessment.escalate && rec.crewBrief.some((l) => l.includes('35 knots')) && rec.status === 'in-hand', rec);
    const [prop] = await crew.listProposals(r);
    check('crew: the gesture proposed, not applied', prop?.ruleId === 'dev_gw_private_lost_gesture' && prop.status === 'proposed' && !prop.financial && prop.approvalRole === 'suite_ambassador', prop);
    check('guest: cannot decide', await rejects(new SupabaseRecoveryOperations({ db: () => guestDb, clock }).decideProposal(prop!.id, { approve: true }), 'not_found'));
    check('shore operations: may read, may not approve a Suite Ambassador’s gesture', (await shore.listProposals(r)).length === 1 && (await rejects(shore.decideProposal(prop!.id, { approve: true }), 'forbidden')));
    const decided = await crew.decideProposal(prop!.id, { approve: true, note: 'The 2007 Barolo.' });
    check('crew: the Suite Ambassador approves, recorded by whom', decided.status === 'approved' && decided.decidedBy === CREW_USER_ID && decided.note === 'The 2007 Barolo.', decided);
    check('crew: decided once', await rejects(crew.decideProposal(prop!.id, { approve: false }), 'conflict'));
    const draftFinancial = await service.from('goodwill_rules').update({ status: 'approved' }).eq('id', 'dev_gw_repeat_service_credit').select('id');
    check('rules: an approved rule must say who authorised it', !!draftFinancial.error);
    const noCeiling = await service.from('goodwill_rules').insert({ id: 'dev_gw_bad_refund', name: 'x', applies_to: ['guest-complaint'], min_severity: 'high', action: { kind: 'refund', description: 'x' }, approval: { role: 'suite_ambassador', maxPerReservation: 1 } });
    check('rules: money only with a ceiling and an admin', !!noCeiling.error);
    check('rules: crew read, cannot write', ((await crewDb.from('goodwill_rules').select('id')).data ?? []).length === 4 && ((await crewDb.from('goodwill_rules').update({ status: 'retired' }).eq('id', 'dev_gw_complaint_visit').select('id')).data ?? []).length === 0);
    const policy = (await crewDb.from('goodwill_policy').select('financial_enabled').maybeSingle()).data as { financial_enabled: boolean } | null;
    check('policy: financial goodwill is off', policy?.financial_enabled === false);

    // Disruptions in the guest's own data, once each.
    const late = new Date('2027-05-12T17:00:00Z');
    const scan1 = await scanReservation(ports, { reservationId: r, guestIds: [g] }, { now: late });
    const scan2 = await scanReservation(ports, { reservationId: r, guestIds: [g] }, { now: late });
    check('scan: a missed update is recorded', scan1.some((x) => x.status === 'recorded') && scan1.length > 0, scan1);
    check('scan: and only once', scan2.length === scan1.length && scan2.every((x) => x.status === 'duplicate'), scan2);
    check('scan: the request raised from the notice is not a new disruption', !((await service.from('service_recovery_events').select('disruption_key')).data as { disruption_key: string }[]).some((e) => e.disruption_key.includes(helped.requestId ?? '-')));
  }

  // ── Shoreside-to-yacht continuity: a delayed flight, through the server ports ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    const crewDb = clientFor(gw.url, CREW_USER_ID);
    check('continuity: nothing before', (await sb.continuity.getArrivalUpdate(r)) === null);
    const flight = { observationId: 'feed-obs-1', flightNumber: 'AA 7412', departureDate: '2027-05-14', status: 'delayed' as const, scheduledArrival: '2027-05-15T09:10:00+02:00', estimatedArrival: '2027-05-15T11:10:00+02:00', observedAt: '2027-05-15T05:30:00Z', source: 'test-feed', simulated: false };
    const [res] = await handleFlightUpdate(supabaseContinuityPorts(service), flight, { now });
    check('continuity: handled for the reservation; every change only requested (no supplier integration)', res?.status === 'adjusted' && res.reservationId === r && (res.outcomes ?? []).every((o) => o === 'requested') && res.outcomes?.length === 3, res);
    const u = await sb.continuity.getArrivalUpdate(r);
    check('continuity: the guest reads it under RLS, and is not told it is done', u?.headline === "We're adjusting your arrival arrangements." && u.steps.length === 6 && u.steps.find((x) => x.kind === 'transfer-updated')?.state === 'pending', u);
    check('continuity: the same times as the mock', u?.steps.map((x) => x.value ?? '').join() === '11:10,,,12:00,15:30,' && /between 15:30 and 16:00/.test(u.steps.find((x) => x.kind === 'embarkation-notified')?.detail ?? ''), u?.steps);
    check('continuity: not simulated when the source is not', u?.simulated === false);
    const inbound = (await sb.voyage.getOverview(r)).flights.find((f) => f.direction === 'inbound');
    check('continuity: the flight shows the new estimate', inbound?.status === 'delayed' && inbound.estimatedArrival === '2027-05-15T11:10:00+02:00', inbound);
    const transferRow = (await service.from('experience_bookings_local').select('start_local').eq('id', uuidFor('dev_bkg_transfer_bcn')).maybeSingle()).data as { start_local: string } | null;
    check('continuity: the booking itself is untouched until the transfer team confirms', transferRow?.start_local === '2027-05-15T10:00:00+02:00', transferRow);
    const tasks = ((await crewDb.from('continuity_tasks').select('team, action, status').eq('reservation_id', r)).data ?? []) as { team: string; action: { kind: string; start?: string }; status: string }[];
    check('continuity: a task for each team, for the crew', tasks.map((t) => t.team).sort().join() === 'embarkation,transfer,venue' && tasks.every((t) => t.status === 'open') && tasks.find((t) => t.team === 'transfer')?.action.start === '2027-05-15T12:00:00+02:00', tasks);
    check('continuity: guests cannot see the tasks', ((await guestDb.from('continuity_tasks').select('id')).data ?? []).length === 0);
    check('continuity: another guest sees no update', (await other.continuity.getArrivalUpdate(r).catch(() => null)) === null);
    const evs = ((await service.from('journey_events').select('type, payload').eq('reservation_id', r).in('type', ['flight.delayed', 'transfer.rescheduled', 'experience.change_requested', 'embarkation.changed'])).data ?? []) as { type: string; payload: { correlationId?: string } }[];
    check('continuity: the events, correlated to the observation', evs.length === 4 && evs.every((e) => e.payload.correlationId === 'feed-obs-1'), evs);
    const [again] = await handleFlightUpdate(supabaseContinuityPorts(service), { ...flight, observationId: 'feed-obs-2' }, { now });
    check('continuity: the same estimate again changes nothing', again?.status === 'duplicate' && ((await crewDb.from('continuity_tasks').select('id').eq('reservation_id', r)).data ?? []).length === 3);
    check('continuity: guests cannot write updates', !!(await guestDb.from('arrival_updates').insert({ reservation_id: r, plan_key: 'x', update: {} })).error);
  }

  // ── After the voyage: the recap, reflections under RLS ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    const home = new Date('2027-05-26T10:00:00-04:00');
    const after = createSupabaseServices(() => guestDb, { now: () => home });
    check('post-voyage: nothing before the voyage is over', (await sb.postVoyage.getRecap(g, r)) === null);
    const recap = await after.postVoyage.getRecap(g, r);
    check('post-voyage: Welcome home.', recap?.welcome.title === 'Welcome home.' && recap.summary.line === 'Seven nights, six ports and four countries aboard Evrima, in Grand Suite 612.', recap?.summary);
    check('post-voyage: the days and destinations from the database', recap?.days.length === 8 && recap.destinations.map((x) => x.portName).join() === 'Barcelona,Palma de Mallorca,Saint-Tropez,Monte Carlo,Portofino,Rome (Civitavecchia)');
    check('post-voyage: the anniversary remembered, and Elena’s note', recap?.days.find((x) => x.dayNumber === 6)?.memories[0]?.title === '20th wedding anniversary' && recap.thankYou.signature === 'Elena Moreau, Suite Ambassador');
    check('post-voyage: inspirations from voyage_inspirations', recap?.recommendations.length === 3 && recap.recommendations.every((x) => d.postVoyage.voyageInspirations.some((i) => i.name === x.name)), recap?.recommendations.map((x) => x.name));
    check('post-voyage: Bonvoy is a placeholder', recap?.bonvoy.connected === false && recap.bonvoy.tierLabel === 'Titanium Elite');
    const fav = recap!.days.find((x) => x.dayNumber === 6)!.memories[0]!.id;
    const f1 = await after.postVoyage.saveFeedback(g, r, { favourites: [fav], words: ['Celebratory'] }, { expectedVersion: 0 });
    check('reflections: saved under RLS, versioned', f1.version === 1 && f1.favourites[0] === fav && f1.status === 'draft');
    check('reflections: a stale edit is refused', await rejects(after.postVoyage.saveFeedback(g, r, { words: ['Restful'] }, { expectedVersion: 0 }), 'conflict'));
    await after.postVoyage.saveFeedback(g, r, { better: 'We waited a long time for the tender in Portofino.', followUp: true, thanks: [{ crewId: 'ambassador', note: 'Thank you, for everything.' }] });
    const otherAfter = createSupabaseServices(() => otherDb, { now: () => home });
    check('reflections: another guest reads nothing', ((await otherDb.from('voyage_feedback').select('guest_id')).data ?? []).length === 0 && (await otherAfter.postVoyage.getRecap(g, r).catch(() => null)) === null);
    const crewDb = clientFor(gw.url, CREW_USER_ID);
    check('reflections: the crew of the reservation read them', ((await crewDb.from('voyage_feedback').select('reflections').eq('reservation_id', r)).data ?? []).length === 1);
    const sent = await after.postVoyage.sendFeedback(g, r);
    check('reflections: sent once, with the follow-up request raised', sent.status === 'sent' && !!sent.sentAt && !!sent.followUpRequestId);
    const req = (await service.from('service_requests').select('category, priority, details, summary').eq('id', sent.followUpRequestId ?? '').maybeSingle()).data as Record<string, string> | null;
    check('reflections: the request carries their words', req?.category === 'concierge' && req.priority === 'priority' && JSON.stringify(req).includes('tender in Portofino'), req);
    check('reflections: sent is read-only (RLS)', (await rejects(after.postVoyage.saveFeedback(g, r, { words: ['Restful'] }), 'conflict')) && ((await guestDb.from('voyage_feedback').update({ status: 'draft' }).eq('guest_id', g).select('guest_id')).data ?? []).length === 0);
    check('inspirations: read-only for guests', !!(await guestDb.from('voyage_inspirations').insert({ name: 'x', region: 'x', yacht_name: 'x', start_date: '2029-01-01', end_date: '2029-01-08', nights: 7, standfirst: 'x', highlight: 'x' })).error);
  }

  // ── Voyage history: past voyages from voyage_history, under RLS ──
  {
    const mockHistory = new ComposedVoyageHistoryService({ voyage: mock.voyage, profile: mock.profile }, new MemoryVoyageHistoryStore(d.voyageHistory.records));
    const shape = (list: VoyageHistoryEntry[]) =>
      list.map((e) => ({ name: e.name, yacht: e.yachtName, dates: e.dates, suite: e.suite, places: e.destinations.map((x) => x.name), experiences: e.experiences.map((m) => m.title), dining: e.dining.map((m) => m.title), saved: e.savedPreferences.map((p) => p.label), memories: e.memories, photos: e.photos.count }));
    const list = await sb.history.listVoyages(g);
    same('history: past voyages from the database', shape(list), shape(await mockHistory.listVoyages(G)));
    const adriatic = await sb.history.getVoyage(g, uuidFor(IDS.pastVoyages.adriatic));
    check('history: one voyage, in full', adriatic.yachtName === 'Evrima' && adriatic.suite === 'Grand Suite 612' && adriatic.experiences.length === 3 && adriatic.photos.count === 0, adriatic.name);
    check('history: another guest reads nothing', (await other.history.listVoyages(g)).every((e) => e.experiences.length === 0 && e.suite === '') && ((await otherDb.from('voyage_history').select('voyage_id')).data ?? []).length === 0);
    const crewDb = clientFor(gw.url, CREW_USER_ID);
    check('history: crew of the reservation read it', ((await crewDb.from('voyage_history').select('voyage_id').eq('guest_id', g)).data ?? []).length === 3);
    check('history: guests cannot write it', !!(await guestDb.from('voyage_history').insert({ guest_id: g, voyage_id: v, yacht_name: 'x', suite_label: 'x' })).error && ((await guestDb.from('voyage_history').update({ suite_label: 'x' }).eq('guest_id', g).select('voyage_id')).data ?? []).length === 0);
  }

  // ── Notification preferences (saved last: earlier checks count preference versions) ──
  {
    const service = createClient(gw.url, jwt({ role: 'service_role' }), { auth: { persistSession: false } });
    const settings = await sb.notifications.getSettings(g);
    check('notifications: settings from communication preferences', settings.preferences.timeFormat === '12h' && settings.quietHours?.start === '23:00');
    await sb.notifications.updatePreferences(g, { delivery: { ...settings.preferences.delivery, recommendation: 'off' } });
    const prefRow = (await service.from('guest_preferences').select('communication').eq('guest_id', g).maybeSingle()).data as { communication?: { notifications?: { delivery?: Record<string, string> } } } | null;
    check('notifications: preferences saved in the database', prefRow?.communication?.notifications?.delivery?.recommendation === 'off', prefRow);
    check('notifications: urgent stays on', await rejects(sb.notifications.updatePreferences(g, { delivery: { ...settings.preferences.delivery, urgent: 'off' } }), 'validation'));

  }

  gw.close();
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Supabase integration: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Supabase integration: all ${passed} checks passed.`);
}

// Imported by request-profile.ts for its gateway and clients; run directly, it runs the checks.
if (!process.env.INTEGRATION_AS_LIBRARY) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}

export { clientFor, gateway, jwt };
