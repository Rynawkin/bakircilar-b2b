'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Ruler, Search, Save, Download, History, Copy, PackageCheck } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type UnitInfo = {
  index: number;
  name: string;
  factor: number;
  weightKg: number;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  tareKg?: number;
  m3: number;
  desi: number;
};

type ProductDimension = {
  productCode: string;
  productName: string;
  shelfCode: string;
  shelfName: string;
  imageUrl?: string | null;
  stockQuantity?: number;
  hasStock?: boolean;
  warehouseStocks?: Record<string, number>;
  units: UnitInfo[];
  missing?: string[];
};

type Shelf = {
  code: string;
  name: string;
};

type ChangeLog = {
  id: string;
  productCode: string;
  changedByName: string | null;
  oldValues: ProductDimension;
  newValues: ProductDimension;
  createdAt: string;
};

const emptyUnits = (): UnitInfo[] =>
  [1, 2, 3, 4].map((index) => ({
    index,
    name: '',
    factor: index === 1 ? 1 : 0,
    weightKg: 0,
    widthCm: 0,
    lengthCm: 0,
    heightCm: 0,
    m3: 0,
    desi: 0,
  }));

const toNumber = (value: unknown) => {
  const num = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
};

const formatNumber = (value: number, fractionDigits = 3) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: fractionDigits }).format(Number(value) || 0);

const mmToCm = (value: unknown) => toNumber(value) / 10;

const cmToMm = (value: unknown) => Math.round(toNumber(value) * 10 * 1000) / 1000;

const calcM3 = (widthCm: number, lengthCm: number, heightCm: number) => {
  if (!widthCm || !lengthCm || !heightCm) return 0;
  return (widthCm * lengthCm * heightCm) / 1_000_000;
};

const calcDesi = (widthCm: number, lengthCm: number, heightCm: number) => {
  if (!widthCm || !lengthCm || !heightCm) return 0;
  return (widthCm * lengthCm * heightCm) / 3000;
};

const normalizeUnit = (unit: UnitInfo): UnitInfo => {
  const widthCm = toNumber(unit.widthCm);
  const lengthCm = toNumber(unit.lengthCm);
  const heightCm = toNumber(unit.heightCm);
  return {
    ...unit,
    name: String(unit.name || '').trim().toUpperCase(),
    factor: toNumber(unit.factor),
    weightKg: toNumber(unit.weightKg),
    widthCm,
    lengthCm,
    heightCm,
    m3: calcM3(widthCm, lengthCm, heightCm),
    desi: calcDesi(widthCm, lengthCm, heightCm),
  };
};

const apiProductToUi = (product: any): ProductDimension => ({
  ...product,
  units: (product?.units || emptyUnits()).map((unit: any) =>
    normalizeUnit({
      ...unit,
      widthCm: mmToCm(unit.widthMm),
      lengthCm: mmToCm(unit.lengthMm),
      heightCm: mmToCm(unit.heightMm),
    })
  ),
});

const buildCsv = (products: ProductDimension[]) => {
  const rows = [
    ['Stok Kodu', 'Urun Adi', 'Stok Miktari', 'Raf Kodu', 'Raf Adi', 'Birim', 'Birim Adi', 'Katsayi', 'Kg', 'En cm', 'Boy cm', 'Yukseklik cm', 'm3', 'Desi', 'Eksikler'],
  ];
  products.forEach((product) => {
    product.units.forEach((unit) => {
      if (!unit.name && unit.index > 1) return;
      rows.push([
        product.productCode,
        product.productName,
        String(product.stockQuantity || 0),
        product.shelfCode || '',
        product.shelfName || '',
        String(unit.index),
        unit.name || '',
        String(unit.factor || ''),
        String(unit.weightKg || ''),
        String(unit.widthCm || ''),
        String(unit.lengthCm || ''),
        String(unit.heightCm || ''),
        String(calcM3(unit.widthCm, unit.lengthCm, unit.heightCm)),
        String(calcDesi(unit.widthCm, unit.lengthCm, unit.heightCm)),
        (product.missing || []).join(' | '),
      ]);
    });
  });
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(';')
    )
    .join('\n');
};

