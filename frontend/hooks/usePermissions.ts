import { useState, useEffect, useCallback } from 'react';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';

export function usePermissions() {
  const { user } = useAuthStore();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPermissions({});
      setRole(null);
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
      setRole(data.role || user?.role || null);
    } catch (error) {
      console.error('Izinler yuklenemedi:', error);
      // Hata durumunda bos izinler
      setPermissions({});
      setRole(user?.role || null);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = useCallback((permission: string): boolean => {
    const value = permissions[permission];
    if (value === true) return true;
    if (value === false) return false;
    if (role === 'HEAD_ADMIN') return true;
    if (role === 'ADMIN') return true;
    if (role === 'MANAGER' && permission.startsWith('reports:')) return true;
    return false;
  }, [permissions, role]);

  return {
    permissions,
    role,
    loading,
    hasPermission,
  };
}


