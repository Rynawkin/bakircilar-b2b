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
  discount1: string;
  discount2: string;
  discount3: string;
  discount4: string;
  discount5: string;
};

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const createEmptyRule = (): DiscountRuleForm => ({
  keywords: '',
  discount1: '',
  discount2: '',
  discount3: '',
  discount4: '',
  discount5: '',
});

const parseKeywordList = (value: string) =>
  value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);

export const buildDiscountSummary = (supplier: Supplier) => {
  const values = [
    supplier.discount1,
    supplier.discount2,
    supplier.discount3,
    supplier.discount4,
    supplier.discount5,
  ].filter((value) => typeof value === 'number' && value > 0) as number[];

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
    discount1: '',
    discount2: '',
    discount3: '',
    discount4: '',
    discount5: '',
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
      discount1: '',
      discount2: '',
      discount3: '',
      discount4: '',
      discount5: '',
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
          discount1: rule.discounts?.[0]?.toString() || '',
          discount2: rule.discounts?.[1]?.toString() || '',
          discount3: rule.discounts?.[2]?.toString() || '',
          discount4: rule.discounts?.[3]?.toString() || '',
          discount5: rule.discounts?.[4]?.toString() || '',
        }))
        : [];

      setEditingSupplier(supplier);
      setForm({
        name: supplier.name || '',
        active: supplier.active ?? true,
        discount1: supplier.discount1?.toString() || '',
        discount2: supplier.discount2?.toString() || '',
        discount3: supplier.discount3?.toString() || '',
        discount4: supplier.discount4?.toString() || '',
        discount5: supplier.discount5?.toString() || '',
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

  const updateDiscountRule = (index: number, field: keyof DiscountRuleForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      discountRules: prev.discountRules.map((rule, idx) =>
        idx === index ? { ...rule, [field]: value } : rule
      ),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Tedarikci adi gerekli');
      return;
    }

    const discountRules: SupplierDiscountRule[] = (form.discountRules || [])
      .map((rule) => {
        const keywords = parseKeywordList(rule.keywords);
        const discounts = [
          parseOptionalNumber(rule.discount1),
          parseOptionalNumber(rule.discount2),
          parseOptionalNumber(rule.discount3),
          parseOptionalNumber(rule.discount4),
          parseOptionalNumber(rule.discount5),
        ].filter((value): value is number => Boolean(value && value > 0));
        return { keywords, discounts };
      })
      .filter((rule) => rule.keywords.length > 0 && rule.discounts.length > 0);

    const payload = {
      name: form.name.trim(),
      active: form.active,
      discount1: parseOptionalNumber(form.discount1),
      discount2: parseOptionalNumber(form.discount2),
      discount3: parseOptionalNumber(form.discount3),
      discount4: parseOptionalNumber(form.discount4),
      discount5: parseOptionalNumber(form.discount5),
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
    addDiscountRule,
    removeDiscountRule,
    updateDiscountRule,
    handleSave,
    // helper
    buildDiscountSummary,
  };
}

export default useTedarikciIskonto;
