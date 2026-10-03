/**
 * Supabase client factory. Uses only the public URL and anon key (protected
 * by RLS) and keeps the session in secure storage. Created lazily so mock
 * mode never touches Supabase.
 */
import { AppState, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { ServiceError } from '@/services/contracts';
import { supabaseAuthStorage } from '@/security/secureStorage';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new ServiceError('unavailable', 'Supabase is not configured');
  if (!client) {
    const created = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { storage: supabaseAuthStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    // Refresh tokens only while the app is in the foreground (Supabase guidance for React Native).
    if (Platform.OS !== 'web') {
      AppState.addEventListener('change', (state) => (state === 'active' ? created.auth.startAutoRefresh() : created.auth.stopAutoRefresh()));
    }
    client = created;
  }
  return client;
}
