'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api/admin';

export interface Supplier {
  id: string;
  name: string;
  active: boolean;
  discount1?: number | null;
  discount2?: number | null;
  discount3?: number | null;
  discount4?: number | null;
  discount5?: number | null;
  defaultDiscounts?: number[] | null;
  priceIsNet?: boolean;
  priceIncludesVat?: boolean;
  priceByColor?: boolean;
  defaultVatRate?: number | null;
  excelSheetName?: string | null;
  excelHeaderRow?: number | null;
  excelCodeHeader?: string | null;
  excelNameHeader?: string | null;
  excelPriceHeader?: string | null;
  pdfPriceIndex?: number | null;
  pdfCodePattern?: string | null;
  discountRules?: SupplierDiscountRule[] | null;
}

export type SupplierDiscountRule = {
  keywords: string[];
  discounts: number[];
};

export type DiscountRuleForm = {
  keywords: string;
  discounts: string[];
};

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

// En az 1 (bos) kutu her zaman bulunsun.
const ensureAtLeastOne = (values: string[]) => (values.length ? values : ['']);

// Supplier'dan ana zincir iskontoyu form dizisine cevir:
// once defaultDiscounts, yoksa discount1..5 dolu olanlar.
const supplierToDiscountStrings = (supplier: Supplier): string[] => {
  if (Array.isArray(supplier.defaultDiscounts) && supplier.defaultDiscounts.length) {
    return supplier.defaultDiscounts
      .filter((value) => typeof value === 'number' && value > 0)
      .map((value) => value.toString());
  }
  const legacy = [
    supplier.discount1,
    supplier.discount2,
    supplier.discount3,
    supplier.discount4,
    supplier.discount5,
  ].filter((value) => typeof value === 'number' && value > 0) as number[];
  return ensureAtLeastOne(legacy.map((value) => value.toString()));
};

const createEmptyRule = (): DiscountRuleForm => ({
  keywords: '',
  discounts: [''],
});

const parseKeywordList = (value: string) =>
  value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);

export const buildDiscountSummary = (supplier: Supplier) => {
  let values: number[] = [];
  if (Array.isArray(supplier.defaultDiscounts) && supplier.defaultDiscounts.length) {
    values = supplier.defaultDiscounts.filter(
      (value) => typeof value === 'number' && value > 0
    ) as number[];
  } else {
    values = [
      supplier.discount1,
      supplier.discount2,
      supplier.discount3,
      supplier.discount4,
      supplier.discount5,
    ].filter((value) => typeof value === 'number' && value > 0) as number[];
  }

  if (!values.length) return supplier.priceIsNet ? 'Net' : 'Bos';
  return values.map((value) => value.toString()).join('+');
};

/**
 * Tedarikci Iskonto Ayarlari ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 */
