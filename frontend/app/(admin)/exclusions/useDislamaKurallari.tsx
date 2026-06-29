'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api/admin';

/**
 * Dislama Kurallari ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir
 * (toast-ici/ConfirmDialog onay akislari dahil).
 */

export type ExclusionType =
  | 'PRODUCT_CODE'
  | 'CUSTOMER_CODE'
  | 'CUSTOMER_NAME'
  | 'PRODUCT_NAME'
  | 'SECTOR_CODE';

export interface Exclusion {
  id: string;
  type: ExclusionType;
  value: string;
  description?: string;
  active: boolean;
  createdAt: string;
}

export interface ProductSearchItem {
  id: string;
  name: string;
  mikroCode: string;
  category?: {
    id: string;
    name: string;
  } | null;
}

export const EXCLUSION_TYPE_LABELS: Record<ExclusionType, string> = {
  PRODUCT_CODE: 'Urun Kodu',
  CUSTOMER_CODE: 'Cari Kodu',
  CUSTOMER_NAME: 'Cari Adi',
  PRODUCT_NAME: 'Urun Adi',
  SECTOR_CODE: 'Sektor Kodu',
};

export const normalizeProductCode = (value: string) => String(value || '').trim().toUpperCase();

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type?: 'danger' | 'warning' | 'success' | 'info';
}

export function useDislamaKurallari() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExclusion, setEditingExclusion] = useState<Exclusion | null>(null);
  const [formType, setFormType] = useState<ExclusionType>('PRODUCT_CODE');
  const [formValue, setFormValue] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [productSearch, setProductSearch] = useState('');
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchResults, setProductSearchResults] = useState<ProductSearchItem[]>([]);

  const productExclusionMap = useMemo(() => {
    const map = new Map<string, Exclusion[]>();
    exclusions
      .filter((item) => item.type === 'PRODUCT_CODE')
      .forEach((item) => {
        const key = normalizeProductCode(item.value);
        const list = map.get(key) || [];
        list.push(item);
        map.set(key, list);
      });
    return map;
  }, [exclusions]);

  const activeProductExclusions = useMemo(
    () =>
      exclusions
        .filter((item) => item.type === 'PRODUCT_CODE' && item.active)
        .sort((a, b) => a.value.localeCompare(b.value, 'tr')),
    [exclusions]
  );

  const fetchExclusions = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getExclusions();
      if (!result.success) {
        throw new Error('Veriler yuklenemedi');
      }
      setExclusions(result.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Bir hata olustu');
    } finally {
      setLoading(false);
    }
  };

  const fetchProductCandidates = async (searchText: string) => {
    try {
      setProductSearchLoading(true);
      const params: any = {
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      };
      if (searchText.trim()) {
        params.search = searchText.trim();
      }
      const result = await adminApi.getProducts(params);
      const items: ProductSearchItem[] = (result.products || []).map((product: any) => ({
        id: product.id,
        name: String(product.name || ''),
        mikroCode: String(product.mikroCode || ''),
        category: product.category || null,
      }));
      setProductSearchResults(items);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Urunler getirilemedi');
    } finally {
      setProductSearchLoading(false);
    }
  };

  useEffect(() => {
    fetchExclusions();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProductCandidates(productSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const resetForm = () => {
    setFormType('PRODUCT_CODE');
    setFormValue('');
    setFormDescription('');
    setFormActive(true);
    setEditingExclusion(null);
  };

  const handleOpenModal = (exclusion?: Exclusion) => {
    if (exclusion) {
      setEditingExclusion(exclusion);
      setFormType(exclusion.type);
      setFormValue(exclusion.value);
      setFormDescription(exclusion.description || '');
      setFormActive(exclusion.active);
    } else {
      resetForm();
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setTimeout(resetForm, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedValue =
      formType === 'PRODUCT_CODE' ? normalizeProductCode(formValue) : String(formValue || '').trim();

    if (!normalizedValue) {
      toast.error('Deger bos olamaz');
      return;
    }

    try {
      if (editingExclusion) {
        await adminApi.updateExclusion(editingExclusion.id, {
          value: normalizedValue,
          description: formDescription || undefined,
          active: formActive,
        });
        toast.success('Kural guncellendi');
      } else {
        await adminApi.createExclusion({
          type: formType,
          value: normalizedValue,
          description: formDescription || undefined,
        });
        toast.success('Kural olusturuldu');
      }

      handleCloseModal();
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Islem basarisiz');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Kurali Sil',
      message: 'Bu kurali silmek istediginize emin misiniz?',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await adminApi.deleteExclusion(id);
          toast.success('Kural silindi');
          fetchExclusions();
        } catch (err: any) {
          toast.error(err.response?.data?.error || 'Silme islemi basarisiz');
        }
      },
    });
  };

  const handleToggleActive = async (exclusion: Exclusion) => {
    try {
      await adminApi.updateExclusion(exclusion.id, { active: !exclusion.active });
      toast.success(exclusion.active ? 'Kural devre disi birakildi' : 'Kural aktif edildi');
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Islem basarisiz');
    }
  };

  const handleQuickExclude = async (product: ProductSearchItem) => {
    const code = normalizeProductCode(product.mikroCode);
    if (!code) return;

    const existingRules = productExclusionMap.get(code) || [];
    const activeRule = existingRules.find((rule) => rule.active);
    if (activeRule) {
      toast('Bu urun zaten dislanmis');
      return;
    }

    try {
      const inactiveRule = existingRules.find((rule) => !rule.active);
      if (inactiveRule) {
        await adminApi.updateExclusion(inactiveRule.id, { active: true });
      } else {
        await adminApi.createExclusion({
          type: 'PRODUCT_CODE',
          value: code,
          description: 'Admin panelden urun dislama',
        });
      }
      toast.success(`${code} dislandi`);
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Urun dislanamadi');
    }
  };

  const handleQuickUnexclude = async (productCode: string) => {
    const code = normalizeProductCode(productCode);
    const existingRules = productExclusionMap.get(code) || [];
    const activeRule = existingRules.find((rule) => rule.active);
    if (!activeRule) {
      toast('Bu urun zaten aktif dislama listesinde degil');
      return;
    }

    try {
      await adminApi.updateExclusion(activeRule.id, { active: false });
      toast.success(`${code} geri alindi`);
      fetchExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Islem basarisiz');
    }
  };

  return {
    // state
    exclusions,
    loading,
    error,
    modalOpen,
    editingExclusion,
    formType,
    setFormType,
    formValue,
    setFormValue,
    formDescription,
    setFormDescription,
    formActive,
    setFormActive,
    confirmDialog,
    setConfirmDialog,
    productSearch,
    setProductSearch,
    productSearchLoading,
    productSearchResults,
    // derived
    productExclusionMap,
    activeProductExclusions,
    // handlers
    fetchExclusions,
    handleOpenModal,
    handleCloseModal,
    handleSubmit,
    handleDelete,
    handleToggleActive,
    handleQuickExclude,
    handleQuickUnexclude,
  };
}

export default useDislamaKurallari;
