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
import { MemoryKeyValueStore, type KeyValueStore } from './KeyValueStore';

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
 * Special-category groups (health-adjacent: allergies, mobility). Device
 * storage is not encrypted (AsyncStorage files, browser localStorage), so
 * these are never written to it; they are kept in `sensitiveStore`, memory by
 * default, and forgotten at sign-out. Supabase mode keeps them server-side.
 */
export const SPECIAL_CATEGORY_GROUPS = ['dietary', 'accessibility'] as const satisfies readonly (keyof GuestPreferences)[];
type SpecialGroup = (typeof SPECIAL_CATEGORY_GROUPS)[number];

function split(p: Partial<GuestPreferences>): { general: Partial<GuestPreferences>; special: Partial<Pick<GuestPreferences, SpecialGroup>> } {
  const general: Record<string, unknown> = { ...p };
  const special: Record<string, unknown> = {};
  for (const k of SPECIAL_CATEGORY_GROUPS) {
    if (k in general) special[k] = general[k];
    delete general[k];
  }
  return { general: general as Partial<GuestPreferences>, special: special as Partial<Pick<GuestPreferences, SpecialGroup>> };
}

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
    /** Where special-category groups are kept: never device storage. */
    private readonly sensitiveStore: KeyValueStore = new MemoryKeyValueStore(),
  ) {}

  private key(guestId: ID) {
    return `${KEY_PREFIX}${guestId}`;
  }

  async load(guestId: ID): Promise<VersionedPreferences | null> {
    const raw = await this.store.getItem(this.key(guestId));
    if (!raw) return null;
    let rec: StoredRecord;
    try {
      rec = JSON.parse(raw) as StoredRecord;
      if (rec.schema !== 1 || typeof rec.version !== 'number' || !rec.preferences) return null;
    } catch {
      // A corrupt record must never lock the guest out; fall back to defaults.
      return null;
    }
    const { general, special } = split(rec.preferences);
    if (Object.keys(special).length) {
      // Written by an earlier version: move the special-category groups off the device.
      await this.sensitiveStore.setItem(this.key(guestId), JSON.stringify({ ...(await this.loadSpecial(guestId)), ...special }));
      await this.store.setItem(this.key(guestId), JSON.stringify({ ...rec, preferences: general }));
    }
    const preferences = { ...general, ...(await this.loadSpecial(guestId)) } as GuestPreferences;
    return { preferences, version: rec.version, updatedAt: rec.updatedAt, source: 'device' };
  }

  private async loadSpecial(guestId: ID): Promise<Partial<GuestPreferences>> {
    const raw = await this.sensitiveStore.getItem(this.key(guestId));
    try {
      return raw ? (JSON.parse(raw) as Partial<GuestPreferences>) : {};
    } catch {
      return {};
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
    const { general, special } = split(merged);
    const rec: StoredRecord = { schema: 1, version: currentVersion + 1, updatedAt: this.now().toISOString(), preferences: general as GuestPreferences };
    await this.sensitiveStore.setItem(this.key(guestId), JSON.stringify(special));
    await this.store.setItem(this.key(guestId), JSON.stringify(rec));
    return { preferences: merged, version: rec.version, updatedAt: rec.updatedAt, source: 'device' };
  }

  /** Development helper: forget saved preferences for a guest. */
  async clear(guestId: ID): Promise<void> {
    await this.store.removeItem(this.key(guestId));
    await this.sensitiveStore.removeItem(this.key(guestId));
  }
}
