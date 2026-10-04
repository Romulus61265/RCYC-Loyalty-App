/// <reference types="node" />
/**
 * Personalization engine checks.  Run: `npm run check:personalization`
 *
 * The rules-based engine (supabase/functions/_shared/personalization) on the
 * fictional dataset and variations of it: the brief's examples, every field
 * of the output, determinism, current reservations, privacy, the internal
 * value segment, Bonvoy status, the party, availability and diversity. Also
 * checks that no screen renders the relevance score.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PersonalizationInput, PersonalizedRecommendation } from '@/domain';
import { devDataset as d, IDS } from '@/data/fixtures';
import { buildPersonalizationInput } from '@/services/personalization/buildInput';
import { MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { ENGINE_VERSION, MIN_SCORE, personalize, toGuestSafe } from '../supabase/functions/_shared/personalization/engine';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}`}`);
};

const NOW = new Date(d.meta.referenceNow).toISOString(); // four days before embarkation

/** The fixture guest, optionally changed: drop bookings or signals, edit preferences. */
function inputWith(change: { dropBookings?: string[]; dropSignals?: string[]; edit?: (i: PersonalizationInput) => void } = {}): PersonalizationInput {
  const input = buildPersonalizationInput({
    profile: structuredClone(d.guest.profile),
    membership: d.guest.membership,
    relationship: d.guest.relationship,
    pastVoyages: d.voyage.pastVoyages,
    voyage: d.voyage.voyage,
    yachtName: d.voyage.yacht.name,
    catalogue: d.experiences.catalogue,
    availability: d.experiences.availability,
    bookings: d.experiences.bookings.filter((b) => !change.dropBookings?.includes(b.id)),
    signals: d.personalization.signals.filter((s) => !change.dropSignals?.includes(s.id)),
    // Past voyages' moments carry the history ids (dev_sig_03…); dropping one drops it here.
    voyageHistory: d.voyageHistory.records.map((r) => ({ ...r, moments: r.moments.filter((m) => !change.dropSignals?.includes(m.id)) })),
  });
  change.edit?.(input);
  return input;
}
const run = (input: PersonalizationInput, opts: Parameters<typeof personalize>[1] = {}) => personalize(input, { now: NOW, ...opts });
const find = (list: PersonalizedRecommendation[], experienceId: string) => list.find((r) => r.experienceId === experienceId);
const kinds = (r?: PersonalizedRecommendation) => new Set((r?.sourceSignals ?? []).map((s) => s.kind));

