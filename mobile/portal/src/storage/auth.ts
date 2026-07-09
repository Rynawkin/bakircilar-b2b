import { User } from '../types';
import { deleteStoredValue, getStoredValue, setStoredValue } from './kv';

const TOKEN_KEY = 'portal-auth-token';
const USER_KEY = 'portal-auth-user';

export async function saveAuth(token: string, user: User) {
  await setStoredValue(TOKEN_KEY, token);
  await setStoredValue(USER_KEY, JSON.stringify(user));
}

export async function getAuthToken() {
  return getStoredValue(TOKEN_KEY);
}

export async function getAuthUser(): Promise<User | null> {
  const raw = await getStoredValue(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function clearAuth() {
  await deleteStoredValue(TOKEN_KEY);
  await deleteStoredValue(USER_KEY);
}
