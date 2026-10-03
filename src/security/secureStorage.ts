/**
 * Secure token storage.
 *
 * iOS Keychain / Android Keystore via expo-secure-store. Tokens are never
 * written to AsyncStorage, logs or analytics. On web (preview only) we fall
 * back to an in-memory store so nothing persists in localStorage.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { chunkedStorage } from './chunkedStorage';

const memory = new Map<string, string>();
const isWeb = Platform.OS === 'web';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return memory.get(key) ?? null;
    return SecureStore.getItemAsync(key, options);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      memory.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, options);
  },
  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      memory.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(key, options);
  },
};

/**
 * Keychain entries are limited to about 2 KB and a Supabase session can be
 * larger, so supabase-js gets a chunking wrapper (still keychain only).
 */
export const supabaseAuthStorage = chunkedStorage(secureStorage);
