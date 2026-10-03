/// <reference types="node" />
/**
 * Concierge checks.  Run: `npm run check:concierge`
 *
 * The mock concierge must answer from the guest's actual data: tomorrow's
 * itinerary at different moments of the journey, their bookings and
 * availability, and their preferences (change a preference, the answer
 * changes). Actions must really change bookings and requests; escalations
 * must reach the right person. Also checks the view model, and that no
 * answer text lives in the UI components.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ConciergeAction, ConciergeAttachment, ConciergeMessage, GuestContext } from '@/domain';
import { devDataset as d, IDS } from '@/data/fixtures';
import { actionKey, buildConciergeModel, buildGuestContext, paragraphsOf, requestCard } from '@/features/concierge/conciergeModel';
import { MockConciergeService } from '@/services/mock/MockConciergeService';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestRecordSource, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}`}`);
};

const R = IDS.reservation;
const G = IDS.guest;
const CONTEXT: GuestContext = { guestRef: 'pseudonym', preferredName: 'Alexander', phase: 'prepare', tierLabel: 'Titanium Elite', upcomingBookingIds: [], occasionsThisVoyage: ['anniversary'], locale: 'en-US' };

/** The mock clock follows `?now=` (as on web); set it for a scenario. */
function at(now?: string) {
  (globalThis as { location?: { search: string } }).location = { search: now ? `?now=${encodeURIComponent(now)}` : '' };
}

function world() {
  const experience = new MockExperienceService();
  const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore()));
  const concierge = new MockConciergeService({ voyage: new MockVoyageService(), experience, loyalty: new MockLoyaltyService(), profile, personalization: new MockPersonalizationService() });
  return { experience, profile, concierge };
}

async function ask(w: ReturnType<typeof world>, body: string) {
  const { conversationId } = await w.concierge.openConversation(R);
  const replies = await w.concierge.sendMessage(conversationId, body, CONTEXT);
  return { conversationId, replies, reply: replies[0], text: replies.map((m) => m.body).join('\n\n'), att: replies.flatMap((m) => m.attachments ?? []) };
}

