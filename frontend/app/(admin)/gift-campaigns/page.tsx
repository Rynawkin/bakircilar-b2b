'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Gift, Plus, Trash2, Search, X, Check, Pencil } from 'lucide-react';
import { ImageCropUpload } from '@/components/admin/ImageCropUpload';
import adminApi, {
  AdminGiftCampaign,
  GiftCampaignInput,
  GiftScopeType,
  GiftTargetType,
} from '@/lib/api/admin';

type GiftItem = { productId: string; name?: string; mikroCode?: string; imageUrl?: string | null; giftQuantity?: number };

type FormState = {
  id?: string;
  title: string;
  subtitle: string;
  bannerImageUrl: string;
  mobileBannerImageUrl: string;
  buttonText: string;
  threshold: string;
  thresholdPriceType: 'invoiced' | 'white';
  thresholdVatIncluded: boolean;
  scopeType: GiftScopeType;
  scopeCategoryIds: string[];
  scopeProducts: GiftItem[];
  giftPickCount: string;
  targetType: GiftTargetType;
  targetSectorCodes: string[];
  active: boolean;
  validFrom: string;
  validTo: string;
  gifts: GiftItem[];
};

const emptyForm: FormState = {
  title: '',
  subtitle: '',
  bannerImageUrl: '',
  mobileBannerImageUrl: '',
  buttonText: '',
  threshold: '0',
  thresholdPriceType: 'invoiced',
  thresholdVatIncluded: false,
  scopeType: 'missingCategories',
  scopeCategoryIds: [],
  scopeProducts: [],
  giftPickCount: '1',
  targetType: 'all',
  targetSectorCodes: [],
  active: true,
  validFrom: '',
  validTo: '',
  gifts: [],
};

const SCOPE_LABELS: Record<GiftScopeType, string> = {
  missingCategories: 'Eksik kategoriler (carinin hiç almadığı)',
  categoryIds: 'Seçili kategoriler',
  productIds: 'Seçili ürünler',
  all: 'Tüm sepet',
};
const TARGET_LABELS: Record<GiftTargetType, string> = {
  all: 'Tüm müşteriler',
  segment: 'Sektör (segment)',
  account: 'Belirli cariler (gelişmiş)',
};

const field = 'h-9 w-full rounded-lg border border-[#e3e8f0] bg-white px-2.5 text-[13px] text-[#14223b] outline-none focus:border-[#15356b]';
const label = 'block text-[12px] font-medium text-[#51607a] mb-1';

