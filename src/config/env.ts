/**
 * Environment configuration.
 *
 * Only `EXPO_PUBLIC_*` values are inlined into the bundle, so nothing here may
 * ever be a secret. Server credentials (Supabase service role, Bonvoy client
 * secret, AI provider keys) live in Edge Function secrets / enterprise vaults.
 */
export type ServiceMode = 'mock' | 'supabase' | 'enterprise';

function read(name: string, fallback = ''): string {
  // Expo statically replaces process.env.EXPO_PUBLIC_* at build time.
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

const mode = read('EXPO_PUBLIC_SERVICE_MODE', 'mock');

export const env = {
  appEnv: read('EXPO_PUBLIC_APP_ENV', 'development') as 'development' | 'staging' | 'production',
  serviceMode: (['mock', 'supabase', 'enterprise'].includes(mode) ? mode : 'mock') as ServiceMode,
  supabaseUrl: read('EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: read('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  apiBaseUrl: read('EXPO_PUBLIC_API_BASE_URL'),
  /** Mock-only: pin "now" to demo a journey phase. */
  demoNow: read('EXPO_PUBLIC_DEMO_NOW', '2026-10-15T10:00:00+01:00'),
} as const;
