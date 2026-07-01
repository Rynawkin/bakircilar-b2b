'use client';

import { Fragment } from 'react';
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ImageCropUpload } from '@/components/admin/ImageCropUpload';
import { formatDate } from '@/lib/utils/format';
import { BannerPosition } from '@/lib/api/admin';
import {
  useBannerlar,
  POSITION_OPTIONS,
  RECOMMENDED_SIZE,
  POSITION_DIMS,
} from './useBannerlar';

/**
 * Yeni gorunum Banner Yonetimi ekrani.
 * Mevcut TUM mantik useBannerlar'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal/kolon/durum dusurulmemistir; brief 4.10.3'teki her oge mevcut:
 * Yeni Banner + kart grid (onizleme 16/7 + pozisyon rozeti HERO/STRIP/SIDE + sira + Aktif/Pasif
 * + baslik/alt baslik + Link/Urun/tarih + CTA + Pasife Al/Duzenle/Sil) + modal
 * (Baslik* + Alt Baslik + Gorsel[yukle/URL/onizleme] + Link + Urun Kodu + CTA + Pozisyon
 * + Sira + Baslangic/Bitis + Aktif toggle) + ConfirmDialog silme.
 */

// Yeni tasarim renk paleti (referans HTML ile birebir)
const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

// Yeni gorunum pozisyon rozeti
const POSITION_BADGE_NEW: Record<BannerPosition, string> = {
  HERO: 'bg-[#eef2fa] text-[#15356b] border border-[#d6e0f1]',
  STRIP: 'bg-[#fffbeb] text-[#b45309] border border-[#fde68a]',
  SIDE: 'bg-[#f4f6fa] text-[#51607a] border border-[#e3e8f0]',
};

const fieldClass =
  'w-full rounded-lg border border-[#e3e8f0] px-3.5 py-2.5 text-[13px] text-[#14223b] outline-none transition focus:border-[#15356b] focus:ring-2 focus:ring-[#15356b]/15';
const labelClass = 'mb-1.5 block text-[12px] font-medium text-[#51607a]';

