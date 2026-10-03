/**
 * Profile & preference persistence checks.  Run: `npm run check:profile`
 *
 * Exercises the repository abstraction (local persistence, versioning,
 * corrupt/old records, storage failure), the profile service's validation,
 * every editable group's schema, the Profile view model, the privacy switch
 * across features, and the Supabase row mapping.
 */
import { devDataset, IDS } from '@/data/fixtures';
import type { GuestPreferences } from '@/domain';
import { buildDiscoverModel } from '@/features/discover/discoverModel';
import { buildHomeViewModel } from '@/features/home/homeModel';
import { groupByKey, isDirty, PREFERENCE_GROUPS, PREFERENCE_SECTION_GROUPS, validateForm } from '@/features/profile/preferenceSchema';
import { buildProfileModel, parseProfileSection, PROFILE_SECTIONS } from '@/features/profile/profileModel';
import { buildVoyageViewModel } from '@/features/voyage/voyageModel';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestRecordSource, MockJourneyEventService, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockScheduleService } from '@/services/mock/MockScheduleService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { fromRow, toRow } from '@/services/remote/SupabasePreferencesRepository';
import { MemoryKeyValueStore, resilientStore, type KeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : ` — got ${JSON.stringify(detail)}`}`);
};
async function rejects(p: Promise<unknown>, code: string) {
  try {
    await p;
    return false;
  } catch (e) {
    return (e as { code?: string }).code === code;
  }
}
const G = IDS.guest;
const seed = devDataset.guest.profile.preferences;

async function main() {
  // ── Repository & service ──
  const store = new MemoryKeyValueStore();
  const service = () => new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(store));
  const s1 = service();
  const v0 = await s1.getPreferences(G);
  check('first read comes from the reservation (v0, seed)', v0.version === 0 && v0.source === 'seed' && v0.preferences.dining.tablePreference === 'window');

  const dining = groupByKey('dining');
  const v1 = await s1.updatePreferences(G, dining.write(v0.preferences, { ...dining.read(v0.preferences), table: 'terrace' }), { expectedVersion: 0 });
  check('save increments the version and stores on device', v1.version === 1 && v1.source === 'device' && v1.preferences.dining.tablePreference === 'terrace');
  check('a save touches only its own group', JSON.stringify(v1.preferences.spa) === JSON.stringify(seed.spa) && JSON.stringify(v1.preferences.suite) === JSON.stringify(seed.suite));

  const reopened = await service().getPreferences(G);
  check('persisted across service instances (app restart)', reopened.version === 1 && reopened.preferences.dining.tablePreference === 'terrace');
  check('getProfile returns the saved preferences', (await service().getProfile(G)).preferences.dining.tablePreference === 'terrace');

  check('stale edit is rejected as a conflict', await rejects(s1.updatePreferences(G, { dining: seed.dining }, { expectedVersion: 0 }), 'conflict'));
  check('conflict leaves the stored value intact', (await service().getPreferences(G)).preferences.dining.tablePreference === 'terrace');

  // Regression: clearing an optional field must stay cleared after reload.
  const cur = (await s1.getPreferences(G)).preferences;
  await s1.updatePreferences(G, dining.write(cur, { ...dining.read(cur), time: '', notes: '' }), { expectedVersion: 1 });
  const afterClear = (await service().getPreferences(G)).preferences.dining;
  check('cleared dinner time and notes stay cleared (no default resurrection)', afterClear.preferredTime === undefined && afterClear.notes === undefined, afterClear);

  // Validation at the service boundary.
  check('rejects an out-of-range temperature', await rejects(s1.updatePreferences(G, { suite: { ...seed.suite, temperatureCelsius: 30 } }), 'validation'));
  check('rejects an unnamed allergy', await rejects(s1.updatePreferences(G, { dietary: { restrictions: [], allergies: [{ allergen: ' ', severity: 'allergy' }] } }), 'validation'));
  check('rejects very long notes', await rejects(s1.updatePreferences(G, { spa: { ...seed.spa, notes: 'x'.repeat(401) } }), 'validation'));

  // Corrupt and older-schema records.
  const corrupt = new MemoryKeyValueStore();
  await corrupt.setItem(`rcyc.preferences.v1.${G}`, '{not json');
  const fromCorrupt = await new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(corrupt)).getPreferences(G);
  check('corrupt record falls back to the reservation defaults', fromCorrupt.version === 0 && fromCorrupt.preferences.dining.tablePreference === 'window');
  const old = new MemoryKeyValueStore();
  const { accessibility: _a, privacy: _p, transportation: _t, ...olderPrefs } = { ...seed, dining: { ...seed.dining, tablePreference: 'terrace' as const } };
  await old.setItem(`rcyc.preferences.v1.${G}`, JSON.stringify({ schema: 1, version: 4, updatedAt: '2027-01-01T00:00:00Z', preferences: olderPrefs }));
  const fromOld = await new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(old)).getPreferences(G);
  check('older record without newer groups still loads, newer groups defaulted', fromOld.version === 4 && fromOld.preferences.dining.tablePreference === 'terrace' && fromOld.preferences.accessibility.mobility === 'none' && fromOld.preferences.privacy.personalisedRecommendations === true);

  // Storage failure → session-only memory, with a warning.
  let warned = false;
  const broken: KeyValueStore = { getItem: () => Promise.reject(new Error('denied')), setItem: () => Promise.reject(new Error('denied')), removeItem: () => Promise.reject(new Error('denied')) };
  const fallbackSvc = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(resilientStore(broken, new MemoryKeyValueStore(), () => (warned = true))));
  const saved = await fallbackSvc.updatePreferences(G, { preferredDestinations: ['Japan'] });
  check('device storage failure keeps working in memory and warns', warned && saved.preferences.preferredDestinations.join() === 'Japan' && (await fallbackSvc.getPreferences(G)).preferences.preferredDestinations.join() === 'Japan');

  // ── Schema ──
  check('ten preference groups, as requested', PREFERENCE_SECTION_GROUPS.map((k) => groupByKey(k).label).join() === 'Dining,Dietary,Beverage,Suite,Pillow,Spa,Activities,Destinations,Transportation,Accessibility');
  const roundTrip = PREFERENCE_GROUPS.filter((g) => {
    const merged = { ...seed, ...g.write(seed, g.read(seed)) } as GuestPreferences;
    return canonical(merged) !== canonical(seed);
  }).map((g) => g.key);
  check('every group round-trips without changing anything', roundTrip.length === 0, roundTrip);
  check('unchanged form is not dirty; a change is', PREFERENCE_GROUPS.every((g) => !isDirty(g, seed, g.read(seed))) && isDirty(dining, seed, { ...dining.read(seed), table: 'terrace' }));
  check('every group has fields and a summary', PREFERENCE_GROUPS.every((g) => g.fields(seed).length > 0 && g.summary(seed).length > 0));
  check('existing values always appear as options', PREFERENCE_GROUPS.every((g) => g.fields(seed).every((f) => f.kind !== 'multi' || list(g.read(seed)[f.key]).every((v) => f.options.some((o) => o.value === v)))));
  check('pillow keeps the feather-free choice', groupByKey('pillow').fields(seed)[0]?.kind === 'single' && groupByKey('pillow').read(seed).pillow === seed.suite.pillow);
  const suite = groupByKey('suite');
  check('form validation: temperature range', !!validateForm(suite, seed, { ...suite.read(seed), temperature: 40 }).temperature);
  check('form validation: allergy names', !!validateForm(groupByKey('dietary'), seed, { ...groupByKey('dietary').read(seed), allergies: [{ allergen: '', severity: 'allergy' }] }).allergies);
  check('form validation: quiet hours need both ends', !!validateForm(groupByKey('communication'), seed, { ...groupByKey('communication').read(seed), quietEnd: '' }).quietEnd);
  check('sensitive groups are marked', groupByKey('dietary').sensitive === true && groupByKey('accessibility').sensitive === true && !groupByKey('dining').sensitive);

  // ── Profile model ──
  const [profile, recognition, overview, pastVoyages] = await Promise.all([
    new MockGuestRecordSource().getProfile(G),
    new MockLoyaltyService().getRecognition(G),
    new MockVoyageService().getOverview(IDS.reservation),
    new MockVoyageService().getPastVoyages(G),
  ]);
  const now = new Date(devDataset.meta.referenceNow);
  const pm = buildProfileModel({ profile, versioned: v0, recognition, overview, pastVoyages, now });
  check('eight sections, as requested', PROFILE_SECTIONS.map((s) => s.label).join() === 'Personal,Bonvoy,Preferences,Companions,Occasions,Voyage History,Communication,Privacy');
  check('section parsing', parseProfileSection('privacy') === 'privacy' && parseProfileSection('x') === 'personal');
  check('personal: masked contact details and home airport', pm.personal.rows.some((r) => r.value === 'a•••••••@example.com') && pm.personal.rows.some((r) => r.label === 'Home airport' && r.value === 'MIA'));
  check('bonvoy: tier, lifetime, masked number, privileges', pm.bonvoy.tierLabel === 'Titanium Elite' && pm.bonvoy.memberNumber === '•••• •••• 7314' && pm.bonvoy.privileges.length === 7);
  check('companions: Camille', pm.companions[0]?.name === 'Camille Laurent' && pm.companions[0].relationship === 'Spouse');
  check('occasions: anniversary flagged for this voyage', pm.occasions.find((o) => o.label === '20th wedding anniversary')?.thisVoyage === true);
  check('history: upcoming plus three past, newest first', pm.history.upcoming?.name === 'Balearics & the Riviera' && pm.history.past.map((v) => v.name).join() === 'Cyclades in Early Summer,Dalmatian Coast & Venice,Caribbean Winter Light');
  check('saved label: from the reservation until first save', pm.saved.source === 'From your reservation');
  check('saved label after saving', buildProfileModel({ profile, versioned: v1, recognition, overview, pastVoyages, now }).saved.source === 'Saved on this device');
  check('preference summaries reflect edits', buildProfileModel({ profile, versioned: v1, recognition, overview, pastVoyages, now }).preferences[0]?.lines.some((l) => l.startsWith('Terrace')) === true);

  // ── Privacy switch reaches other features ──
  const off: GuestPreferences = { ...seed, privacy: { ...seed.privacy, personalisedRecommendations: false } };
  const exp = new MockExperienceService();
  const [bookings, schedules, catalogue, alerts, homeRecs, discoverRecs, availability, destinations, calendar] = await Promise.all([
    exp.listBookings(IDS.reservation), exp.listDaySchedules(IDS.reservation), exp.listCatalogue(IDS.voyage), new MockJourneyEventService().listAlerts(IDS.reservation),
    new MockPersonalizationService().getRecommendations(G, 'home', { limit: 3 }), new MockPersonalizationService().getRecommendations(G, 'discover', { limit: 100 }),
    exp.listAvailability(IDS.voyage), exp.listDestinations(IDS.voyage), new MockScheduleService().getCalendar(IDS.reservation),
  ]);
  const ok = <T,>(value: T) => ({ ok: true as const, value });
  const home = buildHomeViewModel({ overview, recognition, profile: { ...profile, preferences: off } }, { bookings: ok(bookings), schedules: ok(schedules), catalogue: ok(catalogue), alerts: ok(alerts), recommendations: ok(homeRecs) }, 'prepare', now);
  const discover = buildDiscoverModel({ overview, profile: { ...profile, preferences: off }, catalogue, destinations }, { availability: ok(availability), bookings: ok(bookings), recommendations: ok(discoverRecs) }, now);
  const voyageVm = buildVoyageViewModel({ overview, profile: { ...profile, preferences: off } }, { bookings: ok(bookings), catalogue: ok(catalogue), recommendations: ok(discoverRecs), calendar: ok(calendar) }, now);
  check('privacy off: Home shows no recommendations', home.recommendations.length === 0);
  check('privacy off: Discover shows no reasons or rail', discover.recommended.length === 0 && discover.cards.every((c) => !c.recommendation));
  check('privacy off: Voyage itinerary shows no personalised reasons', voyageVm.itinerary.every((p) => p.recommended.every((r) => !r.reason || r.reason === 'Private, as you prefer.')));
  const homeOn = buildHomeViewModel({ overview, recognition, profile }, { bookings: ok(bookings), schedules: ok(schedules), catalogue: ok(catalogue), alerts: ok(alerts), recommendations: ok(homeRecs) }, 'prepare', now);
  check('privacy on: Home recommendations return', homeOn.recommendations.length === 3);

  // ── Supabase mapping ──
  check('Supabase row mapping round-trips', canonical(fromRow({ ...toRow(seed), version: 1, updated_at: '' })) === canonical(seed));

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`${failures.join('\n')}\n\n${failures.length} of ${total} Profile checks failed.`);
    process.exit(1);
  }
  console.log(`✔ Profile & preferences: all ${total} checks passed.`);
}

/** Key-order-independent JSON for deep comparison. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

void main();
