'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { LayoutGrid, Plus, Trash2, Search, X, Check, Pencil, Upload } from 'lucide-react';
import adminApi, {
  AdminCollection,
  CollectionInput,
  CollectionSourceType,
  CollectionRuleType,
  GiftTargetType,
} from '@/lib/api/admin';
import { ImageCropUpload } from '@/components/admin/ImageCropUpload';

type PickItem = { productId: string; name?: string; mikroCode?: string; imageUrl?: string | null };

type FormState = {
  id?: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  color: string;
  sortOrder: string;
  sourceType: CollectionSourceType;
  ruleType: CollectionRuleType;
  categoryId: string;
  products: PickItem[];
  targetType: GiftTargetType;
  targetSectorCodes: string[];
  active: boolean;
  validFrom: string;
  validTo: string;
};

const emptyForm: FormState = {
  title: '',
  subtitle: '',
  imageUrl: '',
  color: '',
  sortOrder: '0',
  sourceType: 'RULE',
  ruleType: 'category',
  categoryId: '',
  products: [],
  targetType: 'all',
  targetSectorCodes: [],
  active: true,
  validFrom: '',
  validTo: '',
};

const SOURCE_LABELS: Record<CollectionSourceType, string> = {
  RULE: 'Kurala göre (kategori / çok satan / indirimli / yeni)',
  MANUAL: 'Elle seçilmiş ürünler',
};
const RULE_LABELS: Record<CollectionRuleType, string> = {
  category: 'Kategori',
  bestseller: 'Çok satanlar',
  discounted: 'İndirimli ürünler',
  new: 'Yeni ürünler',
};
const TARGET_LABELS: Record<GiftTargetType, string> = {
  all: 'Tüm müşteriler',
  segment: 'Sektör (segment)',
  account: 'Belirli cariler (gelişmiş)',
};

// Renk / gradient presetleri (opsiyonel — bos birakilirsa gorsel/varsayilan kullanilir)
const COLOR_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Yeşil', value: 'linear-gradient(150deg,#047857,#0a9d6b)' },
  { label: 'Lacivert', value: 'linear-gradient(150deg,#15356b,#1c4a8f)' },
  { label: 'Mor', value: 'linear-gradient(150deg,#7c3aed,#9560f0)' },
  { label: 'Turuncu', value: 'linear-gradient(150deg,#b45309,#e07b12)' },
  { label: 'Gri', value: 'linear-gradient(150deg,#334155,#64748b)' },
];

