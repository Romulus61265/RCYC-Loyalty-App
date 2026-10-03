/**
 * PreferencesRepository backed by Supabase `public.guest_preferences`.
 *
 * Row Level Security (policy "own") limits every read and write to the
 * signed-in guest's row. Optimistic concurrency uses the `version` column
 * added in migration 20261003000000: an update only applies when the stored
 * version matches the one the guest edited.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GuestPreferences, ID, PreferencesPatch, VersionedPreferences } from '@/domain';
import { ServiceError } from '@/services/contracts';
import type { PreferencesRepository } from '@/services/repositories/PreferencesRepository';

interface Row {
  guest_id: string;
  preferred_destinations: string[];
  dining: GuestPreferences['dining'];
  dietary: GuestPreferences['dietary'];
  beverage: GuestPreferences['beverage'];
  suite: GuestPreferences['suite'];
  activity_interests: string[];
  excursions: GuestPreferences['excursions'];
  spa: GuestPreferences['spa'];
  transportation: GuestPreferences['transportation'];
  accessibility: GuestPreferences['accessibility'];
  communication: GuestPreferences['communication'];
  privacy: GuestPreferences['privacy'];
  version: number;
  updated_at: string;
}

const COLUMNS =
  'guest_id, preferred_destinations, dining, dietary, beverage, suite, activity_interests, excursions, spa, transportation, accessibility, communication, privacy, version, updated_at';

export function toRow(p: GuestPreferences): Omit<Row, 'version' | 'updated_at'> {
  return {
    guest_id: p.guestId,
    preferred_destinations: p.preferredDestinations,
    dining: p.dining,
    dietary: p.dietary,
    beverage: p.beverage,
    suite: p.suite,
    activity_interests: p.activityInterests,
    excursions: p.excursions,
    spa: p.spa,
    transportation: p.transportation,
    accessibility: p.accessibility,
    communication: p.communication,
    privacy: p.privacy,
  };
}

export function fromRow(r: Row): GuestPreferences {
  return {
    guestId: r.guest_id,
    preferredDestinations: r.preferred_destinations ?? [],
    dining: r.dining,
    dietary: r.dietary,
    beverage: r.beverage,
    suite: r.suite,
    activityInterests: r.activity_interests ?? [],
    excursions: r.excursions,
    spa: r.spa,
    transportation: r.transportation,
    accessibility: r.accessibility,
    communication: r.communication,
    privacy: r.privacy,
  };
}

function fail(error: { code?: string; message: string }): never {
  if (error.code === '23505' || error.code === 'PGRST116') throw new ServiceError('conflict', 'Preferences changed elsewhere');
  if (error.code === '42501') throw new ServiceError('forbidden', 'Not allowed to change these preferences');
  throw new ServiceError('unavailable', error.message, true);
}

export class SupabasePreferencesRepository implements PreferencesRepository {
  constructor(private readonly db: () => SupabaseClient) {}

  async load(guestId: ID): Promise<VersionedPreferences | null> {
    const { data, error } = await this.db().from('guest_preferences').select(COLUMNS).eq('guest_id', guestId).maybeSingle<Row>();
    if (error) fail(error);
    return data ? { preferences: fromRow(data), version: data.version, updatedAt: data.updated_at, source: 'supabase' } : null;
  }

  async save(guestId: ID, base: GuestPreferences, patch: PreferencesPatch, expectedVersion?: number): Promise<VersionedPreferences> {
    const current = await this.load(guestId);
    const currentVersion = current?.version ?? 0;
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) throw new ServiceError('conflict', 'Preferences changed elsewhere');
    const next: GuestPreferences = { ...(current?.preferences ?? base), ...patch, guestId };
    const now = new Date().toISOString();

    const query = current
      ? this.db().from('guest_preferences').update({ ...toRow(next), version: currentVersion + 1, updated_at: now }).eq('guest_id', guestId).eq('version', currentVersion)
      : this.db().from('guest_preferences').insert({ ...toRow(next), version: 1, updated_at: now });
    const { data, error } = await query.select(COLUMNS).single<Row>();
    if (error) fail(error);
    return { preferences: fromRow(data), version: data.version, updatedAt: data.updated_at, source: 'supabase' };
  }
}
