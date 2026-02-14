import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';

import { adminApi } from '../api/admin';
import { useAuth } from './AuthContext';
import { Notification } from '../types';
import { savePushToken } from '../storage/push';
import { hapticMedium, hapticSuccess } from '../utils/haptics';
import { inferDeviceName, inferPlatform, registerPushToken } from '../utils/pushNotifications';

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
  const [enabled, setEnabled] = useState(false);
  const initializedRef = useRef(false);
  const knownUnreadIdsRef = useRef<Set<string>>(new Set());

  const loadNotifications = async (showLoading = false) => {
    if (!user || !enabled) {
      setNotifications([]);
      setUnreadCount(0);
      knownUnreadIdsRef.current = new Set();
      initializedRef.current = false;
      return;
    }

    if (showLoading) setLoading(true);
    try {
      const response = await adminApi.getNotifications({ limit: 25, offset: 0 });
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
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        setEnabled(false);
      }
      // Silent fail: notifications are supportive features.
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const markRead = async (ids: string[]) => {
    if (!enabled) return;
    if (!ids || ids.length === 0) return;
    await adminApi.markNotificationsRead(ids);
    await loadNotifications();
    await hapticSuccess();
  };

  const markAllRead = async () => {
    if (!enabled) return;
    await adminApi.markAllNotificationsRead();
    await loadNotifications();
    await hapticSuccess();
  };

  useEffect(() => {
    if (!user) {
      setEnabled(false);
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    let mounted = true;
    const checkPermission = async () => {
      try {
        const permissionData = await adminApi.getMyPermissions();
        const canReadNotifications = permissionData?.permissions?.['admin:notifications'] !== false;
        if (mounted) {
          setEnabled(canReadNotifications);
        }
      } catch {
        if (mounted) {
          // If permission endpoint is unavailable, keep notifications enabled for compatibility.
          setEnabled(true);
        }
      }
    };

    checkPermission();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    loadNotifications(true);
    if (!user || !enabled) return;

    const interval = setInterval(() => {
      loadNotifications(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [user?.id, enabled]);

  useEffect(() => {
    if (!user || !enabled) return;

    let mounted = true;
    const register = async () => {
      try {
        const token = await registerPushToken();
        if (!token || !mounted) return;
        await adminApi.registerPushToken({
          token,
          platform: inferPlatform(),
          appName: 'portal',
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
  }, [user?.id, enabled]);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      hapticMedium();
      loadNotifications(false);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      hapticSuccess();
      const maybeLink = response.notification.request.content.data?.linkUrl;
      if (typeof maybeLink === 'string' && maybeLink.length > 0) {
        // Link routing can be added later if needed.
      }
      loadNotifications(false);
    });

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
