import * as SecureStore from 'expo-secure-store';
import { User } from '../types';

const TOKEN_KEY = 'b2b-auth-token';
const USER_KEY = 'b2b-auth-user';

export async function saveAuth(token: string, user: User) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getAuthToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getAuthUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function clearAuth() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
