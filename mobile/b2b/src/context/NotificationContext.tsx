import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';

import { customerApi } from '../api/customer';
import { useAuth } from './AuthContext';
import { Notification } from '../types';
import { savePushToken } from '../storage/push';
import { hapticMedium, hapticSuccess } from '../utils/haptics';
import { inferDeviceName, inferPlatform, registerPushToken } from '../utils/pushNotifications';
import { navigateFromNotificationLink } from '../navigation/notificationLinking';

type NotificationContextValue = {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const initializedRef = useRef(false);
  const knownUnreadIdsRef = useRef<Set<string>>(new Set());
  const handledResponseIdsRef = useRef<Set<string>>(new Set());
  const isCustomer = user?.role === 'CUSTOMER';

  const loadNotifications = async (showLoading = false) => {
    if (!user || !isCustomer) {
      setNotifications([]);
      setUnreadCount(0);
      knownUnreadIdsRef.current = new Set();
      initializedRef.current = false;
      return;
    }

    if (showLoading) setLoading(true);
    try {
      const response = await customerApi.getNotifications();
      const next = response.notifications || [];
      const nextUnread = Number(response.unreadCount || 0);
      const unreadIds = new Set(next.filter((item) => !item.isRead).map((item) => item.id));

      if (initializedRef.current) {
        const hasNewUnread = Array.from(unreadIds).some((id) => !knownUnreadIdsRef.current.has(id));
        if (hasNewUnread) {
          hapticMedium();
        }
      } else {
        initializedRef.current = true;
      }

      knownUnreadIdsRef.current = unreadIds;
      setNotifications(next);
      setUnreadCount(nextUnread);
    } catch {
      // Notifications are supportive; keep the app usable if the endpoint is unavailable.
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const markRead = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    await customerApi.markNotificationsRead(ids);
    await loadNotifications();
    await hapticSuccess();
  };

  const markAllRead = async () => {
    await customerApi.markNotificationsReadAll();
    await loadNotifications();
    await hapticSuccess();
  };

  useEffect(() => {
    loadNotifications(true);
    if (!user || !isCustomer) return;

    const interval = setInterval(() => {
      loadNotifications(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [user?.id, isCustomer]);

  useEffect(() => {
    if (!user || !isCustomer) return;

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
  }, [user?.id, isCustomer]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      hapticMedium();
      loadNotifications(false);
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
      loadNotifications(false);
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

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      refresh: () => loadNotifications(true),
      markRead,
      markAllRead,
    }),
    [notifications, unreadCount, loading]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
