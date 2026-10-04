/**
 * Environment configuration.
 *
 * Only `EXPO_PUBLIC_*` values are inlined into the bundle, so nothing here may
 * ever be a secret. Server credentials (Supabase service role, Bonvoy client
 * secret, AI provider keys) live in Edge Function secrets / enterprise vaults.
 *
 * Each variable must be read with a *static* `process.env.EXPO_PUBLIC_X`
 * expression — Expo inlines values at build time by matching that exact
 * syntax, so dynamic access (`process.env[name]`) would be empty in builds.
 */
export type ServiceMode = 'mock' | 'supabase' | 'enterprise';
export type AppEnv = 'development' | 'staging' | 'production';
export type LogLevelName = 'debug' | 'info' | 'warn' | 'error';

const raw = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  serviceMode: process.env.EXPO_PUBLIC_SERVICE_MODE,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  logLevel: process.env.EXPO_PUBLIC_LOG_LEVEL,
  demoNow: process.env.EXPO_PUBLIC_DEMO_NOW,
  mockScenario: process.env.EXPO_PUBLIC_MOCK_SCENARIO,
};

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const appEnv = pick(raw.appEnv, ['development', 'staging', 'production'] as const, 'development');

export const env = {
  appEnv,
  serviceMode: pick(raw.serviceMode, ['mock', 'supabase', 'enterprise'] as const, 'mock'),
  supabaseUrl: raw.supabaseUrl ?? '',
  supabaseAnonKey: raw.supabaseAnonKey ?? '',
  apiBaseUrl: raw.apiBaseUrl ?? '',
  logLevel: pick(raw.logLevel, ['debug', 'info', 'warn', 'error'] as const, appEnv === 'production' ? 'warn' : 'debug'),
  /** Mock-only: pin "now" to demo a journey phase. Empty = the dataset's reference moment. */
  demoNow: raw.demoNow ?? '',
  /** Mock-only: force a data condition to exercise empty / loading / error states. */
  mockScenario: pick(raw.mockScenario, ['default', 'empty', 'slow', 'error', 'partial-error'] as const, 'default'),
} as const;

export type Env = typeof env;

const LOCAL_HOST = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(\/|$)/;

/** https everywhere; plain http only to a local Supabase / BFF in development. */
function secureUrl(url: string, e: Env): boolean {
  return /^https:\/\//.test(url) || (e.appEnv === 'development' && LOCAL_HOST.test(url));
}

/**
 * True when a value meant to be the public anon key is a privileged key:
 * a legacy JWT whose role is not `anon`, or a new-style `sb_secret_` key.
 * Such a key bypasses Row Level Security and must never be in the bundle.
 */
export function isPrivilegedSupabaseKey(key: string): boolean {
  if (!key) return false;
  if (key.startsWith('sb_secret_')) return true;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const decode = (globalThis as { atob?: (s: string) => string }).atob;
    if (!decode) return false;
    const json = JSON.parse(decode(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))) as { role?: string };
    return typeof json.role === 'string' && json.role !== 'anon';
  } catch {
    return false;
  }
}

/** Issues containing this marker stop the app in every mode. */
export const SECRET_IN_BUNDLE = 'SECRET_IN_BUNDLE';
/** Issues containing this marker stop the app: a build that would run with demo sign-in where it must not. */
export const UNSAFE_BUILD = 'UNSAFE_BUILD';

/** How the bundle was built: a release build, and the values as written (before defaults). */
export interface BuildInfo {
  release: boolean;
  appEnv: string | undefined;
  serviceMode: string | undefined;
}

/** True in a release bundle (`__DEV__` is false); false in development and in Node scripts. */
function isReleaseBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && !__DEV__;
}

const thisBuild: BuildInfo = { release: isReleaseBuild(), appEnv: raw.appEnv, serviceMode: raw.serviceMode };

/**
 * Returns human-readable configuration problems. Mock mode needs nothing;
 * remote modes need their endpoints. Called once by the service registry.
 */
export function validateEnv(e: Env = env, build: BuildInfo = thisBuild): string[] {
  const issues: string[] = [];
  if (build.serviceMode && build.serviceMode !== e.serviceMode) issues.push(`Unknown EXPO_PUBLIC_SERVICE_MODE "${build.serviceMode}" — using "${e.serviceMode}".`);
  // A missing or misspelt value must never quietly become development + mock (demo sign-in, any code accepted).
  if (build.release && build.appEnv !== e.appEnv) issues.push(`${UNSAFE_BUILD}: a release build needs EXPO_PUBLIC_APP_ENV set to development, staging or production.`);
  if (build.release && build.serviceMode !== e.serviceMode) issues.push(`${UNSAFE_BUILD}: a release build needs EXPO_PUBLIC_SERVICE_MODE set to mock, supabase or enterprise.`);
  // Mock and enterprise modes sign in with the demo account (enterprise's identity adapter is not built yet).
  if (e.appEnv === 'production' && e.serviceMode !== 'supabase') issues.push(`${UNSAFE_BUILD}: production runs on Supabase only; "${e.serviceMode}" mode signs in with the demo account.`);
  if (e.appEnv === 'staging' && e.serviceMode === 'enterprise') issues.push(`${UNSAFE_BUILD}: enterprise mode has no real sign-in yet; development only.`);
  // Checked in every mode: anything EXPO_PUBLIC_ is shipped inside the app.
  if (isPrivilegedSupabaseKey(e.supabaseAnonKey)) {
    issues.push(`${SECRET_IN_BUNDLE}: EXPO_PUBLIC_SUPABASE_ANON_KEY holds a service-role or secret key. Use the anon (publishable) key; keep secrets in Edge Function secrets.`);
  }
  if (e.serviceMode === 'enterprise' && !secureUrl(e.apiBaseUrl, e)) issues.push('EXPO_PUBLIC_API_BASE_URL must be an https:// URL in enterprise mode.');
  if (e.serviceMode === 'supabase') {
    if (!secureUrl(e.supabaseUrl, e)) issues.push('EXPO_PUBLIC_SUPABASE_URL must be an https:// URL in supabase mode (http://localhost is allowed in development).');
    if (!e.supabaseAnonKey) issues.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is required in supabase mode.');
  }
  if (e.demoNow && Number.isNaN(Date.parse(e.demoNow))) issues.push('EXPO_PUBLIC_DEMO_NOW is not a valid ISO date-time.');
  return issues;
}
