/**
 * Device-backed KeyValueStore: AsyncStorage on iOS/Android, localStorage on web.
 *
 * Neither is encrypted, so it holds nothing secret or special-category:
 * tokens use secure storage, and dietary and accessibility preferences stay
 * in memory (LocalPreferencesRepository). Used only for mock persistence; in
 * Supabase mode preferences live in Postgres behind RLS. Wiped at sign-out
 * (security/deviceData).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ListableStore } from '@/security/deviceData';

export const asyncStorageStore: ListableStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
  keys: () => AsyncStorage.getAllKeys(),
  removeMany: (keys) => AsyncStorage.multiRemove(keys),
};
