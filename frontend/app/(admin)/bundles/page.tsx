'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Boxes, Plus, Trash2, Search, X, Check, Pencil, Package } from 'lucide-react';
import adminApi, {
  AdminBundle,
  AdminBundleItem,
  BundleInputPayload,
} from '@/lib/api/admin';

// Formda tutulan bilesen: adminApi'nin AdminBundleItem'ini kullanir (goruntuleme alanlariyla).
type FormItem = AdminBundleItem;

type FormState = {
  id?: string;
  title: string;
  imageUrl: string; // duzenlemede mevcut gorsel; yeni yuklenen dosya ayri state
  secondaryCategoryId: string;
  discountPercent: string;
  active: boolean;
  items: FormItem[];
};

const emptyForm: FormState = {
  title: '',
  imageUrl: '',
  secondaryCategoryId: '',
  discountPercent: '0',
  active: true,
  items: [],
};

const field =
  'h-9 w-full rounded-lg border border-[#e3e8f0] bg-white px-2.5 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]';
const label = 'block text-[12px] font-medium text-[#51607a] mb-1';
const helper = 'mt-1 text-[11px] text-[#8b97ac]';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export default function BundlesPage() {
  const [bundles, setBundles] = useState<AdminBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  // Secilen/yuklenecek gorsel dosyasi ve onizleme URL'i
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  // Bilesen urun aramasi
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; name: string; mikroCode: string; imageUrl?: string | null }>
  >([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const loadBundles = useCallback(async () => {
    setLoading(true);
    try {
      const { bundles } = await adminApi.listBundles();
      setBundles(bundles || []);
    } catch {
      toast.error('Paketler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBundles();
    adminApi
      .getCategories()
      .then((d) =>
        setCategories(
          (d.categories || [])
            .filter((c) => (c.name || '').trim().toLocaleLowerCase('tr-TR') !== 'paketler')
            .map((c) => ({ id: c.id, name: c.name }))
        )
      )
      .catch(() => {});
  }, [loadBundles]);

  // Urun arama (debounce)
  useEffect(() => {
    if (!searchOpen || search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { products } = await adminApi.getProducts({ search: search.trim(), page: 1, limit: 10 });
        if (active) setSearchResults(products || []);
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [search, searchOpen]);

  const resetImage = () => {
    setImageFile(null);
    setImagePreview('');
  };

  const closeForm = () => {
    setForm(null);
    setSearchOpen(false);
    setSearch('');
    resetImage();
  };

  const startNew = () => {
    resetImage();
    setForm({ ...emptyForm });
  };

  const startEdit = (b: AdminBundle) => {
    resetImage();
    setForm({
      id: b.id,
      title: b.title || '',
      imageUrl: b.imageUrl || '',
      secondaryCategoryId: b.secondaryCategoryId || '',
      discountPercent: String(b.discountPercent ?? 0),
      active: !!b.active,
      items: (b.items || []).map((it) => ({
        id: it.id,
        productId: it.productId,
        quantity: it.quantity,
        useDiscountedPrice: !!it.useDiscountedPrice,
        productName: it.productName,
        productCode: it.productCode,
        imageUrl: it.imageUrl,
        missing: it.missing,
      })),
    });
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // ayni dosya tekrar secilebilsin
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Lütfen bir görsel dosyası seçin');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Görsel 5 MB’den küçük olmalı');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const addProduct = (product: { id: string; name: string; mikroCode: string; imageUrl?: string | null }) => {
    setForm((f) => {
      if (!f) return f;
      const existing = f.items.find((it) => it.productId === product.id);
      if (existing) {
        // Ayni urun ikinci kez eklenmez; adedi 1 artir.
        toast('Bu ürün zaten pakette — adedi artırıldı', { icon: 'ℹ️' });
        return {
          ...f,
          items: f.items.map((it) =>
            it.productId === product.id ? { ...it, quantity: it.quantity + 1 } : it
          ),
        };
      }
      return {
        ...f,
        items: [
          ...f.items,
          {
            productId: product.id,
            quantity: 1,
            useDiscountedPrice: false,
            productName: product.name,
            productCode: product.mikroCode,
            imageUrl: product.imageUrl,
          },
        ],
      };
    });
  };

  const changeItemQty = (productId: string, qty: number) => {
    setForm((f) =>
      f
        ? {
            ...f,
            items: f.items.map((it) =>
              it.productId === productId ? { ...it, quantity: qty } : it
            ),
          }
        : f
    );
  };

  const toggleItemDiscounted = (productId: string, value: boolean) => {
    setForm((f) =>
      f
        ? {
            ...f,
            items: f.items.map((it) =>
              it.productId === productId ? { ...it, useDiscountedPrice: value } : it
            ),
          }
        : f
    );
  };

  const removeItem = (productId: string) => {
    setForm((f) => (f ? { ...f, items: f.items.filter((it) => it.productId !== productId) } : f));
  };

  const save = async () => {
    if (!form) return;

    const title = form.title.trim();
    if (!title) {
      toast.error('Başlık zorunlu');
      return;
    }
    if (form.items.length === 0) {
      toast.error('En az bir bileşen ürün ekleyin');
      return;
    }
    if (form.items.some((it) => !(it.quantity > 0))) {
      toast.error('Tüm bileşen adetleri 0’dan büyük olmalı');
      return;
    }
    const isNew = !form.id;
    if (isNew && !imageFile) {
      toast.error('Yeni paket için görsel zorunlu');
      return;
    }

    const rawDiscount = Number(form.discountPercent);
    const discountPercent = Number.isFinite(rawDiscount) ? Math.min(100, Math.max(0, rawDiscount)) : 0;

    const payload: BundleInputPayload = {
      title,
      secondaryCategoryId: form.secondaryCategoryId || null,
      discountPercent,
      active: form.active,
      items: form.items.map((it) => ({
        productId: it.productId,
        quantity: Math.max(1, Math.trunc(Number(it.quantity)) || 1),
        useDiscountedPrice: !!it.useDiscountedPrice,
      })),
    };

    setSaving(true);
    try {
      if (form.id) {
        await adminApi.updateBundle(form.id, payload, imageFile);
        toast.success('Paket güncellendi');
      } else {
        await adminApi.createBundle(payload, imageFile as File);
        toast.success('Paket oluşturuldu');
      }
      closeForm();
      loadBundles();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: AdminBundle) => {
    if (!window.confirm(`"${b.title}" paketi silinsin mi?`)) return;
    try {
      await adminApi.deleteBundle(b.id);
      toast.success('Silindi');
      loadBundles();
    } catch {
      toast.error('Silinemedi');
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold text-[#14223b]">
            <Boxes className="h-5 w-5 text-[#15356b]" />
            Paketler
          </h1>
          <p className="mt-1 text-[13px] text-[#8b97ac]">
            Başka ürünlerden oluşan paket ürünler. Fiyat, bileşen fiyatlarının toplamıdır; paket
            bazında % indirim uygulanabilir.
          </p>
        </div>
        {!form && (
          <button
            onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#1c4585]"
          >
            <Plus className="h-4 w-4" />
            Yeni Paket
          </button>
        )}
      </div>

      {/* Liste */}
      {!form && (
        <div className="rounded-xl border border-[#e7ebf2] bg-white">
          {loading ? (
            <div className="p-6 text-center text-[13px] text-[#8b97ac]">Yükleniyor…</div>
          ) : bundles.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#8b97ac]">
              Henüz paket yok. &quot;Yeni Paket&quot; ile oluşturun.
            </div>
          ) : (
            <div className="divide-y divide-[#eef1f6]">
              {bundles.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3.5">
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-[#eef1f6] bg-gray-50">
                    {b.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.imageUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#c4ccd8]">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      b.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {b.active ? 'Aktif' : 'Pasif'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[#14223b]">{b.title}</div>
                    <div className="text-[12px] text-[#8b97ac]">
                      Kod: <b>{b.code}</b> · {b.items?.length || 0} bileşen
                      {b.discountPercent > 0 ? (
                        <>
                          {' '}
                          · İskonto: <b>%{b.discountPercent}</b>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => startEdit(b)}
                    className="rounded-lg border border-[#d8e0ec] p-2 text-[#51607a] hover:bg-[#f4f6fa]"
                    title="Düzenle"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(b)}
                    className="rounded-lg border border-[#f3c9c9] p-2 text-red-600 hover:bg-red-50"
                    title="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Editor */}
      {form && (
        <div className="rounded-xl border border-[#e7ebf2] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#14223b]">
              {form.id ? 'Paketi Düzenle' : 'Yeni Paket'}
            </h2>
            <button onClick={closeForm} className="text-[#8b97ac] hover:text-[#14223b]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Baslik */}
            <div className="md:col-span-2">
              <label className={label}>Başlık *</label>
              <input
                className={field}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Örn. Temizlik Başlangıç Seti"
              />
            </div>

            {/* Gorsel */}
            <div className="md:col-span-2">
              <label className={label}>Görsel {form.id ? '(opsiyonel)' : '*'}</label>
              <div className="flex items-start gap-3">
                <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-[#e3e8f0] bg-gray-50">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="" className="h-full w-full object-contain" />
                  ) : form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.imageUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#c4ccd8]">
                      <Package className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onPickImage}
                    className="block w-full text-[12px] text-[#51607a] file:mr-3 file:rounded-lg file:border-0 file:bg-[#eef2f9] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-[#15356b] hover:file:bg-[#e2e9f5]"
                  />
                  <p className={helper}>
                    {form.id
                      ? 'Yeni görsel yüklerseniz mevcut görselin yerini alır. Boş bırakırsanız mevcut görsel korunur.'
                      : 'JPG/PNG vb. — en fazla 5 MB. Yeni paket için görsel zorunludur.'}
                  </p>
                  {imageFile && (
                    <button
                      onClick={resetImage}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:underline"
                    >
                      <X className="h-3 w-3" /> Seçilen görseli kaldır
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Ikinci kategori */}
            <div>
              <label className={label}>İkinci kategori (opsiyonel)</label>
              <select
                className={field}
                value={form.secondaryCategoryId}
                onChange={(e) => setForm({ ...form, secondaryCategoryId: e.target.value })}
              >
                <option value="">— Yok —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className={helper}>
                Paket her zaman &quot;Paketler&quot; kategorisinde görünür; burada seçilen ikinci
                kategoride de görünür.
              </p>
            </div>

            {/* Iskonto */}
            <div>
              <label className={label}>Paket iskontosu (%)</label>
              <input
                className={field}
                type="number"
                min={0}
                max={100}
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
              />
              <p className={helper}>Bileşen fiyatları toplamı üzerinden % indirim. Boş/0 = indirim yok.</p>
            </div>

            {/* Aktif */}
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-[13px] text-[#14223b]">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Aktif
              </label>
            </div>

            {/* Bilesenler */}
            <div className="md:col-span-2">
              <label className={label}>Paket içeriği (bileşenler) *</label>

              {form.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#e3e8f0] p-4 text-center text-[12px] text-[#9aa6b8]">
                  Henüz bileşen eklenmedi. Aşağıdan ürün arayıp ekleyin.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {form.items.map((it) => (
                    <div
                      key={it.productId}
                      className="flex items-center gap-2 rounded-lg border border-[#e3e8f0] bg-[#f7f9fc] py-1.5 pl-2 pr-1.5"
                    >
                      <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-white">
                        {it.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.imageUrl} alt="" className="h-full w-full object-contain" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-[#14223b]">
                          {it.productName || it.productCode || it.productId}
                          {it.missing && (
                            <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-600">
                              bulunamadı
                            </span>
                          )}
                        </div>
                        {it.productCode && (
                          <div className="text-[11px] text-[#8b97ac]">{it.productCode}</div>
                        )}
                      </div>
                      <label
                        className="flex flex-shrink-0 items-center gap-1 text-[11.5px] text-[#51607a]"
                        title="Bu bileşen şu an indirimdeyse indirimli fiyatından eklenir"
                      >
                        <input
                          type="checkbox"
                          checked={it.useDiscountedPrice}
                          onChange={(e) => toggleItemDiscounted(it.productId, e.target.checked)}
                        />
                        İndirimli fiyattan
                      </label>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) => {
                            const v = Math.max(1, Math.trunc(Number(e.target.value)) || 1);
                            changeItemQty(it.productId, v);
                          }}
                          className="h-7 w-14 rounded-md border border-[#d8e0ec] bg-white px-1.5 text-center text-[12px] text-[#14223b] outline-none focus:border-[#15356b]"
                        />
                        <span className="text-[11px] text-[#8b97ac]">adet</span>
                      </div>
                      <button
                        onClick={() => removeItem(it.productId)}
                        className="rounded-full p-1 text-[#8b97ac] hover:bg-white hover:text-red-600"
                        title="Kaldır"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!searchOpen ? (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 py-1.5 text-[12px] text-[#51607a] hover:bg-[#f4f6fa]"
                >
                  <Search className="h-3.5 w-3.5" /> Ürün ara & ekle
                </button>
              ) : (
                <div className="mt-2 rounded-lg border border-[#e3e8f0] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-[#14223b]">Bileşen ürün ekle</span>
                    <button
                      onClick={() => {
                        setSearchOpen(false);
                        setSearch('');
                      }}
                      className="text-[#8b97ac] hover:text-[#14223b]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#e3e8f0] px-2.5">
                    <Search className="h-4 w-4 text-[#9aa6b8]" />
                    <input
                      className="h-9 flex-1 border-none bg-transparent text-[13px] outline-none"
                      placeholder="Ürün adı veya kodu (en az 2 harf)…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-56 overflow-auto">
                    {searching ? (
                      <div className="py-3 text-center text-[12px] text-[#8b97ac]">Aranıyor…</div>
                    ) : search.trim().length < 2 ? (
                      <div className="py-3 text-center text-[12px] text-[#8b97ac]">
                        Aramak için en az 2 harf girin
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="py-3 text-center text-[12px] text-[#8b97ac]">Sonuç yok</div>
                    ) : (
                      searchResults.map((p) => {
                        const already = form.items.some((it) => it.productId === p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => addProduct(p)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f4f6fa]"
                          >
                            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-gray-50">
                              {p.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.imageUrl} alt="" className="h-full w-full object-contain" />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12.5px] text-[#14223b]">{p.name}</div>
                              <div className="text-[11px] text-[#8b97ac]">{p.mikroCode}</div>
                            </div>
                            {already ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Plus className="h-4 w-4 text-[#15356b]" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={closeForm}
              className="rounded-lg border border-[#d8e0ec] px-4 py-2 text-[13px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
            >
              İptal
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
