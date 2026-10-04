/// <reference types="node" />
/**
 * Security guards for the client fixes of docs/22.  Run: `npm run check:security`
 *
 *   H6 · a release build never falls back to demo sign-in: an unset or
 *        misspelt environment, or production on anything but Supabase,
 *        stops the app;
 *   H7 · special-category preferences (dietary, accessibility) never reach
 *        device storage, and sign-out wipes what the app kept there;
 *   H3 · nothing the concierge says performs an action, in any mode.
 *
 * The database (H1, H2, H4) and the concierge function (H3, H4, H5) are
 * covered by test:supabase and check:concierge-server.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNSAFE_BUILD, validateEnv, type BuildInfo, type Env } from '@/config/env';
import { DeviceData, type ListableStore } from '@/security/deviceData';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository, SPECIAL_CATEGORY_GROUPS } from '@/services/repositories/PreferencesRepository';
import type { GuestPreferences } from '@/domain';
import { data } from '@/services/mock/support';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${JSON.stringify(detail).slice(0, 900)}`}`);
};
const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** A store whose keys can be listed, like AsyncStorage. */
class ListableMemory extends MemoryKeyValueStore implements ListableStore {
  readonly data = new Map<string, string>();
  override async getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  override async setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  override async removeItem(k: string) {
    this.data.delete(k);
  }
  async keys() {
    return [...this.data.keys()];
  }
  async removeMany(keys: readonly string[]) {
    keys.forEach((k) => this.data.delete(k));
  }
}

