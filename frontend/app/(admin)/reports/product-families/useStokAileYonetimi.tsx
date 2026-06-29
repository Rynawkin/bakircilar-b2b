'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api/admin';

export interface ProductFamily {
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

export interface PoolProduct {
  id: string;
  mikroCode: string;
  name: string;
}

export type FormMode = 'create' | 'edit';

export const foldSearch = (value: string): string =>
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

export const buildSearchVariants = (query: string): string[] => {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const folded = foldSearch(raw);
  const trI = raw.replace(/i/g, 'ı').replace(/I/g, 'İ');
  const latinI = raw.replace(/ı/g, 'i').replace(/İ/g, 'I');
  return Array.from(new Set([raw, folded, trI, latinI].filter((item) => String(item || '').trim().length >= 2)));
};

export const mapFamilyItemsToPool = (family: ProductFamily): PoolProduct[] =>
  family.items.map((item) => ({
    id: item.id,
    mikroCode: String(item.productCode || '').trim().toUpperCase(),
    name: String(item.productName || '').trim(),
  }));

/**
 * Stok Aile Yonetimi ekraninin TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki ProductFamiliesPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 */
export function useStokAileYonetimi() {
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
  const [familySearch, setFamilySearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<PoolProduct[]>([]);
  const searchRequestRef = useRef(0);

  const selectedCodeSet = useMemo(
    () => new Set(selectedProducts.map((product) => product.mikroCode)),
    [selectedProducts]
  );
  const editingFamily = useMemo(
    () => families.find((family) => family.id === editingId) || null,
    [families, editingId]
  );
  const familyNamesByProductCode = useMemo(() => {
    const map = new Map<string, string[]>();
    families.forEach((family) => {
      const familyName = String(family.name || '').trim();
      family.items.forEach((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        if (!code) return;
        const list = map.get(code) || [];
        if (familyName && !list.includes(familyName)) list.push(familyName);
        map.set(code, list);
      });
    });
    return map;
  }, [families]);
  const filteredFamilies = useMemo(() => {
    const q = foldSearch(familySearch);
    if (!q) return families;
    return families.filter((family) =>
      foldSearch(`${family.name || ''} ${family.code || ''} ${family.note || ''}`).includes(q)
    );
  }, [families, familySearch]);

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
        const foldedTokens = foldSearch(q).split(' ').filter(Boolean);
        const deduped = new Map<string, PoolProduct>();
        mapped.forEach((product) => {
          const key = product.mikroCode;
          if (!deduped.has(key)) deduped.set(key, product);
        });
        const filtered = Array.from(deduped.values()).filter((product) => {
          if (foldedTokens.length === 0) return true;
          const haystack = `${foldSearch(product.mikroCode)} ${foldSearch(product.name)}`;
          return foldedTokens.every((token) => haystack.includes(token));
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

  return {
    // state
    families,
    loadingFamilies,
    saving,
    deletingId,
    mode,
    editingId,
    name,
    setName,
    code,
    setCode,
    note,
    setNote,
    selectedProducts,
    search,
    setSearch,
    familySearch,
    setFamilySearch,
    searchLoading,
    searchResults,
    // derived
    selectedCodeSet,
    editingFamily,
    familyNamesByProductCode,
    filteredFamilies,
    // handlers
    loadFamilies,
    resetForm,
    startEdit,
    addProduct,
    removeProduct,
    saveFamily,
    deleteFamily,
  };
}
