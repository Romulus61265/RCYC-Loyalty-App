/// <reference types="node" />
/**
 * Special-occasion checks.  Run: `npm run check:occasions`
 *
 * Detection of every kind (birthday, anniversary, honeymoon, milestone
 * voyage, Bonvoy milestone) and of nothing else; the fictional guest's
 * anniversary plan (message, private dining, wine and sommelier, suite
 * amenity, private shore experience, concierge assistance); privacy and the
 * party; and that nothing is ever requested or booked without the guest's
 * explicit approval, with any charge acknowledged.
 */
import type { CelebrationInput } from '@/services/occasions/celebrations';
import type { ExperienceBooking, GuestServiceRequest, NewServiceRequest } from '@/domain';
import { devDataset as d, IDS } from '@/data/fixtures';
import { buildCelebrationModel, celebrationCard } from '@/features/celebrations/celebrationModel';
import { ServiceError, type Services } from '@/services/contracts';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockGuestRecordSource } from '@/services/mock/MockMiscServices';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockServiceRequestService } from '@/services/mock/MockServiceRequestService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { mockNow } from '@/services/mock/support';
import { detectCelebrations, numberWord, ordinalWord, planCelebration, PLAYBOOKS } from '@/services/occasions/celebrations';
import { ComposedOccasionService } from '@/services/occasions/ComposedOccasionService';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { toGuestRequest } from '@/services/shared/serviceRequests';

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

const NOW = new Date(d.meta.referenceNow);
const ANNIV = 'anniversary:dev_occ_anniv_20';
const ctx = { guest: { id: IDS.guest, name: 'Alexander Laurent' }, voyage: { id: IDS.voyage, name: d.voyage.voyage.name }, where: 'home' as const };

function input(edit?: (i: CelebrationInput) => void): CelebrationInput {
  const p = structuredClone(d.guest.profile);
  const i: CelebrationInput = {
    now: NOW,
    guest: { id: p.guest.id, firstName: p.guest.firstName, preferredName: p.guest.preferredName },
    companions: p.companions,
    occasions: p.occasions,
    preferences: p.preferences,
    membership: structuredClone(d.guest.membership),
    relationship: structuredClone(d.guest.relationship),
    voyage: d.voyage.voyage,
    yachtName: d.voyage.yacht.name,
    ambassador: { firstName: 'Elena', title: 'Suite Ambassador' },
    catalogue: d.experiences.catalogue,
    availability: d.experiences.availability,
    bookings: structuredClone(d.experiences.bookings),
    requests: d.concierge.requests.map((r) => toGuestRequest(r, ctx)),
  };
  edit?.(i);
  return i;
}
const plan = (i: CelebrationInput, key = ANNIV) => {
  const c = detectCelebrations(i).find((x) => x.key === key);
  return c ? planCelebration(c, i) : undefined;
};

