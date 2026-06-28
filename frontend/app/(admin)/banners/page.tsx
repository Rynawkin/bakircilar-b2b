'use client';

import { useState, useEffect, Fragment } from 'react';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import {
  Image as ImageIcon,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Package,
  ArrowUpDown,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/utils/format';
import adminApi, {
  AdminBanner,
  BannerInput,
  BannerPosition,
} from '@/lib/api/admin';

const POSITION_OPTIONS: { value: BannerPosition; label: string; hint: string }[] = [
  { value: 'HERO', label: 'HERO', hint: 'Ana vitrin (büyük üst banner)' },
  { value: 'STRIP', label: 'STRIP', hint: 'İnce şerit banner' },
  { value: 'SIDE', label: 'SIDE', hint: 'Yan / ikincil banner' },
];

const POSITION_BADGE: Record<BannerPosition, string> = {
  HERO: 'bg-primary-100 text-primary-700',
  STRIP: 'bg-amber-100 text-amber-700',
  SIDE: 'bg-slate-100 text-slate-700',
};

// Pozisyona gore onerilen gorsel olcusu
const RECOMMENDED_SIZE: Record<BannerPosition, string> = {
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

export default function BannersPage() {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Banner Yönetimi</h1>
              <p className="text-sm text-gray-600">
                Müşteri vitrinindeki HERO, STRIP ve SIDE bannerlarını yönetin
              </p>
            </div>
          </div>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Yeni Banner
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : banners.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <ImageIcon className="h-7 w-7" />
              </div>
              <p className="mb-1 text-base font-semibold text-gray-900">Henüz banner yok</p>
              <p className="mb-5 text-sm text-gray-500">
                Vitrinde gösterilecek ilk bannerı oluşturun.
              </p>
              <Button onClick={openCreate} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                İlk Bannerı Oluştur
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {banners.map((banner) => (
              <Card key={banner.id} className="flex flex-col overflow-hidden p-0">
                {/* Preview */}
                <div className="relative aspect-[16/7] w-full overflow-hidden bg-slate-100">
                  {banner.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={banner.imageUrl}
                      alt={banner.title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                      <ImageIcon className="h-7 w-7" />
                      <span className="mt-1 text-xs">Görsel yok</span>
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex items-center gap-1.5">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${POSITION_BADGE[banner.position]}`}
                    >
                      {banner.position}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-600 shadow-sm">
                      <ArrowUpDown className="h-3 w-3" />
                      {banner.sortOrder ?? 0}
                    </span>
                  </div>
                  <div className="absolute right-2 top-2">
                    {banner.active ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        <Eye className="h-3 w-3" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        <EyeOff className="h-3 w-3" /> Pasif
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h3 className="line-clamp-1 text-base font-bold text-gray-900">{banner.title}</h3>
                    {banner.subtitle && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{banner.subtitle}</p>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-600">
                    {banner.linkUrl && (
                      <div className="flex items-center gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate font-medium text-primary-600">{banner.linkUrl}</span>
                      </div>
                    )}
                    {banner.productCode && (
                      <div className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">Ürün: {banner.productCode}</span>
                      </div>
                    )}
                    {(banner.startsAt || banner.endsAt) && (
                      <div className="text-[11px] text-gray-500">
                        {banner.startsAt ? formatDate(banner.startsAt) : '—'}
                        {' → '}
                        {banner.endsAt ? formatDate(banner.endsAt) : '—'}
                      </div>
                    )}
                  </div>

                  {banner.buttonText && (
                    <div>
                      <span className="inline-flex items-center rounded-md bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                        {banner.buttonText}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleToggleActive(banner)}
                      disabled={togglingId === banner.id}
                      className="flex flex-1 items-center justify-center gap-1.5"
                    >
                      {togglingId === banner.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : banner.active ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {banner.active ? 'Pasife Al' : 'Aktif Et'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEdit(banner)}
                      className="flex items-center justify-center gap-1.5 px-3"
                      aria-label="Düzenle"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(banner)}
                      className="flex items-center justify-center gap-1.5 px-3"
                      aria-label="Sil"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Transition show={isModalOpen} as={Fragment}>
        <Dialog onClose={closeModal} className="relative z-50">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </TransitionChild>

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
                <div className="p-6">
                  <DialogTitle className="mb-1 text-xl font-bold text-gray-900">
                    {editing ? 'Banner Düzenle' : 'Yeni Banner'}
                  </DialogTitle>
                  <p className="mb-6 text-sm text-gray-500">
                    Vitrinde gösterilecek banner bilgilerini girin.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Başlık */}
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Başlık <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Örn. Yaz Kampanyası"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    {/* Alt başlık */}
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Alt Başlık
                      </label>
                      <textarea
                        value={formData.subtitle ?? ''}
                        onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                        rows={2}
                        placeholder="Kısa açıklama metni"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    {/* Görsel: dosyadan yükle veya URL */}
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Görsel
                      </label>
                      <div className="mb-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBannerImageUpload}
                          disabled={uploadingImage}
                          className="block w-full text-sm text-gray-500 file:mr-2 file:rounded file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
                        />
                        <p className="mt-1.5 text-xs font-medium text-amber-700">
                          {RECOMMENDED_SIZE[formData.position ?? 'HERO']}
                        </p>
                        {uploadingImage && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                            <Loader2 className="h-3 w-3 animate-spin" /> Yükleniyor…
                          </p>
                        )}
                      </div>
                      <input
                        type="text"
                        value={formData.imageUrl ?? ''}
                        onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                        placeholder="…veya görsel URL yapıştır (https:// ya da /uploads/...)"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      {formData.imageUrl?.trim() ? (
                        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={formData.imageUrl}
                            alt="Önizleme"
                            className="max-h-40 w-full object-contain"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : null}
                    </div>

                    {/* Link & Ürün kodu */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">
                          Link URL
                        </label>
                        <input
                          type="text"
                          value={formData.linkUrl ?? ''}
                          onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                          placeholder="/discounted-products"
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">
                          Ürün Kodu
                          <span className="ml-1 text-xs font-normal text-gray-400">(opsiyonel)</span>
                        </label>
                        <input
                          type="text"
                          value={formData.productCode ?? ''}
                          onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                          placeholder="Hızlı satış için ürün kodu"
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>

                    {/* CTA & Pozisyon */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">
                          Buton Metni (CTA)
                        </label>
                        <input
                          type="text"
                          value={formData.buttonText ?? ''}
                          onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                          placeholder="Hemen İncele"
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">
                          Pozisyon
                        </label>
                        <select
                          value={formData.position ?? 'HERO'}
                          onChange={(e) =>
                            setFormData({ ...formData, position: e.target.value as BannerPosition })
                          }
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          {POSITION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label} — {opt.hint}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Sıra & Tarihler */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">
                          Sıra
                        </label>
                        <input
                          type="number"
                          value={formData.sortOrder ?? 0}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sortOrder: e.target.value === '' ? 0 : parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">
                          Başlangıç
                        </label>
                        <input
                          type="date"
                          value={formData.startsAt ?? ''}
                          onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">
                          Bitiş
                        </label>
                        <input
                          type="date"
                          value={formData.endsAt ?? ''}
                          onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>

                    {/* Aktif switch */}
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Aktif</p>
                        <p className="text-xs text-gray-500">
                          Aktif bannerlar müşteri vitrininde gösterilir.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={formData.active ?? true}
                        onClick={() => setFormData({ ...formData, active: !(formData.active ?? true) })}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          formData.active ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            formData.active ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 border-t border-gray-100 pt-4">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={closeModal}
                        disabled={saving}
                      >
                        İptal
                      </Button>
                      <Button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {editing ? 'Güncelle' : 'Oluştur'}
                      </Button>
                    </div>
                  </form>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel="Sil"
        cancelLabel="İptal"
      />
    </div>
  );
}
