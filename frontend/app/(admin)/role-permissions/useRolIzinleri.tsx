'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { useRouter } from 'next/navigation';

// Türkçe rol isimleri
export const ROLE_NAMES: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Yönetici',
  SALES_REP: 'Satış Personeli',
  DEPOCU: 'Depocu',
  CUSTOMER: 'Müşteri',
  DIVERSEY: 'Diversey'
};

// Permission kategorileri
export const PERMISSION_CATEGORIES = {
  dashboard: 'Dashboard Widget\'ları',
  reports: 'Raporlar',
  admin: 'Admin Sayfaları'
};

export type ConfirmDialogState = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type?: 'danger' | 'warning' | 'success' | 'info';
};

/**
 * Rol İzin Yönetimi ekranının TÜM mantığı (state/effect/handler/türetilmiş değer).
 * Klasik ve yeni görünüm bu hook'u kullanır; görsel dışındaki hiçbir mantık değişmez.
 * Aşağıdaki kod, eski page.tsx'in `return (` öncesindeki mantığın BİRE BİR taşınmış halidir.
 */
export function useRolIzinleri() {
  const { user } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [availablePermissions, setAvailablePermissions] = useState<Record<string, string>>({});
  const [permissionDescriptions, setPermissionDescriptions] = useState<Record<string, string>>({});
  const [selectedRole, setSelectedRole] = useState<string>('ADMIN');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

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
      toast.error('İzinler yüklenirken bir hata oluştu');
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
      toast.error(error.response?.data?.error || 'İzin güncellenirken bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const resetRole = async (role: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'İzinleri Sıfırla',
      message: `${ROLE_NAMES[role]} rolünün izinlerini varsayılana sıfırlamak istediğinize emin misiniz?`,
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          setSaving(true);
          await adminApi.resetRolePermissions(role);
          await loadPermissions(); // Reload all permissions
          toast.success('İzinler başarıyla sıfırlandı');
        } catch (error: any) {
          console.error('İzinler sıfırlanamadı:', error);
          toast.error(error.response?.data?.error || 'İzinler sıfırlanırken bir hata oluştu');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const closeConfirmDialog = () => setConfirmDialog({ ...confirmDialog, isOpen: false });

  // Kategoriye göre izinleri grupla
  const groupedPermissions: Record<string, string[]> = {};
  Object.keys(availablePermissions).forEach(permission => {
    const category = permission.split(':')[0];
    if (!groupedPermissions[category]) {
      groupedPermissions[category] = [];
    }
    groupedPermissions[category].push(permission);
  });

  const roles = ['ADMIN', 'MANAGER', 'SALES_REP', 'DEPOCU', 'CUSTOMER', 'DIVERSEY'];

  return {
    // store / router
    user,
    router,
    // durum
    loading,
    saving,
    permissions,
    availablePermissions,
    permissionDescriptions,
    selectedRole,
    setSelectedRole,
    confirmDialog,
    setConfirmDialog,
    closeConfirmDialog,
    // handler
    togglePermission,
    resetRole,
    // türetilmiş
    groupedPermissions,
    roles,
    // sabitler
    ROLE_NAMES,
    PERMISSION_CATEGORIES,
  };
}
