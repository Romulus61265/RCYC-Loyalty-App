/**
 * Home dashboard view-model checks.  Run: `npm run check:home`
 *
 * Builds the Home view model from the mock services at several moments of
 * the journey, and with empty / failing optional data, and asserts what the
 * guest would see. No device or simulator needed.
 */
import { AppError } from '@/core/errors/AppError';
import { buildHomeViewModel, type HomeCoreData, type HomeOptionalData, type HomeViewModel } from '@/features/home/homeModel';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestProfileService, MockJourneyEventService, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { devDataset, IDS } from '@/data/fixtures';

const voyage = new MockVoyageService();
const loyalty = new MockLoyaltyService();
const experience = new MockExperienceService();
const profileSvc = new MockGuestProfileService();
const events = new MockJourneyEventService();
const personalization = new MockPersonalizationService();

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : ` — got ${JSON.stringify(detail)}`}`);
};

async function load() {
  const [overview, recognition, profile] = await Promise.all([
    voyage.getOverview(IDS.reservation),
    loyalty.getRecognition(IDS.guest, IDS.voyage),
    profileSvc.getProfile(IDS.guest),
  ]);
  const core: HomeCoreData = { overview, recognition, profile };
  const optional: HomeOptionalData = {
    bookings: { ok: true, value: await experience.listBookings(IDS.reservation) },
    schedules: { ok: true, value: await experience.listDaySchedules(IDS.reservation) },
    catalogue: { ok: true, value: await experience.listCatalogue(IDS.voyage) },
    alerts: { ok: true, value: await events.listAlerts(IDS.reservation) },
    recommendations: { ok: true, value: await personalization.getRecommendations(IDS.guest, 'home', { limit: 3 }) },
  };
  return { core, optional };
}

async function at(iso: string, optionalOverride?: Partial<HomeOptionalData>): Promise<HomeViewModel> {
  const now = new Date(iso);
  const { core, optional } = await load();
  const phase = await voyage.getJourneyPhase(IDS.reservation, now);
  return buildHomeViewModel(core, { ...optional, ...optionalOverride }, phase, now);
}

const noBlanks = (name: string, vm: HomeViewModel) => {
  const json = JSON.stringify(vm);
  check(`${name}: no undefined/NaN text`, !/"[^"]*(undefined|NaN)[^"]*"/.test(json), json.match(/"[^"]*(undefined|NaN)[^"]*"/)?.[0]);
};

async function main() {
  // 1 · Preparing (dataset reference moment: 11 May 2027, 09:00 Miami)
  const prep = await at(devDataset.meta.referenceNow);
  check('prepare: greets Alexander', prep.hero.greeting.endsWith(', Alexander'), prep.hero.greeting);
  check('prepare: phase label', prep.hero.phaseLabel === 'Preparing for your voyage', prep.hero.phaseLabel);
  check('prepare: countdown 3 days', prep.hero.headline === '3 days until Barcelona' && prep.hero.countdown?.days === 3, prep.hero.headline);
  check('prepare: journey step is Prepare', prep.hero.steps.find((s) => s.state === 'current')?.key === 'prepare');
  check('prepare: Bonvoy Titanium Elite', prep.recognition.tierLabel === 'Titanium Elite' && /fourth voyage/.test(prep.recognition.line), prep.recognition.line);
  check('prepare: yacht Evrima', prep.yacht.name === 'Evrima');
  check('prepare: Grand Suite 612 with ambassador', prep.suite.title === 'Grand Suite 612' && prep.suite.ambassador === 'Elena Moreau', prep.suite);
  check('prepare: embarkation shown', prep.embarkation?.windowLabel === '13:30 – 14:00' && prep.embarkation.terminal === 'Port Vell Yacht Terminal', prep.embarkation);
  check('prepare: next is the arrival transfer', prep.next?.title === 'Private arrival transfer', prep.next?.title);
  check('prepare: next merges into the arrival section (no duplicate card)', prep.nextIsArrival === true);
  check('prepare: transfer tracks AA 7412', prep.transfer?.flight?.label === 'AA 7412 · MIA → BCN' && prep.transfer.status.label === 'Confirmed', prep.transfer);
  const [dining, shore, spa] = prep.arranged;
  check('prepare: dining = Mediterraneo, +6 more (7 dinners)', dining?.item?.title === 'Dinner at Mediterraneo' && dining.more === 6, dining);
  check('prepare: ashore = Sagrada Família', shore?.item?.title === 'The Sagrada Família, privately', shore?.item?.title);
  check('prepare: spa = deep tissue', spa?.item?.title === 'Deep-tissue recovery massage', spa?.item?.title);
  check('prepare: 3 recommendations, none already booked', prep.recommendations.length === 3, prep.recommendations.map((r) => r.title));
  check('prepare: 3 alerts', prep.alerts.length === 3, prep.alerts.length);
  check('prepare: concierge mentions the anniversary', /20th wedding anniversary/.test(prep.concierge.prompt), prep.concierge.prompt);
  check('prepare: no section errors', Object.keys(prep.errors).length === 0, prep.errors);
  noBlanks('prepare', prep);

  // 2 · Travel day (morning of embarkation, in Barcelona)
  const travel = await at('2027-05-15T08:00:00+02:00');
  check('travel: phase', travel.hero.phaseLabel === 'On your way to the yacht', travel.hero.phaseLabel);
  check('travel: headline Today, Barcelona', travel.hero.headline === 'Today, Barcelona', travel.hero.headline);
  check('travel: embarkation is Today', travel.embarkation?.dateLabel === 'Today', travel.embarkation?.dateLabel);
  check('travel: transfer is Today 10:00', travel.transfer?.whenLabel === 'Today · 10:00', travel.transfer?.whenLabel);
  noBlanks('travel', travel);

  // 3 · Sailing, anniversary morning in Monte Carlo
  const sail = await at('2027-05-20T10:00:00+02:00');
  check('sail: phase', sail.hero.phaseLabel === 'At sea with us', sail.hero.phaseLabel);
  check('sail: headline Day 6 · Monte Carlo', sail.hero.headline === 'Day 6 · Monte Carlo', sail.hero.headline);
  check('sail: Prepare/Travel/Embark done, Sail current', sail.hero.steps.map((s) => s.state).join() === 'done,done,done,current,upcoming', sail.hero.steps.map((s) => s.state));
  check('sail: embarkation hidden', sail.embarkation === null);
  check('sail: next today is the couples ritual', sail.next?.heading === 'Next today' && sail.next.title === 'Couples terrace ritual', sail.next);
  check('sail: next is shown on its own', sail.nextIsArrival === false);
  check('sail: pre-voyage alerts have expired', sail.alerts.length === 0, sail.alerts.map((a) => a.title));
  check('sail: transfer is the departure', sail.transfer?.direction === 'departure');
  check('prepare: transfer is the arrival', prep.transfer?.direction === 'arrival');
  check('sail: dining = anniversary dinner, being arranged', sail.arranged[0]?.item?.title === 'Anniversary dinner on a private terrace' && sail.arranged[0].item.status.label === 'Being arranged', sail.arranged[0]);
  check('sail: transfer is the departure car with AA 7419', sail.transfer?.flight?.label === 'AA 7419 · FCO → MIA', sail.transfer?.flight);
  noBlanks('sail', sail);

  // 4 · After the voyage
  const after = await at('2027-05-24T09:00:00-04:00');
  check('after: headline', after.hero.headline === 'Until we meet again', after.hero.headline);
  check('after: final step current', after.hero.steps.at(-1)?.state === 'current');
  check('after: nothing next, no arrival', after.next === null && after.transfer === null && after.embarkation === null);
  check('after: arranged slots empty with hints', after.arranged.every((a) => a.item === null && a.emptyHint.length > 0));
  noBlanks('after', after);

  // 5 · Empty data
  const empty = await at(devDataset.meta.referenceNow, {
    bookings: { ok: true, value: [] },
    schedules: { ok: true, value: [] },
    alerts: { ok: true, value: [] },
    recommendations: { ok: true, value: [] },
  });
  check('empty: next is null', empty.next === null);
  check('empty: no transfer', empty.transfer === null);
  check('empty: arranged slots show hints', empty.arranged.every((a) => a.item === null) && /Elena can reserve/.test(empty.arranged[0]!.emptyHint), empty.arranged[0]?.emptyHint);
  check('empty: no alerts, no recommendations', empty.alerts.length === 0 && empty.recommendations.length === 0);
  check('empty: core sections intact', empty.hero.headline === '3 days until Barcelona' && empty.embarkation !== null);
  noBlanks('empty', empty);

  // 6 · Partial outage of optional sources
  const outage = new AppError('unavailable', 'test outage');
  const partial = await at(devDataset.meta.referenceNow, {
    bookings: { ok: false, error: outage },
    alerts: { ok: false, error: outage },
    recommendations: { ok: false, error: outage },
  });
  check('partial: "what\'s next" marked unknown rather than empty', partial.nextKnown === false && partial.next === null);
  check('empty: "what\'s next" is known to be empty', empty.nextKnown === true);
  check('partial: section errors reported', !!partial.errors.arranged && !!partial.errors.alerts && !!partial.errors.recommendations, Object.keys(partial.errors));
  check('partial: hero, recognition, voyage still present', partial.hero.headline === '3 days until Barcelona' && partial.recognition.tierLabel === 'Titanium Elite' && partial.suite.title === 'Grand Suite 612');
  noBlanks('partial', partial);

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`${failures.join('\n')}\n\n${failures.length} of ${total} Home checks failed.`);
    process.exit(1);
  }
  console.log(`✔ Home view model: all ${total} checks passed.`);
}

void main();
