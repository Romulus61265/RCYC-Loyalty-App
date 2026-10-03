/// <reference types="node" />
/**
 * Notification checks.  Run: `npm run check:notifications`
 *
 * The shared engine (supabase/functions/_shared/notifications) on the
 * fictional voyage: the brief's examples word for word, all seven types,
 * stable keys and determinism, preferences, quiet hours, privacy; the
 * NotificationService (inbox, read state, settings, devices); the push
 * dispatcher (window, dedupe, dead tokens, retries) and the Expo sender;
 * and the view models.
 */
import type { NotificationPreferences } from '@/domain';
import { devDataset as d, IDS } from '@/data/fixtures';
import { buildInbox, buildSettings } from '@/features/notifications/notificationsModel';
import { ServiceError } from '@/services/contracts';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockGuestRecordSource, MockJourneyEventService, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockServiceRequestService } from '@/services/mock/MockServiceRequestService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { buildNotifyInput } from '@/services/notifications/buildNotifyInput';
import { ComposedNotificationService } from '@/services/notifications/ComposedNotificationService';
import { MemoryNotificationState } from '@/services/notifications/state';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { routeFromPush } from '@/services/push/PushRegistrar';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { toGuestRequest } from '@/services/shared/serviceRequests';
import { dispatch, DryRunPushSender, ExpoPushSender, toMessages, type DispatchPorts, type PushMessage, type PushSender } from '../supabase/functions/_shared/notifications/dispatch';
import { buildCandidates, clock, contextualNotifications, decide, defaultPreferencesFor, dueForPush, inbox, inQuietHours, NOTIFICATION_TYPES, safeRoute, upcoming } from '../supabase/functions/_shared/notifications/engine';
import type { NotifyInput } from '../supabase/functions/_shared/notifications/types';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}`}`);
};
async function rejects(p: Promise<unknown>, code: string) {
  try {
    await p;
    return false;
  } catch (e) {
    return e instanceof ServiceError && e.code === code;
  }
}

const US = defaultPreferencesFor('en-US');
const ctx = { guest: { id: IDS.guest, name: 'Alexander Laurent' }, voyage: { id: IDS.voyage, name: d.voyage.voyage.name }, where: 'aboard' as const };

function input(edit?: (i: NotifyInput) => void): NotifyInput {
  const i = buildNotifyInput({
    profile: structuredClone(d.guest.profile),
    voyage: d.voyage.voyage,
    bookings: structuredClone(d.experiences.bookings),
    schedules: d.experiences.daySchedules,
    requests: d.concierge.requests.map((r) => toGuestRequest(r, ctx)),
    alerts: d.communication.alerts,
    recommendations: [],
    stored: d.communication.notifications,
  });
  edit?.(i);
  return i;
}
const all = (i = input(), p: NotificationPreferences = US) => contextualNotifications(i, p);
const byKey = (list: ReturnType<typeof all>, key: string) => list.find((n) => n.key === key);

