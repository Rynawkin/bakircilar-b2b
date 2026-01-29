import { useState, useEffect } from 'react';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';

export function usePermissions() {
  const { user } = useAuthStore();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    loadPermissions();
  }, [user]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getMyPermissions();
      setPermissions(data.permissions);
    } catch (error) {
      console.error('Izinler yuklenemedi:', error);
      // Hata durumunda bos izinler
      setPermissions({});
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (permission: string): boolean => {
    return permissions[permission] === true;
  };

  return {
    permissions,
    loading,
    hasPermission,
  };
}
