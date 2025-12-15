'use client';

import { useState, useEffect } from 'react';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { useRouter } from 'next/navigation';

// Türkçe rol isimleri
const ROLE_NAMES: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Yönetici',
  SALES_REP: 'Satış Personeli',
  CUSTOMER: 'Müşteri',
  DIVERSEY: 'Diversey'
};

// Permission kategorileri
const PERMISSION_CATEGORIES = {
  dashboard: 'Dashboard Widget\'ları',
  reports: 'Raporlar',
  admin: 'Admin Sayfaları'
};

export default function RolePermissionsPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [availablePermissions, setAvailablePermissions] = useState<Record<string, string>>({});
  const [permissionDescriptions, setPermissionDescriptions] = useState<Record<string, string>>({});
  const [selectedRole, setSelectedRole] = useState<string>('ADMIN');

  useEffect(() => {
    // HEAD_ADMIN kontrolü
    if (user && user.role !== 'HEAD_ADMIN') {
      router.push('/dashboard');
      return;
    }

    loadPermissions();
  }, [user, router]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getAllRolePermissions();
      setPermissions(data.permissions);
      setAvailablePermissions(data.availablePermissions);
      setPermissionDescriptions(data.permissionDescriptions || {});
    } catch (error) {
      console.error('İzinler yüklenemedi:', error);
      alert('İzinler yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = async (role: string, permission: string, currentValue: boolean) => {
    try {
      setSaving(true);
      const newValue = !currentValue;

      await adminApi.setRolePermission(role, permission, newValue);

      // Update local state
      setPermissions(prev => ({
        ...prev,
        [role]: {
          ...prev[role],
          [permission]: newValue
        }
      }));
    } catch (error: any) {
      console.error('İzin güncellenemedi:', error);
      alert(error.response?.data?.error || 'İzin güncellenirken bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const resetRole = async (role: string) => {
    if (!confirm(`${ROLE_NAMES[role]} rolünün izinlerini varsayılana sıfırlamak istediğinize emin misiniz?`)) {
      return;
    }

    try {
      setSaving(true);
      await adminApi.resetRolePermissions(role);
      await loadPermissions(); // Reload all permissions
      alert('İzinler başarıyla sıfırlandı');
    } catch (error: any) {
      console.error('İzinler sıfırlanamadı:', error);
      alert(error.response?.data?.error || 'İzinler sıfırlanırken bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  // Kategoriye göre izinleri grupla
  const groupedPermissions: Record<string, string[]> = {};
  Object.keys(availablePermissions).forEach(permission => {
    const category = permission.split(':')[0];
    if (!groupedPermissions[category]) {
      groupedPermissions[category] = [];
    }
    groupedPermissions[category].push(permission);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">İzinler yükleniyor...</div>
      </div>
    );
  }

  if (!user || user.role !== 'HEAD_ADMIN') {
    return null;
  }

  const roles = ['ADMIN', 'MANAGER', 'SALES_REP', 'CUSTOMER', 'DIVERSEY'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rol İzin Yönetimi</h1>
        <p className="mt-2 text-gray-600">
          Her rolün dashboard ve raporlara erişim izinlerini yönetin
        </p>
      </div>

      {/* Role Selection Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            {roles.map(role => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${selectedRole === role
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              >
                {ROLE_NAMES[role]}
              </button>
            ))}
          </nav>
        </div>

        {/* Permissions Table */}
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {ROLE_NAMES[selectedRole]} İzinleri
            </h2>
            <button
              onClick={() => resetRole(selectedRole)}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Varsayılana Sıfırla
            </button>
          </div>

          <div className="space-y-8">
            {Object.entries(groupedPermissions).map(([category, perms]) => (
              <div key={category}>
                <h3 className="text-base font-semibold text-gray-900 mb-4">
                  {PERMISSION_CATEGORIES[category as keyof typeof PERMISSION_CATEGORIES] || category}
                </h3>
                <div className="space-y-2">
                  {perms.map(permission => {
                    const isEnabled = permissions[selectedRole]?.[permission] ?? false;
                    return (
                      <div
                        key={permission}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1 mr-4">
                          <div className="font-medium text-gray-900">
                            {availablePermissions[permission]}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{permission}</div>
                          {permissionDescriptions[permission] && (
                            <div className="text-sm text-gray-600 mt-1">
                              {permissionDescriptions[permission]}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => togglePermission(selectedRole, permission, isEnabled)}
                          disabled={saving}
                          className={`
                            relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50
                            ${isEnabled ? 'bg-blue-600' : 'bg-gray-200'}
                          `}
                        >
                          <span
                            className={`
                              pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                              ${isEnabled ? 'translate-x-5' : 'translate-x-0'}
                            `}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Bilgi</h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-disc list-inside space-y-1">
                <li>İzinler anında uygulanır, kullanıcıların tekrar giriş yapması gerekmez</li>
                <li>HEAD_ADMIN rolü her zaman tüm izinlere sahiptir</li>
                <li>&quot;Varsayılana Sıfırla&quot; butonu izinleri sistem varsayılan değerlerine döndürür</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
