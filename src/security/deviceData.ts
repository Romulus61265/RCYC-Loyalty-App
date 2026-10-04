/**
 * What this app keeps on the device, and wiping it at sign-out.
 *
 * Everything the app writes to device storage is under the `rcyc.` prefix;
 * session tokens are in the keychain (secureStorage) and are removed by the
 * auth service itself. Anything held in memory for the session (e.g. the
 * special-category preferences of LocalPreferencesRepository) registers a
 * clearer here. After a sign-out nothing of the guest is left behind for the
 * next person to use the device.
 */
import type { KeyValueStore } from '@/services/repositories/KeyValueStore';

export const DEVICE_KEY_PREFIX = 'rcyc.';

/** Device storage that can list its keys (AsyncStorage can). */
export interface ListableStore extends KeyValueStore {
  keys(): Promise<readonly string[]>;
  removeMany(keys: readonly string[]): Promise<void>;
}

export class DeviceData {
  private clearers = new Set<() => void | Promise<void>>();

  constructor(private readonly stores: ListableStore[] = []) {}

  /** Registers something held for the session that a sign-out must forget. */
  onWipe(clear: () => void | Promise<void>): () => void {
    this.clearers.add(clear);
    return () => this.clearers.delete(clear);
  }

  /** Removes every `rcyc.` key from device storage and runs every clearer. Never throws. */
  async wipe(): Promise<{ removed: number; failed: number }> {
    let removed = 0;
    let failed = 0;
    for (const store of this.stores) {
      try {
        const ours = (await store.keys()).filter((k) => k.startsWith(DEVICE_KEY_PREFIX));
        if (ours.length) await store.removeMany(ours);
        removed += ours.length;
      } catch {
        failed += 1;
      }
    }
    for (const clear of this.clearers) {
      try {
        await clear();
      } catch {
        failed += 1;
      }
    }
    return { removed, failed };
  }
}
