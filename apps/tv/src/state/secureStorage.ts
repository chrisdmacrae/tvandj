import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Keystore-backed storage for secrets on device. expo-secure-store has no web
 * implementation, so the web build (used for layout work) falls back to
 * AsyncStorage/localStorage — acceptable for a dev-only target.
 */
const secure = Platform.OS !== 'web';

export const secureStorage = {
  get: (key: string) => (secure ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key)),
  set: (key: string, value: string) => (secure ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value)),
  remove: (key: string) => (secure ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key)),
};
