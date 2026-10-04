/// <reference types="node" />
/**
 * Performance guards.  Run: `npm run check:perf`
 *
 * The measured fixes of docs/21, kept from regressing:
 *   • bundle and app size: one icon family and the six font files in use,
 *     never a package index that pulls in every family or weight;
 *   • requests: identical reads in flight share one request, and nothing
 *     that could hide a write is ever shared (coalescingFetch);
 *   • refreshing on focus only when something may have changed
 *     (dataVersion's read/write split);
 *   • Discover's cards re-render only when their own props change.
 *
 * Request budgets per screen, against PostgREST, are in test:supabase
 * (request-profile.ts); the browser measurements in docs/21.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { coalescingFetch } from '@/services/remote/coalescingFetch';
import { dataVersion, isReadMethod, noteServiceCall } from '@/services/dataVersion';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`);
};

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const files: string[] = [];
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
})(SRC);
const hits = (re: RegExp) =>
  files.flatMap((f) => {
    const s = readFileSync(f, 'utf8');
    return [...s.matchAll(re)].map((m) => `${relative(ROOT, f)}:${s.slice(0, m.index).split('\n').length}`);
  });

async function main() {
  // ─── Bundle and app size ─────────────────────────────────────────────────
  // The index of @expo/vector-icons bundles every family's glyph map (~520 KB) and font files;
  // the Google Fonts indexes reference every weight (28 files). Measured: 18 MB of web export → 5.4 MB.
  const iconIndex = hits(/from '@expo\/vector-icons'/g);
  check('icons import one family, never the package index', iconIndex.length === 0, iconIndex);
  const otherFamilies = hits(/from '@expo\/vector-icons\/(?!Ionicons')[A-Za-z]+'/g);
  check('only Ionicons is used', otherFamilies.length === 0, otherFamilies);
  const fontIndex = hits(/from '@expo-google-fonts\/[a-z-]+'/g);
  check('fonts import one weight each, never the package index', fontIndex.length === 0, fontIndex);
  const weights = hits(/from '@expo-google-fonts\/[a-z-]+\/[0-9A-Za-z_]+'/g);
  check('exactly the six faces the type scale uses', weights.length === 6, weights);

  // ─── Requests: identical reads in flight share one ───────────────────────
  type Call = { url: string; method: string };
  const net: Call[] = [];
  let release: (() => void)[] = [];
  let status = 200;
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    net.push({ url, method: init?.method ?? 'GET' });
    await new Promise<void>((r) => release.push(r));
    return new Response(JSON.stringify({ url, n: net.length }), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      const r = release;
      release = [];
      r.forEach((f) => f());
    }
  };
  const f = coalescingFetch(fake);
  const A = 'https://x.supabase.co/rest/v1/reservations?select=id&id=eq.1';
  const auth = (who: string) => ({ headers: { Authorization: `Bearer ${who}`, apikey: 'anon' } });

  let p: Promise<Response[]> = Promise.all([f(A, auth('g')), f(A, auth('g')), f(A, auth('g'))]);
  await settle();
  const bodies = await Promise.all((await p).map((r) => r.json() as Promise<{ n: number }>));
  check('three identical reads at once: one request', net.length === 1 && bodies.every((b) => b.n === 1), net.length);
  check('…each caller gets its own readable body', bodies.length === 3);

  net.length = 0;
  p = Promise.all([f(A, auth('g'))]);
  await settle();
  await p;
  check('once it has arrived, a new read goes to the network (no stale answers)', net.length === 1);

  net.length = 0;
  p = Promise.all([f(A, auth('g')), f(A, auth('someone-else'))]);
  await settle();
  await p;
  check('another signed-in user never shares an answer', net.length === 2);

  net.length = 0;
  const first = f(A, auth('g'));
  const write = f('https://x.supabase.co/rest/v1/service_requests', { ...auth('g'), method: 'POST', body: '{}' });
  const after = f(A, auth('g'));
  await settle();
  await Promise.all([first, write, after]);
  check('a write in between: the read after it is not joined to the one before', net.length === 3, net.map((c) => c.method));

  net.length = 0;
  const fnWrite = f('https://x.supabase.co/functions/v1/concierge-respond', { ...auth('g'), method: 'POST', body: '{}' });
  const fnAfter = f(A, auth('g'));
  await settle();
  await Promise.all([fnWrite, fnAfter]);
  check('a function that may write is a write too', net.length === 2);

  net.length = 0;
  const rpc = 'https://x.supabase.co/rest/v1/rpc/my_personal_details';
  p = Promise.all([f(rpc, { ...auth('g'), method: 'POST', body: '{}' }), f(rpc, { ...auth('g'), method: 'POST', body: '{}' })]);
  await settle();
  await p;
  check('read-only RPCs are shared', net.length === 1);
  net.length = 0;
  const writeRpc = 'https://x.supabase.co/rest/v1/rpc/cancel_experience_booking';
  p = Promise.all([f(writeRpc, { ...auth('g'), method: 'POST', body: '{"b":1}' }), f(writeRpc, { ...auth('g'), method: 'POST', body: '{"b":1}' })]);
  await settle();
  await p;
  check('other RPCs (writes) never are, even when identical', net.length === 2);

  net.length = 0;
  p = Promise.all([f(A, { headers: { ...auth('g').headers, Accept: 'application/vnd.pgrst.object+json' } }), f(A, auth('g'))]);
  await settle();
  await p;
  check('a different representation (single row or list) is a different read', net.length === 2);

  net.length = 0;
  status = 500;
  const failed = f(A, auth('g'));
  await settle();
  check('an error is passed on as it came', (await failed).status === 500);
  status = 200;
  p = Promise.all([f(A, auth('g'))]);
  await settle();
  await p;
  check('…and never reused', net.length === 2);

  // ─── Refresh on focus: only when something may have changed ──────────────
  for (const m of ['getOverview', 'listBookings', 'unreadCount', 'upcoming', 'subscribe', 'checkAvailability', 'openConversation']) check(`${m} is a read`, isReadMethod(m));
  for (const m of ['requestBooking', 'cancelBooking', 'updatePreferences', 'sendMessage', 'performAction', 'submit', 'markRead', 'recordFeedback', 'approveStep', 'acceptAlternative', 'saveFeedback']) check(`${m} is a change`, !isReadMethod(m));
  const v0 = dataVersion();
  noteServiceCall('getOverview');
  check('a read leaves the data version alone', dataVersion() === v0);
  noteServiceCall('requestBooking');
  check('a change moves it', dataVersion() === v0 + 1);
  const focus = readFileSync(join(SRC, 'hooks/useRefreshOnFocus.ts'), 'utf8');
  check('screens refresh on focus when the version moved or the data is old', /dataVersion\(\) !== loaded\.current\.version \|\| Date\.now\(\) - loaded\.current\.at > REFRESH_AFTER_MS/.test(focus));
  check('every service call is counted', /noteServiceCall\(prop\)/.test(readFileSync(join(SRC, 'services/instrument.ts'), 'utf8')));

  // ─── Discover: a card renders again only when it changed ─────────────────
  const card = readFileSync(join(SRC, 'features/discover/components/ExperienceCard.tsx'), 'utf8');
  check('ExperienceCard is memoised', /export const ExperienceCard = memo\(/.test(card));
  const hook = readFileSync(join(SRC, 'features/discover/useDiscover.ts'), 'utf8');
  check('toggleSave keeps one identity (no dependency on the saved set)', /\[services, guestId\],\n  \);\n  const viewed/.test(hook) && /savedRef\.current/.test(hook));
  check('the results list is deferred', /useDeferredValue\(incoming\)/.test(readFileSync(join(SRC, 'features/discover/components/DiscoverSections.tsx'), 'utf8')));
  check('the Supabase client shares identical reads', /global: \{ fetch: coalescingFetch\(fetch\) \}/.test(readFileSync(join(SRC, 'services/remote/supabaseClient.ts'), 'utf8')));

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Performance: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Performance: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