export default function GiftCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdminGiftCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [sectorCodes, setSectorCodes] = useState<string[]>([]);

  // Urun arama (hediye + kapsam urunleri)
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchFor, setSearchFor] = useState<'gifts' | 'scope' | null>(null);
  const [searching, setSearching] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const { campaigns } = await adminApi.getGiftCampaigns();
      setCampaigns(campaigns || []);
    } catch {
      toast.error('Kampanyalar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
    adminApi.getCategories().then((d) => setCategories((d.categories || []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {});
    adminApi.getVadeFilters().then((d) => setSectorCodes(d.sectorCodes || [])).catch(() => {});
  }, [loadCampaigns]);

  useEffect(() => {
    if (!searchFor || search.trim().length < 2) {
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
  }, [search, searchFor]);

  const startNew = () => setForm({ ...emptyForm });
  const startEdit = (c: AdminGiftCampaign) => {
    setForm({
      id: c.id,
      title: c.title || '',
      subtitle: c.subtitle || '',
      bannerImageUrl: c.bannerImageUrl || '',
      mobileBannerImageUrl: c.mobileBannerImageUrl || '',
      buttonText: c.buttonText || '',
      threshold: String(c.threshold ?? 0),
      thresholdPriceType: c.thresholdPriceType,
      thresholdVatIncluded: !!c.thresholdVatIncluded,
      scopeType: c.scopeType,
      scopeCategoryIds: c.scopeCategoryIds || [],
      scopeProducts: (c.scopeProductIds || []).map((id) => ({ productId: id })),
      giftPickCount: String(c.giftPickCount ?? 1),
      targetType: c.targetType,
      targetSectorCodes: c.targetSectorCodes || [],
      active: !!c.active,
      validFrom: c.validFrom ? String(c.validFrom).slice(0, 10) : '',
      validTo: c.validTo ? String(c.validTo).slice(0, 10) : '',
      gifts: (c.gifts || []).map((g) => ({ productId: g.productId, name: g.name, mikroCode: g.mikroCode, imageUrl: g.imageUrl, giftQuantity: g.giftQuantity ?? 1 })),
    });
  };

  const addProduct = (product: any) => {
    if (!form || !searchFor) return;
    const item: GiftItem = { productId: product.id, name: product.name, mikroCode: product.mikroCode, imageUrl: product.imageUrl };
    if (searchFor === 'gifts') {
      if (form.gifts.some((g) => g.productId === item.productId)) return;
      setForm({ ...form, gifts: [...form.gifts, { ...item, giftQuantity: 1 }] });
    } else {
      if (form.scopeProducts.some((g) => g.productId === item.productId)) return;
      setForm({ ...form, scopeProducts: [...form.scopeProducts, item] });
    }
  };

  const changeGiftQty = (productId: string, qty: number) => {
    setForm((f) =>
      f
        ? { ...f, gifts: f.gifts.map((g) => (g.productId === productId ? { ...g, giftQuantity: qty } : g)) }
        : f
    );
  };

  const save = async () => {
    if (!form) return;
    const payload: GiftCampaignInput = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      bannerImageUrl: form.bannerImageUrl.trim() || null,
      mobileBannerImageUrl: form.mobileBannerImageUrl.trim() || null,
      buttonText: form.buttonText.trim() || null,
      threshold: Number(form.threshold) || 0,
      thresholdPriceType: form.thresholdPriceType,
      thresholdVatIncluded: form.thresholdVatIncluded,
      scopeType: form.scopeType,
      scopeCategoryIds: form.scopeType === 'categoryIds' ? form.scopeCategoryIds : [],
      scopeProductIds: form.scopeType === 'productIds' ? form.scopeProducts.map((p) => p.productId) : [],
      giftPickCount: Math.max(1, Number(form.giftPickCount) || 1),
      targetType: form.targetType,
      targetSectorCodes: form.targetType === 'segment' ? form.targetSectorCodes : [],
      active: form.active,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      gifts: form.gifts.map((g, i) => ({ productId: g.productId, sortOrder: i, giftQuantity: Math.max(1, Math.trunc(Number(g.giftQuantity ?? 1)) || 1) })),
    };
    setSaving(true);
    try {
      if (form.id) {
        await adminApi.updateGiftCampaign(form.id, payload);
        toast.success('Kampanya güncellendi');
      } else {
        await adminApi.createGiftCampaign(payload);
        toast.success('Kampanya oluşturuldu');
      }
      setForm(null);
      setSearch('');
      setSearchFor(null);
      loadCampaigns();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Kampanya silinsin mi?')) return;
    try {
      await adminApi.deleteGiftCampaign(id);
      toast.success('Silindi');
      loadCampaigns();
    } catch {
      toast.error('Silinemedi');
    }
  };

  const toggleActive = async (c: AdminGiftCampaign) => {
    try {
      await adminApi.updateGiftCampaign(c.id, { title: c.title, active: !c.active });
      loadCampaigns();
    } catch {
      toast.error('Güncellenemedi');
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold text-[#14223b]">
            <Gift className="h-5 w-5 text-emerald-600" />
            Hediyeli Kampanyalar
          </h1>
          <p className="mt-1 text-[13px] text-[#8b97ac]">
            &quot;Eksik kategorilerden şu tutarı geç → bir ürünü bedava seç.&quot; Cari bazlı çalışır.
          </p>
        </div>
        {!form && (
          <button
            onClick={startNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#15356b] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#1c4585]"
          >
            <Plus className="h-4 w-4" />
            Yeni Kampanya
          </button>
        )}
      </div>

      {/* Liste */}
      {!form && (
        <div className="rounded-xl border border-[#e7ebf2] bg-white">
          {loading ? (
            <div className="p-6 text-center text-[13px] text-[#8b97ac]">Yükleniyor…</div>
          ) : campaigns.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#8b97ac]">Henüz kampanya yok. &quot;Yeni Kampanya&quot; ile oluşturun.</div>
          ) : (
            <div className="divide-y divide-[#eef1f6]">
              {campaigns.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3.5">
                  <button
                    onClick={() => toggleActive(c)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {c.active ? 'Aktif' : 'Pasif'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[#14223b]">{c.title}</div>
                    <div className="text-[12px] text-[#8b97ac]">
                      Baraj: <b>{c.threshold} ₺</b> · {SCOPE_LABELS[c.scopeType]} · {TARGET_LABELS[c.targetType]} · {c.gifts?.length || 0} hediye
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
            <h2 className="text-[16px] font-semibold text-[#14223b]">{form.id ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}</h2>
            <button onClick={() => { setForm(null); setSearchFor(null); setSearch(''); }} className="text-[#8b97ac] hover:text-[#14223b]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={label}>Başlık *</label>
              <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Keşfet & Hediye Kazan" />
            </div>
            <div className="md:col-span-2">
              <label className={label}>Alt başlık</label>
              <input className={field} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </div>
            <div>
              <ImageCropUpload
                value={form.bannerImageUrl}
                onChange={(url) => setForm((f) => (f ? { ...f, bannerImageUrl: url } : f))}
                aspect={1920 / 640}
                targetWidth={1920}
                targetHeight={640}
                label="Banner görseli (masaüstü)"
                hint="Yükleyince çerçeveye sığdırırsın — 1920 × 640 px (3:1) olarak kaydedilir, kırpılmaz"
              />
            </div>
            <div>
              <ImageCropUpload
                value={form.mobileBannerImageUrl}
                onChange={(url) => setForm((f) => (f ? { ...f, mobileBannerImageUrl: url } : f))}
                aspect={768 / 600}
                targetWidth={768}
                targetHeight={600}
                label="Mobil banner görseli (768 × 600, opsiyonel)"
                hint="Boş bırakılırsa masaüstü görsel kullanılır — 768 × 600 px olarak kaydedilir"
              />
            </div>
            <div>
              <label className={label}>Buton metni</label>
              <input className={field} value={form.buttonText} onChange={(e) => setForm({ ...form, buttonText: e.target.value })} placeholder="Kampanya ürünlerini gör" />
            </div>

            <div>
              <label className={label}>Baraj tutarı (₺)</label>
              <input className={field} type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Fiyat türü</label>
                <select className={field} value={form.thresholdPriceType} onChange={(e) => setForm({ ...form, thresholdPriceType: e.target.value as any })}>
                  <option value="invoiced">Faturalı</option>
                  <option value="white">Beyaz</option>
                </select>
              </div>
              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-[12.5px] text-[#51607a]">
                  <input type="checkbox" checked={form.thresholdVatIncluded} onChange={(e) => setForm({ ...form, thresholdVatIncluded: e.target.checked })} />
                  KDV dahil say
                </label>
              </div>
            </div>

            <div>
              <label className={label}>Barajı sayan ürünler (kapsam)</label>
              <select className={field} value={form.scopeType} onChange={(e) => setForm({ ...form, scopeType: e.target.value as GiftScopeType })}>
                {(Object.keys(SCOPE_LABELS) as GiftScopeType[]).map((k) => (
                  <option key={k} value={k}>{SCOPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Seçilebilecek hediye adedi</label>
              <input className={field} type="number" min={1} value={form.giftPickCount} onChange={(e) => setForm({ ...form, giftPickCount: e.target.value })} />
            </div>

            {/* Kapsam: kategoriler */}
            {form.scopeType === 'categoryIds' && (
              <div className="md:col-span-2">
                <label className={label}>Kapsam kategorileri</label>
                <div className="max-h-40 overflow-auto rounded-lg border border-[#e3e8f0] p-2">
                  <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                    {categories.map((cat) => {
                      const checked = form.scopeCategoryIds.includes(cat.id);
                      return (
                        <label key={cat.id} className="flex items-center gap-1.5 text-[12px] text-[#14223b]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                scopeCategoryIds: e.target.checked
                                  ? [...form.scopeCategoryIds, cat.id]
                                  : form.scopeCategoryIds.filter((x) => x !== cat.id),
                              })
                            }
                          />
                          <span className="truncate">{cat.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Kapsam: urunler */}
            {form.scopeType === 'productIds' && (
              <div className="md:col-span-2">
                <label className={label}>Kapsam ürünleri</label>
                <ProductChips items={form.scopeProducts} onRemove={(id) => setForm({ ...form, scopeProducts: form.scopeProducts.filter((p) => p.productId !== id) })} />
                <button onClick={() => setSearchFor('scope')} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 py-1.5 text-[12px] text-[#51607a] hover:bg-[#f4f6fa]">
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

            {/* Hediye havuzu */}
            <div className="md:col-span-2">
              <label className={label}>Hediye havuzu (müşterinin seçebileceği ürünler)</label>
              <ProductChips
                items={form.gifts}
                onRemove={(id) => setForm({ ...form, gifts: form.gifts.filter((g) => g.productId !== id) })}
                onChangeQty={changeGiftQty}
              />
              <button onClick={() => setSearchFor('gifts')} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] px-3 py-1.5 text-[12px] text-[#51607a] hover:bg-[#f4f6fa]">
                <Search className="h-3.5 w-3.5" /> Hediye ürün ara & ekle
              </button>
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-[13px] text-[#14223b]">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Aktif
              </label>
            </div>
          </div>

          {/* Urun arama paneli */}
          {searchFor && (
            <div className="mt-4 rounded-lg border border-[#e3e8f0] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[#14223b]">
                  {searchFor === 'gifts' ? 'Hediye ürün ekle' : 'Kapsam ürünü ekle'}
                </span>
                <button onClick={() => { setSearchFor(null); setSearch(''); }} className="text-[#8b97ac] hover:text-[#14223b]"><X className="h-4 w-4" /></button>
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
            <button onClick={() => { setForm(null); setSearchFor(null); setSearch(''); }} className="rounded-lg border border-[#d8e0ec] px-4 py-2 text-[13px] font-medium text-[#51607a] hover:bg-[#f4f6fa]">
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

function ProductChips({
  items,
  onRemove,
  onChangeQty,
}: {
  items: GiftItem[];
  onRemove: (id: string) => void;
  onChangeQty?: (id: string, qty: number) => void;
}) {
  if (items.length === 0) {
    return <div className="text-[12px] text-[#9aa6b8]">Henüz ürün eklenmedi.</div>;
  }
  // Hediye havuzu: her ürün için adet girilebilen düzenlenebilir satırlar
  if (onChangeQty) {
    return (
      <div className="flex flex-col gap-1.5">
        {items.map((it) => (
          <div key={it.productId} className="flex items-center gap-2 rounded-lg border border-[#e3e8f0] bg-[#f7f9fc] py-1.5 pl-2.5 pr-1.5">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#14223b]">
              {it.name || it.mikroCode || it.productId}
            </span>
            <div className="flex flex-shrink-0 items-center gap-1">
              <input
                type="number"
                min={1}
                value={it.giftQuantity ?? 1}
                onChange={(e) => {
                  const v = Math.max(1, Math.trunc(Number(e.target.value)) || 1);
                  onChangeQty(it.productId, v);
                }}
                className="h-7 w-14 rounded-md border border-[#d8e0ec] bg-white px-1.5 text-center text-[12px] text-[#14223b] outline-none focus:border-[#15356b]"
              />
              <span className="text-[11px] text-[#8b97ac]">adet</span>
            </div>
            <button onClick={() => onRemove(it.productId)} className="rounded-full p-1 text-[#8b97ac] hover:bg-white hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    );
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