async function main() {
  // ─── Detection ──────────────────────────────────────────────────────────
  {
    const found = detectCelebrations(input());
    const a = found[0];
    check('the fictional guest: exactly one celebration, the anniversary', found.length === 1 && a?.kind === 'anniversary', found);
    check('… on 20 May, day 6, in Monte Carlo', a?.date === '2027-05-20' && a.dayNumber === 6 && a.port === 'Monte Carlo' && !a.atSea);
    check('… the 20th, discreetly, for Alexander and Camille', a?.ordinal === 20 && a.recognition === 'discreet' && a.people.join() === 'Alexander,Camille');
    check('the birthday in September is not during the voyage', !found.some((c) => c.kind === 'birthday'));
    check('a private occasion is never detected', detectCelebrations(input((i) => i.occasions.forEach((o) => (o.recognition = 'private')))).length === 0);
    check('an occasion recurs yearly: an older date still matches', detectCelebrations(input((i) => (i.occasions[0]!.date = '2007-05-20'))).some((c) => c.kind === 'anniversary' && c.date === '2027-05-20'));
    check('past celebrations are not offered', detectCelebrations(input((i) => (i.now = new Date('2027-05-21T08:00:00+02:00')))).length === 0);

    const bday = detectCelebrations(input((i) => (i.occasions[1]!.date = '2027-05-17')));
    check('birthday during the voyage (a sea day)', bday.some((c) => c.kind === 'birthday' && c.date === '2027-05-17' && c.atSea && c.people[0] === 'Alexander'), bday);
    const honeymoon = detectCelebrations(input((i) => i.occasions.push({ id: 'occ_honey', type: 'honeymoon', label: 'Honeymoon', date: '2027-05-15', personIds: [IDS.guest, IDS.companion], recognition: 'celebrate' })));
    check('honeymoon', honeymoon.some((c) => c.kind === 'honeymoon' && c.date === '2027-05-15' && c.port === 'Barcelona'));
    const fifth = detectCelebrations(input((i) => (i.relationship!.voyagesCompleted = 4)));
    check('milestone voyage: the fifth, from embarkation', fifth.some((c) => c.kind === 'milestone-voyage' && c.label === 'Your fifth voyage with us' && c.date === '2027-05-15'), fifth);
    const hundredth = detectCelebrations(input((i) => (i.relationship!.nightsSailed = 97)));
    check('milestone voyage: the 100th night, on the right evening', hundredth.some((c) => c.label === 'Your 100th night aboard with us' && c.date === '2027-05-17'), hundredth);
    const bonvoy = detectCelebrations(input((i) => (i.membership!.memberSince = '2012-05-19')));
    check('Bonvoy milestone: fifteen years, in five-year steps only', bonvoy.some((c) => c.kind === 'bonvoy-milestone' && c.label === 'Fifteen years with Marriott Bonvoy' && c.date === '2027-05-19') && !detectCelebrations(input((i) => (i.membership!.memberSince = '2013-05-19'))).some((c) => c.kind === 'bonvoy-milestone'));
    check('several at once, in date order', (() => {
      const many = detectCelebrations(input((i) => { i.relationship!.voyagesCompleted = 4; i.membership!.memberSince = '2012-05-19'; }));
      return many.length === 3 && many.every((c, k) => k === 0 || many[k - 1]!.date <= c.date);
    })());
    check('ordinal words', ordinalWord(5) === 'fifth' && ordinalWord(20) === 'twentieth' && ordinalWord(25) === 'twenty-fifth' && ordinalWord(100) === '100th' && numberWord(20) === 'twenty');
  }

  // ─── The anniversary plan ───────────────────────────────────────────────
  {
    const p = plan(input())!;
    const step = (k: string) => p.steps.find((s) => s.kind === k);
    check('message: “Twenty years”, dated and placed', p.message.title === 'Twenty years' && p.message.eyebrow === 'Thursday 20 May · Monte Carlo');
    check('message: personal, with the second day in Monte Carlo', p.message.body[0] === 'Alexander, your 20th wedding anniversary falls on Thursday 20 May, your second day in Monte Carlo.', p.message.body[0]);
    check('message: discreet, as asked; with Camille; nothing without a yes', /kept it between us/.test(p.message.body[1]!) && /with Camille/.test(p.message.body[2]!) && /Nothing is requested or charged unless you say so/.test(p.message.body[2]!));
    check('message: signed by the Suite Ambassador', p.message.signature === 'Elena, your Suite Ambassador');
    check('steps in playbook order', p.steps.map((s) => s.kind).join() === PLAYBOOKS.anniversary.join(), p.steps.map((s) => s.kind));
    const dining = step('private-dining');
    check('private dining: the terrace dinner, already being arranged', dining?.title === 'Dinner on a Private Terrace' && dining.state === 'in-hand' && dining.inHand?.label === 'Being arranged' && dining.time === '20:30' && !dining.proposal);
    const wine = step('wine');
    check('wine: a Barolo from the wedding year, with the sommelier, arranged', wine?.title === 'A 2007 Barolo, with the sommelier' && wine.state === 'in-hand' && wine.inHand?.label === 'Arranged' && /2007 Barolo Riserva/.test(wine.detail), wine);
    const amenity = step('suite-amenity');
    check('suite amenity: Champagne (their celebration wine) and flowers, quietly', amenity?.title === 'Champagne on ice, and flowers' && amenity.state === 'suggested' && /no card and no fuss/.test(amenity.detail), amenity);
    check('… proposed as a suite request, not a purchase', amenity?.proposal?.kind === 'service-request' && amenity.proposal.category === 'suite' && /Quietly, please: no card/.test(amenity.proposal.description) && !amenity.chargeable);
    const shore = step('private-shore');
    check('private shore: Villa Ephrussi in Monte Carlo, confirmed', shore?.title === 'Villa Ephrussi de Rothschild, Quietly' && shore.inHand?.label === 'Confirmed' && shore.destination === 'Monte Carlo');
    check('spa together: the couples ritual, confirmed', step('spa')?.inHand?.label === 'Confirmed' && step('spa')?.time === '16:00');
    const help = step('concierge');
    check('concierge assistance: Elena, to plan it together', help?.title === 'Elena, your Suite Ambassador' && help.proposal?.kind === 'service-request' && help.proposal.category === 'concierge' && help.actionLabel === 'Ask Elena to plan it with you');
    check('the plan says nothing is booked or charged without approval', /until you approve it/.test(p.assurance));
    const card = celebrationCard(p);
    check('Home card: four in hand, two more ideas', card.title === 'Twenty years' && card.line === '4 already in hand, 2 more ideas for the day.' && card.cta === 'Plan your anniversary', card);
    const vm = buildCelebrationModel(p, 2);
    check('screen: approval summary shows exactly what will be sent', vm.steps.find((s) => s.heading === 'In your suite')?.action?.summary.includes('Champagne on ice, and flowers in our suite on the morning of Thursday 20 May') === true);
  }

  // ─── When nothing is arranged yet ───────────────────────────────────────
  {
    const fresh = plan(input((i) => { i.bookings = i.bookings.filter((b) => !['dev_bkg_anniversary', 'dev_bkg_ephrussi', 'dev_bkg_couples'].includes(b.id)); i.requests = []; }))!;
    const dining = fresh.steps.find((s) => s.kind === 'private-dining')!;
    check('private dining: the open terrace that evening, to request', dining.state === 'suggested' && dining.proposal?.kind === 'request-experience' && dining.proposal.start === '2027-05-20T20:30:00+02:00' && dining.actionLabel === 'Request 20:30');
    check('… with its price, and a charge to acknowledge', dining.price === '€1,200' && dining.chargeable, dining.price);
    const wine = fresh.steps.find((s) => s.kind === 'wine')!;
    check('wine: proposed from their favourite, the wedding year, priced by the sommelier first', wine.title === 'A 2007 Barolo, with the sommelier' && /from 2007, the year you married/.test(wine.detail) && wine.proposal?.kind === 'service-request' && !wine.chargeable);
    const shore = fresh.steps.find((s) => s.kind === 'private-shore')!;
    check('shore: a private experience in Monte Carlo that day', shore.state === 'suggested' && shore.destination === 'Monte Carlo' && Boolean(shore.experienceId));
    check('nothing in the plan is in hand yet', fresh.steps.every((s) => s.state === 'suggested'));
  }

  // ─── Privacy and the party ──────────────────────────────────────────────
  {
    const off = plan(input((i) => (i.preferences.privacy.personalisedRecommendations = false)))!;
    check('personalisation off: the message and a person only', off.steps.map((s) => s.kind).join() === 'concierge' && Boolean(off.message.title));
    const quiet = plan(input((i) => { i.preferences.privacy.shareOccasionsWithCrew = false; i.requests = []; }))!;
    check('occasions not shared with crew: requests don’t say why', quiet.steps.every((s) => !s.proposal || s.proposal.kind !== 'service-request' || !/anniversary/i.test(s.proposal.description)), quiet.steps.map((s) => s.proposal));
    const minors = plan(input((i) => { i.companions.push({ id: 'c2', firstName: 'Léa', lastName: 'Laurent', relationship: 'child', isMinor: true }); i.requests = []; }))!;
    check('a minor in the party: no Champagne in the suite', !/Champagne/.test(minors.steps.find((s) => s.kind === 'suite-amenity')!.title));
    const cake = plan(input((i) => { i.occasions[1]!.date = '2027-05-17'; i.preferences.dietary.allergies = [{ allergen: 'nut', severity: 'allergy' }]; }), 'birthday:dev_occ_bday_alexander')!;
    check('birthday: a cake that respects their dietary needs', /small cake \(nut-free\)/.test(cake.steps.find((s) => s.kind === 'suite-amenity')!.title));
    check('birthday: no shore step on a sea day', !cake.steps.some((s) => s.kind === 'private-shore') && cake.message.title === 'Happy birthday, Alexander');
  }

  // ─── Every kind is planned by the same machinery ────────────────────────
  {
    const i = input((x) => {
      x.occasions[1]!.date = '2027-05-17';
      x.occasions.push({ id: 'occ_honey', type: 'honeymoon', label: 'Honeymoon', date: '2027-05-15', personIds: [IDS.guest, IDS.companion], recognition: 'celebrate' });
      x.relationship!.voyagesCompleted = 4;
      x.membership!.memberSince = '2012-05-19';
    });
    const plans = detectCelebrations(i).map((c) => planCelebration(c, i));
    const kinds = new Set(plans.map((p) => p.celebration.kind));
    check('all five kinds detected and planned', ['birthday', 'anniversary', 'honeymoon', 'milestone-voyage', 'bonvoy-milestone'].every((k) => kinds.has(k as never)), [...kinds]);
    check('each plan: a message and at least two steps', plans.every((p) => p.message.title && p.message.body.length >= 2 && p.steps.length >= 2));
    check('each step: heading, title and a full sentence', plans.flatMap((p) => p.steps).every((s) => s.heading && s.title && /[.!?”]$/.test(s.detail)), plans.flatMap((p) => p.steps).filter((s) => !/[.!?”]$/.test(s.detail)).map((s) => s.detail));
    const milestone = plans.find((p) => p.celebration.kind === 'milestone-voyage')!;
    check('milestone voyage: signed by the Captain and crew, with the bridge', milestone.message.signature === 'The Captain and crew of Evrima' && milestone.steps[0]?.kind === 'captain');
    check('… the bridge request already in hand is recognised', milestone.steps[0]?.state === 'in-hand' && milestone.steps[0]?.inHand?.label === 'Needs your reply');
  }

  // ─── Approval: nothing without a yes ────────────────────────────────────
  {
    const voyage = new MockVoyageService();
    const experience = new MockExperienceService();
    const submitted: NewServiceRequest[] = [];
    const created: GuestServiceRequest[] = [];
    const realRequests = new MockServiceRequestService({ voyage });
    const booked: string[] = [];
    // The anniversary dinner not yet arranged, so its step is a chargeable request.
    const exp = Object.assign(Object.create(experience) as MockExperienceService, {
      listBookings: async (r: string) => (await experience.listBookings(r)).filter((b: ExperienceBooking) => b.id !== 'dev_bkg_anniversary'),
      requestBooking: async (...a: Parameters<MockExperienceService['requestBooking']>) => {
        booked.push(a[1]);
        return experience.requestBooking(...a);
      },
    });
    const requests: Services['requests'] = {
      ...realRequests,
      listActive: async (r) => [...(await realRequests.listActive(r)).filter((x) => x.id !== 'dev_srq_anniv_dinner'), ...created],
      listHistory: (r) => realRequests.listHistory(r),
      submit: async (input) => {
        submitted.push(input);
        const r = await realRequests.submit(input);
        created.push(r);
        return r;
      },
      get: (id) => realRequests.get(id),
      close: (id) => realRequests.close(id),
      subscribe: (r, l) => realRequests.subscribe(r, l),
    };
    const svc = new ComposedOccasionService({ profile: new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore())), loyalty: new MockLoyaltyService(), voyage, experience: exp, requests, clock: { now: mockNow } });
    const G = IDS.guest;
    const R = IDS.reservation;

    const before = (await exp.listBookings(R)).length;
    const plans = await svc.listCelebrations(G, R);
    check('planning books and requests nothing', plans.length === 1 && submitted.length === 0 && booked.length === 0 && (await exp.listBookings(R)).length === before);
    const dinner = plans[0]!.steps.find((s) => s.kind === 'private-dining')!;
    check('the dinner is offered as a chargeable request', dinner.state === 'suggested' && dinner.chargeable && dinner.proposal?.kind === 'request-experience');

    check('no approval → refused', await rejects(svc.approveStep(G, R, ANNIV, { stepId: dinner.id } as never), 'validation'));
    check('approved: false → refused', await rejects(svc.approveStep(G, R, ANNIV, { stepId: dinner.id, approved: false } as never), 'validation'));
    check('a chargeable step without acknowledging the charge → refused', await rejects(svc.approveStep(G, R, ANNIV, { stepId: dinner.id, approved: true }), 'validation'));
    check('… and still nothing was booked', booked.length === 0);
    check('an unknown step → not found', await rejects(svc.approveStep(G, R, ANNIV, { stepId: `${ANNIV}:yacht-purchase`, approved: true }), 'not_found'));
    check('an unknown celebration → not found', await rejects(svc.approveStep(G, R, 'birthday:nope', { stepId: 'x', approved: true }), 'not_found'));

    const ok = await svc.approveStep(G, R, ANNIV, { stepId: dinner.id, approved: true, acknowledgedCharge: true, note: 'A quiet corner, please.' });
    const booking = (await exp.listBookings(R)).find((b) => b.id === ok.bookingId);
    check('approved with the charge acknowledged: a booking request, not a confirmed purchase', booked.length === 1 && booking !== undefined && booking.status === 'received', booking);
    check('… now in hand, requested', ok.step.state === 'in-hand' && ok.step.inHand?.label === 'Requested' && !ok.step.proposal);

    const amenityId = `${ANNIV}:suite-amenity`;
    const a = await svc.approveStep(G, R, ANNIV, { stepId: amenityId, approved: true, note: 'White flowers, please.' });
    check('the amenity becomes a suite request, tagged with its step, with the note', submitted.length === 1 && submitted[0]!.category === 'suite' && submitted[0]!.occasionStep === amenityId && /White flowers, please/.test(submitted[0]!.description) && Boolean(a.requestId));
    check('approving the same step again → refused', await rejects(svc.approveStep(G, R, ANNIV, { stepId: amenityId, approved: true }), 'conflict'));
    const after = await svc.getPlan(G, R, ANNIV);
    check('the plan now shows the amenity as requested', after.steps.find((s) => s.id === amenityId)?.inHand?.label === 'Requested');
    check('steps already in hand cannot be approved', await rejects(svc.approveStep(G, R, ANNIV, { stepId: `${ANNIV}:private-shore`, approved: true }), 'conflict'));
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Occasions: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Occasions: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
