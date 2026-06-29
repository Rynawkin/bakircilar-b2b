'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { usePermissions } from '@/hooks/usePermissions';

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  assignedSectorCodes: string[];
  active: boolean;
  createdAt: string;
}

/**
 * Personel Yonetimi ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function usePersonel() {
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [availableSectorCodes, setAvailableSectorCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'SALES_REP' as 'SALES_REP' | 'MANAGER' | 'DEPOCU',
    assignedSectorCodes: [] as string[],
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    email: '',
    name: '',
    active: true,
    assignedSectorCodes: [] as string[],
  });

  const [selectedSectorCode, setSelectedSectorCode] = useState('');

  useEffect(() => {
    if (permissionsLoading) return;
    if (!hasPermission('admin:staff')) {
      return;
    }
    fetchStaff();
    fetchSectorCodes();
  }, [permissionsLoading, hasPermission]);

  const fetchSectorCodes = async () => {
    try {
      const { sectorCodes } = await adminApi.getSectorCodes();
      setAvailableSectorCodes(sectorCodes);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Sektör kodları yüklenemedi');
    }
  };

  const fetchStaff = async () => {
    try {
      const { staff: staffList } = await adminApi.getStaffMembers();
      setStaff(staffList);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Staff listesi yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password || !createForm.name) {
      toast.error('Email, şifre ve isim zorunludur');
      return;
    }

    try {
      await adminApi.createStaffMember(createForm);
      toast.success('Kullanıcı oluşturuldu!');
      setShowCreateModal(false);
      setCreateForm({
        email: '',
        password: '',
        name: '',
        role: 'SALES_REP',
        assignedSectorCodes: [],
      });
      setSelectedSectorCode('');
      fetchStaff();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Oluşturma başarısız');
    }
  };

  const handleEdit = async () => {
    if (!editingStaff) return;

    try {
      await adminApi.updateStaffMember(editingStaff.id, editForm);
      toast.success('Kullanıcı güncellendi!');
      setEditingStaff(null);
      fetchStaff();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Güncelleme başarısız');
    }
  };

  const addSectorCode = (codes: string[], setCodes: (codes: string[]) => void) => {
    if (!selectedSectorCode || codes.includes(selectedSectorCode)) {
      if (codes.includes(selectedSectorCode)) {
        toast.error('Bu sektör zaten eklenmiş');
      }
      return;
    }
    const newCodes = [...codes, selectedSectorCode];
    setCodes(newCodes);
    setSelectedSectorCode('');
  };

  const removeSectorCode = (index: number, codes: string[], setCodes: (codes: string[]) => void) => {
    const newCodes = codes.filter((_, i) => i !== index);
    setCodes(newCodes);
  };

  return {
    // state
    staff,
    availableSectorCodes,
    isLoading,
    showCreateModal,
    setShowCreateModal,
    editingStaff,
    setEditingStaff,
    createForm,
    setCreateForm,
    editForm,
    setEditForm,
    selectedSectorCode,
    setSelectedSectorCode,
    // handlers
    handleCreate,
    handleEdit,
    addSectorCode,
    removeSectorCode,
  };
}

export default usePersonel;
