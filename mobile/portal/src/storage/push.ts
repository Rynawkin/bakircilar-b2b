import { deleteStoredValue, getStoredValue, setStoredValue } from './kv';

const PUSH_TOKEN_KEY = 'portal-push-token';

export async function savePushToken(token: string) {
  await setStoredValue(PUSH_TOKEN_KEY, token);
}

export async function getPushToken() {
  return getStoredValue(PUSH_TOKEN_KEY);
}

export async function clearPushToken() {
  await deleteStoredValue(PUSH_TOKEN_KEY);
}
