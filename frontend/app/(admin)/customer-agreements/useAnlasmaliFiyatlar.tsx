'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Customer } from '@/types';
import adminApi from '@/lib/api/admin';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Anlasmali Fiyatlar ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */

export interface AgreementRow {
  id: string;
  productId: string;
  priceInvoiced: number;
  priceWhite?: number | null;
  customerProductCode?: string | null;
  minQuantity: number;
  validFrom: string;
  validTo?: string | null;
  product: {
    id: string;
    name: string;
    mikroCode: string;
    unit?: string;
  };
}

export interface ProductResult {
  id: string;
  name: string;
  mikroCode: string;
  unit?: string;
}

export interface AgreementImportRow {
  mikroCode: string;
  priceInvoiced: number;
  priceWhite?: number | null;
  customerProductCode?: string | null;
  minQuantity?: number;
  validFrom?: string | null;
  validTo?: string | null;
}

export function useAnlasmaliFiyatlar() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebounce(productSearch, 300);
  const [productResults, setProductResults] = useState<ProductResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);

  const [agreements, setAgreements] = useState<AgreementRow[]>([]);
  const [agreementSearch, setAgreementSearch] = useState('');
  const debouncedAgreementSearch = useDebounce(agreementSearch, 300);

  const [formData, setFormData] = useState({
    priceInvoiced: '',
    priceWhite: '',
    customerProductCode: '',
    minQuantity: '1',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedAgreementIds, setSelectedAgreementIds] = useState<string[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    failed: number;
    results: Array<{ mikroCode: string; status: string; reason?: string }>;
  } | null>(null);

  const parseNumber = (value: any) => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value;
    let str = String(value).trim();
    if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(str)) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d+,\d+$/.test(str)) {
      str = str.replace(',', '.');
    } else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(str)) {
      str = str.replace(/,/g, '');
    }
    const parsed = Number(str);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const parseOptionalNumber = (value: any) => {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const parsed = parseNumber(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseDateValue = (value: any) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'number') {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    }
    const raw = String(value).trim();
    const parts = raw.split('.');
    if (parts.length === 3) {
      const [day, month, year] = parts.map((part) => Number(part));
      if (day && month && year) {
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.toISOString().slice(0, 10);
      }
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  };

  const findColumnIndex = (headers: any[], candidates: string[]) => {
    const normalized = headers.map((header) => String(header || '').toLowerCase().trim());
    return normalized.findIndex((header) =>
      candidates.some((candidate) => header.includes(candidate))
    );
  };

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:agreements')) {
      router.push('/dashboard');
      return;
    }
    fetchCustomers();
  }, [user, permissionsLoading, router, hasPermission]);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const { customers } = await adminApi.getCustomers();
      setCustomers(customers);
    } catch (error) {
      console.error('Customers not loaded:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedCustomer) {
      setAgreements([]);
      setSelectedAgreementIds([]);
      return;
    }
    fetchAgreements();
  }, [selectedCustomer, debouncedAgreementSearch]);

  const fetchAgreements = async () => {
    if (!selectedCustomer) return;
    try {
      const { agreements } = await adminApi.getAgreements(selectedCustomer.id, debouncedAgreementSearch || undefined);
      setAgreements(agreements || []);
    } catch (error) {
      console.error('Agreements not loaded:', error);
      setAgreements([]);
    }
  };

  useEffect(() => {
    setSelectedAgreementIds((prev) => prev.filter((id) => agreements.some((agreement) => agreement.id === id)));
  }, [agreements]);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!debouncedProductSearch.trim()) {
        setProductResults([]);
        return;
      }
      try {
        const { products } = await adminApi.getProducts({ search: debouncedProductSearch, limit: 20, page: 1 });
        setProductResults(products || []);
      } catch (error) {
        console.error('Products not loaded:', error);
      }
    };

    fetchProducts();
  }, [debouncedProductSearch]);

  const filteredCustomers = useMemo(() => {
    const tokens = buildSearchTokens(customerSearch);
    if (tokens.length === 0) return customers;
    return customers.filter((customer) => {
      const haystack = normalizeSearchText([
        customer.name,
        customer.email,
        customer.mikroCariCode,
      ].filter(Boolean).join(' '));
      return matchesSearchTokens(haystack, tokens);
    });
  }, [customers, customerSearch]);

  const resetForm = () => {
    setSelectedProduct(null);
    setFormData({
      priceInvoiced: '',
      priceWhite: '',
      customerProductCode: '',
      minQuantity: '1',
      validFrom: new Date().toISOString().slice(0, 10),
      validTo: '',
    });
  };

  const handleSelectAgreement = (agreement: AgreementRow) => {
    setSelectedProduct({
      id: agreement.product.id,
      name: agreement.product.name,
      mikroCode: agreement.product.mikroCode,
      unit: agreement.product.unit,
    });
    setFormData({
      priceInvoiced: String(agreement.priceInvoiced),
      priceWhite: agreement.priceWhite !== null && agreement.priceWhite !== undefined
        ? String(agreement.priceWhite)
        : '',
      customerProductCode: agreement.customerProductCode || '',
      minQuantity: String(agreement.minQuantity),
      validFrom: agreement.validFrom ? agreement.validFrom.slice(0, 10) : new Date().toISOString().slice(0, 10),
      validTo: agreement.validTo ? agreement.validTo.slice(0, 10) : '',
    });
  };

  const handleSave = async () => {
    if (!selectedCustomer || !selectedProduct) {
      toast.error('Musteri ve urun seciniz.');
      return;
    }
    if (!formData.priceInvoiced) {
      toast.error('Faturali fiyat giriniz.');
      return;
    }
    setSaving(true);
    try {
      await adminApi.upsertAgreement({
        customerId: selectedCustomer.id,
        productId: selectedProduct.id,
        priceInvoiced: Number(formData.priceInvoiced),
        priceWhite: formData.priceWhite ? Number(formData.priceWhite) : null,
        customerProductCode: formData.customerProductCode?.trim() || null,
        minQuantity: Number(formData.minQuantity) || 1,
        validFrom: formData.validFrom,
        validTo: formData.validTo || null,
      });
      toast.success('Anlasma kaydedildi.');
      resetForm();
      fetchAgreements();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Anlasma kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agreementId: string) => {
    if (!confirm('Anlasmayi silmek istiyor musunuz?')) return;
    setDeletingId(agreementId);
    try {
      await adminApi.deleteAgreement(agreementId);
      toast.success('Anlasma silindi.');
      setSelectedAgreementIds((prev) => prev.filter((id) => id !== agreementId));
      fetchAgreements();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Anlasma silinemedi.');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleAgreementSelection = (agreementId: string) => {
    setSelectedAgreementIds((prev) => (
      prev.includes(agreementId) ? prev.filter((id) => id !== agreementId) : [...prev, agreementId]
    ));
  };

  const toggleSelectAllAgreements = () => {
    if (agreements.length === 0) return;
    setSelectedAgreementIds((prev) => (
      prev.length === agreements.length ? [] : agreements.map((agreement) => agreement.id)
    ));
  };

  const handleBulkDelete = async (mode: 'selected' | 'all') => {
    if (!selectedCustomer) {
      toast.error('Once musteri secin.');
      return;
    }
    const targetIds = mode === 'selected' ? selectedAgreementIds : [];
    if (mode === 'selected' && targetIds.length === 0) {
      toast.error('Silmek icin en az bir anlasma secin.');
      return;
    }
    const confirmMessage = mode === 'selected'
      ? `${targetIds.length} anlasmayi silmek istiyor musunuz?`
      : 'Secili musterinin tum anlasmalarini silmek istiyor musunuz?';
    if (!confirm(confirmMessage)) return;

    setBulkDeleting(true);
    try {
      const result = await adminApi.deleteAgreements({
        customerId: selectedCustomer.id,
        ids: mode === 'selected' ? targetIds : undefined,
      });
      const deletedCount = result?.deletedCount ?? 0;
      toast.success(`${deletedCount} anlasma silindi.`);
      setSelectedAgreementIds([]);
      fetchAgreements();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Toplu silme basarisiz.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const allAgreementsSelected = agreements.length > 0 && selectedAgreementIds.length === agreements.length;

  const handleDownloadTemplate = () => {
    const rows = [
      ['Mikro Kod', 'Faturali Fiyat', 'Beyaz Fiyat', 'Musteri Urun Kodu', 'Min Miktar', 'Baslangic', 'Bitis'],
      ['B101996', '86,69', '76,61', 'CUS-001', '1', new Date().toISOString().slice(0, 10), ''],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Anlasmalar');
    XLSX.writeFile(workbook, `anlasmali-fiyatlar-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImport = async () => {
    if (!selectedCustomer) {
      toast.error('Once musteri secin.');
      return;
    }
    if (!importFile) {
      toast.error('Dosya secin.');
      return;
    }

    setImporting(true);
    setImportSummary(null);
    try {
      const arrayBuffer = await importFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[];
      const headers = data[0] || [];

      const codeIndex = findColumnIndex(headers, ['mikro kod', 'stok kod', 'stok kodu', 'urun kod', 'ürün kod']);
      const invoicedIndex = findColumnIndex(headers, ['faturali fiyat', 'faturalı fiyat', 'invoiced']);
      const whiteIndex = findColumnIndex(headers, ['beyaz fiyat', 'white']);
      const customerCodeIndex = findColumnIndex(headers, ['musteri urun kod', 'ozel urun kod', 'musteri kod', 'musteri urun']);
      const minQtyIndex = findColumnIndex(headers, ['min miktar', 'minimum miktar', 'min qty']);
      const validFromIndex = findColumnIndex(headers, ['baslangic', 'başlangıç', 'gecerlilik baslangic', 'valid from']);
      const validToIndex = findColumnIndex(headers, ['bitis', 'bitiş', 'gecerlilik bitis', 'valid to']);

      if (codeIndex === -1 || invoicedIndex === -1) {
        throw new Error('Mikro kod ve faturali fiyat kolonlari zorunludur.');
      }

      const rows: AgreementImportRow[] = [];
      for (let i = 1; i < data.length; i += 1) {
        const row = data[i];
        const mikroCode = String(row[codeIndex] || '').trim();
        if (!mikroCode) continue;

        const rawCustomerCode = customerCodeIndex !== -1
          ? String(row[customerCodeIndex] || '').trim()
          : '';

        const priceWhiteValue = whiteIndex !== -1 ? parseOptionalNumber(row[whiteIndex]) : null;

        rows.push({
          mikroCode,
          priceInvoiced: parseNumber(row[invoicedIndex]),
          priceWhite: priceWhiteValue,
          customerProductCode: customerCodeIndex !== -1 ? (rawCustomerCode || null) : null,
          minQuantity: minQtyIndex !== -1 ? parseNumber(row[minQtyIndex]) : 1,
          validFrom: validFromIndex !== -1 ? parseDateValue(row[validFromIndex]) : null,
          validTo: validToIndex !== -1 ? parseDateValue(row[validToIndex]) : null,
        });
      }

      if (rows.length === 0) {
        throw new Error('Islenecek satir bulunamadi.');
      }

      const result = await adminApi.importAgreements({
        customerId: selectedCustomer.id,
        rows,
      });
      setImportSummary(result);
      toast.success('Excel aktarimi tamamlandi.');
      fetchAgreements();
    } catch (error: any) {
      console.error('Agreement import error:', error);
      toast.error(error?.message || 'Excel aktarimi basarisiz.');
    } finally {
      setImporting(false);
    }
  };

  return {
    // navigation / yetki
    router,
    isLoading,

    // musteri secimi
    customers,
    selectedCustomer,
    setSelectedCustomer,
    customerSearch,
    setCustomerSearch,
    filteredCustomers,

    // urun secimi
    productSearch,
    setProductSearch,
    productResults,
    selectedProduct,
    setSelectedProduct,

    // anlasma listesi
    agreements,
    agreementSearch,
    setAgreementSearch,

    // form
    formData,
    setFormData,
    saving,
    deletingId,
    bulkDeleting,
    selectedAgreementIds,
    allAgreementsSelected,

    // excel import
    importFile,
    setImportFile,
    importing,
    importSummary,
    setImportSummary,

    // handlerlar
    resetForm,
    handleSelectAgreement,
    handleSave,
    handleDelete,
    toggleAgreementSelection,
    toggleSelectAllAgreements,
    handleBulkDelete,
    handleDownloadTemplate,
    handleImport,
  };
}

export default useAnlasmaliFiyatlar;
