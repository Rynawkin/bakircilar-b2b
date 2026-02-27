'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Save, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { adminApi } from '@/lib/api/admin';

interface ProductFamily {
  id: string;
  name: string;
  code?: string | null;
  note?: string | null;
  active: boolean;
  items: Array<{
    id: string;
    productCode: string;
    productName?: string | null;
    priority: number;
    active: boolean;
  }>;
}

interface PoolProduct {
  id: string;
  mikroCode: string;
  name: string;
}

type FormMode = 'create' | 'edit';

const foldSearch = (value: string): string =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[ıi]/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();

const buildSearchVariants = (query: string): string[] => {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const folded = foldSearch(raw);
  const trI = raw.replace(/i/g, 'ı').replace(/I/g, 'İ');
  const latinI = raw.replace(/ı/g, 'i').replace(/İ/g, 'I');
  return Array.from(new Set([raw, folded, trI, latinI].filter((item) => String(item || '').trim().length >= 2)));
};

const mapFamilyItemsToPool = (family: ProductFamily): PoolProduct[] =>
  family.items.map((item) => ({
    id: item.id,
    mikroCode: String(item.productCode || '').trim().toUpperCase(),
    name: String(item.productName || '').trim(),
  }));

export default function ProductFamiliesPage() {
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [loadingFamilies, setLoadingFamilies] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mode, setMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<PoolProduct[]>([]);

  const [search, setSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<PoolProduct[]>([]);
  const searchRequestRef = useRef(0);

  const selectedCodeSet = useMemo(
    () => new Set(selectedProducts.map((product) => product.mikroCode)),
    [selectedProducts]
  );

  const loadFamilies = async () => {
    setLoadingFamilies(true);
    try {
      const result = await adminApi.getProductFamilies();
      setFamilies(result.data || []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aile listesi alinamadi');
    } finally {
      setLoadingFamilies(false);
    }
  };

  useEffect(() => {
    loadFamilies();
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const requestId = ++searchRequestRef.current;
    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const variants = buildSearchVariants(q);
        const responses = await Promise.all(
          variants.map((searchValue) =>
            adminApi.getProducts({
              search: searchValue,
              limit: 40,
              page: 1,
              sortBy: 'name',
              sortOrder: 'asc',
            })
          )
        );
        if (searchRequestRef.current !== requestId) return;
        const merged = responses.flatMap((result) => result.products || []);
        const mapped = merged
          .map((product: any) => ({
            id: String(product.id || ''),
            mikroCode: String(product.mikroCode || '').trim().toUpperCase(),
            name: String(product.name || '').trim(),
          }))
          .filter((product: PoolProduct) => product.mikroCode && product.name);
        const foldedQuery = foldSearch(q);
        const deduped = new Map<string, PoolProduct>();
        mapped.forEach((product) => {
          const key = product.mikroCode;
          if (!deduped.has(key)) deduped.set(key, product);
        });
        const filtered = Array.from(deduped.values()).filter((product) => {
          if (!foldedQuery) return true;
          return (
            foldSearch(product.mikroCode).includes(foldedQuery) ||
            foldSearch(product.name).includes(foldedQuery)
          );
        });
        setSearchResults(filtered.slice(0, 80));
      } catch (error) {
        if (searchRequestRef.current === requestId) {
          setSearchResults([]);
        }
      } finally {
        if (searchRequestRef.current === requestId) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [search]);

  const resetForm = () => {
    setMode('create');
    setEditingId(null);
    setName('');
    setCode('');
    setNote('');
    setSelectedProducts([]);
  };

  const startEdit = (family: ProductFamily) => {
    setMode('edit');
    setEditingId(family.id);
    setName(family.name || '');
    setCode(family.code || '');
    setNote(family.note || '');
    setSelectedProducts(mapFamilyItemsToPool(family));
  };

  const addProduct = (product: PoolProduct) => {
    const codeUpper = product.mikroCode.toUpperCase();
    if (!codeUpper || selectedCodeSet.has(codeUpper)) return;
    setSelectedProducts((prev) => [
      ...prev,
      { id: product.id, mikroCode: codeUpper, name: product.name || '-' },
    ]);
  };

  const removeProduct = (productCode: string) => {
    setSelectedProducts((prev) =>
      prev.filter((product) => product.mikroCode !== productCode.toUpperCase())
    );
  };

  const saveFamily = async () => {
    const familyName = name.trim();
    if (!familyName) {
      toast.error('Aile adi zorunlu');
      return;
    }
    const productCodes = selectedProducts.map((product) => product.mikroCode);
    if (productCodes.length === 0) {
      toast.error('En az bir urun secilmeli');
      return;
    }

    setSaving(true);
    try {
      if (mode === 'create') {
        await adminApi.createProductFamily({
          name: familyName,
          code: code.trim() || null,
          note: note.trim() || null,
          productCodes,
        });
        toast.success('Aile olusturuldu');
      } else if (editingId) {
        await adminApi.updateProductFamily(editingId, {
          name: familyName,
          code: code.trim() || null,
          note: note.trim() || null,
          productCodes,
        });
        toast.success('Aile guncellendi');
      }
      await loadFamilies();
      resetForm();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aile kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const deleteFamily = async (familyId: string) => {
    setDeletingId(familyId);
    try {
      await adminApi.deleteProductFamily(familyId);
      setFamilies((prev) => prev.filter((item) => item.id !== familyId));
      if (editingId === familyId) resetForm();
      toast.success('Aile silindi');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aile silinemedi');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/reports/ucarer-depo">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Ucarer Depo
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Stok Aile Yonetimi</h1>
              <p className="text-sm text-gray-600">Aileleri ayri ekranda urun havuzundan secerek yonetin</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={resetForm}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni Aile
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle>Tanimli Aileler</CardTitle>
              <CardDescription>Duzenlemek icin satira tiklayin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingFamilies && <p className="text-sm text-gray-500">Yukleniyor...</p>}
              {!loadingFamilies && families.length === 0 && (
                <p className="text-sm text-gray-500">Tanimli aile yok.</p>
              )}
              {families.map((family) => (
                <div key={family.id} className="rounded-md border bg-white p-3">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => startEdit(family)}
                  >
                    <p className="font-semibold text-sm text-gray-900">
                      {family.name} {family.code ? `(${family.code})` : ''}
                    </p>
                    <p className="text-xs text-gray-600">{family.items.length} urun</p>
                  </button>
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => deleteFamily(family.id)}
                      disabled={deletingId === family.id}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Sil
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="xl:col-span-8">
            <CardHeader>
              <CardTitle>{mode === 'create' ? 'Yeni Aile' : 'Aile Duzenle'}</CardTitle>
              <CardDescription>
                Urunleri kod yazarak degil, urun havuzundan secerek ekleyin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input placeholder="Aile Adi" value={name} onChange={(e) => setName(e.target.value)} />
                <Input placeholder="Aile Kodu (ops.)" value={code} onChange={(e) => setCode(e.target.value)} />
                <Input placeholder="Not (ops.)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-900">Urun Havuzu</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Urun kodu veya urun adi ara..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-64 overflow-auto rounded-md border bg-white">
                  {searchLoading && <p className="p-3 text-sm text-gray-500">Araniyor...</p>}
                  {!searchLoading && search.trim().length < 2 && (
                    <p className="p-3 text-sm text-gray-500">Arama icin en az 2 karakter girin.</p>
                  )}
                  {!searchLoading && search.trim().length >= 2 && searchResults.length === 0 && (
                    <p className="p-3 text-sm text-gray-500">Sonuc bulunamadi.</p>
                  )}
                  {!searchLoading && searchResults.map((product) => {
                    const selected = selectedCodeSet.has(product.mikroCode);
                    return (
                      <div key={product.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{product.mikroCode}</p>
                          <p className="text-xs text-gray-600 truncate">{product.name}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={selected ? 'outline' : 'primary'}
                          disabled={selected}
                          onClick={() => addProduct(product)}
                        >
                          {selected ? 'Eklendi' : 'Ekle'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border bg-white">
                <div className="border-b px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">
                    Secilen Urunler ({selectedProducts.length})
                  </p>
                </div>
                {selectedProducts.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500">Henuz urun secilmedi.</p>
                ) : (
                  <div className="max-h-64 overflow-auto">
                    {selectedProducts.map((product) => (
                      <div key={product.mikroCode} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{product.mikroCode}</p>
                          <p className="text-xs text-gray-600 truncate">{product.name || '-'}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => removeProduct(product.mikroCode)}
                        >
                          Cikar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Temizle
                </Button>
                <Button type="button" onClick={saveFamily} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Kaydediliyor...' : mode === 'create' ? 'Aileyi Kaydet' : 'Degisiklikleri Kaydet'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
