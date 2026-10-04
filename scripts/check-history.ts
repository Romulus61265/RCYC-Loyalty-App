/// <reference types="node" />
/**
 * Voyage history checks.  Run: `npm run check:history`
 *
 * Each past voyage: yacht, dates, destinations, suite, experiences, dining
 * highlights, saved preferences (and whether each still stands), memories
 * and a photographs placeholder. And previous behaviour as the
 * personalization engine's input: the same history, from voyage records.
 */
import { devDataset as d, IDS } from '@/data/fixtures';
import type { PersonalizationSignal } from '@/domain';
import { historySummary, placesLine, voyageLine } from '@/features/history/historyModel';
import { ServiceError } from '@/services/contracts';
import { ComposedVoyageHistoryService, MemoryVoyageHistoryStore } from '@/services/history/ComposedVoyageHistoryService';
import { MockGuestRecordSource } from '@/services/mock/MockMiscServices';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { buildPersonalizationInput } from '@/services/personalization/buildInput';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { personalize } from '../supabase/functions/_shared/personalization/engine';
import { historyFromVoyages, mergeHistory } from '../supabase/functions/_shared/personalization/history';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`);
};
async function rejects(p: Promise<unknown>, code: string) {
  try {
    await p;
    return false;
  } catch (e) {
    return e instanceof ServiceError && e.code === code;
  }
}

const G = IDS.guest;
const V = IDS.pastVoyages;

function services() {
  const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore()));
  const voyage = new MockVoyageService();
  return { profile, history: new ComposedVoyageHistoryService({ voyage, profile }, new MemoryVoyageHistoryStore(d.voyageHistory.records)) };
}

async function main() {
  const s = services();
  const list = await s.history.listVoyages(G);

  // ─── The list ────────────────────────────────────────────────────────────
  check('three past voyages, newest first', list.map((e) => e.voyageId).join() === [V.greekIsles, V.adriatic, V.caribbean].join(), list.map((e) => e.name));
  check('summary: in a sentence', historySummary(list) === 'Three voyages, 24 nights, aboard Ilma and Evrima.', historySummary(list));
  check('another guest has none', (await s.history.listVoyages('dev_gst_nobody')).every((e) => e.yachtName === '' && e.experiences.length === 0));
  check('an unknown voyage', await rejects(s.history.getVoyage(G, 'nope'), 'not_found'));

  // ─── Each voyage ─────────────────────────────────────────────────────────
  const adriatic = await s.history.getVoyage(G, V.adriatic);
  check('yacht, dates, nights', adriatic.yachtName === 'Evrima' && adriatic.dates === '31 August – 7 September 2024' && adriatic.nights === 7 && voyageLine(adriatic) === 'Evrima · 31 August – 7 September 2024 · 7 nights', voyageLine(adriatic));
  check('destinations', placesLine(adriatic) === 'Dubrovnik, Hvar and Venice' && adriatic.destinations.every((x) => x.country));
  check('suite', adriatic.suite === 'Grand Suite 612');
  check('experiences, in order, with where and when', adriatic.experiences.map((m) => m.title).join(' | ') === 'Under sail on a classic yacht | A vineyard lunch with the winemaker | The Doge’s Palace before opening' && adriatic.experiences.every((m) => m.place && m.date));
  check('dining highlights', adriatic.dining.map((m) => m.title).join() === 'The Chef’s Counter, with the wine pairing');
  check('memories, from what they did', adriatic.memories.join(' | ') === 'Taking the helm of a classic yacht off Hvar | A private vineyard lunch on Hvar | The Chef’s Counter and its wine pairing aboard Evrima | Your early, private morning in the Doge’s Palace', adriatic.memories);
  check('photographs: a placeholder, none invented', adriatic.photos.count === 0 && /Photographs from this voyage will appear here/.test(adriatic.photos.placeholder));
  const caribbean = list.find((e) => e.voyageId === V.caribbean)!;
  check('the Caribbean: dining, no excursions recorded, places with “the”', caribbean.experiences.length === 0 && caribbean.dining.length === 2 && placesLine(caribbean) === 'Bridgetown, the Grenadines and St Barths');
  const aegean = list.find((e) => e.voyageId === V.greekIsles)!;
  check('Ilma, and the Owner’s Suite', aegean.yachtName === 'Ilma' && aegean.suite === 'Owner’s Suite 701' && aegean.nights === 10);
  const santorini = aegean.experiences.find((m) => m.id === 'dev_sig_07');
  check('what they told us, kindly', santorini?.note === 'You told us it felt crowded, so we have kept to private guides since.' && santorini.rating === 2);

  // ─── Saved preferences, and whether they stand today ─────────────────────
  check('saved preferences: each still stands today', list.every((e) => e.savedPreferences.every((p) => p.status === 'kept')), list.flatMap((e) => e.savedPreferences.map((p) => `${p.label}:${p.status}`)));
  check('saved preferences: what was learned where', caribbean.savedPreferences.map((p) => p.label).join() === 'A window table each evening,Feather-free pillows and duvet' && aegean.savedPreferences.some((p) => p.label === 'Firm pressure, unscented oil'));
  const current = await s.profile.getPreferences(G);
  await s.profile.updatePreferences(G, { spa: { ...current.preferences.spa, pressure: 'medium' }, dining: { ...current.preferences.dining, tablePreference: 'terrace' } }, { expectedVersion: current.version });
  const after = await s.history.listVoyages(G);
  const status = (voyageId: string, label: string) => after.find((e) => e.voyageId === voyageId)!.savedPreferences.find((p) => p.label === label)!.status;
  check('a preference changed since: noted, not kept', status(V.greekIsles, 'Firm pressure, unscented oil') === 'noted' && status(V.caribbean, 'A window table each evening') === 'noted' && status(V.caribbean, 'Feather-free pillows and duvet') === 'kept');

  // ─── Previous behaviour as personalization input ─────────────────────────
  const items = historyFromVoyages(d.voyageHistory.records);
  check('history: every weighted moment, tied to its voyage', items.length === 8 && items.every((h) => h.voyageId && h.weight > 0) && items.find((h) => h.id === 'dev_sig_06')?.voyageId === V.adriatic);
  check('history: kinds from where they happened', items.find((h) => h.id === 'dev_sig_05')?.kind === 'dining' && items.find((h) => h.id === 'dev_sig_09')?.kind === 'spa' && items.find((h) => h.id === 'dev_sig_06')?.kind === 'excursion');
  check('history: moments without a weight are shown, not learned from', historyFromVoyages([{ voyageId: 'v', moments: [{ id: 'x', kind: 'dining', tags: [] }] }]).length === 0);
  check('history: voyage records first, older signals only when new', mergeHistory([{ id: 'a', kind: 'spa', weight: 1, tags: [] }], [{ id: 'a', kind: 'spa', weight: 0.1, tags: [] }, { id: 'b', kind: 'spa', weight: 0.2, tags: [] }]).map((h) => `${h.id}:${h.weight}`).join() === 'a:1,b:0.2');

  const base = {
    profile: structuredClone(d.guest.profile),
    membership: d.guest.membership,
    relationship: d.guest.relationship,
    pastVoyages: d.voyage.pastVoyages,
    voyage: d.voyage.voyage,
    yachtName: d.voyage.yacht.name,
    catalogue: d.experiences.catalogue,
    availability: d.experiences.availability,
    bookings: d.experiences.bookings,
    signals: d.personalization.signals,
  };
  const now = new Date(d.meta.referenceNow).toISOString();
  const withHistory = personalize(buildPersonalizationInput({ ...base, voyageHistory: d.voyageHistory.records }), { now, limit: 100, includeBooked: true });
  // The same moments as the old history signals: the engine sees exactly the same.
  const asSignals: PersonalizationSignal[] = d.voyageHistory.records.flatMap((r) =>
    r.moments.map((m) => ({ id: m.id, guestId: G, kind: m.kind === 'dining' ? 'dining-history' : m.kind === 'spa' ? 'spa-history' : 'excursion-history', summary: m.title, memory: m.memory, category: m.category, voyageId: r.voyageId, rating: m.rating, weight: m.weight ?? 0, observedAt: `${m.date}T12:00:00Z`, source: 'reservations', tags: m.tags })) as PersonalizationSignal[],
  );
  const viaSignals = personalize(buildPersonalizationInput({ ...base, signals: [...d.personalization.signals, ...asSignals], voyageHistory: [] }), { now, limit: 100, includeBooked: true });
  check('personalization: voyage records give exactly what the history signals gave', JSON.stringify(withHistory) === JSON.stringify(viaSignals));
  const withoutHistory = personalize(buildPersonalizationInput({ ...base, voyageHistory: [] }), { now, limit: 100, includeBooked: true });
  const usesHistory = (list: typeof withHistory) => list.filter((r) => r.sourceSignals.some((sig) => sig.ref && items.some((h) => h.id === sig.ref))).length;
  check('personalization: previous behaviour shapes recommendations', usesHistory(withHistory) > 0 && usesHistory(withoutHistory) === 0, { with: usesHistory(withHistory), without: usesHistory(withoutHistory) });
  check('personalization: and changes what is said', JSON.stringify(withHistory.map((r) => r.reason)) !== JSON.stringify(withoutHistory.map((r) => r.reason)));
  const sail = withHistory.find((r) => r.sourceSignals.some((sig) => sig.ref === 'dev_sig_06'));
  check('personalization: the helm off Hvar is remembered by name', Boolean(sail) && /Hvar/.test(JSON.stringify(sail)), sail?.reason);

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Voyage history: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Voyage history: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
