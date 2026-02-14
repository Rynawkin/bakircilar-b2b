import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const getProjectId = () => {
  const fromEasConfig = (Constants as any)?.easConfig?.projectId;
  const fromExpoConfig = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
  return fromEasConfig || fromExpoConfig || undefined;
};

export async function registerPushToken() {
  if (!Device.isDevice) {
    return null;
  }

  const current = await Notifications.getPermissionsAsync();
  let finalStatus = current.status;

  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#0B2E6B',
    });
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId: getProjectId(),
    })
  ).data;

  return token || null;
}

export function inferPlatform() {
  return Platform.OS;
}

export function inferDeviceName() {
  return Device.deviceName || Device.modelName || null;
}
