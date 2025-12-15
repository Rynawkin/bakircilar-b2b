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

    // HEAD_ADMIN her şeye erişebilir
    if (user.role === 'HEAD_ADMIN') {
      setPermissions({
        'dashboard:orders': true,
        'dashboard:customers': true,
        'dashboard:excess-stock': true,
        'dashboard:sync': true,
        'dashboard:stok-ara': true,
        'dashboard:cari-ara': true,
        'dashboard:ekstre': true,
        'dashboard:diversey-stok': true,
        'reports:margin-compliance': true,
        'reports:price-history': true,
        'reports:pending-orders': true,
        'admin:customers': true,
        'admin:price-rules': true,
        'admin:settings': true,
        'admin:products': true,
        'admin:sync': true,
      });
      setLoading(false);
      return;
    }

    // Diğer roller için backend'den izinleri al
    loadPermissions();
  }, [user]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getMyPermissions();
      setPermissions(data.permissions);
    } catch (error) {
      console.error('İzinler yüklenemedi:', error);
      // Hata durumunda boş izinler
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