export default function ProductDimensionsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductDimension[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDimension | null>(null);
  const [originalProduct, setOriginalProduct] = useState<ProductDimension | null>(null);
  const [history, setHistory] = useState<ChangeLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [shelfSearch, setShelfSearch] = useState('');
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [shelfOptionsOpen, setShelfOptionsOpen] = useState(false);
  const [shelfSearching, setShelfSearching] = useState(false);
  const [missingSearch, setMissingSearch] = useState('');
  const [missingProducts, setMissingProducts] = useState<ProductDimension[]>([]);
  const [loadingMissing, setLoadingMissing] = useState(false);

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:product-dimensions')) {
      router.push('/dashboard');
    }
  }, [user, permissionsLoading, hasPermission, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      void searchProducts(search);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchShelves(shelfSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [shelfSearch]);

  const changedFields = useMemo(() => {
    if (!selectedProduct || !originalProduct) return [];
    const changes: string[] = [];
    if ((selectedProduct.shelfCode || '') !== (originalProduct.shelfCode || '')) {
      changes.push(`Raf: ${originalProduct.shelfCode || '-'} -> ${selectedProduct.shelfCode || '-'}`);
    }
    selectedProduct.units.forEach((unit, index) => {
      const oldUnit = originalProduct.units[index] || emptyUnits()[index];
      const fields: Array<[keyof UnitInfo, string]> = [
        ['name', 'Birim adi'],
        ['factor', 'Katsayi'],
        ['weightKg', 'Kg'],
        ['widthCm', 'En cm'],
        ['lengthCm', 'Boy cm'],
        ['heightCm', 'Yukseklik cm'],
      ];
      fields.forEach(([field, label]) => {
        if (String(unit[field] ?? '') !== String(oldUnit[field] ?? '')) {
          changes.push(`${unit.index}. birim ${label}: ${oldUnit[field] || '-'} -> ${unit[field] || '-'}`);
        }
      });
    });
    return changes;
  }, [selectedProduct, originalProduct]);

  const searchProducts = async (value: string) => {
    setSearching(true);
    try {
      const res = await apiClient.get('/admin/product-dimensions/products', { params: { search: value, limit: 40 } });
      setSearchResults((res.data.products || []).map(apiProductToUi));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Urun aranamadi');
    } finally {
      setSearching(false);
    }
  };

  const loadProduct = async (productCode: string) => {
    try {
      const res = await apiClient.get(`/admin/product-dimensions/products/${encodeURIComponent(productCode)}`);
      const product = apiProductToUi(res.data.product);
      setSelectedProduct(product);
      setOriginalProduct(JSON.parse(JSON.stringify(product)));
      setHistory(res.data.history || []);
      setShelfSearch(product.shelfCode || '');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Urun yuklenemedi');
    }
  };

  const searchShelves = async (value: string) => {
    setShelfSearching(true);
    try {
      const res = await apiClient.get('/admin/product-dimensions/shelves', { params: { search: value || undefined, limit: 5000 } });
      setShelves(res.data.shelves || []);
    } catch {
      setShelves([]);
    } finally {
      setShelfSearching(false);
    }
  };

  const selectShelf = (shelf: Shelf) => {
    setSelectedProduct((prev) =>
      prev ? { ...prev, shelfCode: shelf.code, shelfName: shelf.name } : prev
    );
    setShelfSearch(`${shelf.code} - ${shelf.name}`);
    setShelfOptionsOpen(false);
  };

  const loadMissingProducts = async () => {
    setLoadingMissing(true);
    try {
      const res = await apiClient.get('/admin/product-dimensions/missing', {
        params: { search: missingSearch || undefined, limit: 150 },
      });
      setMissingProducts((res.data.products || []).map(apiProductToUi));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Eksik veri raporu alinamadi');
    } finally {
      setLoadingMissing(false);
    }
  };

  const updateUnit = (index: number, patch: Partial<UnitInfo>) => {
    setSelectedProduct((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        units: prev.units.map((unit) =>
          unit.index === index ? normalizeUnit({ ...unit, ...patch }) : unit
        ),
      };
    });
  };

  const copyUnit = (fromIndex: number, toIndex: number, includeWeight = true) => {
    if (!selectedProduct) return;
    const source = selectedProduct.units.find((unit) => unit.index === fromIndex);
    if (!source) return;
    const target = selectedProduct.units.find((unit) => unit.index === toIndex);
    updateUnit(toIndex, {
      name: target?.name || source.name,
      widthCm: source.widthCm,
      lengthCm: source.lengthCm,
      heightCm: source.heightCm,
      weightKg: includeWeight ? Math.abs(toNumber(target?.factor || 1)) * source.weightKg : target?.weightKg || 0,
    });
  };

  const validateBeforeSave = () => {
    if (!selectedProduct) return false;
    for (const unit of selectedProduct.units) {
      const hasAnyValue = Boolean(unit.name || unit.factor || unit.weightKg || unit.widthCm || unit.lengthCm || unit.heightCm);
      if (!hasAnyValue) continue;
      if (unit.name.length > 10) {
        toast.error(`${unit.index}. birim adi 10 karakterden uzun olamaz`);
        return false;
      }
      if (unit.factor === 0) {
        toast.error(`${unit.index}. birim katsayisi 0 olamaz`);
        return false;
      }
      if ([unit.weightKg, unit.widthCm, unit.lengthCm, unit.heightCm].some((value) => value < 0)) {
        toast.error(`${unit.index}. birimde negatif deger olamaz`);
        return false;
      }
      const dimensionCount = [unit.widthCm, unit.lengthCm, unit.heightCm].filter((value) => value > 0).length;
      if (dimensionCount > 0 && dimensionCount < 3) {
        toast.error(`${unit.index}. birim icin en, boy ve yukseklik birlikte girilmeli`);
        return false;
      }
    }
    return true;
  };

  const saveProduct = async () => {
    if (!selectedProduct || !validateBeforeSave()) return;
    if (changedFields.length === 0) {
      toast('Degisen alan yok');
      return;
    }
    const confirmed = window.confirm(`Mikro stok karti guncellenecek:\n\n${changedFields.slice(0, 12).join('\n')}${changedFields.length > 12 ? '\n...' : ''}`);
    if (!confirmed) return;

    setSaving(true);
    try {
      const payload = {
        shelfCode: selectedProduct.shelfCode || '',
        units: selectedProduct.units.map((unit) => ({
          index: unit.index,
          name: unit.name || '',
          factor: unit.factor || 0,
          weightKg: unit.weightKg || 0,
          widthMm: cmToMm(unit.widthCm),
          lengthMm: cmToMm(unit.lengthCm),
          heightMm: cmToMm(unit.heightCm),
        })),
      };
      const res = await apiClient.put(`/admin/product-dimensions/products/${encodeURIComponent(selectedProduct.productCode)}`, payload);
      const product = apiProductToUi(res.data.product);
      setSelectedProduct(product);
      setOriginalProduct(JSON.parse(JSON.stringify(product)));
      setHistory(res.data.history || []);
      toast.success('Mikro stok karti guncellendi');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kayit yapilamadi');
    } finally {
      setSaving(false);
    }
  };

  const exportMissing = () => {
    const csv = buildCsv(missingProducts);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `yolpilot-eksik-olcu-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!user || permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container-custom py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
              <Ruler className="h-4 w-4" />
              Yolpilot Veri Hazirligi
            </div>
            <h1 className="text-3xl font-bold text-slate-950">Urun Olcu ve Raf Bilgileri</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Stok birimlerinin en, boy, yukseklik, kg ve katsayi bilgilerini cm olarak girin; sistem Mikro stok kartina mm olarak yazar. M3 ve desi otomatik hesaplanir.
            </p>
          </div>
          <Button onClick={saveProduct} isLoading={saving} disabled={!selectedProduct || changedFields.length === 0 || saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Save className="mr-2 h-4 w-4" />
            Degisenleri Kaydet
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Urun Ara</h2>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Kod veya urun adi..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-primary-500 focus:ring-2"
                />
              </div>
              <div className="mt-3 max-h-[360px] space-y-2 overflow-auto">
                {searching && <div className="text-sm text-slate-500">Araniyor...</div>}
                {!searching && searchResults.map((product) => (
                  <button
                    key={product.productCode}
                    onClick={() => loadProduct(product.productCode)}
                    className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${
                      selectedProduct?.productCode === product.productCode
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-slate-200 bg-white hover:border-primary-200 hover:bg-slate-50'
                    }`}
                    type="button"
                  >
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.productName} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-slate-300">Resim yok</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{product.productCode}</div>
                      <div className="line-clamp-2 text-xs text-slate-600">{product.productName || 'Urun adi yok'}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${product.hasStock ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          Stok: {formatNumber(product.stockQuantity || 0, 2)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                          Raf: {product.shelfCode || '-'} {product.shelfName ? `- ${product.shelfName}` : ''}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">Eksik Veri Raporu</h2>
                <Button onClick={exportMissing} disabled={missingProducts.length === 0} className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 text-xs">
                  <Download className="mr-1 h-3 w-3" />
                  Excel
                </Button>
              </div>
              <div className="flex gap-2">
                <input
                  value={missingSearch}
                  onChange={(event) => setMissingSearch(event.target.value)}
                  placeholder="Opsiyonel filtre"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-primary-500 focus:ring-2"
                />
                <Button onClick={loadMissingProducts} isLoading={loadingMissing} className="bg-slate-900 text-white hover:bg-slate-800">
                  Getir
                </Button>
              </div>
              <div className="mt-3 max-h-[300px] space-y-2 overflow-auto">
                {missingProducts.map((product) => (
                  <button
                    key={product.productCode}
                    type="button"
                    onClick={() => loadProduct(product.productCode)}
                    className="flex w-full gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-left text-xs hover:bg-amber-100"
                  >
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-white/70">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.productName} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-slate-300">Resim yok</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-amber-900">{product.productCode}</div>
                      <div className="line-clamp-1 text-amber-800">{product.productName || 'Urun adi yok'}</div>
                      <div className="mt-1 text-amber-700">{(product.missing || []).slice(0, 3).join(', ')}</div>
                      <div className="mt-1 font-semibold text-slate-600">Stok: {formatNumber(product.stockQuantity || 0, 2)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            {!selectedProduct ? (
              <Card className="flex min-h-[420px] items-center justify-center">
                <div className="text-center">
                  <PackageCheck className="mx-auto h-14 w-14 text-slate-300" />
                  <h2 className="mt-4 text-xl font-bold text-slate-900">Urun secin</h2>
                  <p className="mt-2 text-sm text-slate-500">Olcu, kg, birim katsayisi ve raf bilgilerini duzenlemek icin soldan urun arayin.</p>
                </div>
              </Card>
            ) : (
              <>
                <Card>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        {selectedProduct.imageUrl ? (
                          <img src={selectedProduct.imageUrl} alt={selectedProduct.productName} className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-slate-300">Resim yok</div>
                        )}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-950">{selectedProduct.productCode}</h2>
                        <p className="mt-1 text-sm text-slate-600">{selectedProduct.productName}</p>
                        <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${selectedProduct.hasStock ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {selectedProduct.hasStock ? 'Stokta var' : 'Stokta yok'}: {formatNumber(selectedProduct.stockQuantity || 0, 2)}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm">
                      <div className="font-semibold text-slate-700">Mevcut Raf</div>
                      <div className="text-slate-900">{selectedProduct.shelfCode || '-'} {selectedProduct.shelfName ? `- ${selectedProduct.shelfName}` : ''}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Raf / Reyon Kodu</label>
                      <input
                        value={selectedProduct.shelfCode || ''}
                        onChange={(event) => {
                          const shelfCode = event.target.value.toUpperCase();
                          setSelectedProduct((prev) => prev ? { ...prev, shelfCode } : prev);
                          setShelfSearch(shelfCode);
                        }}
                        placeholder="O-3"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none ring-primary-500 focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">Raf ara ve sec</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          value={shelfSearch}
                          onChange={(event) => {
                            setShelfSearch(event.target.value);
                            setShelfOptionsOpen(true);
                          }}
                          onFocus={() => {
                            setShelfOptionsOpen(true);
                            void searchShelves('');
                          }}
                          placeholder="Raf kodu veya raf adi yazin..."
                          className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none ring-primary-500 focus:ring-2"
                        />
                        {shelfOptionsOpen && (
                          <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                            <div className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                              {shelfSearching ? 'Raflar araniyor...' : `${shelves.length.toLocaleString('tr-TR')} raf listeleniyor`}
                            </div>
                            {!shelfSearching && shelves.length === 0 && (
                              <div className="px-3 py-4 text-sm text-slate-500">Raf bulunamadi.</div>
                            )}
                            {shelves.map((shelf) => (
                              <button
                                key={shelf.code}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectShelf(shelf)}
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-primary-50 ${
                                  selectedProduct.shelfCode === shelf.code ? 'bg-primary-50 text-primary-700' : 'text-slate-700'
                                }`}
                              >
                                <span className="font-semibold">{shelf.code}</span>
                                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{shelf.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Kutu bosken tum aktif Mikro reyonlari listelenir; yazarak kod veya ad icinden arayabilirsiniz.
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="grid gap-4 2xl:grid-cols-2">
                  {selectedProduct.units.map((unit) => {
                    const isDefined = Boolean(unit.name);
                    return (
                      <Card key={unit.index} className={isDefined ? 'border-slate-200' : 'border-dashed border-slate-300'}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">{unit.index}. Birim</h3>
                            <p className="text-xs text-slate-500">
                              {unit.index === 1 ? 'Ana birim' : 'Ek birim ve katsayi Mikro stok kartina yazilir'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-slate-100 px-3 py-2 text-right text-xs">
                            <div>M3: <span className="font-bold">{formatNumber(unit.m3, 6)}</span></div>
                            <div>Desi: <span className="font-bold">{formatNumber(unit.desi, 2)}</span></div>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Birim Adi
                            <input
                              value={unit.name}
                              onChange={(event) => updateUnit(unit.index, { name: event.target.value })}
                              placeholder={unit.index === 2 ? 'KOLI' : 'PAKET'}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none ring-primary-500 focus:ring-2"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            Katsayi
                            <input
                              type="number"
                              step="0.000001"
                              value={unit.factor}
                              onChange={(event) => updateUnit(unit.index, { factor: toNumber(event.target.value) })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-primary-500 focus:ring-2"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            Kg
                            <input
                              type="number"
                              step="0.001"
                              value={unit.weightKg}
                              onChange={(event) => updateUnit(unit.index, { weightKg: toNumber(event.target.value) })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-primary-500 focus:ring-2"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            En (cm)
                            <input
                              type="number"
                              step="0.1"
                              value={unit.widthCm}
                              onChange={(event) => updateUnit(unit.index, { widthCm: toNumber(event.target.value) })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-primary-500 focus:ring-2"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            Boy (cm)
                            <input
                              type="number"
                              step="0.1"
                              value={unit.lengthCm}
                              onChange={(event) => updateUnit(unit.index, { lengthCm: toNumber(event.target.value) })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-primary-500 focus:ring-2"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            Yukseklik (cm)
                            <input
                              type="number"
                              step="0.1"
                              value={unit.heightCm}
                              onChange={(event) => updateUnit(unit.index, { heightCm: toNumber(event.target.value) })}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-primary-500 focus:ring-2"
                            />
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {unit.index !== 1 && (
                            <Button onClick={() => copyUnit(1, unit.index)} className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 text-xs">
                              <Copy className="mr-1 h-3 w-3" />
                              1. birimden kopyala
                            </Button>
                          )}
                          {unit.factor < 0 && (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                              Negatif katsayi Mikroda ters yonlu cevrim olarak korunur.
                            </span>
                          )}
                          {unit.index > 1 && unit.name && unit.factor !== 0 && (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              Yaklasik: 1 {unit.name} = {formatNumber(Math.abs(unit.factor), 4)} {selectedProduct.units[0]?.name || 'ana birim'}
                            </span>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                <Card>
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-slate-500" />
                    <h2 className="text-lg font-bold text-slate-900">Degisiklik Gecmisi</h2>
                  </div>
                  <div className="mt-3 space-y-2">
                    {history.length === 0 && <div className="text-sm text-slate-500">Henuz kayit yok.</div>}
                    {history.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                        <div className="font-semibold text-slate-900">
                          {new Date(item.createdAt).toLocaleString('tr-TR')} - {item.changedByName || 'Bilinmeyen kullanici'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Onceki raf: {item.oldValues?.shelfCode || '-'} | Yeni raf: {item.newValues?.shelfCode || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
