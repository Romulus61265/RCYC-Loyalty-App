import { env } from '@/config/env';
import { devDataset } from '@/data/fixtures';
import { EXECUTIVE_DEMO_NOW, executiveDemoDataset } from '@/data/fixtures/executiveDemo';
import { ServiceError } from '@/services/contracts';

export type MockScenario = typeof env.mockScenario;

/**
 * Development-only overrides from the web URL (`?scenario=empty&now=…`), so
 * QA can exercise states without rebuilding. Ignored in production builds
 * and on native, where `window.location` is absent.
 */
/**
 * The query as first seen on this `location`: in the browser that is the
 * address the app opened with, because in-app navigation drops the query
 * string and a demo must not change mid-session. (Checks that assign a new
 * `location` object get a fresh read.)
 */
let seen: { location: unknown; search: string } | undefined;
function currentSearch(): string {
  const location = (globalThis as { location?: { search?: string } }).location;
  if (!location) return '';
  if (seen?.location !== location) seen = { location, search: location.search ?? '' };
  return seen.search;
}

function urlParam(name: string): string | null {
  if (env.appEnv === 'production') return null;
  const search = currentSearch();
  return search ? new URLSearchParams(search).get(name) : null;
}

const SCENARIOS: readonly MockScenario[] = ['default', 'empty', 'slow', 'error', 'partial-error'];

/** Current mock data condition: URL override, then EXPO_PUBLIC_MOCK_SCENARIO. */
export function mockScenario(): MockScenario {
  const fromUrl = urlParam('scenario');
  return fromUrl && (SCENARIOS as readonly string[]).includes(fromUrl) ? (fromUrl as MockScenario) : env.mockScenario;
}

/**
 * A demonstration layered on the data:
 *  • `?demo=executive` or EXPO_PUBLIC_DEMO_MODE=executive: the presenter-led
 *    journey for senior audiences (docs/23): embarkation morning, a prepared
 *    dataset, and the flight delay reported when the presenter chooses;
 *  • `?demo=disruption`: the classic sail in Saint-Tropez cancelled for a
 *    forecast mistral, with its recovery;
 *  • `?demo=flight-delay`: embarkation morning; a few seconds after opening,
 *    the inbound flight to Barcelona is reported two hours late (simulated)
 *    and the arrival arrangements are adjusted;
 *  • `?demo=welcome-home`: four days after the voyage, at home in Miami.
 */
export type MockDemo = 'executive' | 'disruption' | 'flight-delay' | 'welcome-home';

export function mockDemo(): MockDemo | null {
  const d = urlParam('demo');
  if (d === 'executive' || d === 'disruption' || d === 'flight-delay' || d === 'welcome-home') return d;
  return env.demoMode === 'executive' ? 'executive' : null;
}

/** Four days after the guests flew home to Miami: where the welcome-home demo starts. */
export const WELCOME_HOME_DEMO_NOW = '2027-05-26T10:00:00-04:00';

/** Embarkation morning, with AA 7412 in the air: where the flight-delay demo starts. */
export const FLIGHT_DELAY_DEMO_NOW = '2027-05-15T07:30:00+02:00';

/** Where each demonstration's clock is pinned ('' = the dataset's reference moment). */
const DEMO_NOW: Record<MockDemo | 'none', string> = { executive: EXECUTIVE_DEMO_NOW, 'flight-delay': FLIGHT_DELAY_DEMO_NOW, 'welcome-home': WELCOME_HOME_DEMO_NOW, disruption: '', none: '' };

/** True when the scenario asks for lists with nothing in them. */
export const isEmptyScenario = () => mockScenario() === 'empty';

/**
 * Simulates an outage. `core` data (voyage, recognition) fails in the
 * `error` scenario; `optional` data (bookings, alerts, recommendations)
 * fails in `partial-error`, so screens can prove they degrade gracefully.
 */
export function failIf(scope: 'core' | 'optional', what: string): void {
  const s = mockScenario();
  if ((s === 'error' && scope === 'core') || (s === 'partial-error' && scope === 'optional')) {
    throw new ServiceError('unavailable', `Mock outage: ${what}`, true);
  }
}

/** Simulated network latency so loading states are exercised in the shell. */
export function latency<T>(value: T, ms = 220): Promise<T> {
  const delay = mockScenario() === 'slow' ? ms * 15 : ms;
  return new Promise((resolve) => setTimeout(() => resolve(structuredCloneSafe(value)), delay));
}

/** Defensive copy so screens can't mutate fixtures by accident. */
function structuredCloneSafe<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function notFound(what: string, id: string): never {
  throw new ServiceError('not_found', `${what} ${id} not found`);
}

/** The dataset every mock service reads from: the development dataset, or its executive-demo preparation. */
export const data = mockDemo() === 'executive' ? executiveDemoDataset(devDataset) : devDataset;

/**
 * Mock clock — pinned so the journey phase is predictable. Uses
 * EXPO_PUBLIC_DEMO_NOW when set, otherwise the dataset's reference moment.
 */
export function mockNow(): Date {
  const pinned = Date.parse(urlParam('now') || DEMO_NOW[mockDemo() ?? 'none'] || env.demoNow || data.meta.referenceNow);
  return Number.isNaN(pinned) ? new Date() : new Date(pinned);
}

const startedAt = Date.now();

/**
 * Timestamps for things that happen during the demo (messages, requests):
 * the pinned demo moment plus the time since the app started, so they sort
 * after the dataset's history and still move forward.
 */
export function mockEventTime(): Date {
  return new Date(mockNow().getTime() + (Date.now() - startedAt));
}

let seq = 0;
export function mockId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq}`;
}
