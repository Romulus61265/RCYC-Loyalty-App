/**
 * Discover marketplace checks.  Run: `npm run check:discover`
 *
 * Builds the Discover model from the mock services (including the rules-based
 * recommendation engine) and asserts categories, card fields, contextual
 * reasons, every filter, and degraded states.
 */
import { AppError } from '@/core/errors/AppError';
import { devDataset, IDS } from '@/data/fixtures';
import {
  activeFilterCount,
  applyDiscoverFilters,
  buildDiscoverModel,
  DEFAULT_FILTERS,
  DISCOVER_CATEGORIES,
  type DiscoverFilters,
  type DiscoverOptionalData,
} from '@/features/discover/discoverModel';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockGuestProfileService, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockVoyageService } from '@/services/mock/MockVoyageService';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : ` — got ${JSON.stringify(detail)}`}`);
};

async function main() {
  const exp = new MockExperienceService();
  const [overview, profile, catalogue, destinations, availability, bookings, recommendations] = await Promise.all([
    new MockVoyageService().getOverview(IDS.reservation),
    new MockGuestProfileService().getProfile(IDS.guest),
    exp.listCatalogue(IDS.voyage),
    exp.listDestinations(IDS.voyage),
    exp.listAvailability(IDS.voyage),
    exp.listBookings(IDS.reservation),
    new MockPersonalizationService().getRecommendations(IDS.guest, 'discover', { limit: 100 }),
  ]);
  const core = { overview, profile, catalogue, destinations };
  const optional: DiscoverOptionalData = {
    availability: { ok: true, value: availability },
    bookings: { ok: true, value: bookings },
    recommendations: { ok: true, value: recommendations },
  };
  const now = new Date(devDataset.meta.referenceNow);
  const m = buildDiscoverModel(core, optional, now);
  const card = (id: string) => m.cards.find((c) => c.id === id)!;
  const filter = (patch: Partial<DiscoverFilters>) => applyDiscoverFilters(m.cards, { ...DEFAULT_FILTERS, ...patch });

  // ── Categories ──
  check('ten categories plus All', DISCOVER_CATEGORIES.map((c) => c.label).join() === 'All,Private Experiences,Destinations,Dining,Wine,Wellness,Spa,Marina,Culture,Shopping,Transportation');
  for (const c of DISCOVER_CATEGORIES.filter((x) => x.key !== 'all' && x.key !== 'destinations')) {
    check(`category ${c.label} has experiences`, filter({ category: c.key }).length > 0, filter({ category: c.key }).length);
  }
  check('destinations: one card per port of call', m.destinations.length === 6 && m.destinations.every((d) => d.experienceCount >= 0 && d.dateLabel.startsWith('Day')), m.destinations.map((d) => d.dateLabel));
  check('Monte Carlo destination spans both days', m.destinations.find((d) => d.name === 'Monte Carlo')?.dateLabel === 'Day 5 & Day 6 · 19 May');
  check('Private Experiences contains only private-format items', filter({ category: 'private' }).every((c) => c.formatLabel.startsWith('Private, for')));
  check('Wellness and Spa are distinct', filter({ category: 'wellness' }).every((c) => !c.categories.includes('spa')) && filter({ category: 'wellness' }).length === 3);
  check('Marina includes private yachting moments', filter({ category: 'marina' }).some((c) => c.id === 'dev_exp_classic_sail'));

  // ── Every card carries every field ──
  const missing = m.cards.flatMap((c) => {
    const problems: string[] = [];
    if (!c.title || !c.description || !c.destination) problems.push('text');
    if (!c.durationLabel) problems.push('duration');
    if (!c.availability.label) problems.push('availability');
    if (!c.priceLabel || !c.inclusionLabel) problems.push('price/inclusion');
    if (!c.formatLabel) problems.push('private/group');
    if (!c.media.alt || c.media.tone.length !== 2) problems.push('image');
    if (!c.reservation.label) problems.push('reservation');
    return problems.length ? [`${c.id}: ${problems.join('+')}`] : [];
  });
  check('every card has title, description, destination, duration, availability, price, inclusion, format, image, reservation', missing.length === 0, missing);
  check('price shown when not included', m.cards.filter((c) => c.inclusionLabel === 'At additional cost').every((c) => /^From €|on request/.test(c.priceLabel)));
  check('included experiences say so', card('dev_exp_marina').priceLabel === 'Included' && card('dev_exp_marina').inclusionLabel === 'Included in your voyage');
  check('durations read naturally', card('dev_exp_mallorca_wine').durationLabel === '5 hours' && card('dev_exp_chefs_counter').durationLabel === '2 h 45 min' && card('dev_exp_sunrise_yoga').durationLabel === '45 minutes' && card('dev_exp_mediterraneo').durationLabel === 'An evening');
  check('format labels', card('dev_exp_classic_sail').formatLabel === 'Private, for your party' && card('dev_exp_wine_masterclass').formatLabel === 'Small group, up to 12' && card('dev_exp_marina').formatLabel === 'Shared with fellow guests');
  check('aboard destination', card('dev_exp_bridge').destination === 'Aboard Evrima');

  // ── Contextual reasons ──
  check('vineyard reason (the brief’s example)', card('dev_exp_mallorca_wine').recommendation?.reason === 'Recommended because you enjoyed a private vineyard lunch on Hvar on your Adriatic voyage in 2024.', card('dev_exp_mallorca_wine').recommendation);
  check('sailing reason cites Hvar', /taking the helm of a classic yacht off Hvar/.test(card('dev_exp_classic_sail').recommendation?.reason ?? ''));
  check('culture reason cites the Doge’s Palace', /Doge’s Palace/.test(card('dev_exp_oceanographic').recommendation?.reason ?? ''));
  check('anniversary reason names the date and port', card('dev_exp_couples_ritual').recommendation?.reason === 'For your 20th wedding anniversary on Thursday 20 May, in Monte Carlo.', card('dev_exp_couples_ritual').recommendation);
  check('curated reasons take precedence', card('dev_exp_bridge').recommendation?.reason.startsWith('You took the helm off Hvar') === true);
  check('group formats are not recommended ashore (after a crowded tour)', !card('dev_exp_wine_masterclass').recommendation || card('dev_exp_wine_masterclass').recommendation!.reason.includes('Barolo'));
  check('every reason is a full sentence', m.cards.every((c) => !c.recommendation || /[.!]$/.test(c.recommendation.reason)));

  // ── Recommended for You ──
  check('Recommended for You: six', m.recommended.length === 6, m.recommended.length);
  check('Recommended for You: none already reserved, none fully booked, no transfers', m.recommended.every((c) => !c.reservation.reserved && c.availability.status !== 'unavailable' && !c.categories.includes('transport')));
  check('Recommended for You: ordered by score', m.recommended.every((c, i) => i === 0 || (m.recommended[i - 1]!.recommendation!.score >= c.recommendation!.score)));
  check('Recommended for You: reasons are varied', new Set(m.recommended.map((c) => c.recommendation!.reason)).size >= 5, m.recommended.map((c) => c.recommendation!.reason));

  // ── Availability & reservation status ──
  check('reserved card shows date and time', card('dev_exp_classic_sail').reservation.label === 'Reserved' && card('dev_exp_classic_sail').reservation.detail === 'Tuesday 18 May · 10:00', card('dev_exp_classic_sail').reservation);
  check('anniversary dinner is being arranged', card('dev_exp_anniversary_terrace').reservation.label === 'Being arranged');
  check('fully booked offers the concierge', card('dev_exp_tramuntana_walk').availability.label === 'Fully booked' && card('dev_exp_tramuntana_walk').reservation.label === 'Ask your concierge');
  check('waitlist is on request', card('dev_exp_helicopter').availability.label === 'Waitlist' && card('dev_exp_helicopter').reservation.label === 'On request');
  check('limited shows its note', card('dev_exp_wine_masterclass').availability.label === 'Limited availability' && card('dev_exp_wine_masterclass').availability.detail === 'Four places left');
  check('next open times listed', card('dev_exp_palma_seu').availability.nextTimes.join() === '16 May, 15:30,16 May, 16:45', card('dev_exp_palma_seu').availability.nextTimes);

  // ── Filters ──
  const tropez = filter({ port: 'Saint-Tropez' });
  check('port filter: Saint-Tropez', tropez.map((c) => c.id).sort().join() === 'dev_exp_classic_sail,dev_exp_marina', tropez.map((c) => c.id));
  check('port filter: Monte Carlo covers both days', filter({ port: 'Monte Carlo' }).some((c) => c.id === 'dev_exp_villa_ephrussi') && filter({ port: 'Monte Carlo' }).some((c) => c.id === 'dev_exp_oceanographic'));
  check('port filter: aboard', filter({ port: 'aboard' }).every((c) => c.destination === 'Aboard Evrima') && filter({ port: 'aboard' }).length > 5);
  const palmaDay = filter({ date: '2027-05-16' });
  check('date filter: 16 May has Palma and aboard options, no Saint-Tropez', palmaDay.some((c) => c.id === 'dev_exp_palma_seu') && palmaDay.some((c) => c.id === 'dev_exp_deep_tissue') && !palmaDay.some((c) => c.id === 'dev_exp_classic_sail'));
  check('interest filter: wine', filter({ interests: ['wine'] }).every((c) => c.tags.some((t) => t === 'wine' || t === 'red-wine')) && filter({ interests: ['wine'] }).length >= 3);
  check('interest filter: yachting', filter({ interests: ['yachting'] }).some((c) => c.id === 'dev_exp_riva_fruttuoso'));
  check('interests are marked as the guest’s own', m.options.interests.every((i) => i.yours));
  check('private only', filter({ privateOnly: true }).every((c) => c.isPrivate) && !filter({ privateOnly: true }).some((c) => c.id === 'dev_exp_marina'));
  check('bookable now hides waitlist and fully booked', !filter({ availability: 'open' }).some((c) => c.id === 'dev_exp_tramuntana_walk' || c.id === 'dev_exp_helicopter'));
  const combined = filter({ category: 'culture', port: 'Monte Carlo', privateOnly: true, availability: 'open' });
  check('combined filters', combined.length >= 2 && combined.every((c) => c.categories.includes('culture') && c.portKey === 'Monte Carlo' && c.isPrivate), combined.map((c) => c.id));
  check('no match returns empty', filter({ port: 'Portofino', interests: ['wellbeing'] }).length === 0);
  check('active filter count', activeFilterCount({ ...DEFAULT_FILTERS, port: 'Palma de Mallorca', interests: ['wine', 'culture'], privateOnly: true }) === 4);
  check('filter options', m.options.ports[0]?.value === 'all' && m.options.ports.at(-1)?.value === 'aboard' && m.options.dates.length === 9);

  // ── Degraded data ──
  const outage = new AppError('unavailable', 'test');
  const noRecs = buildDiscoverModel(core, { ...optional, recommendations: { ok: false, error: outage } }, now);
  check('recommendations down: cards still render, without reasons', noRecs.cards.length === m.cards.length && noRecs.cards.every((c) => !c.recommendation) && !!noRecs.errors.recommendations && noRecs.recommended.length === 0);
  const noAvail = buildDiscoverModel(core, { ...optional, availability: { ok: false, error: outage } }, now);
  check('availability down: "on request" instead of a guess', noAvail.cards.every((c) => c.availability.label === 'Availability on request') && !!noAvail.errors.availability);
  const empty = buildDiscoverModel(core, { availability: { ok: true, value: [] }, bookings: { ok: true, value: [] }, recommendations: { ok: true, value: [] } }, now);
  check('empty: nothing reserved, no recommendations', empty.cards.every((c) => !c.reservation.reserved) && empty.recommended.length === 0);

  const json = JSON.stringify(m);
  check('no undefined/NaN text', !/"[^"]*(undefined|NaN)[^"]*"/.test(json), json.match(/"[^"]*(undefined|NaN)[^"]*"/)?.[0]);

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`${failures.join('\n')}\n\n${failures.length} of ${total} Discover checks failed.`);
    process.exit(1);
  }
  console.log(`✔ Discover: all ${total} checks passed.`);
}

void main();