const actionsOf = (att: ConciergeAttachment[]) => att.flatMap((a) => (a.kind === 'actions' ? a.actions : []));
const cards = (att: ConciergeAttachment[], kind: ConciergeAttachment['kind']) => att.filter((a) => a.kind === kind);
const clean = (ms: ConciergeMessage[]) => !/undefined|NaN|\[object|null\b/.test(JSON.stringify(ms));
const allReplies: ConciergeMessage[] = [];

async function main() {
  // ── 1 · The six suggested prompts ────────────────────────────────────────
  at();
  {
    const w = world();
    const { messages } = await w.concierge.openConversation(R);
    const opening = messages.at(-1)!;
    const prompts = ['What is planned for tomorrow?', 'Move my dinner reservation.', 'What private experiences are available in Monte Carlo?', 'Arrange transportation.', 'What benefits do I have?', 'Help me celebrate my anniversary.'];
    check('opening offers the six suggested prompts', JSON.stringify(opening.suggestions) === JSON.stringify(prompts), opening.suggestions);
    check('opening greets the guest and names the embarkation', /Alexander\. Everything is in hand for Barcelona on Saturday 15 May/.test(opening.body), opening.body);
    const bridge = (opening.attachments ?? []).find((a) => a.kind === 'actions' && a.subject?.requestId === 'dev_srq_bridge');
    check('opening suggests settling the request awaiting the guest (bridge times)', bridge?.kind === 'actions' && bridge.actions.map((a) => a.label).join() === '16:30,17:30', bridge);
    check('opening suggests the document that is due', actionsOf(opening.attachments ?? []).some((a) => a.kind === 'open' && a.route === '/voyage?section=documents'));
    const expected = ['schedule.query', 'dining.modify', 'experience.discover', 'transport.arrange', 'loyalty.benefits', 'occasion.plan'];
    for (const [i, q] of prompts.entries()) {
      const r = await ask(w, q);
      allReplies.push(...r.replies);
      check(`"${q}" → ${expected[i]}`, r.reply?.intent === expected[i], r.reply?.intent);
    }
  }

  // ── 2 · Tomorrow, judged from now ────────────────────────────────────────
  at(); // 11 May, at home in Miami
  {
    const r = await ask(world(), 'What is planned for tomorrow?');
    allReplies.push(...r.replies);
    check('pre-voyage tomorrow is Wednesday 12 May, at home', /Tomorrow, Wednesday 12 May, you are still at home in Miami/.test(r.text), r.text);
    check('… mentions the questionnaire due on the 13th', /health questionnaire is due by Thursday 13 May/.test(r.text), r.text);
    check('… and the flight that starts the journey', /AA 7412 leaves Miami at 18:40/.test(r.text), r.text);
    check('… with day one attached and a way to complete the document', cards(r.att, 'schedule').some((a) => a.kind === 'schedule' && a.dayNumber === 1) && actionsOf(r.att).some((a) => a.kind === 'open'));
  }
  at('2027-05-18T09:00:00+02:00'); // Saint-Tropez; tomorrow is Monte Carlo
  {
    const w = world();
    const r = await ask(w, 'What should I do tomorrow?');
    allReplies.push(...r.replies);
    check('"What should I do tomorrow?" uses tomorrow’s itinerary (Monte Carlo, day 5)', /Tomorrow, Wednesday 19 May, Evrima is overnight in Monte Carlo, alongside from 08:00/.test(r.text) && cards(r.att, 'schedule').some((a) => a.kind === 'schedule' && a.dayNumber === 5), r.text);
    const day5 = d.experiences.bookings.filter((b) => b.start.startsWith('2027-05-19'));
    check('… lists every booking that day with its time', day5.every((b) => r.text.includes(`${b.start.slice(11, 16)} — ${b.title}`)), r.text);
    check('… notes the window table (dining preference)', /Dinner at Lumière, at your window table/.test(r.text));
    check('… leads with suggestions when asked what to do', r.text.indexOf('I would suggest') < r.text.indexOf('Already arranged'));
    check('… personalised suggestions carry their reason', /chosen with you in mind/.test(r.text) && /Should you wish to mark the twentieth/.test(r.text), r.text);
    const offers = actionsOf(r.att).filter((a): a is Extract<ConciergeAction, { kind: 'request-experience' }> => a.kind === 'request-experience');
    const booked = new Set(d.experiences.bookings.map((b) => b.experienceId));
    check('… never suggests something already booked', offers.length > 0 && offers.every((a) => !booked.has(a.experienceId)), offers);
    const busy = day5.map((b) => [Date.parse(b.start), b.end ? Date.parse(b.end) : Date.parse(b.start) + 2.5 * 3_600_000]);
    check('… offers only times that fit around the bookings', offers.every((a) => busy.every(([s, e]) => Date.parse(a.start) >= e! || Date.parse(a.start) < s!)), offers.map((a) => a.start));
    check('… practical notes: sunset and dress code', /Sunset is at 20:50/.test(r.text) && /Dress code this evening: evening elegant/.test(r.text));
    check('… suggests asking about the next day', r.reply?.suggestions?.includes('What is planned for Thursday 20 May?') === true, r.reply?.suggestions);

    // Preferences change the answer.
    const prefs = (await w.profile.getPreferences(G)).preferences;
    await w.profile.updatePreferences(G, { dining: { ...prefs.dining, tablePreference: 'terrace' }, privacy: { ...prefs.privacy, personalisedRecommendations: false } });
    const r2 = await ask(w, 'What should I do tomorrow?');
    check('with personalisation off, suggestions carry no personal reasons', !/chosen with you in mind|Should you wish to mark the twentieth/.test(r2.text), r2.text);
    check('with a terrace preference, the window-table note goes', !/window table/.test(r2.text));
  }
  at('2027-05-17T08:00:00+02:00');
  {
    const r = await ask(world(), "What's on today?");
    check('"today" during the voyage is the sea day', /Today, Monday 17 May, Evrima is at sea all day/.test(r.text), r.text);
    const r2 = await ask(world(), 'What is planned on the 21st?');
    check('a named date resolves (Portofino, by tender)', /On Friday 21 May, Evrima is at anchor off Portofino from 08:30, ashore by tender; all aboard is at 18:00/.test(r2.text), r2.text);
  }

  // ── 3 · Moving dinner, for real ──────────────────────────────────────────
  at();
  {
    const w = world();
    const r = await ask(w, 'Move my dinner reservation.');
    allReplies.push(...r.replies);
    check('dinner: the next dinner, with its venue and table', /You are at Mediterraneo on Saturday 15 May at 20:30, at your window table/.test(r.text), r.text);
    const moves = actionsOf(r.att).filter((a) => a.kind === 'change-booking');
    check('dinner: offers the free times that evening', moves.map((a) => a.label).join() === 'Move to 19:30,Move to 21:00', moves);
    const r2 = await ask(w, '21:00, please');
    allReplies.push(...r2.replies);
    const moved = (await w.experience.listBookings(R)).find((b) => b.id === 'dev_bkg_dinner_1');
    check('"21:00, please" moves the booking in the Experience service', moved?.start === '2027-05-15T21:00:00+02:00' && moved.status === 'confirmed', moved);
    check('… and confirms it with a reservation card', cards(r2.att, 'confirmation').some((a) => a.kind === 'confirmation' && a.status === 'confirmed' && a.bookingId === 'dev_bkg_dinner_1' && Boolean(a.reference)), r2.att);
    const requests = await w.concierge.listServiceRequests(R);
    check('… and records it as a confirmed request', requests.some((q) => q.bookingId === 'dev_bkg_dinner_1' && q.status === 'confirmed' && q.type === 'dining-change'));
    const r3 = await ask(w, 'Move my dinner on 20 May');
    check('the private anniversary dinner goes to the Suite Ambassador, not a slot list', actionsOf(r3.att).some((a) => a.kind === 'escalate' && a.to === 'suite-ambassador') && !actionsOf(r3.att).some((a) => a.kind === 'change-booking'), r3.text);
    const r4 = await ask(w, 'Move my dinner on Sunday 16 May to 23:00');
    check('an unavailable time is said plainly, with alternatives', /23:00 isn't available at Lumière/.test(r4.text) && actionsOf(r4.att).some((a) => a.kind === 'change-booking'), r4.text);
  }

  // ── 4 · Discover, transport, benefits, occasion ──────────────────────────
  at('2027-05-18T09:00:00+02:00');
  {
    const w = world();
    const r = await ask(w, 'What private experiences are available in Monte Carlo?');
    allReplies.push(...r.replies);
    check('Monte Carlo: unbooked private experience offered with times', actionsOf(r.att).some((a) => a.kind === 'request-experience' && a.experienceId === 'dev_exp_monaco_atelier'), r.att);
    check('… names what is already arranged there', /Already arranged: .*(Villa Ephrussi.*Oceanographic|Oceanographic.*Villa Ephrussi)/.test(r.text), r.text);
    check('… for the party, by name', /for you and Camille/.test(r.text));
    check('… transfers are not "experiences"', !/Helicopter/.test(r.text));

    const t = await ask(w, 'Arrange transportation.');
    allReplies.push(...t.replies);
    check('transport: confirmed transfers and tracked flight', /Private departure transfer/.test(t.text) && /tracking AA 7419/.test(t.text), t.text);
    check('… knows the helicopter is already requested (no second offer)', /request for the helicopter along the coast has been received/.test(t.text) && !actionsOf(t.att).some((a) => a.kind === 'service-request' && /Helicopter/.test(a.summary)), t.text);
    const car = actionsOf(t.att).find((a) => a.kind === 'service-request' && /Private car in Portofino/.test(a.summary));
    check('… offers a car where none is arranged, carrying the guest’s note', car?.kind === 'service-request' && /sedan/.test(car.details ?? ''), car);

    const b = await ask(w, 'What benefits do I have?');
    allReplies.push(...b.replies);
    check('benefits: tier, lifetime status and the fourth voyage', /Titanium Elite member \(Lifetime Platinum Elite\), returning for your fourth voyage/.test(b.text), b.text);
    check('… the voyage’s privileges, as a card', cards(b.att, 'privileges').some((a) => a.kind === 'privileges' && a.privilegeIds.length === d.guest.privileges.length));
    check('… recognition is not points', !/points/i.test(b.text));

    const o = await ask(w, 'Help me celebrate my anniversary.');
    allReplies.push(...o.replies);
    check('anniversary: date, port and countdown', /20th wedding anniversary is on Thursday 20 May, in Monte Carlo, 2 days from now/.test(o.text), o.text);
    check('… discreet, as recorded', /quietly, as you prefer/.test(o.text));
    check('… what is in place that day', /16:00 — Couples terrace ritual/.test(o.text) && /Anniversary dinner on a private terrace \(being arranged\)/.test(o.text), o.text);
    check('… ideas, flowers and the Suite Ambassador as actions', actionsOf(o.att).some((a) => a.kind === 'request-experience' && a.experienceId === 'dev_exp_monaco_atelier') && actionsOf(o.att).some((a) => a.kind === 'service-request' && a.type === 'occasion') && actionsOf(o.att).some((a) => a.kind === 'escalate' && a.to === 'suite-ambassador'));
    const prefs = (await w.profile.getPreferences(G)).preferences;
    await w.profile.updatePreferences(G, { privacy: { ...prefs.privacy, shareOccasionsWithCrew: false } });
    const o2 = await ask(w, 'Help me celebrate my anniversary.');
    check('… respects "don’t tell the crew"', /Your crew have not been told about the occasion/.test(o2.text), o2.text);
  }

  // ── 5 · Requests and their status ────────────────────────────────────────
  at();
  {
    const w = world();
    const r = await ask(w, 'What is the status of Bridge visit on the sea day, 17 May?');
    allReplies.push(...r.replies);
    const times = actionsOf(r.att).filter((a): a is Extract<ConciergeAction, { kind: 'request-experience' }> => a.kind === 'request-experience' && a.requestId === 'dev_srq_bridge');
    check('status: the awaiting request offers its times', times.map((a) => a.label).join() === '16:30,17:30', r.att);
    const done = await w.concierge.performAction(r.conversationId, times[1]!);
    allReplies.push(...done);
    const bridge = (await w.experience.listBookings(R)).find((b) => b.experienceId === 'dev_exp_bridge');
    check('choosing 17:30 books the bridge visit (included, so confirmed)', bridge?.start === '2027-05-17T17:30:00+02:00' && bridge.status === 'confirmed', bridge);
    check('… and closes the waiting request', (await w.concierge.getServiceRequest('dev_srq_bridge')).status === 'confirmed');
    const heli = await ask(w, 'Any news on the helicopter?');
    check('status by keyword finds the helicopter request', /Helicopter to Nice/.test(heli.text) && cards(heli.att, 'service-request').length === 1, heli.text);

    const paid = await w.concierge.performAction(r.conversationId, { kind: 'request-experience', label: 'Request', experienceId: 'dev_exp_wine_masterclass', start: '2027-05-17T15:00:00+02:00', partySize: 2 });
    const conf = paid[0]?.attachments?.[0];
    check('a paid experience is requested and handed to a person', conf?.kind === 'confirmation' && conf.status === 'received' && /Elena is arranging it and will confirm by/.test(paid[0]!.body), paid[0]);
    const wait = await w.concierge.performAction(r.conversationId, { kind: 'request-experience', label: 'Request', experienceId: 'dev_exp_helicopter', start: '2027-05-19T12:00:00+02:00', partySize: 2 });
    check('a waitlisted experience becomes a request, not a booking', !(await w.experience.listBookings(R)).some((b) => b.experienceId === 'dev_exp_helicopter') && wait[0]?.attachments?.[0]?.kind === 'confirmation');
  }

  // ── 6 · People ───────────────────────────────────────────────────────────
  at();
  {
    const w = world();
    const r = await ask(w, 'Can Elena call me?');
    allReplies.push(...r.replies);
    const h = cards(r.att, 'handoff')[0];
    check('naming the ambassador hands over to the Suite Ambassador', h?.kind === 'handoff' && h.to === 'suite-ambassador' && h.agentName === 'Elena, Suite Ambassador' && h.expectedResponseMinutes === 5, h);
    const joined = await new Promise<ConciergeMessage | undefined>((done) => {
      const stop = w.concierge.subscribe(r.conversationId, (m) => {
        stop();
        done(m);
      });
      setTimeout(() => done(undefined), 4000);
    });
    check('… Elena joins the conversation as a person', joined?.author === 'human' && /it's Elena/.test(joined.body) && joined.authorName === 'Elena, Suite Ambassador', joined);
    check('… the hand-off is a request, now being handled', (await w.concierge.listServiceRequests(R)).some((q) => q.summary === 'Speak with Elena' && q.status === 'in_progress'));

    const team = await ask(w, 'I would like to speak to a real person');
    check('asking for a person before the voyage reaches the shoreside team', cards(team.att, 'handoff').some((a) => a.kind === 'handoff' && a.to === 'concierge-team' && a.agentName === 'Marco, Shoreside Concierge'), team.att);
    const medical = await ask(w, 'I feel unwell');
    check('medical goes to the Medical Centre, urgently, with emergency advice', cards(medical.att, 'handoff').some((a) => a.kind === 'handoff' && a.to === 'medical') && /local emergency number/.test(medical.text) && (await w.concierge.listServiceRequests(R)).some((q) => q.type === 'medical' && q.priority === 'urgent'), medical.text);
    const miss1 = await ask(w, 'blue bananas');
    check('an unclear request offers a person rather than guessing', actionsOf(miss1.att).filter((a) => a.kind === 'escalate').length === 2 && cards(miss1.att, 'handoff').length === 0);
    const miss2 = await ask(w, 'purple elephants');
    check('a second unclear request goes straight to a person', cards(miss2.att, 'handoff').some((a) => a.kind === 'handoff' && a.to === 'concierge-team'), miss2.text);
  }
  at('2027-05-18T09:00:00+02:00');
  {
    const r = await ask(world(), 'Can I speak with someone from the team?');
    check('aboard, the team is Guest Services', cards(r.att, 'handoff').some((a) => a.kind === 'handoff' && a.agentName === 'Sofia, Guest Services'), r.att);
    const m = await ask(world(), 'There is an emergency, I need a doctor');
    check('aboard, emergency advice is the suite telephone', /red key on any suite telephone/.test(m.text), m.text);
  }

  check('no reply contains unresolved values', clean(allReplies), allReplies.map((m) => m.body).filter((b) => /undefined|NaN|\[object/.test(b)));

  // ── 7 · View model ───────────────────────────────────────────────────────
  at();
  {
    const p = paragraphsOf('Already arranged:\n• 08:30 — Museum\n• Flowers\n\nSunset is at 20:50.');
    check('replies split into a timed list and text', p[0]?.type === 'list' && p[0].heading === 'Already arranged:' && p[0].items[0]?.time === '08:30' && p[0].items[1]?.time === undefined && p[1]?.type === 'text', p);
    const w = world();
    const { messages, conversationId } = await w.concierge.openConversation(R);
    const r = await w.concierge.sendMessage(conversationId, 'Move my dinner reservation.', CONTEXT);
    const overview = await new MockVoyageService().getOverview(R);
    const base = { overview, catalogue: d.experiences.catalogue, days: d.experiences.daySchedules, privileges: d.guest.privileges, requests: await w.concierge.listServiceRequests(R), bookings: await w.experience.listBookings(R), phase: 'prepare' as const };
    const now = new Date(d.meta.referenceNow);
    const action = actionsOf(r.flatMap((m) => m.attachments ?? [])).find((a) => a.kind === 'change-booking')!;
    const m1 = buildConciergeModel({ ...base, messages: [...messages, ...r] }, { performed: new Set(), sending: false, now });
    const card1 = m1.thread.find((t) => t.kind === 'card' && t.card.type === 'action' && t.card.buttons.some((b) => b.key === actionKey(action)));
    check('action card buttons start idle', card1?.kind === 'card' && card1.card.type === 'action' && card1.card.buttons.every((b) => b.state === 'idle'));
    const m2 = buildConciergeModel({ ...base, messages: [...messages, ...r] }, { performed: new Set([actionKey(action)]), sending: false, now });
    const card2 = m2.thread.find((t) => t.kind === 'card' && t.card.type === 'action' && t.card.buttons.some((b) => b.key === actionKey(action)));
    check('after the tap: that button is done, the others disabled', card2?.kind === 'card' && card2.card.type === 'action' && card2.card.resolved && card2.card.buttons.filter((b) => b.state === 'done').length === 1 && card2.card.buttons.filter((b) => b.state === 'disabled').length === 1);
    check('history is grouped under day dividers', m1.thread.filter((t) => t.kind === 'divider').map((t) => (t.kind === 'divider' ? t.label : '')).join('|') === 'Monday 26 April|Today', m1.thread.filter((t) => t.kind === 'divider'));
    check('people are named and distinct (ambassador, team, medical)', m1.people.map((p) => p.to).join() === 'suite-ambassador,concierge-team,medical' && m1.people[0]!.title === 'Elena, your Suite Ambassador');
    check('quick replies come from the last reply, and hide while sending', m1.quickReplies.length > 0 && buildConciergeModel({ ...base, messages: [...messages, ...r] }, { performed: new Set(), sending: true, now }).quickReplies.length === 0);
    check('requests split into open and completed', m1.requests.open.length === 4 && m1.requests.closed.length === 3 && m1.requests.attention === 1, m1.requests);
    const steps = requestCard(d.concierge.requests[0]!, now).steps.map((s) => `${s.label}:${s.state}`).join();
    check('request status steps', steps === 'Received:done,Being arranged:current,Confirmed:todo', steps);
    const profile = await new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore())).getProfile(G);
    const ctx = buildGuestContext({ guestId: G, phase: 'sail', overview, profile, recognition: await new MockLoyaltyService().getRecognition(G, IDS.voyage), bookings: base.bookings, now: new Date('2027-05-19T10:00:00+02:00') });
    check('guest context knows the day and port aboard', ctx.currentDay === 5 && ctx.currentPort === 'Monte Carlo' && ctx.occasionsThisVoyage.join() === 'anniversary', ctx);
    check('guest context carries no contact details', !/@|\+1|•/.test(JSON.stringify(ctx)), ctx);
  }

  // ── 8 · No answers in the UI ─────────────────────────────────────────────
  const dir = resolve(__dirname, '../src/features/concierge');
  const ui = readdirSync(join(dir, 'components')).map((f) => readFileSync(join(dir, 'components', f), 'utf8')).concat(readFileSync(join(dir, 'ConciergeScreen.tsx'), 'utf8'));
  const leaks = ['Mediterraneo', 'Elena', 'Monte Carlo', 'What is planned', 'Barcelona', 'anniversary', 'Titanium'].filter((w) => ui.some((src) => src.includes(w)));
  check('concierge UI components hold no answers, names or places', leaks.length === 0, leaks);

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Concierge: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Concierge: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
