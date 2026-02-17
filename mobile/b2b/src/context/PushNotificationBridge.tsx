import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

import { customerApi } from '../api/customer';
import { useAuth } from './AuthContext';
import { savePushToken } from '../storage/push';
import { hapticMedium, hapticSuccess } from '../utils/haptics';
import { inferDeviceName, inferPlatform, registerPushToken } from '../utils/pushNotifications';
import { navigateFromNotificationLink } from '../navigation/notificationLinking';

export function PushNotificationBridge() {
  const { user } = useAuth();
  const handledResponseIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || user.role !== 'CUSTOMER') return;

    let mounted = true;
    const register = async () => {
      try {
        const token = await registerPushToken();
        if (!token || !mounted) return;
        await customerApi.registerPushToken({
          token,
          platform: inferPlatform(),
          appName: 'b2b',
          deviceName: inferDeviceName() || undefined,
        });
        await savePushToken(token);
      } catch {
        // Keep app usable when push registration fails.
      }
    };

    register();
    return () => {
      mounted = false;
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      hapticMedium();
    });

    const onNotificationResponse = (response: Notifications.NotificationResponse) => {
      const notificationId = String(response.notification?.request?.identifier || '');
      if (notificationId && handledResponseIdsRef.current.has(notificationId)) {
        return;
      }
      if (notificationId) {
        handledResponseIdsRef.current.add(notificationId);
      }

      hapticSuccess();
      const maybeLink = response.notification.request.content.data?.linkUrl;
      if (typeof maybeLink === 'string' && maybeLink.length > 0) {
        navigateFromNotificationLink(maybeLink);
      }
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(onNotificationResponse);

    Notifications.getLastNotificationResponseAsync()
      .then((lastResponse) => {
        if (lastResponse) {
          onNotificationResponse(lastResponse);
        }
      })
      .catch(() => undefined);

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  return null;
}
