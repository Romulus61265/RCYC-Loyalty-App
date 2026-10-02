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
  /** Mock-only: pin "now" to demo a journey phase. */
  demoNow: raw.demoNow || '2026-10-15T10:00:00+01:00',
} as const;

export type Env = typeof env;

/**
 * Returns human-readable configuration problems. Mock mode needs nothing;
 * remote modes need their endpoints. Called once by the service registry.
 */
export function validateEnv(e: Env = env): string[] {
  const issues: string[] = [];
  if (raw.serviceMode && raw.serviceMode !== e.serviceMode) issues.push(`Unknown EXPO_PUBLIC_SERVICE_MODE "${raw.serviceMode}" — using "${e.serviceMode}".`);
  if (e.serviceMode !== 'mock') {
    if (!/^https:\/\//.test(e.apiBaseUrl)) issues.push('EXPO_PUBLIC_API_BASE_URL must be an https:// URL outside mock mode.');
    if (e.serviceMode === 'supabase' && !/^https:\/\//.test(e.supabaseUrl)) issues.push('EXPO_PUBLIC_SUPABASE_URL must be an https:// URL in supabase mode.');
    if (e.serviceMode === 'supabase' && !e.supabaseAnonKey) issues.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is required in supabase mode.');
  }
  if (Number.isNaN(Date.parse(e.demoNow))) issues.push('EXPO_PUBLIC_DEMO_NOW is not a valid ISO date-time.');
  if (e.appEnv === 'production' && e.serviceMode === 'mock') issues.push('Production build is running on mock services.');
  return issues;
}
