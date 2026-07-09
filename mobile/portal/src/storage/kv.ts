import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const webStorage = () => (globalThis as any).localStorage as
  | { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void }
  | undefined;

export async function setStoredValue(key: string, value: string) {
  if (Platform.OS === 'web') {
    webStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webStorage()?.getItem(key) || null;
  return SecureStore.getItemAsync(key);
}

export async function deleteStoredValue(key: string) {
  if (Platform.OS === 'web') {
    webStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
