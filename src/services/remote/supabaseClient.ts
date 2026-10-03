/**
 * Supabase client factory. Uses only the public URL and anon key (protected
 * by RLS) and keeps the session in secure storage. Created lazily so mock
 * mode never touches Supabase.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { ServiceError } from '@/services/contracts';
import { supabaseAuthStorage } from '@/security/secureStorage';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new ServiceError('unavailable', 'Supabase is not configured');
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { storage: supabaseAuthStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
