/// <reference types="node" />
/**
 * Supabase integration checks that need no database.  Run: `npm run check:supabase`
 *
 *  • the committed seed matches the development dataset;
 *  • configuration refuses privileged keys and insecure URLs;
 *  • sign-in: no account enumeration, codes and challenges validated, an
 *    unlinked account is signed out, token refreshes don't reload the app;
 *  • keychain chunking for large sessions;
 *  • row mapping refuses external links, IDs can't alter filters, error codes map;
 *  • static scans: no service-role key or server secret in app code, every
 *    table in the migrations has RLS and every view is security_invoker.
 *
 * The end-to-end check against PostgreSQL + PostgREST is `npm run test:supabase`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPrivilegedSupabaseKey, validateEnv, type Env } from '@/config/env';
import { chunkedStorage, type StringStore } from '@/security/chunkedStorage';
import { toAlert, toNotification, type AlertRow, type NotificationRow } from '@/services/supabase/rows';
import { SupabaseAuthService } from '@/services/supabase/SupabaseAuthService';
import { toServiceError, uuid } from '@/services/supabase/support';
import { buildSeedRows, renderSeedSql } from './supabase/seedRows';

const ROOT = resolve(__dirname, '..');
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
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
function files(dir: string, ext: RegExp): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((f) => {
    const rel = join(dir, f);
    return statSync(join(ROOT, rel)).isDirectory() ? files(rel, ext) : ext.test(f) ? [rel] : [];
  });
}
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role, iss: 'supabase' })}.sig`;

async function main() {
  // ── Seed ──
  check('supabase/seed.sql is up to date (npm run seed:generate)', read('supabase/seed.sql') === renderSeedSql(buildSeedRows()));
  const seed = read('supabase/seed.sql');
  check('seed is marked fictional and refuses real databases', /FICTIONAL/.test(seed) && /Refusing to load the fictional seed/.test(seed));
  check('seed uses example.com addresses only', (seed.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).every((e) => e.endsWith('@example.com')));
  check('seed creates no auth users or roles', !/insert into (auth\.|public\.user_roles)/.test(seed));

  // ── Configuration ──
  check('service-role JWT is detected', isPrivilegedSupabaseKey(fakeJwt('service_role')));
  check('secret key is detected', isPrivilegedSupabaseKey('sb_secret_abc123'));
  check('anon JWT is accepted', !isPrivilegedSupabaseKey(fakeJwt('anon')));
  check('publishable key is accepted', !isPrivilegedSupabaseKey('sb_publishable_abc123'));
  check('malformed key is not treated as privileged', !isPrivilegedSupabaseKey('not.a.jwt'));
  const base: Env = { appEnv: 'development', serviceMode: 'supabase', supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: fakeJwt('anon'), apiBaseUrl: '', logLevel: 'info', demoNow: '', mockScenario: 'default' };
  check('supabase mode needs no API_BASE_URL', validateEnv(base).length === 0, validateEnv(base));
  check('service-role key is refused, in any mode', validateEnv({ ...base, serviceMode: 'mock', supabaseAnonKey: fakeJwt('service_role') }).some((i) => i.startsWith('SECRET_IN_BUNDLE')));
  check('missing anon key is reported', validateEnv({ ...base, supabaseAnonKey: '' }).some((i) => /ANON_KEY/.test(i)));
  check('http://localhost allowed in development', validateEnv({ ...base, supabaseUrl: 'http://127.0.0.1:54321' }).length === 0);
  check('plain http refused in production', validateEnv({ ...base, appEnv: 'production', supabaseUrl: 'http://127.0.0.1:54321' }).some((i) => /SUPABASE_URL/.test(i)));
  check('plain http to a remote host refused', validateEnv({ ...base, supabaseUrl: 'http://abc.supabase.co' }).some((i) => /SUPABASE_URL/.test(i)));
  check('enterprise mode still needs API_BASE_URL', validateEnv({ ...base, serviceMode: 'enterprise' }).some((i) => /API_BASE_URL/.test(i)));

  // ── Sign-in ──
  const calls: { method: string; args: unknown }[] = [];
  let otpError: { message: string; status?: number } | null = null;
  let verifyResult: { data: { session: unknown }; error: { message: string } | null } = { data: { session: null }, error: { message: 'Token has expired or is invalid' } };
  let linkedGuest: string | null = 'guest-1';
  let signOutError: { message: string } | null = null;
  const hooks: { listener: ((event: string, session: unknown) => void) | null } = { listener: null };
  const session = { user: { id: 'user-1' }, expires_at: 1_900_000_000, access_token: 'a', refresh_token: 'r' };
  const query = (result: unknown) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => result, then: (r: (v: unknown) => void) => r(result) };
    return q;
  };
  const fake = {
    auth: {
      signInWithOtp: async (args: unknown) => (calls.push({ method: 'signInWithOtp', args }), { data: {}, error: otpError }),
      verifyOtp: async (args: unknown) => (calls.push({ method: 'verifyOtp', args }), verifyResult),
      getSession: async () => ({ data: { session }, error: null }),
      signOut: async (args?: unknown) => (calls.push({ method: 'signOut', args }), { error: signOutError }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1' } }) },
      onAuthStateChange: (fn: (event: string, session: unknown) => void) => ((hooks.listener = fn), { data: { subscription: { unsubscribe: () => (hooks.listener = null) } } }),
    },
    from: (table: string) => (table === 'guests' ? query({ data: linkedGuest ? { id: linkedGuest } : null, error: null }) : query({ data: [{ role: 'guest' }], error: null })),
  };
  const auth = new SupabaseAuthService(() => fake as unknown as SupabaseClient);

  check('invalid e-mail refused before any call', (await rejects(auth.signInWithOtp('not-an-email'), 'validation')) && calls.length === 0);
  const known = await auth.signInWithOtp('  Alexander.Laurent@Example.com ');
  const otpArgs = calls[0]?.args as { email: string; options: { shouldCreateUser: boolean } };
  check('code requested without creating accounts', otpArgs.options.shouldCreateUser === false && otpArgs.email === 'alexander.laurent@example.com', otpArgs);
  otpError = { message: 'Signups not allowed for otp', status: 422 };
  const unknown = await auth.signInWithOtp('nobody@example.com');
  check('unknown address looks the same as a known one', typeof unknown.challengeId === 'string' && typeof known.challengeId === 'string');
  otpError = { message: 'Email rate limit exceeded', status: 429 };
  check('rate limit reported as unavailable', await rejects(auth.signInWithOtp('nobody@example.com'), 'unavailable'));
  otpError = null;
  check('code must be six digits', await rejects(auth.verifyOtp(known.challengeId, '12ab'), 'validation'));
  check('unknown challenge refused', await rejects(auth.verifyOtp('otp_forged', '123456'), 'validation'));
  check('wrong code refused', await rejects(auth.verifyOtp(known.challengeId, '123456'), 'validation'));
  verifyResult = { data: { session }, error: null };
  const signedIn = await auth.verifyOtp(known.challengeId, '123456');
  check('verified session maps to the guest', signedIn.guestId === 'guest-1' && signedIn.userId === 'user-1' && signedIn.roles[0] === 'guest' && !signedIn.mfaVerified, signedIn);
  check('verify uses the e-mail from the challenge', (calls.find((c) => c.method === 'verifyOtp')?.args as { email: string; type: string }).email === 'alexander.laurent@example.com');
  check('challenge cannot be replayed', await rejects(auth.verifyOtp(known.challengeId, '123456'), 'validation'));
  linkedGuest = null;
  const other = await auth.signInWithOtp('staff@example.com');
  const before = calls.filter((c) => c.method === 'signOut').length;
  check('account without a guest record is refused', await rejects(auth.verifyOtp(other.challengeId, '654321'), 'forbidden'));
  check('… and its session is not kept', calls.filter((c) => c.method === 'signOut').length === before + 1);
  check('getSession is null without a linked guest', (await auth.getSession()) === null);
  linkedGuest = 'guest-1';
  check('Bonvoy sign-in reports unavailable until configured', await rejects(auth.signInWithBonvoy(), 'unavailable'));
  signOutError = { message: 'network' };
  await auth.signOut();
  check('sign-out falls back to clearing the device', (calls.at(-1)?.args as { scope?: string } | undefined)?.scope === 'local');
  const seen: unknown[] = [];
  const stop = auth.onSessionChange((s) => seen.push(s));
  hooks.listener?.('TOKEN_REFRESHED', session);
  hooks.listener?.('SIGNED_OUT', null);
  await new Promise((r) => setTimeout(r, 10));
  check('token refresh does not notify; sign-out does', seen.length === 1 && seen[0] === null, seen);
  stop();
  check('listener removed', hooks.listener === null);

  // ── Keychain chunking ──
  const mem = new Map<string, string>();
  const store: StringStore = { getItem: async (k) => mem.get(k) ?? null, setItem: async (k, v) => void mem.set(k, v), removeItem: async (k) => void mem.delete(k) };
  const chunked = chunkedStorage(store, 100);
  const big = 'x'.repeat(250) + 'end';
  await chunked.setItem('sb-auth', big);
  check('large value is split across entries', mem.get('sb-auth') === 'chunks:3' && [...mem.values()].every((v) => v.length <= 100));
  check('large value reads back intact', (await chunked.getItem('sb-auth')) === big);
  await chunked.setItem('sb-auth', 'small');
  check('shrinking removes old chunks', mem.size === 1 && (await chunked.getItem('sb-auth')) === 'small');
  await chunked.setItem('sb-auth', big);
  mem.delete('sb-auth.1');
  check('a missing chunk reads as signed out', (await chunked.getItem('sb-auth')) === null);
  await chunked.removeItem('sb-auth');
  check('remove clears every chunk', mem.size === 0);

  // ── Mapping and errors ──
  const alert = (route: string | null) => toAlert({ id: 'a', event_id: 'e', event_type: null, severity: 'info', title: 't', body: 'b', handled: null, action_label: 'Open', action_route: route, created_at: '2027-05-10T09:00:00-04:00', expires_at: null, acknowledged_at: null } as AlertRow);
  check('in-app alert action kept', alert('/voyage?section=documents').action?.route === '/voyage?section=documents');
  check('external alert action dropped', alert('https://evil.example').action === undefined && alert('//evil.example').action === undefined);
  const note = (link: string | null) => toNotification({ id: 'n', guest_id: 'g', reservation_id: null, channel: 'push', category: 'travel', title: 't', body: 'b', deep_link: link, scheduled_for: 's', delivered_at: null, read_at: null, bypass_quiet_hours: false } as NotificationRow);
  check('external notification link dropped', note('//evil.example').deepLink === undefined && note('/concierge').deepLink === '/concierge');
  check('IDs that would alter a filter are refused', (() => {
    try {
      uuid('00000000-0000-4000-8000-000000000000,voyage_id.is.null', 'Voyage');
      return false;
    } catch (e) {
      return (e as { code?: string }).code === 'not_found';
    }
  })());
  const codes = ['42501', 'PGRST116', '23505', '40001', '23514', 'PGRST301', 'XX000'].map((c) => toServiceError({ code: c, message: 'm' }).code);
  check('database errors map to service codes', codes.join() === 'forbidden,not_found,conflict,conflict,validation,unauthenticated,unavailable', codes);
  check('network failures are retryable', toServiceError({ message: 'fetch failed' }).retryable === true);

  // ── Static scans ──
  const appFiles = files('src', /\.(ts|tsx)$/);
  const offenders = appFiles.filter((f) => /SERVICE_ROLE|service_role_key|sb_secret_[A-Za-z0-9]/.test(read(f).replace(/startsWith\('sb_secret_'\)/g, '')));
  check('no service-role key referenced in app code', offenders.length === 0, offenders);
  const envReads = appFiles.flatMap((f) => [...read(f).matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]!));
  check('app reads only EXPO_PUBLIC_ variables', envReads.every((n) => n.startsWith('EXPO_PUBLIC_') || n === 'NODE_ENV'), envReads.filter((n) => !n.startsWith('EXPO_PUBLIC_')));
  const clients = appFiles.filter((f) => /\bcreateClient\(/.test(read(f)));
  check('one Supabase client, built from the anon key', clients.length === 1 && /env\.supabaseAnonKey/.test(read(clients[0]!)), clients);
  check('.env.example holds no secret', !/SERVICE_ROLE|SECRET\s*=/.test(read('.env.example')));
  const migrations = files('supabase/migrations', /\.sql$/).map(read).join('\n');
  const tables = [...migrations.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]!);
  const renamed = new Map([...migrations.matchAll(/alter table public\.(\w+)\s+rename to (\w+)/g)].map((m) => [m[1]!, m[2]!]));
  const rls = (t: string) => new RegExp(`alter table public\\.${t} +enable row level security|'${t}'`).test(migrations);
  const missing = tables.filter((t) => !rls(t) && !rls(renamed.get(t) ?? '§'));
  check('every table in the migrations enables RLS', missing.length === 0, missing);
  const views = [...migrations.matchAll(/create (?:or replace )?view public\.(\w+)([^;]*?) as/g)];
  check('every view is security_invoker', views.length > 0 && views.every((m) => /security_invoker = true/.test(m[2]!)), views.filter((m) => !/security_invoker/.test(m[2]!)).map((m) => m[1]));
  const definers = [...migrations.matchAll(/create (?:or replace )?function ([\w.]+)\([^)]*\)[^$]*?security definer([^$]*?)as \$\$/g)];
  check('every SECURITY DEFINER function pins search_path', definers.every((m) => /set search_path/.test(m[2]!)), definers.filter((m) => !/set search_path/.test(m[2]!)).map((m) => m[1]));

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Supabase checks: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Supabase: all ${passed} checks passed.`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