async function main() {
  // ─── The brief's examples ────────────────────────────────────────────────
  {
    // Anniversary + Monte Carlo → a private anniversary dinner (once the terrace isn't already booked).
    const list = run(inputWith({ dropBookings: ['dev_bkg_anniversary'] }));
    const dinner = find(list, 'dev_exp_anniversary_terrace');
    check('anniversary + Monte Carlo: private anniversary dinner recommended', dinner !== undefined && list.indexOf(dinner) < 3, list.map((r) => r.recommendation));
    check('… on the day, in Monte Carlo', dinner?.voyageDate === '2027-05-20' && /Monte Carlo/.test(dinner.destination), dinner && { date: dinner.voyageDate, destination: dinner.destination });
    check('… the reason names the occasion and the port', dinner?.reason === 'For your 20th wedding anniversary on Thursday 20 May, in Monte Carlo.', dinner?.reason);
    check('… from the occasion and the itinerary', kinds(dinner).has('special-occasion') && kinds(dinner).has('current-itinerary'), dinner?.sourceSignals);
    check('… a valued guest’s Suite Ambassador arranges it personally', dinner?.action.kind === 'service-request' && dinner.action.type === 'occasion', dinner?.action);
    const plain = find(run(inputWith({ dropBookings: ['dev_bkg_anniversary'], edit: (i) => void (i.valueSegment = undefined) })), 'dev_exp_anniversary_terrace');
    check('… otherwise, a request for the open terrace that evening', plain?.action.kind === 'request-experience' && plain.action.start === '2027-05-20T20:30:00+02:00', plain?.action);

    // Wine interest + Mallorca → private vineyard experience.
    const wine = run(inputWith({ dropBookings: ['dev_bkg_mallorca_wine'], dropSignals: ['dev_sig_18', 'dev_sig_05', 'dev_sig_03'] }));
    const vineyard = find(wine, 'dev_exp_mallorca_wine');
    check('wine interest + Mallorca: private vineyard experience recommended', vineyard !== undefined && wine.indexOf(vineyard) < 5, wine.map((r) => r.recommendation));
    check('… in Palma on day 2', vineyard?.destination === 'Palma de Mallorca' && vineyard.voyageDate === '2027-05-16' && vineyard.dayNumber === 2, vineyard);
    check('… because of the wine interest', vineyard?.reason === 'For your love of wine: a private visit to the vineyards of Palma de Mallorca.' && kinds(vineyard).has('dining-preferences'), vineyard?.reason);
    check('… with the open slot to request', vineyard?.action.kind === 'request-experience' && vineyard.action.start === '2027-05-16T09:30:00+02:00', vineyard?.action);
    const remembered = find(run(inputWith({ dropBookings: ['dev_bkg_mallorca_wine'] })), 'dev_exp_mallorca_wine');
    check('… and with history, the reason recalls the Hvar vineyard', remembered?.reason === 'Recommended because you enjoyed a private vineyard lunch on Hvar on your Adriatic voyage in 2024.' && kinds(remembered).has('previous-voyages'), remembered?.reason);

    // Spa history + sea day → wellness treatment.
    const spa = run(inputWith({ dropBookings: ['dev_bkg_spa_deep'] }));
    const massage = find(spa, 'dev_exp_deep_tissue');
    check('spa history + sea day: treatment recommended', massage !== undefined && spa.indexOf(massage) < 5, spa.map((r) => r.recommendation));
    check('… on the sea day, aboard', massage?.voyageDate === '2027-05-17' && massage.destination === 'Aboard Evrima, at sea', massage && { date: massage.voyageDate, destination: massage.destination });
    check('… the reason ties the sea day to their history', massage?.reason === 'Monday 17 May is a day at sea: time for a treatment like your deep-tissue massage aboard Ilma.', massage?.reason);
    check('… from spa preferences and the itinerary', kinds(massage).has('spa-preferences') && kinds(massage).has('current-itinerary') && massage!.rules.includes('spa-sea-day'));
    check('… at an open morning time', massage?.action.kind === 'request-experience' && massage.action.start.startsWith('2027-05-17T'), massage?.action);
  }

  // ─── Output: every field, every time ────────────────────────────────────
  {
    const list = run(inputWith(), { includeBooked: true, limit: 100 });
    check('engine returns recommendations', list.length >= 10, list.length);
    const bad = list.filter(
      (r) =>
        !r.recommendation ||
        !r.category ||
        !/[.!]$/.test(r.reason) ||
        !(r.relevanceScore >= MIN_SCORE && r.relevanceScore <= 1) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(r.voyageDate) ||
        !r.destination ||
        !r.action?.kind ||
        !r.action.label ||
        r.sourceSignals.length === 0,
    );
    check('every recommendation has recommendation, category, reason, score, date, destination, action and signals', bad.length === 0, bad.map((r) => r.id));
    check('sorted by relevance', list.every((r, i) => i === 0 || list[i - 1]!.relevanceScore >= r.relevanceScore || list[i - 1]!.category !== r.category));
    check('dates fall within the voyage', list.every((r) => r.voyageDate >= d.voyage.voyage.startDate && r.voyageDate <= d.voyage.voyage.endDate));
    check('reasons never mention scores, tiers or segments', list.every((r) => !/\d\.\d|score|titanium|elite|segment|distinguished|value/i.test(r.reason)), list.map((r) => r.reason));
    check('transfers are services, not suggestions', !list.some((r) => r.category === 'transfer'));
    const seen = new Set(list.flatMap((r) => r.sourceSignals.map((s) => s.kind)));
    const all = ['bonvoy-status', 'previous-voyages', 'current-itinerary', 'dining-preferences', 'spa-preferences', 'excursion-history', 'destination-interests', 'travel-companion', 'special-occasion', 'current-reservations'];
    const extra = run(inputWith({ dropBookings: ['dev_bkg_anniversary', 'dev_bkg_dinner_1', 'dev_bkg_dinner_4', 'dev_bkg_dinner_7'] }), { limit: 100 });
    for (const r of extra) r.sourceSignals.forEach((s) => seen.add(s.kind));
    check('every input kind drives at least one recommendation', all.every((k) => seen.has(k as never)) && seen.has('value-segment'), all.filter((k) => !seen.has(k as never)));
    const camille = find(list, 'dev_exp_villa_ephrussi');
    check('travel companion: Camille’s gardens and art count', kinds(camille).has('travel-companion') && camille!.rules.includes('companion'), camille);
    const noOccasion = find(run(inputWith({ dropSignals: ['dev_sig_08'], edit: (i) => (i.occasions = []) }), { includeBooked: true, limit: 100 }), 'dev_exp_villa_ephrussi');
    check('… and lead when nothing stronger applies', noOccasion?.reason === 'Camille loves gardens and art. We thought of you both.', noOccasion?.reason);
    check('engine version recorded', ENGINE_VERSION === 'rules-v1');
  }

  // ─── Deterministic ──────────────────────────────────────────────────────
  {
    const a = run(inputWith(), { limit: 100 });
    const b = run(inputWith(), { limit: 100 });
    check('same input, same output', JSON.stringify(a) === JSON.stringify(b));
    const shuffled = inputWith();
    for (const k of ['catalogue', 'slots', 'bookings', 'history', 'occasions', 'itinerary'] as const) (shuffled[k] as unknown[]).reverse();
    check('input order does not matter', JSON.stringify(run(shuffled, { limit: 100 })) === JSON.stringify(a));
    check('no clock unless one is given', JSON.stringify(personalize(inputWith(), { limit: 5 })) === JSON.stringify(personalize(inputWith(), { limit: 5 })));
  }

  // ─── Current reservations ───────────────────────────────────────────────
  {
    const input = inputWith();
    const list = run(input, { limit: 100 });
    const booked = new Set(input.bookings.filter((b) => b.status !== 'cancelled').map((b) => b.experienceId));
    check('booked experiences are not recommended', !list.some((r) => booked.has(r.experienceId)));
    const explain = run(input, { limit: 100, includeBooked: true });
    check('… unless every card is being explained, then marked booked', explain.filter((r) => booked.has(r.experienceId)).every((r) => r.booked && r.action.kind === 'open'));
    const busy = input.bookings.map((b) => [Date.parse(b.start), b.end ? Date.parse(b.end) : Date.parse(b.start) + 2 * 3_600_000] as const);
    const clash = list.filter((r) => r.action.kind === 'request-experience' && busy.some(([s, e]) => Date.parse((r.action as { start: string }).start) >= s && Date.parse((r.action as { start: string }).start) < e));
    check('offered times never clash with a booking', clash.length === 0, clash.map((r) => r.id));
    const later = run(input, { limit: 100, now: '2027-05-18T07:00:00+02:00' });
    check('nothing in the past', later.every((r) => r.voyageDate >= '2027-05-18'), later.map((r) => r.voyageDate));
    check('sold-out experiences are not suggested', !find(list, 'dev_exp_tramuntana_walk'));
    // Mediterraneo (their window table) was booked on three evenings; free two of them, and the 18th.
    const free = run(inputWith({ dropBookings: ['dev_bkg_dinner_1', 'dev_bkg_dinner_4', 'dev_bkg_dinner_7'] }), { limit: 100 });
    const table = find(free, 'dev_exp_mediterraneo');
    check('a free evening gets the window table they like', table !== undefined && ['2027-05-15', '2027-05-18', '2027-05-21'].includes(table.voyageDate) && kinds(table).has('current-reservations') && /window table/.test(table.reason), table);
    check('… near their preferred dinner time', table?.action.kind === 'request-experience' && ['20:30', '21:00'].includes(table.action.start.slice(11, 16)), table?.action);
  }

  // ─── Privacy ────────────────────────────────────────────────────────────
  {
    const off = run(inputWith({ edit: (i) => void (i.preferences.personalisedRecommendations = false) }), { limit: 100 });
    check('personalisation off: only the itinerary is used', off.length > 0 && off.every((r) => r.sourceSignals.every((s) => s.kind === 'current-itinerary')), off.map((r) => r.sourceSignals));
    check('… with neutral reasons', off.every((r) => /^In .+ on \w+day \d+ \w+\.$/.test(r.reason)), off.map((r) => r.reason));
    const priv = run(inputWith({ dropBookings: ['dev_bkg_anniversary'], edit: (i) => i.occasions.forEach((o) => (o.recognition = 'private')) }), { limit: 100 });
    check('private occasions are never used', !priv.some((r) => kinds(r).has('special-occasion') || /anniversary/i.test(r.reason)));
  }

  // ─── Internal signals: value segment and Bonvoy status ──────────────────
  {
    const withSeg = run(inputWith({ dropBookings: ['dev_bkg_anniversary'] }), { limit: 100 });
    const without = run(inputWith({ dropBookings: ['dev_bkg_anniversary'], edit: (i) => void (i.valueSegment = undefined) }), { limit: 100 });
    check('value segment never changes the score or order', JSON.stringify(withSeg.map((r) => [r.id, r.relevanceScore])) === JSON.stringify(without.map((r) => [r.id, r.relevanceScore])));
    check('value segment is internal and carries no value', withSeg.flatMap((r) => r.sourceSignals).filter((s) => s.kind === 'value-segment').every((s) => s.visibility === 'internal' && !/distinguished|founding|established|emerging/.test(s.detail)));
    const safe = toGuestSafe(withSeg);
    check('guest-safe output has no internal signals', safe.every((r) => r.sourceSignals.every((s) => s.visibility === 'guest')) && withSeg.some((r) => r.sourceSignals.some((s) => s.visibility === 'internal')));
    const mock = await new MockPersonalizationService().getPersonalizedRecommendations(IDS.guest, IDS.reservation, { limit: 20 });
    check('the service never returns internal signals', mock.length > 0 && mock.every((r) => r.sourceSignals.every((s) => s.visibility === 'guest' && s.kind !== 'value-segment')));
    check('the service respects the limit', (await new MockPersonalizationService().getPersonalizedRecommendations(IDS.guest, IDS.reservation, { limit: 3 })).length === 3);

    const member = run(inputWith({ edit: (i) => void (i.bonvoy = { tier: 'member' }) }), { limit: 100 });
    const titanium = run(inputWith(), { limit: 100 });
    const diffs = titanium.map((r) => r.relevanceScore - (find(member, r.experienceId)?.relevanceScore ?? r.relevanceScore));
    check('Bonvoy status: at most a tie-breaker', diffs.every((x) => x >= 0 && x <= 0.031), diffs);
    check('… and never a reason', titanium.every((r) => !/bonvoy|titanium|status/i.test(r.reason)));
  }

  // ─── The party ──────────────────────────────────────────────────────────
  {
    const minor = run(inputWith({ edit: (i) => i.companions.push({ firstName: 'Léa', relationship: 'child', isMinor: true, interests: [] }) }), { limit: 100, includeBooked: true });
    check('with a minor in the party: no wine experiences', !minor.some((r) => r.category === 'wine'));
    const chair = run(inputWith({ edit: (i) => void (i.preferences.mobility = 'wheelchair') }), { limit: 100, includeBooked: true });
    const walking = new Set(d.experiences.catalogue.filter((e) => e.tags.includes('walking')).map((e) => e.id));
    check('wheelchair users: no walking experiences', !chair.some((r) => walking.has(r.experienceId)));
    const twoOf = run(inputWith(), { limit: 100 }).filter((r) => r.action.kind === 'request-experience');
    check('requests are for the whole party', twoOf.every((r) => (r.action as { partySize: number }).partySize === 2));
  }

  // ─── Diversity ──────────────────────────────────────────────────────────
  {
    const top = run(inputWith({ dropBookings: d.experiences.bookings.map((b) => b.id) }), { limit: 6 });
    const counts = new Map<string, number>();
    top.forEach((r) => counts.set(r.category, (counts.get(r.category) ?? 0) + 1));
    check('at most two of a kind in the top six', [...counts.values()].every((n) => n <= 2), Object.fromEntries(counts));
  }

  // ─── The score is never shown ───────────────────────────────────────────
  {
    const root = resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.tsx')) files.push(p);
      }
    };
    walk(join(root, 'src'));
    const hits = files.filter((f) => /relevanceScore|\.score\b|sourceSignals/.test(readFileSync(f, 'utf8')));
    check('no screen or component renders the relevance score or source signals', hits.length === 0, hits);
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Personalization: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Personalization: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
