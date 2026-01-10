'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Customer } from '@/types';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LogoLink } from '@/components/ui/Logo';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useAuthStore } from '@/lib/store/authStore';

interface AgreementRow {
  id: string;
  productId: string;
  priceInvoiced: number;
  priceWhite: number;
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

interface ProductResult {
  id: string;
  name: string;
  mikroCode: string;
  unit?: string;
}

interface AgreementImportRow {
  mikroCode: string;
  priceInvoiced: number;
  priceWhite: number;
  minQuantity?: number;
  validFrom?: string | null;
  validTo?: string | null;
}

export default function AgreementsPage() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();

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
    minQuantity: '1',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
    if (!user) return;
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'HEAD_ADMIN') {
      router.push('/login');
      return;
    }
    fetchCustomers();
  }, [user, router]);

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
      priceWhite: String(agreement.priceWhite),
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
    if (!formData.priceInvoiced || !formData.priceWhite) {
      toast.error('Faturali ve beyaz fiyatlari giriniz.');
      return;
    }
    setSaving(true);
    try {
      await adminApi.upsertAgreement({
        customerId: selectedCustomer.id,
        productId: selectedProduct.id,
        priceInvoiced: Number(formData.priceInvoiced),
        priceWhite: Number(formData.priceWhite),
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
      fetchAgreements();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Anlasma silinemedi.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadTemplate = () => {
    const rows = [
      ['Mikro Kod', 'Faturali Fiyat', 'Beyaz Fiyat', 'Min Miktar', 'Baslangic', 'Bitis'],
      ['B101996', '86,69', '76,61', '1', new Date().toISOString().slice(0, 10), ''],
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
      const minQtyIndex = findColumnIndex(headers, ['min miktar', 'minimum miktar', 'min qty']);
      const validFromIndex = findColumnIndex(headers, ['baslangic', 'başlangıç', 'gecerlilik baslangic', 'valid from']);
      const validToIndex = findColumnIndex(headers, ['bitis', 'bitiş', 'gecerlilik bitis', 'valid to']);

      if (codeIndex === -1 || invoicedIndex === -1 || whiteIndex === -1) {
        throw new Error('Mikro kod, faturali fiyat ve beyaz fiyat kolonlari zorunludur.');
      }

      const rows: AgreementImportRow[] = [];
      for (let i = 1; i < data.length; i += 1) {
        const row = data[i];
        const mikroCode = String(row[codeIndex] || '').trim();
        if (!mikroCode) continue;

        rows.push({
          mikroCode,
          priceInvoiced: parseNumber(row[invoicedIndex]),
          priceWhite: parseNumber(row[whiteIndex]),
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">Anlasmali Fiyatlar</h1>
                <p className="text-sm text-primary-100">Musteri bazli anlasma fiyatlari</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => router.push('/customers')}
              className="bg-white text-primary-700 hover:bg-primary-50"
            >
              Musterilere Don
            </Button>
          </div>
        </div>
      </header>

      <div className="container-custom py-8 space-y-6">
        <Card>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Musteri Sec</label>
              <Input
                placeholder="Musteri ara"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <div className="mt-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      resetForm();
                    }}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-50 ${
                      selectedCustomer?.id === customer.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{customer.name}</div>
                    <div className="text-xs text-gray-500">{customer.mikroCariCode}</div>
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="px-3 py-4 text-xs text-gray-500">Musteri bulunamadi.</div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Urun Sec</label>
              <Input
                placeholder="Urun ara"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <div className="mt-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {productResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-gray-50 ${
                      selectedProduct?.id === product.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{product.name}</div>
                    <div className="text-xs text-gray-500">{product.mikroCode}</div>
                  </button>
                ))}
                {productSearch.trim() && productResults.length === 0 && (
                  <div className="px-3 py-4 text-xs text-gray-500">Urun bulunamadi.</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-700">Anlasma Bilgileri</label>
              <Input
                label="Faturali Fiyat"
                type="number"
                value={formData.priceInvoiced}
                onChange={(e) => setFormData({ ...formData, priceInvoiced: e.target.value })}
              />
              <Input
                label="Beyaz Fiyat"
                type="number"
                value={formData.priceWhite}
                onChange={(e) => setFormData({ ...formData, priceWhite: e.target.value })}
              />
              <Input
                label="Min Miktar"
                type="number"
                value={formData.minQuantity}
                onChange={(e) => setFormData({ ...formData, minQuantity: e.target.value })}
              />
              <Input
                label="Baslangic"
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
              />
              <Input
                label="Bitis (opsiyonel)"
                type="date"
                value={formData.validTo}
                onChange={(e) => setFormData({ ...formData, validTo: e.target.value })}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleSave}
                  isLoading={saving}
                >
                  Kaydet
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Temizle
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Excel ile Toplu Aktarim</h2>
            <Button variant="secondary" onClick={handleDownloadTemplate}>
              Ornek Excel Indir
            </Button>
          </div>
          <div className="space-y-3 text-sm text-gray-600">
            <p>Excel kolonlari: Mikro Kod, Faturali Fiyat, Beyaz Fiyat, Min Miktar, Baslangic, Bitis.</p>
            <p>Aktarim, secili musteri icin uygulanir.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            />
            <Button
              className="bg-primary-600 hover:bg-primary-700 text-white"
              onClick={handleImport}
              isLoading={importing}
              disabled={importing || !importFile}
            >
              {importing ? 'Aktariliyor...' : 'Excel Aktar'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setImportFile(null);
                setImportSummary(null);
              }}
              disabled={importing}
            >
              Temizle
            </Button>
          </div>
          {importSummary && (
            <div className="mt-4 text-sm">
              <div>Aktarilan: {importSummary.imported}</div>
              <div>Basarisiz: {importSummary.failed}</div>
              {importSummary.results?.filter((item) => item.status !== 'IMPORTED').length > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  {importSummary.results.filter((item) => item.status !== 'IMPORTED').slice(0, 8).map((item, idx) => (
                    <div key={`${item.mikroCode}-${idx}`}>
                      {item.mikroCode || '-'}: {item.reason || 'Hata'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Anlasmalar</h2>
            <Input
              placeholder="Anlasma ara"
              value={agreementSearch}
              onChange={(e) => setAgreementSearch(e.target.value)}
              className="w-60"
            />
          </div>

          {!selectedCustomer ? (
            <div className="text-sm text-gray-500">Anlasma gormek icin musteri secin.</div>
          ) : agreements.length === 0 ? (
            <div className="text-sm text-gray-500">Anlasma bulunamadi.</div>
          ) : (
            <div className="space-y-3">
              {agreements.map((agreement) => (
                <div key={agreement.id} className="border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-semibold text-gray-900">{agreement.product.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{agreement.product.mikroCode}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Min: {agreement.minQuantity} {agreement.product.unit || ''}
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 min-w-[160px]">
                    <div>Faturali: {formatCurrency(agreement.priceInvoiced)}</div>
                    <div>Beyaz: {formatCurrency(agreement.priceWhite)}</div>
                  </div>
                  <div className="text-xs text-gray-500 min-w-[160px]">
                    <div>Baslangic: {formatDateShort(agreement.validFrom)}</div>
                    <div>Bitis: {agreement.validTo ? formatDateShort(agreement.validTo) : '-'}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleSelectAgreement(agreement)}>
                      Duzenle
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(agreement.id)}
                      isLoading={deletingId === agreement.id}
                    >
                      Sil
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