async function main() {
  // ─── H6 · Fail closed ────────────────────────────────────────────────────
  const env = (over: Partial<Env>): Env => ({ appEnv: 'development', serviceMode: 'mock', supabaseUrl: '', supabaseAnonKey: '', apiBaseUrl: '', logLevel: 'info', demoNow: '', mockScenario: 'default', ...over });
  const release = (appEnv: string | undefined, serviceMode: string | undefined): BuildInfo => ({ release: true, appEnv, serviceMode });
  const unsafe = (issues: string[]) => issues.some((i) => i.startsWith(UNSAFE_BUILD));
  const supa = { serviceMode: 'supabase' as const, supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'sb_publishable_x' };

  check('a release with no EXPO_PUBLIC_APP_ENV does not start', unsafe(validateEnv(env({}), release(undefined, 'mock'))));
  check('a release with no EXPO_PUBLIC_SERVICE_MODE does not start', unsafe(validateEnv(env({}), release('development', undefined))));
  check('a release with a misspelt environment does not start', unsafe(validateEnv(env({}), release('prod', 'mock'))));
  check('production on mock services does not start', unsafe(validateEnv(env({ appEnv: 'production' }), release('production', 'mock'))));
  check('production on enterprise (demo sign-in) does not start', unsafe(validateEnv(env({ appEnv: 'production', serviceMode: 'enterprise', apiBaseUrl: 'https://bff.example.com' }), release('production', 'enterprise'))));
  check('staging on enterprise (demo sign-in) does not start', unsafe(validateEnv(env({ appEnv: 'staging', serviceMode: 'enterprise', apiBaseUrl: 'https://bff.example.com' }), release('staging', 'enterprise'))));
  const prod = validateEnv(env({ appEnv: 'production', ...supa }), release('production', 'supabase'));
  check('production on Supabase, declared, starts', prod.length === 0, prod);
  const demo = validateEnv(env({}), release('development', 'mock'));
  check('a declared demo build (development, mock) starts', demo.length === 0, demo);
  check('development (not a release) may leave both unset', validateEnv(env({}), { release: false, appEnv: undefined, serviceMode: undefined }).length === 0);
  const registry = read('src/services/registry.ts');
  check('the registry stops on an unsafe build', /issues\.some\(\(i\) => i\.startsWith\(UNSAFE_BUILD\)\)\) \{\n\s+throw new AppError\('config'/.test(registry));

  // ─── H7 · Special-category preferences stay off the device ───────────────
  const device = new ListableMemory();
  const sensitive = new MemoryKeyValueStore();
  const repo = new LocalPreferencesRepository(device, () => new Date('2027-05-01T00:00:00Z'), sensitive);
  const guestProfile = data.guest.profile;
  const g = guestProfile.guest.id;
  const base = guestProfile.preferences;
  const dietary: GuestPreferences['dietary'] = { restrictions: ['Vegetarian'], allergies: [{ allergen: 'Peanuts', severity: 'anaphylactic' }] };
  await repo.save(g, base, { dietary, spa: { ...base.spa, favouriteTreatments: ['Massage'] } });
  const stored = [...device.data.values()].join('');
  check('dietary and accessibility are never written to device storage', SPECIAL_CATEGORY_GROUPS.every((k) => !stored.includes(`"${k}"`)) && !/Peanuts|anaphylactic/.test(stored), stored.slice(0, 300));
  check('…other groups are', /Massage/.test(stored));
  const loaded = await repo.load(g);
  check('…and the guest still sees what they saved, this session', loaded?.preferences.dietary.allergies[0]?.allergen === 'Peanuts' && loaded.preferences.spa.favouriteTreatments.includes('Massage'), loaded?.preferences.dietary);

  // A record from an earlier version, with allergies on the device: moved off it on first read.
  const legacy = new ListableMemory();
  const legacyKey = `rcyc.preferences.v1.${g}`;
  await legacy.setItem(legacyKey, JSON.stringify({ schema: 1, version: 3, updatedAt: '2027-04-01T00:00:00Z', preferences: { ...base, dietary } }));
  const migrated = await new LocalPreferencesRepository(legacy, undefined, new MemoryKeyValueStore()).load(g);
  check('an older record is moved off the device on first read', !/Peanuts/.test((await legacy.getItem(legacyKey)) ?? '') && migrated?.preferences.dietary.allergies[0]?.allergen === 'Peanuts' && migrated.version === 3);

  // ─── H7 · Sign-out wipes the device ──────────────────────────────────────
  const disk = new ListableMemory();
  await disk.setItem('rcyc.preferences.v1.g1', '{}');
  await disk.setItem('rcyc.anything.else', 'x');
  await disk.setItem('another-app-key', 'keep');
  const memory = new MemoryKeyValueStore();
  await memory.setItem('k', 'v');
  const wiper = new DeviceData([disk]);
  wiper.onWipe(() => memory.clear());
  wiper.onWipe(() => {
    throw new Error('a clearer that fails');
  });
  const result = await wiper.wipe();
  check('sign-out removes every rcyc. key from device storage', (await disk.keys()).join() === 'another-app-key' && result.removed === 2, await disk.keys());
  check('…runs every clearer, and a failing one neither stops the rest nor throws', (await memory.getItem('k')) === null && result.failed === 1);
  check('the registry wipes at every sign-out, even a failed one', /async signOut\(\) \{\n\s+try \{\n\s+await auth\.signOut\(\);\n\s+\} finally \{\n\s+const \{ failed \} = await device\.wipe\(\);/.test(registry) && /auth: wipingOnSignOut\(composed\.auth, device\)/.test(registry));
  check('device storage is wiped through the store the preferences use', /new DeviceData\(\[asyncStorageStore\]\)/.test(registry) && /sensitive\.clear\(\)/.test(registry));

  // ─── H3 · Words never act ────────────────────────────────────────────────
  check('the AI provider contract has no way to perform an action', !/perform\?: ConciergeAction/.test(read('src/services/contracts/index.ts')));
  check('the mock concierge performs nothing from a message', !/result\.perform/.test(read('src/services/mock/MockConciergeService.ts')));
  const pipeline = read('supabase/functions/_shared/concierge/pipeline.ts');
  check('the concierge function performs nothing from a message', !/ports\.execute|\.execute\(/.test(pipeline) && /status: 'awaiting_tap'/.test(pipeline));

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Security: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Security: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
