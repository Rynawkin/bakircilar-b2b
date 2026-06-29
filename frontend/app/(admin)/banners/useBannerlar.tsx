'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import adminApi, {
  AdminBanner,
  BannerInput,
  BannerPosition,
} from '@/lib/api/admin';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { AdminBanner, BannerInput, BannerPosition } from '@/lib/api/admin';

export const POSITION_OPTIONS: { value: BannerPosition; label: string; hint: string }[] = [
  { value: 'HERO', label: 'HERO', hint: 'Ana vitrin (büyük üst banner)' },
  { value: 'STRIP', label: 'STRIP', hint: 'İnce şerit banner' },
  { value: 'SIDE', label: 'SIDE', hint: 'Yan / ikincil banner' },
];

export const POSITION_BADGE: Record<BannerPosition, string> = {
  HERO: 'bg-primary-100 text-primary-700',
  STRIP: 'bg-amber-100 text-amber-700',
  SIDE: 'bg-slate-100 text-slate-700',
};

// Pozisyona gore onerilen gorsel olcusu
export const RECOMMENDED_SIZE: Record<BannerPosition, string> = {
  HERO: 'Önerilen ölçü: 1920 × 640 px (yatay, ~3:1) · maks 5MB',
  STRIP: 'Önerilen ölçü: 1200 × 140 px (ince şerit) · maks 5MB',
  SIDE: 'Önerilen ölçü: 600 × 500 px · maks 5MB',
};

const emptyForm: BannerInput = {
  title: '',
  subtitle: '',
  imageUrl: '',
  linkUrl: '',
  productCode: '',
  buttonText: '',
  position: 'HERO',
  sortOrder: 0,
  active: true,
  startsAt: '',
  endsAt: '',
};

// ISO -> input[type=date] (YYYY-MM-DD)
const toDateInput = (value?: string | null) => {
  if (!value) return '';
  return value.split('T')[0] ?? '';
};

// input[type=date] -> ISO veya null
const toIsoOrNull = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

/**
 * Banner Yonetimi ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useBannerlar() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBanner | null>(null);
  const [formData, setFormData] = useState<BannerInput>(emptyForm);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'success' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const { banners: data } = await adminApi.getBanners();
      const sorted = [...(data || [])].sort((a, b) => {
        if (a.position !== b.position) return a.position.localeCompare(b.position);
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
      setBanners(sorted);
    } catch (error) {
      console.error('Bannerlar yüklenemedi:', error);
      toast.error('Bannerlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (banner: AdminBanner) => {
    setEditing(banner);
    setFormData({
      title: banner.title ?? '',
      subtitle: banner.subtitle ?? '',
      imageUrl: banner.imageUrl ?? '',
      linkUrl: banner.linkUrl ?? '',
      productCode: banner.productCode ?? '',
      buttonText: banner.buttonText ?? '',
      position: banner.position ?? 'HERO',
      sortOrder: banner.sortOrder ?? 0,
      active: banner.active ?? true,
      startsAt: toDateInput(banner.startsAt),
      endsAt: toDateInput(banner.endsAt),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditing(null);
    setFormData(emptyForm);
  };

  const buildPayload = (): BannerInput => ({
    title: formData.title.trim(),
    subtitle: formData.subtitle?.trim() || null,
    imageUrl: formData.imageUrl?.trim() || null,
    linkUrl: formData.linkUrl?.trim() || null,
    productCode: formData.productCode?.trim() || null,
    buttonText: formData.buttonText?.trim() || null,
    position: formData.position ?? 'HERO',
    sortOrder: Number.isFinite(formData.sortOrder) ? Number(formData.sortOrder) : 0,
    active: formData.active ?? true,
    startsAt: toIsoOrNull(formData.startsAt),
    endsAt: toIsoOrNull(formData.endsAt),
  });

  const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen resim dosyası seçin');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB\'dan küçük olmalıdır');
      return;
    }
    setUploadingImage(true);
    const fd = new FormData();
    fd.append('image', file);
    try {
      const { imageUrl } = await adminApi.uploadBannerImage(fd);
      setFormData((prev) => ({ ...prev, imageUrl }));
      toast.success('Görsel yüklendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Görsel yüklenemedi');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Başlık zorunludur');
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await adminApi.updateBanner(editing.id, payload);
        toast.success('Banner güncellendi');
      } else {
        await adminApi.createBanner(payload);
        toast.success('Banner oluşturuldu');
      }
      setIsModalOpen(false);
      setEditing(null);
      setFormData(emptyForm);
      await fetchBanners();
    } catch (error) {
      console.error('Banner kaydedilemedi:', error);
      toast.error('Banner kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (banner: AdminBanner) => {
    setTogglingId(banner.id);
    try {
      await adminApi.updateBanner(banner.id, { title: banner.title, active: !banner.active });
      setBanners((prev) =>
        prev.map((item) => (item.id === banner.id ? { ...item, active: !item.active } : item))
      );
      toast.success(banner.active ? 'Banner pasife alındı' : 'Banner aktif edildi');
    } catch (error) {
      console.error('Banner durumu güncellenemedi:', error);
      toast.error('Banner durumu güncellenemedi');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (banner: AdminBanner) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Banner Sil',
      message: `"${banner.title}" bannerını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await adminApi.deleteBanner(banner.id);
          setBanners((prev) => prev.filter((item) => item.id !== banner.id));
          toast.success('Banner silindi');
        } catch (error) {
          console.error('Banner silinemedi:', error);
          toast.error('Banner silinemedi');
        }
      },
    });
  };

  return {
    // veri / yuklenme durumlari
    banners,
    loading,
    saving,
    togglingId,
    uploadingImage,
    // modal / form
    isModalOpen,
    editing,
    formData,
    setFormData,
    // confirm dialog
    confirmDialog,
    setConfirmDialog,
    // aksiyonlar
    openCreate,
    openEdit,
    closeModal,
    handleBannerImageUpload,
    handleSubmit,
    handleToggleActive,
    handleDelete,
  };
}

export default useBannerlar;
