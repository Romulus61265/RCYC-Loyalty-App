/**
 * Minimal async key/value storage used by local repositories. Kept tiny so
 * device storage, browser storage and test doubles are interchangeable.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Uses `primary`, falling back to `fallback` if it throws (e.g. storage
 * disabled in a private browser window). Never loses a save silently: the
 * fallback holds it for the session and `onFallback` lets us log it.
 */
export function resilientStore(primary: KeyValueStore, fallback: KeyValueStore, onFallback: (e: unknown) => void): KeyValueStore {
  let degraded = false;
  const run = async <T,>(op: (s: KeyValueStore) => Promise<T>): Promise<T> => {
    if (!degraded) {
      try {
        return await op(primary);
      } catch (e) {
        degraded = true;
        onFallback(e);
      }
    }
    return op(fallback);
  };
  return {
    getItem: (k) => run((s) => s.getItem(k)),
    setItem: (k, v) => run((s) => s.setItem(k, v)),
    removeItem: (k) => run((s) => s.removeItem(k)),
  };
}

/** In-memory store: tests, previews, and a fallback when device storage fails. */
export class MemoryKeyValueStore implements KeyValueStore {
  private map = new Map<string, string>();

  async getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  async removeItem(key: string) {
    this.map.delete(key);
  }
}