async function main() {
  // ─── The brief's examples ───────────────────────────────────────────────
  {
    const list = all();
    const driver = byKey(list, 'transfer:dev_bkg_transfer_bcn:arriving');
    check('“Your transfer driver will arrive in 20 minutes.”', driver?.title === 'Your transfer driver will arrive in 20 minutes.' && driver.type === 'service-update', driver);
    check('… twenty minutes before pick-up, and time-sensitive', driver?.at === '2027-05-15T09:40:00+02:00' && driver.timeSensitive);
    const dinner = byKey(list, 'reminder:dev_bkg_dinner_1');
    check('“Dinner at Mediterraneo begins at 8:30 PM.”', dinner?.title === 'Dinner at Mediterraneo begins at 8:30 PM.' && dinner.type === 'reminder', dinner?.title);
    check('… two hours before', dinner?.at === '2027-05-15T18:30:00+02:00');
    const marina = list.find((n) => n.type === 'itinerary-change');
    check('“Tomorrow’s marina activity has moved to 3:00 PM.”', marina?.title === 'Tomorrow’s marina activity has moved to 3:00 PM.' && /It was at 2:30 PM/.test(marina.body), marina);
    check('… told when the change was made', marina?.at === '2027-05-17T18:00:00+02:00');
    const wine = all(input((i) => (i.recommendations = [{ experienceId: 'dev_exp_mallorca_wine', recommendation: 'Binissalem Vineyards & Lunch in Deià', category: 'wine', destination: 'Palma de Mallorca', voyageDate: '2027-05-16', reason: 'For your love of wine.', actionable: true }])));
    const idea = byKey(wine, 'recommendation:dev_exp_mallorca_wine');
    check('“A private wine experience is available in Mallorca.”', idea?.title === 'A private wine experience is available in Mallorca.' && idea.type === 'recommendation', idea?.title);
    check('… the evening before', idea?.at === '2027-05-15T18:00:00+02:00', idea?.at);
    check('24-hour times when preferred', byKey(all(input(), { ...US, timeFormat: '24h' }), 'reminder:dev_bkg_dinner_1')?.title === 'Dinner at Mediterraneo begins at 20:30.');
  }

  // ─── Every type, stable keys, determinism ───────────────────────────────
  {
    const urgentInput = input((i) => i.alerts.push({ id: 'alr_tender', severity: 'urgent', title: 'Tenders paused in Portofino', body: 'A swell has come up. We will tell you the moment they resume.', createdAt: '2027-05-21T11:00:00+02:00' }));
    const list = all(urgentInput);
    const types = new Set(list.map((n) => n.type));
    check('all seven types', NOTIFICATION_TYPES.every((t) => t === 'recommendation' || types.has(t)) && all(input((i) => (i.recommendations = [{ experienceId: 'x', recommendation: 'X', category: 'culture', destination: 'Portofino', voyageDate: '2027-05-21', reason: 'R.', actionable: true }]))).some((n) => n.type === 'recommendation'), [...types]);
    check('urgent alerts are urgent and time-sensitive', byKey(list, 'alert:alr_tender')?.type === 'urgent' && byKey(list, 'alert:alr_tender')?.timeSensitive === true);
    check('non-urgent alerts stay attention cards (no duplicates)', !list.some((n) => n.key === 'alert:dev_alr_flight'));
    check('keys are unique', new Set(list.map((n) => n.key)).size === list.length);
    check('same input, same output', JSON.stringify(all()) === JSON.stringify(all()));
    const shuffled = input();
    for (const k of ['bookings', 'activities', 'requests', 'stored', 'itinerary'] as const) (shuffled[k] as unknown[]).reverse();
    check('input order does not matter', JSON.stringify(all(shuffled)) === JSON.stringify(all()));
    check('the server’s message replaces the generated one (dedupe key)', list.filter((n) => n.key === 'request:dev_srq_bridge:in_progress').length === 1 && byKey(list, 'request:dev_srq_bridge:in_progress')?.source.kind === 'stored');
    check('reminders only for confirmed or arranged bookings', !list.some((n) => n.key === 'reminder:dev_bkg_anniversary') || d.experiences.bookings.find((b) => b.id === 'dev_bkg_anniversary')?.status === 'in_progress');
    check('all aboard on a day ashore', byKey(list, 'all-aboard:dev_pc_2')?.title === 'All aboard is at 6:30 PM.');
    check('arrival in port', byKey(list, 'arrival:dev_pc_5')?.title === 'Welcome to Monte Carlo.');
    check('a request resolved', byKey(list, 'request:dev_srq_wine_2007:resolved')?.title === 'Done: Source a 2007 Barolo for the anniversary');
    check('a withdrawn request tells the guest nothing new', !list.some((n) => n.key.startsWith('request:dev_srq_transfer_early:closed')));
    check('only internal routes', list.every((n) => !n.deepLink || n.deepLink.startsWith('/')) && safeRoute('https://evil.example') === undefined && safeRoute('//evil') === undefined && safeRoute('/requests/x') === '/requests/x');
  }

  // ─── Preferences, quiet hours, privacy ──────────────────────────────────
  {
    const off = all(input(), { ...US, delivery: { ...US.delivery, reminder: 'off' } });
    check('a type switched off is not delivered', off.filter((n) => n.type === 'reminder').every((n) => n.delivery === 'off' && n.reason === 'type-off'));
    check('urgent cannot be switched off', decide(buildCandidates(input((i) => i.alerts.push({ id: 'u', severity: 'urgent', title: 'U', body: 'B', createdAt: '2027-05-21T11:00:00+02:00' })), US), input(), { ...US, delivery: { ...US.delivery, urgent: 'off' } }).find((n) => n.type === 'urgent')?.delivery === 'push');
    const noPush = all(input((i) => (i.guest.pushChannel = false)));
    check('push channel off: everything stays in the app', noPush.every((n) => n.delivery !== 'push' || n.type === 'urgent'));
    const privacy = all(input((i) => { i.guest.personalisedRecommendations = false; i.recommendations = [{ experienceId: 'x', recommendation: 'X', category: 'wine', destination: 'Palma de Mallorca', voyageDate: '2027-05-16', reason: 'R.', actionable: true }]; }));
    check('personalisation off: no recommendations at all', !privacy.some((n) => n.type === 'recommendation'));
    check('quiet hours, across midnight', inQuietHours('2027-05-17T23:30:00+02:00', { start: '23:00', end: '07:00' }) && inQuietHours('2027-05-18T06:59:00+02:00', { start: '23:00', end: '07:00' }) && !inQuietHours('2027-05-18T07:00:00+02:00', { start: '23:00', end: '07:00' }));
    const late = decide([{ key: 'k', type: 'reminder', title: 'T', body: 'B', at: '2027-05-17T23:30:00+02:00', timeSensitive: false, source: { kind: 'booking', id: 'b' } }], input(), US)[0]!;
    check('a reminder in quiet hours waits until 07:00', late.delivery === 'push' && late.deliverAt === '2027-05-18T07:00:00+02:00' && late.reason === 'quiet-hours', late);
    const driver = decide([{ key: 'k', type: 'service-update', title: 'T', body: 'B', at: '2027-05-18T06:40:00+02:00', timeSensitive: true, source: { kind: 'transfer', id: 'b' } }], input(), US)[0]!;
    check('the driver is never held', driver.deliverAt === '2027-05-18T06:40:00+02:00' && !driver.reason);
    const stale = decide([{ key: 'k', type: 'reminder', title: 'T', body: 'B', at: '2027-05-17T23:30:00+02:00', expiresAt: '2027-05-18T00:30:00+02:00', timeSensitive: false, source: { kind: 'booking', id: 'b' } }], input(), US)[0]!;
    check('held past its moment: inbox only, no late push', stale.delivery === 'in-app');
    const early = byKey(all(input(), { ...US, reminderLead: 'early' }), 'reminder:dev_bkg_dinner_1');
    check('earlier reminders', early?.at === '2027-05-15T16:30:00+02:00');
    check('12-hour clock', clock('2027-05-15T12:00:00+02:00', '12h') === '12:00 PM' && clock('2027-05-15T00:30:00+02:00', '12h') === '12:30 AM' && clock('2027-05-15T09:05:00+02:00', '24h') === '09:05');
    check('defaults: 12-hour for en-US, 24-hour otherwise', defaultPreferencesFor('en-US').timeFormat === '12h' && defaultPreferencesFor('fr-FR').timeFormat === '24h');
  }

  // ─── Inbox, upcoming, the dispatch window ───────────────────────────────
  {
    const list = all();
    const now = new Date('2027-05-15T09:45:00+02:00');
    const box = inbox(list, now);
    check('inbox: only what is due, newest first', box.every((n) => Date.parse(n.at) <= now.getTime()) && box.every((n, i) => i === 0 || Date.parse(box[i - 1]!.at) >= Date.parse(n.at)));
    const next = upcoming(list, now);
    check('upcoming: pushes still to come, soonest first', next.length > 0 && next.every((n, i) => n.delivery === 'push' && (i === 0 || Date.parse(next[i - 1]!.deliverAt) <= Date.parse(n.deliverAt))));
    const window = dueForPush(list, new Date('2027-05-15T09:30:00+02:00'), new Date('2027-05-15T09:45:00+02:00'));
    check('dispatch window: the driver and the 09:45 reminder', window.map((n) => n.key).sort().join() === ['reminder:dev_bkg_sagrada', 'transfer:dev_bkg_transfer_bcn:arriving'].sort().join(), window.map((n) => n.key));
    check('dispatch never re-sends stored notifications', dueForPush(list, new Date('2027-04-01T00:00:00Z'), new Date('2027-06-01T00:00:00Z')).every((n) => n.source.kind !== 'stored'));
  }

  // ─── The service ────────────────────────────────────────────────────────
  {
    let now = new Date(d.meta.referenceNow);
    const voyage = new MockVoyageService();
    const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore()));
    const svc = new ComposedNotificationService(
      { profile, voyage, experience: new MockExperienceService(), requests: new MockServiceRequestService({ voyage }), journeyEvents: new MockJourneyEventService(), personalization: new MockPersonalizationService(), clock: { now: () => now } },
      new MemoryNotificationState({ [IDS.guest]: d.communication.readNotificationKeys }),
    );
    const G = IDS.guest;
    const R = IDS.reservation;
    const list = await svc.list(G, R);
    check('inbox at the demo moment: due only, newest first', list.length > 0 && list.every((n, i) => i === 0 || Date.parse(list[i - 1]!.at) >= Date.parse(n.at)));
    check('history the guest had read is read', list.filter((n) => n.key.startsWith('request:dev_srq_bedding')).every((n) => n.read));
    const unread = await svc.unreadCount(G, R);
    check('a calm unread count', unread > 0 && unread <= 4, unread);
    await svc.markRead(G, [list.find((n) => !n.read)!.key]);
    check('mark one read', (await svc.unreadCount(G, R)) === unread - 1);
    await svc.markAllRead(G, R);
    check('mark all read', (await svc.unreadCount(G, R)) === 0);
    check('filter by type', (await svc.list(G, R, { type: 'service-update' })).every((n) => n.type === 'service-update'));
    now = new Date('2027-05-15T09:45:00+02:00');
    const morning = await svc.list(G, R);
    check('on embarkation morning: the driver and the Sagrada reminder are new', morning.slice(0, 2).every((n) => !n.read) && morning.some((n) => n.title === 'Your transfer driver will arrive in 20 minutes.'));
    check('coming up: tonight’s dinner', (await svc.upcoming(G, R)).some((u) => u.title === 'Dinner at Mediterraneo begins at 8:30 PM.'));

    const s = await svc.getSettings(G);
    check('settings: 12-hour for the guest’s en-US, quiet hours from communication', s.preferences.timeFormat === '12h' && s.quietHours?.start === '23:00' && s.pushChannel);
    check('urgent cannot be turned off', await rejects(svc.updatePreferences(G, { delivery: { ...s.preferences.delivery, urgent: 'off' } }), 'validation'));
    check('unknown values are refused', await rejects(svc.updatePreferences(G, { timeFormat: '13h' as never }), 'validation'));
    const changed = await svc.updatePreferences(G, { delivery: { ...s.preferences.delivery, reminder: 'off' }, timeFormat: '24h' });
    check('preferences saved with the guest’s communication preferences', changed.preferences.delivery.reminder === 'off' && (await profile.getPreferences(G)).preferences.communication.notifications?.timeFormat === '24h');
    check('… and applied to the inbox', !(await svc.list(G, R)).some((n) => n.type === 'reminder' && n.key.startsWith('reminder:')));

    check('device: refuses something that is not an Expo token', await rejects(svc.registerDevice(G, { token: 'abc', platform: 'ios' }), 'validation'));
    const dev = await svc.registerDevice(G, { token: 'ExponentPushToken[abcdefghijklmnop]', platform: 'ios', name: 'Alexander’s iPhone' });
    const again = await svc.registerDevice(G, { token: 'ExponentPushToken[abcdefghijklmnop]', platform: 'ios' });
    const devices = await svc.listDevices(G);
    check('device: registered once, re-registration is the same device', dev.id === again.id && devices.length === 1);
    check('device: the token is never returned', !JSON.stringify(devices).includes('ExponentPushToken'));
    await svc.unregisterDevice(G, dev.id);
    check('device: removed', (await svc.listDevices(G)).length === 0);
  }

  // ─── The dispatcher ─────────────────────────────────────────────────────
  {
    const i = input();
    const recorded: string[] = [];
    const disabled: string[] = [];
    const sent = new Set<string>();
    const ports = (devices: { id: string; token: string }[]): DispatchPorts => ({
      guests: async () => [{ guestId: IDS.guest, reservationId: IDS.reservation }],
      load: async () => ({ input: i, prefs: US, zoneFor: () => 'Europe/Madrid' }),
      sentKeys: async (_g, keys) => new Set(keys.filter((k) => sent.has(k))),
      devices: async () => devices,
      record: async (rows) => rows.forEach((r) => (recorded.push(`${r.n.key}:${r.status}`), sent.add(r.n.key))),
      disableDevice: async (id) => void disabled.push(id),
    });
    const window = { since: new Date('2027-05-15T09:30:00+02:00'), until: new Date('2027-05-15T09:45:00+02:00') };
    const dry = new DryRunPushSender();
    const first = await dispatch(ports([{ id: 'd1', token: 'ExponentPushToken[aaaaaaaaaaaa]' }]), dry, window);
    check('dispatch: due pushes sent and recorded', first.sent === 2 && recorded.length === 2 && recorded.every((r) => r.endsWith(':dry-run')), first);
    const second = await dispatch(ports([{ id: 'd1', token: 'ExponentPushToken[aaaaaaaaaaaa]' }]), dry, window);
    check('dispatch: a second run sends nothing again', second.sent === 0 && second.skippedAlreadySent === 2 && dry.sent.length === 2, second);
    const driverMsg = dry.sent.find((m) => m.data.key === 'transfer:dev_bkg_transfer_bcn:arriving')!;
    check('push payload: high priority, a sound, its channel, an internal route and a TTL', driverMsg.priority === 'high' && driverMsg.sound === 'default' && driverMsg.channelId === 'rcyc-service-update' && driverMsg.data.route === '/voyage?section=embarkation' && (driverMsg.ttl ?? 0) > 0, driverMsg);
    const reminderMsg = dry.sent.find((m) => m.data.key === 'reminder:dev_bkg_sagrada')!;
    check('push payload: reminders are quiet', reminderMsg.priority === 'normal' && reminderMsg.sound === null);

    sent.clear();
    recorded.length = 0;
    const dead: PushSender = { name: 'expo', send: async (m: PushMessage[]) => m.map(() => ({ status: 'error' as const, message: 'gone', error: 'DeviceNotRegistered' })) };
    const r3 = await dispatch(ports([{ id: 'd2', token: 'ExponentPushToken[bbbbbbbbbbbb]' }]), dead, window);
    check('dispatch: a dead token is disabled', disabled.includes('d2') && r3.disabledDevices >= 1);
    check('dispatch: a failed push is not recorded, so the next run retries', r3.failed === 2 && recorded.length === 0, r3);
    const none = await dispatch(ports([]), dry, window);
    check('dispatch: no device, nothing sent', none.sent === 0);

    const calls: { url: string; body: unknown[]; auth?: string }[] = [];
    const fakeFetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      const body = JSON.parse(init.body) as unknown[];
      calls.push({ url, body, auth: init.headers.Authorization });
      return { ok: true, json: async () => ({ data: body.map((_, k) => (k === 1 ? { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: `t${k}` })) }) };
    }) as unknown as typeof fetch;
    const expo = new ExpoPushSender('secret-token', 'https://exp.host/--/api/v2/push/send', fakeFetch);
    const messages = toMessages(byKey(all(), 'reminder:dev_bkg_dinner_1')!, Array.from({ length: 150 }, (_, k) => `ExponentPushToken[t${k}aaaaaaaaaaaa]`), new Date('2027-05-15T18:30:00+02:00'));
    const tickets = await expo.send(messages);
    check('Expo sender: batches of 100, with the access token', calls.length === 2 && calls[0]!.body.length === 100 && calls[1]!.body.length === 50 && calls[0]!.auth === 'Bearer secret-token');
    check('Expo sender: one ticket per message, errors kept', tickets.length === 150 && tickets[1]?.status === 'error' && (tickets[1] as { error?: string }).error === 'DeviceNotRegistered' && tickets[0]?.status === 'ok');
  }

  // ─── View models and the device side ────────────────────────────────────
  {
    const now = new Date('2027-05-15T19:00:00+02:00');
    const items = inbox(all(), now).map((n) => ({ key: n.key, type: n.type, title: n.title, body: n.body, at: n.at, deepLink: n.deepLink, read: false, delivery: n.delivery === 'push' ? ('push' as const) : ('in-app' as const) }));
    const vm = buildInbox(items, [], US, now);
    check('inbox groups: Today first', vm.groups[0]?.label === 'Today' && vm.groups[0].items.some((i) => i.title === 'Dinner at Mediterraneo begins at 8:30 PM.'));
    check('inbox: times in the guest’s format', vm.groups[0]?.items.find((i) => i.key === 'reminder:dev_bkg_dinner_1')?.time === '6:30 PM');
    check('inbox: filter chips for the types present', vm.types[0]?.value === 'all' && vm.types.length >= 3);
    const settings = buildSettings({ preferences: US, pushChannel: true, quietHours: { start: '23:00', end: '07:00' }, personalisedRecommendations: false });
    check('settings: urgent locked on; recommendations locked off by privacy', Boolean(settings.rows.find((r) => r.type === 'urgent')?.locked) && /Privacy/.test(settings.rows.find((r) => r.type === 'recommendation')?.locked ?? ''));
    check('settings: quiet hours explained', /arrive at 07:00/.test(settings.quietLine));
    check('a tapped push opens internal routes only', routeFromPush({ route: '/requests/x' }) === '/requests/x' && routeFromPush({ route: 'https://evil.example' }) === '/' && routeFromPush(null) === '/');
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Notifications: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Notifications: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
