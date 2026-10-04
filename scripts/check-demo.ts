/// <reference types="node" />
/**
 * Demo Mode guards (docs/23).  Run: `npm run check:demo`
 *
 *   • DEMO_MODE configuration: `executive` on mock services only, never in production;
 *   • the executive dataset: derived from the development dataset without
 *     changing it, internally consistent, and showing what each step needs;
 *   • the presenter's script: fifteen steps, in order, on routes that exist;
 *   • determinism: the clock is pinned and the data the steps show is the
 *     same on every run (a reset is a fresh set of services).
 *
 * The journey itself, through the app, is the browser walk-through in docs/23.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Before the app modules load (they are imported dynamically below), as a build would inline it.
process.env.EXPO_PUBLIC_DEMO_MODE = 'executive';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${JSON.stringify(detail).slice(0, 900)}`}`);
};
const ROOT = join(__dirname, '..');

async function main() {
  const { env, validateEnv, UNSAFE_BUILD } = await import('@/config/env');
  const { devDataset } = await import('@/data/fixtures');
  const { executiveDemoDataset, EXECUTIVE_DEMO_NOW, EXECUTIVE_DEMO_VINEYARD } = await import('@/data/fixtures/executiveDemo');
  const { data, mockDemo, mockNow } = await import('@/services/mock/support');
  const { EXECUTIVE_DEMO_SCRIPT } = await import('@/services/mock/executiveDemoScript');
  const { MockExperienceService } = await import('@/services/mock/MockExperienceService');
  const { MockPersonalizationService } = await import('@/services/mock/MockMiscServices');
  const { inactiveDemo } = await import('@/services/demo');

  // ─── Configuration ───────────────────────────────────────────────────────
  check('EXPO_PUBLIC_DEMO_MODE=executive turns the executive demonstration on', env.demoMode === 'executive' && mockDemo() === 'executive');
  const base = { ...env, appEnv: 'development' as const, serviceMode: 'mock' as const };
  check('demo mode on mock services: no issues', validateEnv(base, { release: false, appEnv: 'development', serviceMode: 'mock' }).length === 0, validateEnv(base));
  check('demo mode on Supabase is reported and ignored', validateEnv({ ...base, serviceMode: 'supabase', supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'sb_publishable_x' }).some((i) => /DEMO_MODE runs on mock services only/.test(i)));
  check('a production build can never run a demonstration (production needs Supabase)', validateEnv({ ...base, appEnv: 'production' }, { release: true, appEnv: 'production', serviceMode: 'mock' }).some((i) => i.startsWith(UNSAFE_BUILD)));
  const registry = readFileSync(join(ROOT, 'src/services/registry.ts'), 'utf8');
  check('enterprise and Supabase modes have no demonstration', /demo: inactiveDemo,/.test(registry) && /demo: inactiveDemo/.test(readFileSync(join(ROOT, 'src/services/supabase/index.ts'), 'utf8')));
  check('outside a demonstration: no script, and nothing to simulate', inactiveDemo.mode === null && inactiveDemo.script().length === 0 && (await inactiveDemo.simulateInboundDelay().then(() => false, () => true)));

  // ─── The executive dataset ───────────────────────────────────────────────
  const before = JSON.stringify(devDataset);
  const exec = executiveDemoDataset(devDataset);
  check('deriving it leaves the development dataset untouched', JSON.stringify(devDataset) === before);
  check('the mock services read the executive dataset', data.meta.datasetId === exec.meta.datasetId && data.meta.fictional);
  check('the guest is Alexander Laurent', `${exec.guest.profile.guest.firstName} ${exec.guest.profile.guest.lastName}` === 'Alexander Laurent');
  check('aboard Evrima, in the Mediterranean, in the Grand Suite', exec.voyage.yacht.name === 'Evrima' && exec.voyage.suite.name === 'Grand Suite' && exec.voyage.voyage.itinerary.some((p) => p.portName === 'Palma de Mallorca'));
  check('Titanium Elite recognition', /titanium/i.test(JSON.stringify(exec.guest.membership)));
  check('the vineyard is not booked (it is the recommendation at Palma)', !exec.experiences.bookings.some((b) => b.experienceId === EXECUTIVE_DEMO_VINEYARD.experienceId) && devDataset.experiences.bookings.some((b) => b.experienceId === EXECUTIVE_DEMO_VINEYARD.experienceId));
  const vineyard = exec.experiences.catalogue.find((e) => e.id === EXECUTIVE_DEMO_VINEYARD.experienceId);
  check('…a private experience in Palma', vineyard?.portCallId === EXECUTIVE_DEMO_VINEYARD.portCallId && vineyard.format === 'private');
  check('…recommended with its reason', exec.personalization.recommendations.some((r) => r.id === EXECUTIVE_DEMO_VINEYARD.recommendationId && r.experienceId === vineyard?.id && r.audience === 'guest' && /Barolo/.test(r.rationale)));
  const bookingIds = new Set(exec.experiences.bookings.map((b) => b.id));
  const dangling = exec.experiences.daySchedules.flatMap((d) => d.items).filter((i) => i.bookingId && !bookingIds.has(i.bookingId));
  check('every programme item points at a booking that exists', dangling.length === 0, dangling.map((i) => i.id));
  const catalogueIds = new Set(exec.experiences.catalogue.map((e) => e.id));
  check('every recommendation points at an experience that exists', exec.personalization.recommendations.every((r) => !r.experienceId || catalogueIds.has(r.experienceId)));
  check('no paperwork outstanding, and no overdue alert', exec.voyage.documents.every((d) => d.status !== 'required') && !exec.communication.alerts.some((a) => /questionnaire/i.test(a.body)));
  check('every record id is still dev_-prefixed', exec.personalization.recommendations.every((r) => r.id.startsWith('dev_')));

  // ─── The story is the same every time ────────────────────────────────────
  check('the clock is pinned to embarkation morning in Barcelona', mockNow().toISOString() === new Date(EXECUTIVE_DEMO_NOW).toISOString());
  const run = async () => {
    const experience = new MockExperienceService();
    const personalization = new MockPersonalizationService({ experience });
    const recs = await personalization.getRecommendations(exec.guest.profile.guest.id, 'voyage', { reservationId: exec.voyage.reservation.id, limit: 20 });
    return { bookings: (await experience.listBookings(exec.voyage.reservation.id)).map((b) => `${b.id}@${b.start}`), recs: recs.map((r) => `${r.id}:${r.rationale}`) };
  };
  const [first, second] = [await run(), await run()];
  check('two runs show exactly the same bookings and recommendations', JSON.stringify(first) === JSON.stringify(second));
  check('…the vineyard is among Voyage’s recommendations', first.recs.some((r) => r.startsWith(`${EXECUTIVE_DEMO_VINEYARD.recommendationId}:`)), first.recs);
  const changed = new MockExperienceService();
  await changed.cancelBooking(exec.experiences.bookings[0]!.id);
  check('what one run changes stays with its services (a reset starts clean)', (await new MockExperienceService().listBookings(exec.voyage.reservation.id)).length === first.bookings.length);

  // ─── The presenter's script ──────────────────────────────────────────────
  const steps = EXECUTIVE_DEMO_SCRIPT;
  check('fifteen steps, numbered in order', steps.length === 15 && steps.every((s, i) => s.n === i + 1));
  const expected = ['Open Home', 'Titanium recognition', 'The upcoming voyage', 'The Grand Suite', 'A personalised recommendation', 'Open Voyage', 'The itinerary', 'Open Mallorca', 'The private vineyard', 'Open Concierge', 'Ask about the anniversary', 'Curated options', 'The inbound flight is delayed', 'Travel arrangements adjust themselves', 'Service continuity'];
  check('…the journey as briefed', JSON.stringify(steps.map((s) => s.title)) === JSON.stringify(expected), steps.map((s) => s.title));
  check('only step 13 is performed (the flight delay); every other step has a route', steps.every((s) => (s.n === 13 ? s.action === 'inbound-delay' && !s.route : !!s.route && !s.action)));
  const routeFile = (route: string) => {
    const path = route.split('?')[0]!;
    if (path === '/') return 'src/app/(tabs)/index.tsx';
    if (path.startsWith('/port/')) return 'src/app/port/[id].tsx';
    return existsSync(join(ROOT, `src/app/(tabs)${path}.tsx`)) ? `src/app/(tabs)${path}.tsx` : `src/app${path}.tsx`;
  };
  const missing = steps.filter((s) => s.route && !existsSync(join(ROOT, routeFile(s.route))));
  check('every step’s route exists', missing.length === 0, missing.map((s) => s.route));
  check('Mallorca’s route is the vineyard’s port', steps.filter((s) => s.route?.startsWith('/port/')).every((s) => s.route === `/port/${EXECUTIVE_DEMO_VINEYARD.portCallId}`));
  check('the presenter screen and the Demo button exist', existsSync(join(ROOT, 'src/app/demo.tsx')) && /if \(!demo\.mode \|\| path === '\/demo'\) return null;/.test(readFileSync(join(ROOT, 'src/features/demo/DemoButton.tsx'), 'utf8')));
  check('a reset wipes the device and builds fresh services', /async reset\(\) \{\n\s+await device\.wipe\(\);\n\s+onReset\(\);/.test(registry) && /key=\{generation\}/.test(readFileSync(join(ROOT, 'src/services/ServiceProvider.tsx'), 'utf8')));

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Demo mode: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Demo mode: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
