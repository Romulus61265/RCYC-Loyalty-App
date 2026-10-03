/**
 * Preferences persistence, behind an interface.
 *
 * The profile service talks to `PreferencesRepository`, never to a storage
 * technology. Implementations:
 *   - LocalPreferencesRepository: device storage (MVP mock persistence)
 *   - SupabasePreferencesRepository (src/services/remote): guest_preferences
 * The service registry chooses one; the UI never knows which.
 */
import type { GuestPreferences, ID, PreferencesPatch, VersionedPreferences } from '@/domain';
import { ServiceError } from '@/services/contracts';
import type { KeyValueStore } from './KeyValueStore';

export interface PreferencesRepository {
  /** Saved preferences, or null when the guest has never saved any. */
  load(guestId: ID): Promise<VersionedPreferences | null>;
  /**
   * Replaces the patched groups. With `expectedVersion`, fails with
   * `ServiceError('conflict')` if another device saved in the meantime.
   */
  save(guestId: ID, base: GuestPreferences, patch: PreferencesPatch, expectedVersion?: number): Promise<VersionedPreferences>;
}

interface StoredRecord {
  schema: 1;
  version: number;
  updatedAt: string;
  preferences: GuestPreferences;
}

const KEY_PREFIX = 'rcyc.preferences.v1.';

/**
 * Lays stored preferences over defaults one *group* at a time: a group the
 * guest has saved is used exactly as saved (so a cleared field stays
 * cleared), while groups the stored record never had — e.g. ones added in a
 * later app version — come from the defaults.
 */
export function mergePreferences(defaults: GuestPreferences, stored: Partial<GuestPreferences>): GuestPreferences {
  const out: GuestPreferences = { ...defaults };
  for (const key of Object.keys(stored) as (keyof GuestPreferences)[]) {
    if (stored[key] !== undefined && key !== 'guestId') (out as unknown as Record<string, unknown>)[key] = stored[key];
  }
  return out;
}

export class LocalPreferencesRepository implements PreferencesRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private key(guestId: ID) {
    return `${KEY_PREFIX}${guestId}`;
  }

  async load(guestId: ID): Promise<VersionedPreferences | null> {
    const raw = await this.store.getItem(this.key(guestId));
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw) as StoredRecord;
      if (rec.schema !== 1 || typeof rec.version !== 'number' || !rec.preferences) return null;
      return { preferences: rec.preferences, version: rec.version, updatedAt: rec.updatedAt, source: 'device' };
    } catch {
      // A corrupt record must never lock the guest out; fall back to defaults.
      return null;
    }
  }

  async save(guestId: ID, base: GuestPreferences, patch: PreferencesPatch, expectedVersion?: number): Promise<VersionedPreferences> {
    const current = await this.load(guestId);
    const currentVersion = current?.version ?? 0;
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new ServiceError('conflict', `Preferences changed elsewhere (have v${expectedVersion}, stored v${currentVersion})`);
    }
    // Patched groups replace the stored group whole (cleared fields stay cleared);
    // defaults only fill groups the stored record has never had.
    const merged: GuestPreferences = { ...mergePreferences(base, current?.preferences ?? {}), ...patch, guestId: base.guestId };
    const rec: StoredRecord = { schema: 1, version: currentVersion + 1, updatedAt: this.now().toISOString(), preferences: merged };
    await this.store.setItem(this.key(guestId), JSON.stringify(rec));
    return { preferences: merged, version: rec.version, updatedAt: rec.updatedAt, source: 'device' };
  }

  /** Development helper: forget saved preferences for a guest. */
  async clear(guestId: ID): Promise<void> {
    await this.store.removeItem(this.key(guestId));
  }
}
