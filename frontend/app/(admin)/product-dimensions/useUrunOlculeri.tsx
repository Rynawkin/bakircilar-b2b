'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Urun Olculeri ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */

export type UnitInfo = {
  index: number;
  name: string;
  factor: number;
  factorDirection?: 'larger' | 'smaller';
  weightKg: number;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  tareKg?: number;
  m3: number;
  desi: number;
  enabled?: boolean;
};

export type ProductDimension = {
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

export type Shelf = {
  code: string;
  name: string;
};

export type ChangeLog = {
  id: string;
  productCode: string;
  changedByName: string | null;
  oldValues: ProductDimension;
  newValues: ProductDimension;
  createdAt: string;
};

export type KeyboardTarget = {
  title: string;
  value: string;
  mode: 'text' | 'number';
  onApply: (value: string) => void;
};

export const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'İ', 'Ö', 'Ü'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Ç', 'Ğ', 'Ş', '.', '-'],
];

export const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', ','];

export const textInputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none ring-primary-500 focus:ring-2 2xl:text-lg';
export const iconTextInputClass = 'w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-base font-semibold outline-none ring-primary-500 focus:ring-2 2xl:text-lg';
export const numericInputClass = 'mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base font-bold outline-none ring-primary-500 focus:ring-2 2xl:text-lg';

export const toNumber = (value: unknown) => {
  const num = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
};

export const mikroFactorToUi = (index: number, factor: unknown) => {
  const raw = toNumber(factor);
  if (index === 1) return { factor: raw || 1, factorDirection: 'larger' as const, mikroFactor: raw || 1 };
  if (raw < 0) return { factor: Math.abs(raw), factorDirection: 'larger' as const, mikroFactor: raw };
  return { factor: raw, factorDirection: 'smaller' as const, mikroFactor: raw };
};

export const uiFactorToMikro = (unit: UnitInfo) => {
  const factor = Math.abs(toNumber(unit.factor));
  if (unit.index === 1) return factor || 1;
  return unit.factorDirection === 'smaller' ? factor : -factor;
};

export const emptyUnits = (): UnitInfo[] =>
  [1, 2, 3, 4].map((index) => ({
    index,
    name: '',
    factor: index === 1 ? 1 : 0,
    factorDirection: 'larger',
    weightKg: 0,
    widthCm: 0,
    lengthCm: 0,
    heightCm: 0,
    m3: 0,
    desi: 0,
    enabled: index === 1,
  }));

export const formatNumber = (value: number, fractionDigits = 3) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: fractionDigits }).format(Number(value) || 0);

export const mmToCm = (value: unknown) => toNumber(value) / 10;

export const cmToMm = (value: unknown) => Math.round(toNumber(value) * 10 * 1000) / 1000;

export const calcM3 = (widthCm: number, lengthCm: number, heightCm: number) => {
  if (!widthCm || !lengthCm || !heightCm) return 0;
  return (widthCm * lengthCm * heightCm) / 1_000_000;
};

export const calcDesi = (widthCm: number, lengthCm: number, heightCm: number) => {
  if (!widthCm || !lengthCm || !heightCm) return 0;
  return (widthCm * lengthCm * heightCm) / 3000;
};

export const normalizeUnit = (unit: UnitInfo): UnitInfo => {
  const widthCm = toNumber(unit.widthCm);
  const lengthCm = toNumber(unit.lengthCm);
  const heightCm = toNumber(unit.heightCm);
  return {
    ...unit,
    name: String(unit.name || '').trim().toUpperCase(),
    factor: toNumber(unit.factor),
    factorDirection: unit.index === 1 ? 'larger' : unit.factorDirection || 'larger',
    weightKg: toNumber(unit.weightKg),
    widthCm,
    lengthCm,
    heightCm,
    m3: calcM3(widthCm, lengthCm, heightCm),
    desi: calcDesi(widthCm, lengthCm, heightCm),
  };
};

export const isUnitEnabled = (unit?: UnitInfo) => Boolean(unit && (unit.index === 1 || unit.enabled || unit.name));

export const apiProductToUi = (product: any): ProductDimension => ({
  ...product,
  units: (product?.units || emptyUnits()).map((unit: any) =>
    normalizeUnit({
      ...unit,
      ...mikroFactorToUi(Number(unit.index), unit.factor),
      widthCm: mmToCm(unit.widthMm),
      lengthCm: mmToCm(unit.lengthMm),
      heightCm: mmToCm(unit.heightMm),
      enabled: unit.index === 1 || Boolean(String(unit.name || '').trim()),
    })
  ),
});