export default function BannerlarNew() {
  const {
    banners,
    loading,
    saving,
    togglingId,
    uploadingImage,
    isModalOpen,
    editing,
    formData,
    setFormData,
    confirmDialog,
    setConfirmDialog,
    openCreate,
    openEdit,
    closeModal,
    handleBannerImageUpload,
    handleSubmit,
    handleToggleActive,
    handleDelete,
  } = useBannerlar();

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <div className="container-custom py-8">
        {/* Header */}
        <div className="mb-[18px] mt-1 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#15356b] text-white">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b]">
                Bannerlar
              </h1>
              <p className="mt-[5px] text-[13px] text-[#8b97ac]">
                Vitrin bannerları · HERO / STRIP / SIDE pozisyonları
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-[7px] rounded-[9px] bg-[#15356b] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#1c4585]"
          >
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.2} />
            Yeni Banner
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className={`${CARD} flex items-center justify-center py-24`}>
            <span className="flex items-center gap-3 text-[13px] text-[#8b97ac]">
              <Loader2 className="h-5 w-5 animate-spin text-[#15356b]" />
              Yükleniyor…
            </span>
          </div>
        ) : banners.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center justify-center px-6 py-16 text-center`}>
            <span className="mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-[15px] bg-[#eef2fa] text-[#15356b]">
              <ImageIcon className="h-7 w-7" strokeWidth={1.7} />
            </span>
            <p className="mb-1.5 text-[15px] font-semibold text-[#14223b]">Henüz banner yok</p>
            <p className="mb-5 text-[13px] text-[#8b97ac]">
              Vitrinde gösterilecek ilk bannerı oluşturun.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-[7px] rounded-[9px] bg-[#15356b] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#1c4585]"
            >
              <Plus className="h-[15px] w-[15px]" strokeWidth={2.2} />
              İlk Bannerı Oluştur
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {banners.map((banner) => (
              <div key={banner.id} className={`${CARD} flex flex-col overflow-hidden`}>
                {/* Preview */}
                <div className="relative aspect-[16/7] w-full overflow-hidden bg-gradient-to-br from-[#0c2247] to-[#15356b]">
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
                    <div className="flex h-full w-full flex-col items-center justify-center text-[#3f5680]">
                      <ImageIcon className="h-[34px] w-[34px]" strokeWidth={1.5} />
                      <span className="mt-1 text-[11px] text-[#9aa6b8]">Görsel yok</span>
                    </div>
                  )}
                  {/* Sol ust: pozisyon rozeti + sira */}
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${POSITION_BADGE_NEW[banner.position]}`}
                    >
                      {banner.position}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[#51607a] shadow-sm">
                      <ArrowUpDown className="h-3 w-3" />
                      {banner.sortOrder ?? 0}
                    </span>
                  </div>
                  {/* Sag ust: aktif/pasif rozeti */}
                  <div className="absolute right-2.5 top-2.5">
                    {banner.active ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#ecfdf5] px-2 py-0.5 text-[11px] font-semibold text-[#047857] ring-1 ring-inset ring-[#a7f3d0]">
                        <Eye className="h-3 w-3" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#f1f4f9] px-2 py-0.5 text-[11px] font-semibold text-[#64748b] ring-1 ring-inset ring-[#e3e8f0]">
                        <EyeOff className="h-3 w-3" /> Pasif
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 p-3.5">
                  <div>
                    <h3 className="line-clamp-1 text-[14px] font-semibold text-[#14223b]">
                      {banner.title}
                    </h3>
                    {banner.subtitle && (
                      <p className="mt-[3px] line-clamp-2 text-[12px] text-[#8b97ac]">
                        {banner.subtitle}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 text-[12px] text-[#51607a]">
                    {banner.linkUrl && (
                      <div className="flex items-center gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#9aa6b8]" />
                        <span className="truncate font-medium text-[#15356b]">{banner.linkUrl}</span>
                      </div>
                    )}
                    {banner.productCode && (
                      <div className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 shrink-0 text-[#9aa6b8]" />
                        <span className="truncate">Ürün: {banner.productCode}</span>
                      </div>
                    )}
                    {(banner.startsAt || banner.endsAt) && (
                      <div className="flex items-center gap-3 text-[11px] text-[#8b97ac]">
                        <span>Sıra: {banner.sortOrder ?? 0}</span>
                        <span>
                          {banner.startsAt ? formatDate(banner.startsAt) : '—'}
                          {' → '}
                          {banner.endsAt ? formatDate(banner.endsAt) : '—'}
                        </span>
                      </div>
                    )}
                  </div>

                  {banner.buttonText && (
                    <div>
                      <span className="inline-flex items-center rounded-md bg-[#eef2fa] px-2.5 py-1 text-[12px] font-semibold text-[#15356b] ring-1 ring-inset ring-[#d6e0f1]">
                        CTA: {banner.buttonText}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-auto flex items-center gap-2 border-t border-[#f1f4f9] pt-[11px]">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(banner)}
                      disabled={togglingId === banner.id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-[7px] text-[12px] font-medium text-[#51607a] transition hover:bg-[#f4f6fa] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {togglingId === banner.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : banner.active ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {banner.active ? 'Pasife Al' : 'Aktif Et'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(banner)}
                      aria-label="Düzenle"
                      className="flex items-center justify-center rounded-lg border border-[#d8e0ec] bg-white px-3 py-[7px] text-[12px] font-semibold text-[#15356b] transition hover:bg-[#eef2fa]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(banner)}
                      aria-label="Sil"
                      className="flex items-center justify-center rounded-lg border border-[#fecaca] bg-white px-3 py-[7px] text-[12px] font-semibold text-[#dc2626] transition hover:bg-[#fef2f2]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
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
            <div className="fixed inset-0 bg-[#0c101e]/50" aria-hidden="true" />
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
              <DialogPanel className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e7ebf2] bg-white shadow-xl">
                <div className="p-6">
                  <DialogTitle className="mb-1 text-[18px] font-semibold text-[#14223b]">
                    {editing ? 'Banner Düzenle' : 'Yeni Banner'}
                  </DialogTitle>
                  <p className="mb-6 text-[13px] text-[#8b97ac]">
                    Vitrinde gösterilecek banner bilgilerini girin.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Başlık */}
                    <div>
                      <label className={labelClass}>
                        Başlık <span className="text-[#dc2626]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Örn. Yaz Kampanyası"
                        className={fieldClass}
                      />
                    </div>

                    {/* Alt başlık */}
                    <div>
                      <label className={labelClass}>Alt Başlık</label>
                      <textarea
                        value={formData.subtitle ?? ''}
                        onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                        rows={2}
                        placeholder="Kısa açıklama metni"
                        className={fieldClass}
                      />
                    </div>

                    {/* Görsel: yükle + o pozisyonun oranında çerçeveye sığdır (kırp) */}
                    <div>
                      <ImageCropUpload
                        value={formData.imageUrl}
                        onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                        aspect={POSITION_DIMS[formData.position ?? 'HERO'].w / POSITION_DIMS[formData.position ?? 'HERO'].h}
                        targetWidth={POSITION_DIMS[formData.position ?? 'HERO'].w}
                        targetHeight={POSITION_DIMS[formData.position ?? 'HERO'].h}
                        label="Görsel"
                        hint={RECOMMENDED_SIZE[formData.position ?? 'HERO']}
                      />
                    </div>

                    {/* Link & Ürün kodu */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Link URL</label>
                        <input
                          type="text"
                          value={formData.linkUrl ?? ''}
                          onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                          placeholder="/discounted-products"
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Ürün Kodu
                          <span className="ml-1 text-[11px] font-normal text-[#9aa6b8]">
                            (opsiyonel)
                          </span>
                        </label>
                        <input
                          type="text"
                          value={formData.productCode ?? ''}
                          onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                          placeholder="Hızlı satış için ürün kodu"
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    {/* CTA & Pozisyon */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Buton Metni (CTA)</label>
                        <input
                          type="text"
                          value={formData.buttonText ?? ''}
                          onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                          placeholder="Hemen İncele"
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Pozisyon</label>
                        <select
                          value={formData.position ?? 'HERO'}
                          onChange={(e) =>
                            setFormData({ ...formData, position: e.target.value as BannerPosition })
                          }
                          className={`${fieldClass} cursor-pointer`}
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
                        <label className={labelClass}>Sıra</label>
                        <input
                          type="number"
                          value={formData.sortOrder ?? 0}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sortOrder: e.target.value === '' ? 0 : parseInt(e.target.value, 10),
                            })
                          }
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Başlangıç</label>
                        <input
                          type="date"
                          value={formData.startsAt ?? ''}
                          onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Bitiş</label>
                        <input
                          type="date"
                          value={formData.endsAt ?? ''}
                          onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    {/* Aktif switch */}
                    <div className="flex items-center justify-between rounded-lg border border-[#e3e8f0] bg-[#fafbfd] px-4 py-3">
                      <div>
                        <p className="text-[13px] font-medium text-[#14223b]">Aktif</p>
                        <p className="text-[11px] text-[#8b97ac]">
                          Aktif bannerlar müşteri vitrininde gösterilir.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={formData.active ?? true}
                        onClick={() => setFormData({ ...formData, active: !(formData.active ?? true) })}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                          formData.active ? 'bg-[#15356b]' : 'bg-[#d8e0ec]'
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
                    <div className="flex gap-3 border-t border-[#f1f4f9] pt-4">
                      <button
                        type="button"
                        onClick={closeModal}
                        disabled={saving}
                        className="rounded-lg border border-[#d8e0ec] bg-white px-5 py-2.5 text-[13px] font-medium text-[#51607a] transition hover:bg-[#f4f6fa] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        İptal
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#15356b] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#1c4585] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {editing ? 'Güncelle' : 'Oluştur'}
                      </button>
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
