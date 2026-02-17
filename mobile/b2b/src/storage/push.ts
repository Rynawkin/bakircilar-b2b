import * as SecureStore from 'expo-secure-store';

const PUSH_TOKEN_KEY = 'b2b-push-token';

export async function savePushToken(token: string) {
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
}

export async function getPushToken() {
  return SecureStore.getItemAsync(PUSH_TOKEN_KEY);
}

export async function clearPushToken() {
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}