export const buildCsv = (products: ProductDimension[]) => {
  const rows = [
    ['Stok Kodu', 'Urun Adi', 'Stok Miktari', 'Raf Kodu', 'Raf Adi', 'Birim', 'Birim Adi', 'Katsayi', 'Kg', 'En cm', 'Boy cm', 'Yukseklik cm', 'm3', 'Desi', 'Eksikler'],
  ];
  products.forEach((product) => {
    product.units.forEach((unit) => {
      if (!isUnitEnabled(unit)) return;
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

export function useUrunOlculeri() {
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
  const [keyboardTarget, setKeyboardTarget] = useState<KeyboardTarget | null>(null);
  const [keyboardValue, setKeyboardValue] = useState('');
  const [unitNames, setUnitNames] = useState<string[]>([]);

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

  useEffect(() => {
    const loadUnitNames = async () => {
      try {
        const res = await apiClient.get('/admin/product-dimensions/unit-names');
        setUnitNames(res.data.units || []);
      } catch {
        setUnitNames([]);
      }
    };
    void loadUnitNames();
  }, []);

  const changedFields = useMemo(() => {
    if (!selectedProduct || !originalProduct) return [];
    const changes: string[] = [];
    if ((selectedProduct.shelfCode || '') !== (originalProduct.shelfCode || '')) {
      changes.push(`Raf: ${originalProduct.shelfCode || '-'} -> ${selectedProduct.shelfCode || '-'}`);
    }
    selectedProduct.units.forEach((unit, index) => {
      const oldUnit = originalProduct.units[index] || emptyUnits()[index];
      const unitEnabled = isUnitEnabled(unit);
      const oldUnitEnabled = isUnitEnabled(oldUnit);
      if (!unitEnabled && !oldUnitEnabled) return;
      if (unitEnabled && !oldUnitEnabled) {
        changes.push(`${unit.index}. birim eklendi`);
      }
      const fields: Array<[keyof UnitInfo, string]> = [
        ['name', 'Birim adi'],
        ['factor', 'Katsayi'],
        ['factorDirection', 'Katsayi yonu'],
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

  const openKeyboard = (target: KeyboardTarget) => {
    setKeyboardTarget(target);
    setKeyboardValue(target.value);
  };

  const applyKeyboard = () => {
    if (!keyboardTarget) return;
    keyboardTarget.onApply(keyboardValue);
    setKeyboardTarget(null);
  };

  const appendKeyboardKey = (key: string) => {
    setKeyboardValue((prev) => `${prev}${key}`);
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

  const addUnit = (index: number) => {
    setSelectedProduct((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        units: prev.units.map((unit) =>
          unit.index === index
            ? normalizeUnit({ ...unit, enabled: true, factor: unit.factor || 1 })
            : unit
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
      if (!isUnitEnabled(unit)) continue;
      if (!unit.name) {
        toast.error(`${unit.index}. birim adi gerekli`);
        return false;
      }
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
    const factorPreview = selectedProduct.units
      .filter((unit) => isUnitEnabled(unit) && unit.index > 1)
      .map((unit) => `${unit.index}. birim ${unit.name || '-'}: ekranda ${formatNumber(Math.abs(unit.factor || 0), 4)} -> Mikro ${formatNumber(uiFactorToMikro(unit), 4)}`);
    const confirmed = window.confirm(`Mikro stok karti guncellenecek. Olculer cm girildi, Mikroya mm olarak yazilacak.\n\nKatsayi cevrimi:\n${factorPreview.join('\n') || '-'}\n\nDegisenler:\n${changedFields.slice(0, 12).join('\n')}${changedFields.length > 12 ? '\n...' : ''}`);
    if (!confirmed) return;

    setSaving(true);
    try {
      const payload = {
        shelfCode: selectedProduct.shelfCode || '',
        units: selectedProduct.units
          .filter(isUnitEnabled)
          .map((unit) => ({
            index: unit.index,
            name: unit.name || '',
            factor: uiFactorToMikro(unit),
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
      toast.success('Mikro stok karti kaydedildi ve tekrar okundu');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Kayit yapilamadi');
    } finally {
      setSaving(false);
    }
  };

  const exportMissing = () => {
    const csv = buildCsv(missingProducts);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `yolpilot-eksik-olcu-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return {
    // store / izin
    user,
    permissionsLoading,
    // arama
    search,
    setSearch,
    searchResults,
    searching,
    // secili urun
    selectedProduct,
    setSelectedProduct,
    originalProduct,
    history,
    saving,
    // raf
    shelfSearch,
    setShelfSearch,
    shelves,
    shelfOptionsOpen,
    setShelfOptionsOpen,
    shelfSearching,
    // eksik veri raporu
    missingSearch,
    setMissingSearch,
    missingProducts,
    loadingMissing,
    // klavye
    keyboardTarget,
    setKeyboardTarget,
    keyboardValue,
    setKeyboardValue,
    // birim adlari datalist
    unitNames,
    // turetilmis
    changedFields,
    // handlerlar
    searchProducts,
    loadProduct,
    searchShelves,
    selectShelf,
    openKeyboard,
    applyKeyboard,
    appendKeyboardKey,
    loadMissingProducts,
    updateUnit,
    addUnit,
    copyUnit,
    validateBeforeSave,
    saveProduct,
    exportMissing,
  };
}

export default useUrunOlculeri;
