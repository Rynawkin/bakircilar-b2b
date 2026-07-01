'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Image as ImageIcon, Search, Upload, Trash2, Loader2 } from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { CategoryWithPriceRules } from '@/types';

export default function CategoryImagesPage() {
  const [categories, setCategories] = useState<CategoryWithPriceRules[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { categories: data } = await adminApi.getCategories();
      const sorted = [...(data || [])].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setCategories(sorted);
    } catch {
      toast.error('Kategoriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLocaleLowerCase('tr').includes(q) ||
        (c.mikroCode || '').toLocaleLowerCase('tr').includes(q)
    );
  }, [categories, search]);

  const applyImage = (id: string, imageUrl: string | null) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, imageUrl } : c)));
  };

  const handleUpload = async (category: CategoryWithPriceRules, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen resim dosyası seçin');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Dosya boyutu 5MB'dan küçük olmalı");
      return;
    }
    setBusyId(category.id);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { imageUrl } = await adminApi.uploadBannerImage(fd);
      await adminApi.setCategoryImage(category.id, imageUrl);
      applyImage(category.id, imageUrl);
      toast.success('Görsel güncellendi');
    } catch {
      toast.error('Görsel yüklenemedi');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (category: CategoryWithPriceRules) => {
    setBusyId(category.id);
    try {
      await adminApi.setCategoryImage(category.id, null);
      applyImage(category.id, null);
      toast.success('Görsel kaldırıldı');
    } catch {
      toast.error('Görsel kaldırılamadı');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[22px] font-semibold text-[#14223b]">
          <ImageIcon className="h-5 w-5 text-[#15356b]" />
          Kategori Görselleri
        </h1>
        <p className="mt-1 text-[13px] text-[#8b97ac]">
          Müşteri anasayfasındaki &quot;Kategori keşfi&quot; kutularında gösterilir. Önerilen ölçü:
          400 × 400 px (kare) · maks 5MB
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-[360px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b97ac]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kategori ara…"
            className="w-full rounded-lg border border-[#e7ebf2] bg-white py-2 pl-9 pr-3 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]"
          />
        </div>
        <span className="text-[13px] text-[#8b97ac]">{filtered.length} kategori</span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#e7ebf2] bg-white p-8 text-center text-[13px] text-[#8b97ac]">
          Yükleniyor…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#e7ebf2] bg-white p-8 text-center text-[13px] text-[#8b97ac]">
          Kategori bulunamadı.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((category) => {
            const busy = busyId === category.id;
            return (
              <div
                key={category.id}
                className="flex flex-col overflow-hidden rounded-xl border border-[#e7ebf2] bg-white"
              >
                <div className="relative flex h-[140px] items-center justify-center bg-gradient-to-br from-[#f4f6fa] to-[#eef2f8] text-[#c3ccd9]">
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt={category.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-9 w-9" strokeWidth={1.5} />
                  )}
                  {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                      <Loader2 className="h-5 w-5 animate-spin text-[#15356b]" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[#14223b]">{category.name}</p>
                    {category.mikroCode && (
                      <p className="mt-0.5 text-[11px] text-[#8b97ac]">{category.mikroCode}</p>
                    )}
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <label
                      className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#15356b] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#1c4585] ${
                        busy ? 'pointer-events-none opacity-60' : ''
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Görsel yükle
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(category, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {category.imageUrl && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemove(category)}
                        className="inline-flex items-center justify-center rounded-lg border border-[#e7ebf2] px-2.5 py-2 text-[#c0392b] hover:bg-[#fdf0ee] disabled:opacity-60"
                        title="Görseli kaldır"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
