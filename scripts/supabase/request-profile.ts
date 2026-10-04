/// <reference types="node" />
/**
 * Request profile: how many HTTP requests each screen's data costs in
 * Supabase mode, against real PostgREST, with the same calls the screens
 * make. Run by `npm run test:supabase` after the integration checks.
 *
 *   • Per call: requests and repeats of an identical request.
 *   • Per screen: the total, and identical requests made more than once.
 *   • Budgets, on the requests the services issue (deterministic): a
 *     screen that grows past its budget fails the run, so a regression
 *     (an N+1, a new query per row) is caught here, not on a phone.
 *   • What reaches the network after identical in-flight reads are shared
 *     (coalescingFetch) depends on timing, so it is reported as a range.
 *
 * It runs after the integration checks, so the data is the same each time
 * (Home includes a recovery notice, whose wording rebuilds the overview and
 * profile). `COALESCE=0` shows the network without in-flight sharing;
 * `COALESCE_WINDOW=2000` the rejected two-second window.
 */
import { coalescingFetch } from '@/services/remote/coalescingFetch';
import { createSupabaseServices } from '@/services/supabase';
import { devDataset as d, IDS } from '@/data/fixtures';
import { buildSeedRows, uuidFor } from './seedRows';
import { clientFor, gateway } from './integration';

type Req = { method: string; path: string };

/** Screens as they load today (see each screen's data hook), with a request budget. */
const SCREENS: { name: string; budget: number; calls: (s: ReturnType<typeof createSupabaseServices>, ids: Ids) => [string, () => Promise<unknown>][] }[] = [
  {
    name: 'Sign-in → journey (JourneyProvider)',
    budget: 6,
    calls: (s, { g }) => [
      ['auth.getSession', () => s.auth.getSession()],
      ['voyage.getUpcomingReservation', () => s.voyage.getUpcomingReservation(g)],
    ],
  },
  {
    name: 'Home',
    budget: 145,
    calls: (s, { g, r, v }) => [
      ['voyage.getJourneyPhase', () => s.voyage.getJourneyPhase(r)],
      ['voyage.getOverview', () => s.voyage.getOverview(r)],
      ['loyalty.getRecognition', () => s.loyalty.getRecognition(g, v)],
      ['profile.getProfile', () => s.profile.getProfile(g)],
      ['experience.listBookings', () => s.experience.listBookings(r)],
      ['experience.listDaySchedules', () => s.experience.listDaySchedules(r)],
      ['experience.listCatalogue', () => s.experience.listCatalogue(v)],
      ['journeyEvents.listAlerts', () => s.journeyEvents.listAlerts(r)],
      ['personalization.getRecommendations', () => s.personalization.getRecommendations(g, 'home', { reservationId: r, limit: 3 })],
      ['postVoyage.getRecap', () => s.postVoyage.getRecap(g, r)],
      ['recovery.listNotices', () => s.recovery.listNotices(g, r)],
      ['continuity.getArrivalUpdate', () => s.continuity.getArrivalUpdate(r)],
      ['occasions.listCelebrations', () => s.occasions.listCelebrations(g, r)],
      ['notifications.unreadCount', () => s.notifications.unreadCount(g, r)],
      ['profile.getPreferences', () => s.profile.getPreferences(g)],
    ],
  },
  {
    name: 'Voyage',
    budget: 34,
    calls: (s, { g, r, v }) => [
      ['voyage.getOverview', () => s.voyage.getOverview(r)],
      ['profile.getProfile', () => s.profile.getProfile(g)],
      ['experience.listBookings', () => s.experience.listBookings(r)],
      ['experience.listCatalogue', () => s.experience.listCatalogue(v)],
      ['schedule.getCalendar', () => s.schedule.getCalendar(r)],
      ['personalization.getRecommendations', () => s.personalization.getRecommendations(g, 'voyage', { reservationId: r })],
    ],
  },
  {
    name: 'Discover',
    budget: 25,
    calls: (s, { g, r, v }) => [
      ['voyage.getOverview', () => s.voyage.getOverview(r)],
      ['profile.getProfile', () => s.profile.getProfile(g)],
      ['experience.listCatalogue', () => s.experience.listCatalogue(v)],
      ['experience.listDestinations', () => s.experience.listDestinations(v)],
      ['experience.listAvailability', () => s.experience.listAvailability(v)],
      ['experience.listBookings', () => s.experience.listBookings(r)],
      ['personalization.getRecommendations', () => s.personalization.getRecommendations(g, 'discover', { reservationId: r })],
    ],
  },
  {
    name: 'Concierge',
    budget: 32,
    calls: (s, { g, r, v }) => [
      ['voyage.getOverview', () => s.voyage.getOverview(r)],
      ['profile.getProfile', () => s.profile.getProfile(g)],
      ['loyalty.getRecognition', () => s.loyalty.getRecognition(g, v)],
      ['experience.listCatalogue', () => s.experience.listCatalogue(v)],
      ['experience.listDaySchedules', () => s.experience.listDaySchedules(r)],
      ['concierge.listServiceRequests', () => s.concierge.listServiceRequests(r)],
      ['experience.listBookings', () => s.experience.listBookings(r)],
      ['concierge.openConversation', () => s.concierge.openConversation(r)],
    ],
  },
  {
    name: 'Profile',
    budget: 34,
    calls: (s, { g, r, v }) => [
      ['profile.getProfile', () => s.profile.getProfile(g)],
      ['profile.getPreferences', () => s.profile.getPreferences(g)],
      ['loyalty.getRecognition', () => s.loyalty.getRecognition(g, v)],
      ['voyage.getOverview', () => s.voyage.getOverview(r)],
      ['voyage.getPastVoyages', () => s.voyage.getPastVoyages(g)],
    ],
  },
];