const field = 'h-9 w-full rounded-lg border border-[#e3e8f0] bg-white px-2.5 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]';
const label = 'block text-[12px] font-medium text-[#51607a] mb-1';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<AdminCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [sectorCodes, setSectorCodes] = useState<string[]>([]);

  // Urun arama (MANUAL)
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const { collections } = await adminApi.getCollections();
      setCollections(collections || []);
    } catch {
      toast.error('Koleksiyonlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
    adminApi.getCategories().then((d) => setCategories((d.categories || []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {});
    adminApi.getVadeFilters().then((d) => setSectorCodes(d.sectorCodes || [])).catch(() => {});
  }, [loadCollections]);

  useEffect(() => {
    if (!searchOpen || search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { products } = await adminApi.getProducts({ search: search.trim(), limit: 20 });
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

  const startNew = () => setForm({ ...emptyForm });
  const startEdit = (c: AdminCollection) => {
    setForm({
      id: c.id,
      title: c.title || '',
      subtitle: c.subtitle || '',
      imageUrl: c.imageUrl || '',
      color: c.color || '',
      sortOrder: String(c.sortOrder ?? 0),
      sourceType: c.sourceType,
      ruleType: (c.ruleType as CollectionRuleType) || 'category',
      categoryId: c.categoryId || '',
      products: (c.productIds || []).map((id) => ({ productId: id })),
      targetType: c.targetType,
      targetSectorCodes: c.targetSectorCodes || [],
      active: !!c.active,
      validFrom: c.validFrom ? String(c.validFrom).slice(0, 10) : '',
      validTo: c.validTo ? String(c.validTo).slice(0, 10) : '',
    });
  };

  const addProduct = (product: any) => {
    if (!form) return;
    const item: PickItem = { productId: product.id, name: product.name, mikroCode: product.mikroCode, imageUrl: product.imageUrl };
    if (form.products.some((g) => g.productId === item.productId)) return;
    setForm({ ...form, products: [...form.products, item] });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    if (!file.type.startsWith('image/')) { toast.error('Lütfen resim dosyası seçin'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Dosya boyutu 5MB\'dan küçük olmalı'); return; }
    setUploadingImg(true);
    const fd = new FormData();
    fd.append('image', file);
    try {
      const { imageUrl } = await adminApi.uploadBannerImage(fd);
      setForm((f) => (f ? { ...f, imageUrl } : f));
      toast.success('Görsel yüklendi');
    } catch {
      toast.error('Görsel yüklenemedi');
    } finally {
      setUploadingImg(false);
      e.target.value = '';
    }
  };

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) {
      toast.error('Başlık gerekli');
      return;
    }
    const payload: CollectionInput = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      color: form.color.trim() || null,
      sortOrder: Number(form.sortOrder) || 0,
      sourceType: form.sourceType,
      ruleType: form.sourceType === 'RULE' ? form.ruleType : null,
      categoryId: form.sourceType === 'RULE' && form.ruleType === 'category' ? (form.categoryId || null) : null,
      productIds: form.sourceType === 'MANUAL' ? form.products.map((p) => p.productId) : [],
      targetType: form.targetType,
      targetSectorCodes: form.targetType === 'segment' ? form.targetSectorCodes : [],
      active: form.active,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
    };
    setSaving(true);
    try {
      if (form.id) {
        await adminApi.updateCollection(form.id, payload);
        toast.success('Koleksiyon güncellendi');
      } else {
        await adminApi.createCollection(payload);
        toast.success('Koleksiyon oluşturuldu');
      }
      setForm(null);
      setSearch('');
      setSearchOpen(false);
      loadCollections();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Koleksiyon silinsin mi?')) return;
    try {
      await adminApi.deleteCollection(id);
      toast.success('Silindi');
      loadCollections();
    } catch {
      toast.error('Silinemedi');
    }
  };

  const toggleActive = async (c: AdminCollection) => {
    try {
      await adminApi.updateCollection(c.id, { title: c.title, active: !c.active });
      loadCollections();
    } catch {
      toast.error('Güncellenemedi');
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold text-[#14223b]">
            <LayoutGrid className="h-5 w-5 text-[#15356b]" />
            Koleksiyonlar
          </h1>
          <p className="mt-1 text-[13px] text-[#8b97ac]">
            Anasayfa &quot;Sizin için koleksiyonlar&quot; seçkileri. Kurala göre (kategori/çok satan/indirimli/yeni) ya da elle ürün listesi.
          </p>
        </div>
        {!form && (
          <button
            onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#1c4585]"
          >
            <Plus className="h-4 w-4" />
            Yeni Koleksiyon
          </button>
        )}
      </div>

      {/* Liste */}
      {!form && (
        <div className="rounded-xl border border-[#e7ebf2] bg-white">
          {loading ? (
            <div className="p-6 text-center text-[13px] text-[#8b97ac]">Yükleniyor…</div>
          ) : collections.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#8b97ac]">Henüz koleksiyon yok. &quot;Yeni Koleksiyon&quot; ile oluşturun.</div>
          ) : (
            <div className="divide-y divide-[#eef1f6]">
              {collections.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3.5">
                  <button
                    onClick={() => toggleActive(c)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {c.active ? 'Aktif' : 'Pasif'}
                  </button>
                  <div
                    className="h-9 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-[#e3e8f0] bg-[#f7f9fc]"
                    style={!c.imageUrl && c.color ? { background: c.color } : undefined}
                  >
                    {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[#14223b]">{c.title}</div>
                    <div className="text-[12px] text-[#8b97ac]">
                      Sıra: <b>{c.sortOrder}</b> · {SOURCE_LABELS[c.sourceType]}
                      {c.sourceType === 'RULE' && c.ruleType ? ` · ${RULE_LABELS[c.ruleType as CollectionRuleType]}` : ''}
                      {c.sourceType === 'MANUAL' ? ` · ${c.productIds?.length || 0} ürün` : ''}
                      {' · '}{TARGET_LABELS[c.targetType]}
                    </div>
                  </div>
                  <button onClick={() => startEdit(c)} className="rounded-lg border border-[#d8e0ec] p-2 text-[#51607a] hover:bg-[#f4f6fa]">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(c.id)} className="rounded-lg border border-[#f3c9c9] p-2 text-red-600 hover:bg-red-50">
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
            <h2 className="text-[16px] font-semibold text-[#14223b]">{form.id ? 'Koleksiyonu Düzenle' : 'Yeni Koleksiyon'}</h2>
            <button onClick={() => { setForm(null); setSearchOpen(false); setSearch(''); }} className="text-[#8b97ac] hover:text-[#14223b]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={label}>Başlık *</label>
              <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="İndirimli Fırsatlar" />
            </div>
            <div className="md:col-span-2">
              <label className={label}>Alt başlık</label>
              <input className={field} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Net fiyat avantajları" />
            </div>

            <div>
              <ImageCropUpload
                value={form.imageUrl}
                onChange={(url) => setForm((f) => (f ? { ...f, imageUrl: url } : f))}
                aspect={600 / 400}
                targetWidth={600}
                targetHeight={400}
                label="Görsel"
                hint="Yükleyince çerçeveye sığdırırsın — 600 × 400 px olarak kaydedilir (görsel yoksa renk kullanılır)"
              />
            </div>

            <div>
              <label className={label}>Renk / gradient (görsel yoksa)</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, color: '' })}
                  className={`h-8 w-8 rounded-lg border ${!form.color ? 'border-[#15356b] ring-2 ring-[#15356b]/30' : 'border-[#e3e8f0]'} bg-white text-[10px] text-[#9aa6b8]`}
                  title="Yok (varsayılan)"
                >
                  —
                </button>
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setForm({ ...form, color: preset.value })}
                    className={`h-8 w-8 rounded-lg border ${form.color === preset.value ? 'border-[#15356b] ring-2 ring-[#15356b]/30' : 'border-[#e3e8f0]'}`}
                    style={{ background: preset.value }}
                    title={preset.label}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className={label}>Sıra (sortOrder)</label>
              <input className={field} type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>

            <div>
              <label className={label}>Kaynak tipi</label>
              <select className={field} value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value as CollectionSourceType })}>
                {(Object.keys(SOURCE_LABELS) as CollectionSourceType[]).map((k) => (
                  <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
                ))}
              </select>
            </div>

            {/* RULE: ruleType */}
            {form.sourceType === 'RULE' && (
              <div>
                <label className={label}>Kural türü</label>
                <select className={field} value={form.ruleType} onChange={(e) => setForm({ ...form, ruleType: e.target.value as CollectionRuleType })}>
                  {(Object.keys(RULE_LABELS) as CollectionRuleType[]).map((k) => (
                    <option key={k} value={k}>{RULE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            )}

            {/* RULE + category: kategori */}
            {form.sourceType === 'RULE' && form.ruleType === 'category' && (
              <div className="md:col-span-2">
                <label className={label}>Kategori</label>
                <select className={field} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Kategori seçin…</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* MANUAL: urun picker */}
            {form.sourceType === 'MANUAL' && (
              <div className="md:col-span-2">
                <label className={label}>Koleksiyon ürünleri</label>
                <ProductChips items={form.products} onRemove={(id) => setForm({ ...form, products: form.products.filter((p) => p.productId !== id) })} />
                <button onClick={() => setSearchOpen(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 py-1.5 text-[12px] text-[#51607a] hover:bg-[#f4f6fa]">
                  <Search className="h-3.5 w-3.5" /> Ürün ara & ekle
                </button>
              </div>
            )}

            {/* Hedefleme */}
            <div>
              <label className={label}>Hedefleme</label>
              <select className={field} value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value as GiftTargetType })}>
                {(Object.keys(TARGET_LABELS) as GiftTargetType[]).map((k) => (
                  <option key={k} value={k}>{TARGET_LABELS[k]}</option>
                ))}
              </select>
            </div>
            {form.targetType === 'segment' && (
              <div>
                <label className={label}>Hedef sektörler</label>
                <div className="max-h-32 overflow-auto rounded-lg border border-[#e3e8f0] p-2">
                  {sectorCodes.map((code) => {
                    const checked = form.targetSectorCodes.includes(code);
                    return (
                      <label key={code} className="flex items-center gap-1.5 text-[12px] text-[#14223b]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              targetSectorCodes: e.target.checked
                                ? [...form.targetSectorCodes, code]
                                : form.targetSectorCodes.filter((x) => x !== code),
                            })
                          }
                        />
                        {code}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className={label}>Başlangıç tarihi</label>
              <input className={field} type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
            </div>
            <div>
              <label className={label}>Bitiş tarihi</label>
              <input className={field} type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-[13px] text-[#14223b]">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Aktif
              </label>
            </div>
          </div>

          {/* Urun arama paneli (MANUAL) */}
          {searchOpen && form.sourceType === 'MANUAL' && (
            <div className="mt-4 rounded-lg border border-[#e3e8f0] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[#14223b]">Ürün ekle</span>
                <button onClick={() => { setSearchOpen(false); setSearch(''); }} className="text-[#8b97ac] hover:text-[#14223b]"><X className="h-4 w-4" /></button>
              </div>
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#e3e8f0] px-2.5">
                <Search className="h-4 w-4 text-[#9aa6b8]" />
                <input className="h-9 flex-1 border-none bg-transparent text-[13px] outline-none" placeholder="Ürün adı veya kodu (en az 2 harf)…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              </div>
              <div className="max-h-56 overflow-auto">
                {searching ? (
                  <div className="py-3 text-center text-[12px] text-[#8b97ac]">Aranıyor…</div>
                ) : searchResults.length === 0 ? (
                  <div className="py-3 text-center text-[12px] text-[#8b97ac]">Sonuç yok</div>
                ) : (
                  searchResults.map((p) => (
                    <button key={p.id} onClick={() => addProduct(p)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f4f6fa]">
                      <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-gray-50">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-contain" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-[#14223b]">{p.name}</div>
                        <div className="text-[11px] text-[#8b97ac]">{p.mikroCode}</div>
                      </div>
                      <Plus className="h-4 w-4 text-[#15356b]" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => { setForm(null); setSearchOpen(false); setSearch(''); }} className="rounded-lg border border-[#d8e0ec] px-4 py-2 text-[13px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
              İptal
            </button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1c4585] disabled:opacity-50">
              <Check className="h-4 w-4" />
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductChips({ items, onRemove }: { items: PickItem[]; onRemove: (id: string) => void }) {
  if (items.length === 0) {
    return <div className="text-[12px] text-[#9aa6b8]">Henüz ürün eklenmedi.</div>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span key={it.productId} className="inline-flex items-center gap-1.5 rounded-full border border-[#e3e8f0] bg-[#f7f9fc] py-1 pl-2 pr-1 text-[12px] text-[#14223b]">
          {it.name || it.mikroCode || it.productId}
          <button onClick={() => onRemove(it.productId)} className="rounded-full p-0.5 text-[#8b97ac] hover:bg-white hover:text-red-600">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
