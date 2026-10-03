/**
 * Device-backed KeyValueStore: AsyncStorage on iOS/Android, localStorage on web.
 *
 * Used only for MVP mock persistence. In production, preferences live in
 * Supabase (RLS-protected) and this store is not used for them; tokens never
 * go here (they use secure storage).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStore } from './KeyValueStore';

export const asyncStorageStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