export function useTedarikciIskonto() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [form, setForm] = useState({
    name: '',
    active: true,
    discounts: [''] as string[],
    priceIsNet: false,
    priceIncludesVat: false,
    priceByColor: false,
    defaultVatRate: '',
    excelSheetName: '',
    excelHeaderRow: '',
    excelCodeHeader: '',
    excelNameHeader: '',
    excelPriceHeader: '',
    pdfPriceIndex: '',
    pdfCodePattern: '',
    discountRules: [] as DiscountRuleForm[],
  });

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const result = await adminApi.getSupplierPriceListSuppliers();
      setSuppliers(result.suppliers || []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Tedarikciler yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const resetForm = () => {
    setForm({
      name: '',
      active: true,
      discounts: [''],
      priceIsNet: false,
      priceIncludesVat: false,
      priceByColor: false,
      defaultVatRate: '',
      excelSheetName: '',
      excelHeaderRow: '',
      excelCodeHeader: '',
      excelNameHeader: '',
      excelPriceHeader: '',
      pdfPriceIndex: '',
      pdfCodePattern: '',
      discountRules: [],
    });
    setEditingSupplier(null);
  };

  const openModal = (supplier?: Supplier) => {
    if (supplier) {
      const ruleForms: DiscountRuleForm[] = Array.isArray(supplier.discountRules)
        ? supplier.discountRules.map((rule) => ({
          keywords: Array.isArray(rule.keywords) ? rule.keywords.join(', ') : '',
          discounts: ensureAtLeastOne(
            (Array.isArray(rule.discounts) ? rule.discounts : [])
              .filter((value) => typeof value === 'number' && value > 0)
              .map((value) => value.toString())
          ),
        }))
        : [];

      setEditingSupplier(supplier);
      setForm({
        name: supplier.name || '',
        active: supplier.active ?? true,
        discounts: supplierToDiscountStrings(supplier),
        priceIsNet: supplier.priceIsNet ?? false,
        priceIncludesVat: supplier.priceIncludesVat ?? false,
        priceByColor: supplier.priceByColor ?? false,
        defaultVatRate: supplier.defaultVatRate?.toString() || '',
        excelSheetName: supplier.excelSheetName || '',
        excelHeaderRow: supplier.excelHeaderRow?.toString() || '',
        excelCodeHeader: supplier.excelCodeHeader || '',
        excelNameHeader: supplier.excelNameHeader || '',
        excelPriceHeader: supplier.excelPriceHeader || '',
        pdfPriceIndex: supplier.pdfPriceIndex?.toString() || '',
        pdfCodePattern: supplier.pdfCodePattern || '',
        discountRules: ruleForms,
      });
    } else {
      resetForm();
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setTimeout(resetForm, 200);
  };

  // ---- Ana zincir iskonto handlerlari (dinamik) ----
  const addMainDiscount = () => {
    setForm((prev) => ({ ...prev, discounts: [...prev.discounts, ''] }));
  };

  const removeMainDiscount = (index: number) => {
    setForm((prev) => {
      const next = prev.discounts.filter((_, idx) => idx !== index);
      return { ...prev, discounts: ensureAtLeastOne(next) };
    });
  };

  const updateMainDiscount = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      discounts: prev.discounts.map((disc, idx) => (idx === index ? value : disc)),
    }));
  };

  // ---- Ozel kural handlerlari ----
  const addDiscountRule = () => {
    setForm((prev) => ({
      ...prev,
      discountRules: [...prev.discountRules, createEmptyRule()],
    }));
  };

  const removeDiscountRule = (index: number) => {
    setForm((prev) => ({
      ...prev,
      discountRules: prev.discountRules.filter((_, idx) => idx !== index),
    }));
  };

  const updateDiscountRuleKeywords = (index: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      discountRules: prev.discountRules.map((rule, idx) =>
        idx === index ? { ...rule, keywords: value } : rule
      ),
    }));
  };

  const updateRuleDiscount = (index: number, discIdx: number, value: string) => {
    setForm((prev) => ({
      ...prev,
      discountRules: prev.discountRules.map((rule, idx) =>
        idx === index
          ? {
            ...rule,
            discounts: rule.discounts.map((disc, dIdx) => (dIdx === discIdx ? value : disc)),
          }
          : rule
      ),
    }));
  };

  const addRuleDiscount = (index: number) => {
    setForm((prev) => ({
      ...prev,
      discountRules: prev.discountRules.map((rule, idx) =>
        idx === index ? { ...rule, discounts: [...rule.discounts, ''] } : rule
      ),
    }));
  };

  const removeRuleDiscount = (index: number, discIdx: number) => {
    setForm((prev) => ({
      ...prev,
      discountRules: prev.discountRules.map((rule, idx) =>
        idx === index
          ? { ...rule, discounts: ensureAtLeastOne(rule.discounts.filter((_, dIdx) => dIdx !== discIdx)) }
          : rule
      ),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Tedarikci adi gerekli');
      return;
    }

    const defaultDiscounts = form.discounts
      .map((value) => parseOptionalNumber(value))
      .filter((value): value is number => Boolean(value && value > 0));

    const discountRules: SupplierDiscountRule[] = (form.discountRules || [])
      .map((rule) => {
        const keywords = parseKeywordList(rule.keywords);
        const discounts = rule.discounts
          .map((value) => parseOptionalNumber(value))
          .filter((value): value is number => Boolean(value && value > 0));
        return { keywords, discounts };
      })
      .filter((rule) => rule.keywords.length > 0 && rule.discounts.length > 0);

    const payload = {
      name: form.name.trim(),
      active: form.active,
      defaultDiscounts,
      // Geri-uyum: ilk 5 kademeyi legacy kolonlara da yaz (eski okuyuculara).
      discount1: defaultDiscounts[0] ?? null,
      discount2: defaultDiscounts[1] ?? null,
      discount3: defaultDiscounts[2] ?? null,
      discount4: defaultDiscounts[3] ?? null,
      discount5: defaultDiscounts[4] ?? null,
      priceIsNet: form.priceIsNet,
      priceIncludesVat: form.priceIncludesVat,
      priceByColor: form.priceByColor,
      defaultVatRate: parseOptionalNumber(form.defaultVatRate),
      excelSheetName: form.excelSheetName.trim() || null,
      excelHeaderRow: form.excelHeaderRow.trim() ? Number(form.excelHeaderRow) : null,
      excelCodeHeader: form.excelCodeHeader.trim() || null,
      excelNameHeader: form.excelNameHeader.trim() || null,
      excelPriceHeader: form.excelPriceHeader.trim() || null,
      pdfPriceIndex: form.pdfPriceIndex.trim() ? Number(form.pdfPriceIndex) : null,
      pdfCodePattern: form.pdfCodePattern.trim() || null,
      discountRules: discountRules.length ? discountRules : [],
    };

    try {
      setSaving(true);
      if (editingSupplier) {
        await adminApi.updateSupplierPriceListSupplier(editingSupplier.id, payload);
        toast.success('Tedarikci guncellendi');
      } else {
        await adminApi.createSupplierPriceListSupplier(payload);
        toast.success('Tedarikci eklendi');
      }
      closeModal();
      await loadSuppliers();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const discountSummary = useMemo(() => {
    if (!editingSupplier) return null;
    return buildDiscountSummary(editingSupplier);
  }, [editingSupplier]);

  return {
    // veri
    suppliers,
    loading,
    saving,
    // modal / form
    modalOpen,
    editingSupplier,
    form,
    setForm,
    discountSummary,
    // handlerlar
    loadSuppliers,
    openModal,
    closeModal,
    // ana zincir iskonto
    addMainDiscount,
    removeMainDiscount,
    updateMainDiscount,
    // ozel kurallar
    addDiscountRule,
    removeDiscountRule,
    updateDiscountRuleKeywords,
    updateRuleDiscount,
    addRuleDiscount,
    removeRuleDiscount,
    handleSave,
    // helper
    buildDiscountSummary,
  };
}

export default useTedarikciIskonto;
