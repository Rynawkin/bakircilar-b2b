'use client';

/**
 * Urun galerisi yoneticisi (admin) — coklu gorsel.
 * Hem admin urun detayinda hem "Resim Hata Talepleri" ekraninda kullanilir.
 * Ana gorsel (yildiz) Mikro'ya yazilir; digerleri yalniz web'de durur.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Star, Trash2, Upload, ArrowUp, ArrowDown, Loader2, ImageOff } from 'lucide-react';
import adminApi, { ProductImageDto } from '@/lib/api/admin';

interface Props {
  productId: string;
  /** Ana gorsel URL'i degisince parent'a haber ver (ust listede thumbnail'i tazelemek icin). */
  onPrimaryChange?: (url: string | null) => void;
  className?: string;
}

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

export function ProductImageManager({ productId, onPrimaryChange, className }: Props) {
  const [images, setImages] = useState<ProductImageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyImages = useCallback((imgs: ProductImageDto[]) => {
    const sorted = [...imgs].sort((a, b) => a.sortOrder - b.sortOrder);
    setImages(sorted);
    const primary = imgs.find((i) => i.isPrimary) || imgs[0] || null;
    onPrimaryChange?.(primary?.url || null);
  }, [onPrimaryChange]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listProductImages(productId);
      applyImages(res.images);
    } catch {
      toast.error('Görseller yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [productId, applyImages]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Sadece görsel dosyası yükleyebilirsiniz');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Görsel en fazla 5MB olabilir');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await adminApi.addProductImage(productId, fd);
      applyImages(res.images);
      toast.success('Görsel eklendi');
    } catch {
      toast.error('Görsel eklenemedi');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const makePrimary = async (imageId: string) => {
    setBusy(true);
    try {
      const res = await adminApi.setPrimaryProductImage(productId, imageId);
      applyImages(res.images);
      toast.success("Ana görsel güncellendi (Mikro'ya da yazıldı)");
    } catch {
      toast.error('Ana görsel yapılamadı');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (imageId: string, isPrimary: boolean) => {
    const msg = isPrimary
      ? 'Bu ANA görsel silinsin mi? (Sıradaki görsel ana olur)'
      : 'Bu görsel silinsin mi?';
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const res = await adminApi.deleteProductGalleryImage(productId, imageId);
      applyImages(res.images);
      toast.success('Görsel silindi');
    } catch {
      toast.error('Görsel silinemedi');
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const arr = [...images];
    const [item] = arr.splice(index, 1);
    arr.splice(target, 0, item);
    setImages(arr); // iyimser
    setBusy(true);
    try {
      const res = await adminApi.reorderProductImages(productId, arr.map((i) => i.id));
      applyImages(res.images);
    } catch {
      toast.error('Sıralama kaydedilemedi');
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">
          Ürün Görselleri {images.length > 0 && <span className="text-gray-400">({images.length})</span>}
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Görsel Ekle
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : images.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500"
        >
          <ImageOff className="h-6 w-6" />
          <span className="text-xs">Görsel yok — eklemek için tıklayın</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className={`group relative rounded-lg border bg-white p-1.5 ${
                img.isPrimary ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200'
              }`}
            >
              <div className="relative flex h-28 items-center justify-center overflow-hidden rounded bg-gray-50">
                <img src={img.url} alt="" className="h-full w-full object-contain" />
                {img.isPrimary && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <Star className="h-2.5 w-2.5 fill-current" /> Ana
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-1">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={busy || idx === 0}
                    title="Sola al"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={busy || idx === images.length - 1}
                    title="Sağa al"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                </div>
                <div className="flex items-center gap-0.5">
                  {!img.isPrimary && (
                    <button
                      type="button"
                      onClick={() => makePrimary(img.id)}
                      disabled={busy}
                      title="Ana görsel yap"
                      className="rounded p-1 text-amber-500 hover:bg-amber-50 disabled:opacity-30"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(img.id, img.isPrimary)}
                    disabled={busy}
                    title="Sil"
                    className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {(img.uploadedByName || img.uploadedAt || img.sizeBytes) && (
                <div className="mt-1 truncate px-0.5 text-[10px] leading-tight text-gray-400" title={`${img.uploadedByName || ''} ${formatDate(img.uploadedAt)} ${formatSize(img.sizeBytes)}`}>
                  {[img.uploadedByName, formatDate(img.uploadedAt), formatSize(img.sizeBytes)].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] text-gray-400">
        Ana görsel (⭐) Mikro'ya yazılır ve kartlarda görünür. Diğer görseller ürün detayında galeri olarak gösterilir.
      </p>
    </div>
  );
}

export default ProductImageManager;