interface Ids {
  g: string;
  r: string;
  v: string;
}

async function main() {
  buildSeedRows();
  const now = new Date(d.meta.referenceNow);
  const gw = await gateway(() => now);
  const ids: Ids = { g: uuidFor(IDS.guest), r: uuidFor(IDS.reservation), v: uuidFor(IDS.voyage) };
  const failures: string[] = [];

  for (const screen of SCREENS) {
    const log: (Req & { call: string })[] = [];
    let current = '';
    // What reaches the network, through the same coalescing fetch the app uses (COALESCE=0 to measure without it).
    const counting = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      log.push({ call: current, method: init?.method ?? 'GET', path: `${url.pathname.replace(/^\/(rest|functions)\/v1/, '')}${url.search}` });
      return fetch(input, init);
    };
    const db = clientFor(gw.url, process.env.GUEST_USER_ID, { fetch: process.env.COALESCE === '0' ? counting : coalescingFetch(counting as typeof fetch, { windowMs: Number(process.env.COALESCE_WINDOW ?? 0) }) });
    const services = createSupabaseServices(() => db, { now: () => now });
    console.log(`\n${screen.name}`);
    let total = 0;
    for (const [name, call] of screen.calls(services, ids)) {
      current = name;
      const start = log.length;
      const t0 = performance.now();
      await call().catch((e: unknown) => console.log(`    ${name} failed: ${e instanceof Error ? e.message : String(e)}`));
      const mine = log.slice(start);
      total += mine.length;
      const paths = mine.map((x) => x.path.split('?')[0]);
      console.log(`  ${String(mine.length).padStart(3)} req  ${(performance.now() - t0).toFixed(0).padStart(4)} ms  ${name}  ${[...new Set(paths)].join(' ')}`);
    }
    // As the screen does it: every call at once, five times. Requests the services issue are
    // deterministic (the budget); what reaches the network after in-flight sharing depends on timing.
    const issuedRuns: number[] = [];
    const networkRuns: number[] = [];
    for (let run = 0; run < 5; run++) {
      let issued = 0;
      let network = 0;
      const below = async (input: RequestInfo | URL, init?: RequestInit) => {
        network += 1;
        return fetch(input, init);
      };
      const shared = process.env.COALESCE === '0' ? below : coalescingFetch(below as typeof fetch, { windowMs: Number(process.env.COALESCE_WINDOW ?? 0) });
      const above = async (input: RequestInfo | URL, init?: RequestInit) => {
        issued += 1;
        return shared(input, init);
      };
      const db2 = clientFor(gw.url, process.env.GUEST_USER_ID, { fetch: above as typeof fetch });
      const services2 = createSupabaseServices(() => db2, { now: () => now });
      await Promise.all(screen.calls(services2, ids).map(([, call]) => call().catch(() => undefined)));
      issuedRuns.push(issued);
      networkRuns.push(network);
    }
    total = Math.max(...issuedRuns);
    const sorted = [...networkRuns].sort((x, y) => x - y);
    // A read with no row filter leans on RLS alone, which checks every row of the table:
    // measured at 0.9–1.9 s with another voyage's 200k rows (SCALE_PROBE=1). Every read filters.
    const unfiltered = log.filter((x) => x.method === 'GET' && ![...new URLSearchParams(x.path.split('?')[1] ?? '').keys()].some((k) => !['select', 'order', 'limit', 'offset'].includes(k)));
    for (const x of unfiltered) failures.push(`${screen.name}: ${x.call} reads ${x.path.split('?')[0]} without a filter`);
    const same = new Map<string, Set<string>>();
    for (const x of log) {
      const k = `${x.method} ${x.path}`;
      same.set(k, (same.get(k) ?? new Set()).add(x.call));
    }
    const repeated = [...same.entries()].filter(([k]) => log.filter((x) => `${x.method} ${x.path}` === k).length > 1);
    console.log(`  ─ loaded together, as the screen does: services issue ${total} requests (budget ${screen.budget}); ${sorted[0]}–${sorted[sorted.length - 1]} reach the network (median ${sorted[2]}). ${repeated.length} identical requests repeated when loaded one call at a time.`);
    for (const [k, calls] of repeated.slice(0, 12)) console.log(`      ×${log.filter((x) => `${x.method} ${x.path}` === k).length} ${k.slice(0, 110)}  ← ${[...calls].join(', ')}`);
    if (total > screen.budget) failures.push(`${screen.name}: ${total} requests, budget ${screen.budget}`);
  }
  gw.close();
  if (failures.length) {
    console.error(`\n✘ Request budgets: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('\n✔ Request budgets: every screen within its budget.');
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
