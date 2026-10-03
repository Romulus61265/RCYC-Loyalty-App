/**
 * Splits values too large for one keychain entry (about 2 KB) into numbered
 * chunks in the same store. Nothing falls back to unencrypted storage.
 * `<key>` holds "chunks:<n>"; `<key>.<i>` hold the parts.
 */
export interface StringStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const CHUNKED = /^chunks:(\d{1,3})$/;

export function chunkedStorage(base: StringStore, chunkSize = 1800): StringStore {
  const removeChunks = async (key: string) => {
    const count = Number((await base.getItem(key))?.match(CHUNKED)?.[1] ?? 0);
    await Promise.all(Array.from({ length: count }, (_, i) => base.removeItem(`${key}.${i}`)));
  };
  return {
    async getItem(key) {
      const head = await base.getItem(key);
      const m = head?.match(CHUNKED);
      if (!m) return head;
      const parts = await Promise.all(Array.from({ length: Number(m[1]) }, (_, i) => base.getItem(`${key}.${i}`)));
      // A missing part means an interrupted write: treat as signed out rather than use a corrupt token.
      return parts.every((p) => p !== null) ? parts.join('') : null;
    },
    async setItem(key, value) {
      await removeChunks(key);
      if (value.length <= chunkSize) {
        await base.setItem(key, value);
        return;
      }
      const parts = Array.from({ length: Math.ceil(value.length / chunkSize) }, (_, i) => value.slice(i * chunkSize, (i + 1) * chunkSize));
      await Promise.all(parts.map((p, i) => base.setItem(`${key}.${i}`, p)));
      // The manifest is written last, so a partial write is never read as complete.
      await base.setItem(key, `chunks:${parts.length}`);
    },
    async removeItem(key) {
      await removeChunks(key);
      await base.removeItem(key);
    },
  };
}
