/**
 * Voyage area checks.  Run: `npm run check:voyage`
 *
 * Builds the calendar (MockScheduleService) and the Voyage view model from
 * the mock services and asserts what each of the nine sections shows.
 */
import { AppError } from '@/core/errors/AppError';
import { devDataset, IDS } from '@/data/fixtures';
import { buildVoyageViewModel, parseSection, VOYAGE_SECTIONS, type VoyageOptionalData } from '@/features/voyage/voyageModel';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockGuestRecordSource, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { buildCalendar, MockScheduleService } from '@/services/mock/MockScheduleService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : ` — got ${JSON.stringify(detail)}`}`);
};

async function main() {
  const voyage = new MockVoyageService();
  const experience = new MockExperienceService();
  const [overview, profile, bookings, catalogue, recommendations, calendar] = await Promise.all([
    voyage.getOverview(IDS.reservation),
    new MockGuestRecordSource().getProfile(IDS.guest),
    experience.listBookings(IDS.reservation),
    experience.listCatalogue(IDS.voyage),
    new MockPersonalizationService().getRecommendations(IDS.guest, 'voyage', { limit: 20 }),
    new MockScheduleService().getCalendar(IDS.reservation),
  ]);
  const optional: VoyageOptionalData = {
    bookings: { ok: true, value: bookings },
    catalogue: { ok: true, value: catalogue },
    recommendations: { ok: true, value: recommendations },
    calendar: { ok: true, value: calendar },
  };
  const now = new Date(devDataset.meta.referenceNow);
  const vm = buildVoyageViewModel({ overview, profile }, optional, now);

  // ── Sections ──
  check('nine sections in order', VOYAGE_SECTIONS.map((s) => s.label).join() === 'Overview,Itinerary,My Suite,Embarkation,Calendar,Dining,Spa,Experiences,Documents');
  check('section param parsing', parseSection('documents') === 'documents' && parseSection(['spa']) === 'spa' && parseSection('nope') === 'overview' && parseSection(undefined) === 'overview');

  // ── Overview ──
  check('overview: route and stats', vm.overview.route === 'Barcelona to Rome' && vm.overview.stats.map((s) => s.value).join() === '7,6,18', vm.overview.stats);
  check('overview: documents shortcut flags attention', vm.overview.shortcuts.find((s) => s.section === 'documents')?.attention === true);
  check('overview: shortcut to every other section', vm.overview.shortcuts.length === VOYAGE_SECTIONS.length - 1);

  // ── Itinerary ──
  const [bcn, palma, sea, tropez, mc1, mc2, porto, rome] = vm.itinerary;
  check('itinerary: 8 days', vm.itinerary.length === 8);
  check('itinerary: Barcelona times', JSON.stringify(bcn?.times) === JSON.stringify([{ label: 'All aboard', value: '19:00' }, { label: 'Depart', value: '20:00' }]), bcn?.times);
  check('itinerary: Palma arrive 08:00, depart 19:00', palma?.times[0]?.value === '08:00' && palma.times.at(-1)?.value === '19:00', palma?.times);
  check('itinerary: sea day has no port times', sea?.times.length === 0 && sea.typeLabel === 'At sea');
  check('itinerary: Monte Carlo day 6 sails after midnight', mc2?.times.at(-1)?.value === '00:00 +1', mc2?.times);
  check('itinerary: local time vs Miami', bcn?.localTime === 'UTC+2 · 6 h ahead of Miami', bcn?.localTime);
  check('itinerary: every port has an image placeholder', vm.itinerary.every((p) => p.media.tone.length === 2 && p.media.alt.length > 0));
  check('itinerary: Barcelona booked = Sagrada + dinner (no transfer)', bcn?.booked.map((b) => b.title).join(' | ') === 'The Sagrada Família, privately | Dinner at Mediterraneo', bcn?.booked.map((b) => b.title));
  check('itinerary: Saint-Tropez booked classic sail', tropez?.booked.some((b) => b.title.startsWith('Under sail')) ?? false);
  check('itinerary: Palma recommends La Seu (personalised)', palma?.recommended.some((r) => r.title === 'La Seu with a Historian' && /Doge/.test(r.reason ?? '')) ?? false, palma?.recommended);
  check('itinerary: sea day recommends the bridge and masterclass', ['A Visit to the Bridge', 'Barolo & Saint-Émilion, Side by Side'].every((t) => sea?.recommended.some((r) => r.title === t)), sea?.recommended.map((r) => r.title));
  check('itinerary: Portofino recommends the lighthouse', porto?.recommended.some((r) => r.title === 'The Lighthouse Path at Golden Hour') ?? false);
  check('itinerary: recommendations never repeat a booking', vm.itinerary.every((p) => p.recommended.every((r) => !bookings.some((b) => b.title.toLowerCase() === r.title.toLowerCase()))));
  check('itinerary: Rome and Monte Carlo day 5 present', rome?.name.startsWith('Rome') === true && mc1?.name === 'Monte Carlo');

  // ── Suite ──
  check('suite: category, deck, number', vm.suite.categoryLabel === 'Grand Suite' && vm.suite.deck === 'Deck 6' && vm.suite.number === '612');
  check('suite: amenities listed', vm.suite.amenities.length === 4);
  check('suite: feather-free and sparkling water preferences', vm.suite.preferences.some((p) => /Feather-free/.test(p.value)) && vm.suite.preferences.some((p) => /Sparkling water/.test(p.value)), vm.suite.preferences);
  check('suite: ambassador contact', vm.suite.ambassador?.name === 'Elena Moreau' && vm.suite.ambassador.telephone === 'Dial 9 from your suite telephone' && vm.suite.ambassador.languages === 'English, French, Italian', vm.suite.ambassador);

  // ── Embarkation ──
  const e = vm.embarkation;
  check('embarkation: port and terminal', e.port === 'Barcelona' && e.terminal === 'Port Vell Yacht Terminal');
  check('embarkation: arrival window', e.arrivalWindow === '13:30 – 14:00', e.arrivalWindow);
  check('embarkation: transfer with tracked flight', e.transfer?.flight === 'AA 7412 lands 09:10 · tracked by your driver', e.transfer?.flight);
  check('embarkation: luggage', e.luggage?.facts.map((f) => f.value).join() === '4,Digital tags issued,15:30', e.luggage?.facts);
  check('embarkation: documentation 5 of 6', e.documents.complete === 5 && e.documents.total === 6 && e.documents.outstanding.join() === 'Health questionnaire', e.documents);
  check('embarkation: check-in steps reflect documents', e.checkIn.steps.length === 7 && e.checkIn.steps.filter((s) => !s.done).map((s) => s.label).join() === 'Health questionnaire', e.checkIn.steps);
  check('embarkation: check-in status', e.checkIn.status.label === 'Check-in nearly complete');

  // ── Calendar ──
  const raw = buildCalendar();
  check('calendar: travel day before + 8 voyage days', vm.calendar.length === 9 && vm.calendar[0]?.heading === 'Before you sail', vm.calendar.map((d) => d.heading));
  check('calendar: outbound flight from Miami on 14 May', raw[0]?.entries.some((x) => x.kind === 'flight' && x.title.endsWith('AA 7412') && x.start.startsWith('2027-05-14T18:40')) ?? false);
  check('calendar: every booking appears exactly once', bookings.every((b) => raw.flatMap((d) => d.entries).filter((x) => x.bookingId === b.id).length === 1));
  check('calendar: entries chronological within each day', raw.every((d) => d.entries.every((x, i) => i === 0 || Date.parse(x.start) >= Date.parse(d.entries[i - 1]!.start))));
  check('calendar: days in date order', raw.every((d, i) => i === 0 || d.date > raw[i - 1]!.date));
  const kinds = new Set(raw.flatMap((d) => d.entries.map((x) => x.kind)));
  check('calendar: combines yacht events, dining, spa, excursions, private, transport, flights, ports', ['yacht-event', 'dining', 'spa', 'excursion', 'private', 'transport', 'flight', 'port'].every((k) => kinds.has(k as never)), [...kinds]);
  check('calendar: suggestions are marked', raw.flatMap((d) => d.entries).filter((x) => x.suggestion).every((x) => !x.bookingId));
  check('calendar: day 6 headline and dress code', vm.calendar[6]?.heading === 'Day 6 · Monte Carlo · your anniversary' && /Evening elegant/.test(vm.calendar[6]?.meta ?? ''), vm.calendar[6]);

  // ── Dining / Spa / Experiences ──
  check('dining: 7 reservations over 7 days', vm.dining.booked.length === 7 && vm.dining.booked.flatMap((g) => g.items).length === 7);
  check('dining: intro mentions the window table', /window table/.test(vm.dining.intro), vm.dining.intro);
  check('spa: 3 appointments', vm.spa.booked.flatMap((g) => g.items).length === 3);
  check('spa: intro reflects firm pressure, mornings', /Firm pressure/.test(vm.spa.intro) && /morning/.test(vm.spa.intro), vm.spa.intro);
  check('experiences: 6 private excursions', vm.experiences.booked.flatMap((g) => g.items).length === 6);
  check('available lists exclude booked experiences', [vm.dining, vm.spa, vm.experiences].every((c) => c.available.every((a) => !bookings.some((b) => b.experienceId === a.id))));
  check('experiences: personalised suggestions ranked first', vm.experiences.available[0]?.reason !== undefined, vm.experiences.available[0]);

  // ── Documents ──
  check('documents: summary', vm.documents.summary === '5 of 6 complete. One item remains, due by 13 May.', vm.documents.summary);
  check('documents: never shows a document number', vm.documents.items.every((d) => !/\d{6,}/.test(d.detail)));

  // ── Error isolation & empties ──
  const outage = new AppError('unavailable', 'test');
  const partial = buildVoyageViewModel({ overview, profile }, { ...optional, bookings: { ok: false, error: outage }, calendar: { ok: false, error: outage } }, now);
  check('partial: errors reported per source', !!partial.errors.bookings && !!partial.errors.calendar && !partial.errors.recommendations);
  check('partial: suite, embarkation and documents still complete', partial.suite.title === 'Grand Suite 612' && partial.embarkation.terminal === 'Port Vell Yacht Terminal' && partial.documents.items.length === 6);
  const empty = buildVoyageViewModel({ overview, profile }, { bookings: { ok: true, value: [] }, catalogue: { ok: true, value: catalogue }, recommendations: { ok: true, value: [] }, calendar: { ok: true, value: [] } }, now);
  check('empty: no bookings anywhere, sections still render', empty.dining.booked.length === 0 && empty.itinerary.every((p) => p.booked.length === 0) && empty.calendar.length === 0);
  check('empty: embarkation without a transfer', empty.embarkation.transfer === null);

  const json = JSON.stringify(vm);
  check('no undefined/NaN text', !/"[^"]*(undefined|NaN)[^"]*"/.test(json), json.match(/"[^"]*(undefined|NaN)[^"]*"/)?.[0]);

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`${failures.join('\n')}\n\n${failures.length} of ${total} Voyage checks failed.`);
    process.exit(1);
  }
  console.log(`✔ Voyage area: all ${total} checks passed.`);
}

void main();
