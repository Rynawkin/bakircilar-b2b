'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LogoLink } from '@/components/ui/Logo';
import { CustomerInfoCard } from '@/components/ui/CustomerInfoCard';
import { Modal } from '@/components/ui/Modal';
import { CariSelectModal } from '@/components/admin/CariSelectModal';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';

interface LastSale {
  saleDate: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
  vatZeroed?: boolean;
}

interface QuoteProduct {
  id: string;
  name: string;
  mikroCode: string;
  unit?: string;
  vatRate: number;
  lastEntryPrice?: number | null;
  currentCost?: number | null;
  warehouseStocks?: Record<string, number>;
  category?: { id: string; name: string } | null;
  mikroPriceLists?: Record<number, number> | Record<string, number>;
  lastSales?: LastSale[];
}

interface QuoteItemForm {
  id: string;
  productId?: string;
  productCode: string;
  productName: string;
  quantity: number;
  priceSource?: 'LAST_SALE' | 'PRICE_LIST' | 'MANUAL' | '';
  priceListNo?: number;
  unitPrice?: number;
  vatRate: number;
  vatZeroed?: boolean;
  isManualLine?: boolean;
  manualVatRate?: number;
  lineDescription?: string;
  lastSales?: LastSale[];
  selectedSaleIndex?: number;
  lastEntryPrice?: number | null;
  currentCost?: number | null;
  mikroPriceLists?: Record<number, number> | Record<string, number>;
}

const PRICE_LIST_LABELS: Record<number, string> = {
  1: 'Perakende Satis 1',
  2: 'Perakende Satis 2',
  3: 'Perakende Satis 3',
  4: 'Perakende Satis 4',
  5: 'Perakende Satis 5',
  6: 'Toptan Satis 1',
  7: 'Toptan Satis 2',
  8: 'Toptan Satis 3',
  9: 'Toptan Satis 4',
  10: 'Toptan Satis 5',
};

const getColumnDisplayName = (column: string) => {
  const nameMap: Record<string, string> = {
    msg_S_0088: 'GUID',
    msg_S_0870: 'Urun Adi',
    msg_S_0078: 'Stok Kodu',
  };
  return nameMap[column] || column;
};

const formatStockValue = (value: any) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  }
  return String(value);
};

const getMikroListPrice = (
  mikroPriceLists: QuoteItemForm['mikroPriceLists'],
  listNo: number
) => {
  if (!mikroPriceLists) return 0;
  const byNumber = (mikroPriceLists as Record<number, number>)[listNo];
  if (typeof byNumber === 'number') return byNumber;
  const byString = (mikroPriceLists as Record<string, number>)[String(listNo)];
  return typeof byString === 'number' ? byString : 0;
};

export default function AdminQuoteNewPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [showCariModal, setShowCariModal] = useState(false);
  const [purchasedProducts, setPurchasedProducts] = useState<QuoteProduct[]>([]);
  const [purchasedSearch, setPurchasedSearch] = useState('');
  const [productTab, setProductTab] = useState<'purchased' | 'search'>('purchased');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<QuoteProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [quoteItems, setQuoteItems] = useState<QuoteItemForm[]>([]);
  const [validityDate, setValidityDate] = useState('');
  const [note, setNote] = useState('');
  const [vatZeroed, setVatZeroed] = useState(false);
  const [lastSalesCount, setLastSalesCount] = useState(1);
  const [whatsappTemplate, setWhatsappTemplate] = useState('');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);
  const [stockDataMap, setStockDataMap] = useState<Record<string, any>>({});
  const [bulkPriceListNo, setBulkPriceListNo] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setValidityDate(defaultDate.toISOString().slice(0, 10));
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedCustomer) return;
    fetchPurchasedProducts(selectedCustomer.id, lastSalesCount);
  }, [selectedCustomer, lastSalesCount]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchSearchResults(searchTerm.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const codes = Array.from(new Set(
      quoteItems
        .filter((item) => !item.isManualLine)
        .map((item) => item.productCode)
        .filter(Boolean)
    ));

    if (codes.length === 0) {
      setStockDataMap({});
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data } = await adminApi.getStocksByCodes(codes);
        const nextMap: Record<string, any> = {};
        data.forEach((row: any) => {
          if (row?.msg_S_0078) {
            nextMap[row.msg_S_0078] = row;
          }
        });
        setStockDataMap(nextMap);
      } catch (error) {
        console.error('Stok kolonlari alinmadi:', error);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [quoteItems]);

  const loadInitialData = async () => {
    const results = await Promise.allSettled([
      adminApi.getCustomers(),
      adminApi.getQuotePreferences(),
      adminApi.getSearchPreferences(),
      adminApi.getStockColumns(),
    ]);

    const [customersResult, quotePrefsResult, searchPrefsResult, columnResult] = results;

    if (customersResult.status === 'fulfilled') {
      setCustomers(customersResult.value.customers || []);
    } else {
      console.error('Musteri listesi yuklenemedi:', customersResult.reason);
      toast.error('Musteri listesi yuklenemedi.');
    }

    if (quotePrefsResult.status === 'fulfilled' && quotePrefsResult.value?.preferences) {
      setLastSalesCount(quotePrefsResult.value.preferences.lastSalesCount || 1);
      setWhatsappTemplate(quotePrefsResult.value.preferences.whatsappTemplate || '');
    } else if (quotePrefsResult.status === 'rejected') {
      console.error('Teklif tercihleri yuklenemedi:', quotePrefsResult.reason);
    }

    if (searchPrefsResult.status === 'fulfilled' && searchPrefsResult.value?.preferences?.stockColumns?.length) {
      setSelectedColumns(searchPrefsResult.value.preferences.stockColumns);
    } else if (searchPrefsResult.status === 'rejected') {
      console.error('Arama tercihleri yuklenemedi:', searchPrefsResult.reason);
    }

    if (columnResult.status === 'fulfilled' && columnResult.value?.columns?.length) {
      setAvailableColumns(columnResult.value.columns);
    } else if (columnResult.status === 'rejected') {
      console.error('Stok kolonlari yuklenemedi:', columnResult.reason);
    }
  };

  const fetchPurchasedProducts = async (customerId: string, limit: number) => {
    try {
      const { customer, products } = await adminApi.getCustomerPurchasedProducts(customerId, limit);
      setPurchasedProducts(products || []);
      if (customer) {
        setSelectedCustomer((prev: any) => ({ ...prev, ...customer }));
      }
    } catch (error) {
      console.error('Daha once alinan urunler alinmadi:', error);
      setPurchasedProducts([]);
    }
  };

  const fetchSearchResults = async (term: string) => {
    setSearchLoading(true);
    try {
      const result = await adminApi.getProducts({
        search: term,
        limit: 50,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      setSearchResults(result.products || []);
    } catch (error) {
      console.error('Urun aramasi basarisiz:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const customerOptions = useMemo(() => {
    return customers
      .filter((customer) => customer.mikroCariCode)
      .map((customer) => ({
        userId: customer.id,
        code: customer.mikroCariCode,
        name: customer.displayName || customer.name,
        city: customer.city,
        district: customer.district,
        phone: customer.phone,
        isLocked: customer.isLocked || false,
        groupCode: customer.groupCode,
        sectorCode: customer.sectorCode,
        paymentTerm: customer.paymentTerm,
        hasEInvoice: customer.hasEInvoice || false,
        balance: customer.balance || 0,
      }));
  }, [customers]);

  const filteredPurchasedProducts = useMemo(() => {
    if (!purchasedSearch.trim()) return purchasedProducts;
    const search = purchasedSearch.toLowerCase();
    return purchasedProducts.filter((product) =>
      product.mikroCode.toLowerCase().includes(search) ||
      product.name.toLowerCase().includes(search)
    );
  }, [purchasedProducts, purchasedSearch]);

  const addProductToQuote = (product: QuoteProduct) => {
    if (quoteItems.some((item) => !item.isManualLine && item.productCode === product.mikroCode)) {
      toast.error('Urun zaten teklife eklendi.');
      return;
    }

    const purchasedMatch = purchasedProducts.find((item) => item.mikroCode === product.mikroCode);
    const sourceProduct = purchasedMatch || product;

    const newItem: QuoteItemForm = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: sourceProduct.id,
      productCode: sourceProduct.mikroCode,
      productName: sourceProduct.name,
      quantity: 1,
      priceSource: '',
      unitPrice: undefined,
      vatRate: sourceProduct.vatRate || 0,
      vatZeroed: false,
      isManualLine: false,
      lastSales: sourceProduct.lastSales || [],
      lastEntryPrice: sourceProduct.lastEntryPrice ?? null,
      currentCost: sourceProduct.currentCost ?? null,
      mikroPriceLists: sourceProduct.mikroPriceLists,
    };

    setQuoteItems((prev) => [...prev, newItem]);
  };

  const addManualLine = () => {
    const newItem: QuoteItemForm = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productCode: 'B101071',
      productName: '',
      quantity: 1,
      priceSource: 'MANUAL',
      unitPrice: undefined,
      vatRate: 0.2,
      vatZeroed: false,
      isManualLine: true,
      manualVatRate: 0.2,
      lineDescription: '',
    };

    setQuoteItems((prev) => [...prev, newItem]);
  };

  const removeItem = (id: string) => {
    setQuoteItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, patch: Partial<QuoteItemForm>) => {
    setQuoteItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handlePriceSourceChange = (item: QuoteItemForm, value: string) => {
    if (item.isManualLine) return;
    updateItem(item.id, {
      priceSource: value as QuoteItemForm['priceSource'],
      priceListNo: undefined,
      unitPrice: undefined,
      selectedSaleIndex: undefined,
    });
  };

  const handlePriceListChange = (item: QuoteItemForm, value: string) => {
    if (!value) {
      updateItem(item.id, { priceListNo: undefined, unitPrice: undefined });
      return;
    }
    const listNo = Number(value);
    const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
    updateItem(item.id, {
      priceListNo: listNo,
      unitPrice: listPrice || undefined,
    });
  };

  const handleLastSaleChange = (item: QuoteItemForm, value: string) => {
    if (!value) {
      updateItem(item.id, { selectedSaleIndex: undefined, unitPrice: undefined });
      return;
    }
    const saleIndex = Number(value);
    const sale = item.lastSales?.[saleIndex];
    updateItem(item.id, {
      selectedSaleIndex: saleIndex,
      unitPrice: sale?.unitPrice || undefined,
    });
  };

  const handleManualPriceChange = (item: QuoteItemForm, value: string) => {
    const parsed = Number(value);
    updateItem(item.id, { unitPrice: Number.isFinite(parsed) ? parsed : undefined });
  };

  const handleManualVatChange = (item: QuoteItemForm, value: string) => {
    const rate = value === '0.1' ? 0.1 : 0.2;
    const code = rate === 0.1 ? 'B101070' : 'B101071';
    updateItem(item.id, {
      manualVatRate: rate,
      vatRate: rate,
      productCode: code,
    });
  };

  const applyPriceListToAll = () => {
    if (!bulkPriceListNo) {
      toast.error('Fiyat listesi secin.');
      return;
    }

    const listNo = Number(bulkPriceListNo);
    setQuoteItems((prev) =>
      prev.map((item) => {
        if (item.isManualLine) return item;
        const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
        return {
          ...item,
          priceSource: 'PRICE_LIST',
          priceListNo: listNo,
          unitPrice: listPrice || undefined,
        };
      })
    );
  };

  const handleGlobalVatZeroChange = (value: boolean) => {
    setVatZeroed(value);
    setQuoteItems((prev) => prev.map((item) => ({ ...item, vatZeroed: value })));
  };

  const saveWhatsappTemplate = async () => {
    try {
      await adminApi.updateQuotePreferences({
        lastSalesCount,
        whatsappTemplate,
      });
      toast.success('Tercihler kaydedildi.');
    } catch (error) {
      toast.error('Tercihler kaydedilemedi.');
    }
  };

  const handleLastSalesCountChange = async (value: number) => {
    const nextValue = Math.max(1, Math.min(10, value));
    setLastSalesCount(nextValue);
    try {
      await adminApi.updateQuotePreferences({ lastSalesCount: nextValue });
    } catch (error) {
      console.error('Son satis adedi guncellenemedi:', error);
    }
  };

  const saveColumnPreferences = async () => {
    setSavingColumns(true);
    try {
      await adminApi.updateSearchPreferences({ stockColumns: selectedColumns });
      setShowColumnSelector(false);
    } catch (error) {
      console.error('Kolon tercihleri kaydedilemedi:', error);
      toast.error('Kolon tercihleri kaydedilemedi.');
    } finally {
      setSavingColumns(false);
    }
  };

  const getManualWarning = (item: QuoteItemForm) => {
    if (item.priceSource !== 'MANUAL' || item.isManualLine) return null;
    const unitPrice = item.unitPrice || 0;
    const lastEntry = item.lastEntryPrice || 0;
    const currentCost = item.currentCost || 0;
    const blocked = lastEntry > 0 && unitPrice > 0 && unitPrice < lastEntry * 1.05;

    const lastEntryDiff = lastEntry > 0
      ? ((unitPrice - lastEntry) / lastEntry) * 100
      : null;
    const currentCostDiff = currentCost > 0
      ? ((unitPrice - currentCost) / currentCost) * 100
      : null;

    return {
      blocked,
      lastEntry,
      currentCost,
      lastEntryDiff,
      currentCostDiff,
    };
  };

  const totals = useMemo(() => {
    return quoteItems.reduce(
      (acc, item) => {
        const quantity = item.quantity || 0;
        const unitPrice = item.unitPrice || 0;
        const lineTotal = quantity * unitPrice;
        const vatRate = item.vatRate || 0;
        const vatZeroedLine = vatZeroed || item.vatZeroed;
        const vatAmount = vatZeroedLine ? 0 : lineTotal * vatRate;
        acc.totalAmount += lineTotal;
        acc.totalVat += vatAmount;
        acc.grandTotal += lineTotal + vatAmount;
        return acc;
      },
      { totalAmount: 0, totalVat: 0, grandTotal: 0 }
    );
  }, [quoteItems, vatZeroed]);

  const hasBlockedPreview = useMemo(() => {
    return quoteItems.some((item) => getManualWarning(item)?.blocked);
  }, [quoteItems]);

  const validateQuote = () => {
    if (!selectedCustomer?.id) {
      toast.error('Musteri secmelisiniz.');
      return false;
    }

    if (!validityDate) {
      toast.error('Gecerlilik tarihi gerekli.');
      return false;
    }

    if (quoteItems.length === 0) {
      toast.error('Teklife en az bir urun ekleyin.');
      return false;
    }

    for (let i = 0; i < quoteItems.length; i++) {
      const item = quoteItems[i];
      if (item.isManualLine) {
        if (!item.productName?.trim()) {
          toast.error(`Manuel satir urun adi gerekli (Satir ${i + 1}).`);
          return false;
        }
        if (!item.unitPrice || item.unitPrice <= 0) {
          toast.error(`Manuel satir fiyat girilmeli (Satir ${i + 1}).`);
          return false;
        }
        if (!item.manualVatRate || (item.manualVatRate !== 0.1 && item.manualVatRate !== 0.2)) {
          toast.error(`Manuel satir KDV secimi gerekli (Satir ${i + 1}).`);
          return false;
        }
        continue;
      }

      if (!item.priceSource) {
        toast.error(`Fiyat kaynagi secilmeli (Satir ${i + 1}).`);
        return false;
      }

      if (item.priceSource === 'PRICE_LIST' && !item.priceListNo) {
        toast.error(`Fiyat listesi secilmeli (Satir ${i + 1}).`);
        return false;
      }

      if (item.priceSource === 'LAST_SALE' && item.selectedSaleIndex === undefined) {
        toast.error(`Son satis secilmeli (Satir ${i + 1}).`);
        return false;
      }

      if (item.priceSource === 'MANUAL' && (!item.unitPrice || item.unitPrice <= 0)) {
        toast.error(`Manuel fiyat girilmeli (Satir ${i + 1}).`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateQuote()) return;

    setSubmitting(true);
    try {
      const payload = {
        customerId: selectedCustomer.id,
        validityDate,
        note,
        vatZeroed,
        items: quoteItems.map((item) => {
          const sale = item.priceSource === 'LAST_SALE' && item.selectedSaleIndex !== undefined
            ? item.lastSales?.[item.selectedSaleIndex]
            : undefined;

          return {
            productId: item.isManualLine ? undefined : item.productId,
            productCode: item.productCode,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
            priceSource: item.priceSource,
            priceListNo: item.priceListNo,
            priceType: 'INVOICED',
            vatZeroed: vatZeroed || item.vatZeroed,
            manualLine: item.isManualLine,
            manualVatRate: item.isManualLine ? item.manualVatRate : undefined,
            lineDescription: item.lineDescription || (item.isManualLine ? item.productName : undefined),
            lastSale: sale
              ? {
                  saleDate: sale.saleDate,
                  unitPrice: sale.unitPrice,
                  quantity: sale.quantity,
                  vatZeroed: sale.vatZeroed,
                }
              : undefined,
          };
        }),
      };

      await adminApi.createQuote(payload);
      toast.success('Teklif olusturuldu.');
      router.push('/quotes');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Teklif olusturulamadi.');
    } finally {
      setSubmitting(false);
    }
  };

  const columnsCount = 7 + selectedColumns.length + 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">Teklif Olustur</h1>
                <p className="text-sm text-primary-100">Mikro teklif fisine aktarilir</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/quotes')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                Teklifler
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-custom py-8 space-y-6">
        <Card>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Musteri Secimi</h2>
                <Button variant="secondary" onClick={() => setShowCariModal(true)}>
                  Musteri Sec
                </Button>
              </div>
              {selectedCustomer ? (
                <CustomerInfoCard customer={selectedCustomer} />
              ) : (
                <div className="text-sm text-gray-500">Teklif icin musteri secin.</div>
              )}
            </div>
            <div className="w-full lg:w-80 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gecerlilik Tarihi</label>
                <input
                  type="date"
                  value={validityDate}
                  onChange={(e) => setValidityDate(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={vatZeroed}
                    onChange={(e) => handleGlobalVatZeroChange(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Tum satirlarda KDV sifirla
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Not</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Teklif notu"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-3">Teklif Ayarlari</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Son Satis Adedi</label>
                  <select
                    value={lastSalesCount}
                    onChange={(e) => handleLastSalesCountChange(Number(e.target.value))}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {idx + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Sablonu</label>
                  <textarea
                    value={whatsappTemplate}
                    onChange={(e) => setWhatsappTemplate(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="{{customerName}} {{quoteNumber}}"
                  />
                </div>
              </div>
              <div className="mt-3">
                <Button variant="secondary" onClick={saveWhatsappTemplate}>
                  Tercihleri Kaydet
                </Button>
              </div>
            </div>
            <div className="w-full md:w-64">
              <h2 className="text-lg font-semibold mb-3">Fiyat Listesi Uygula</h2>
              <div className="flex flex-col gap-2">
                <select
                  value={bulkPriceListNo}
                  onChange={(e) => setBulkPriceListNo(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Liste Sec</option>
                  {Object.keys(PRICE_LIST_LABELS).map((key) => (
                    <option key={key} value={key}>
                      {PRICE_LIST_LABELS[Number(key)]}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={applyPriceListToAll}>
                  Tum Satirlara Uygula
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Urun Ekle</h2>
            <div className="flex gap-2">
              <Button variant={productTab === 'purchased' ? 'primary' : 'secondary'} onClick={() => setProductTab('purchased')}>
                Daha Once Alinanlar
              </Button>
              <Button variant={productTab === 'search' ? 'primary' : 'secondary'} onClick={() => setProductTab('search')}>
                Tum Urunler
              </Button>
              <Button variant="secondary" onClick={addManualLine}>
                Manuel Satir Ekle
              </Button>
            </div>
          </div>

          {productTab === 'purchased' && (
            <div className="space-y-3">
              <Input
                placeholder="Urun ara..."
                value={purchasedSearch}
                onChange={(e) => setPurchasedSearch(e.target.value)}
              />
              {filteredPurchasedProducts.length === 0 ? (
                <div className="text-sm text-gray-500">Urun bulunamadi.</div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {filteredPurchasedProducts.map((product) => (
                    <div key={product.mikroCode} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.mikroCode}</p>
                          {product.lastSales?.length ? (
                            <div className="mt-2 space-y-1">
                              {product.lastSales.map((sale, idx) => (
                                <div key={idx} className="text-xs text-gray-600">
                                  {formatDateShort(sale.saleDate)} - {sale.quantity} adet - {formatCurrency(sale.unitPrice)}
                                  {sale.vatZeroed && <Badge variant="info" className="ml-2 text-xs">KDV 0</Badge>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 mt-1">Satis yok</p>
                          )}
                        </div>
                        <Button variant="secondary" onClick={() => addProductToQuote(product)}>
                          Teklife Ekle
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {productTab === 'search' && (
            <div className="space-y-3">
              <Input
                placeholder="Urun adi veya kodu"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchLoading ? (
                <div className="text-sm text-gray-500">Araniyor...</div>
              ) : searchResults.length === 0 ? (
                <div className="text-sm text-gray-500">Arama sonucu yok.</div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {searchResults.map((product) => (
                    <div key={product.mikroCode} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.mikroCode}</p>
                        </div>
                        <Button variant="secondary" onClick={() => addProductToQuote(product)}>
                          Teklife Ekle
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Teklif Kalemleri</h2>
            <Button variant="secondary" onClick={() => setShowColumnSelector(true)}>
              Kolonlari Sec
            </Button>
          </div>

          {hasBlockedPreview && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              Manuel fiyatli satirlardan bazilari %5 kar altinda. Bu teklif admin onayina gidecek.
            </div>
          )}

          {quoteItems.length === 0 ? (
            <div className="text-sm text-gray-500">Teklife urun eklenmedi.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Urun</th>
                    <th className="px-3 py-2 text-left">Miktar</th>
                    <th className="px-3 py-2 text-left">Fiyat Kaynagi</th>
                    <th className="px-3 py-2 text-left">Secim</th>
                    <th className="px-3 py-2 text-right">Birim Fiyat</th>
                    <th className="px-3 py-2 text-right">Toplam</th>
                    <th className="px-3 py-2 text-left">KDV</th>
                    {selectedColumns.map((column) => (
                      <th key={column} className="px-3 py-2 text-left whitespace-nowrap">
                        {getColumnDisplayName(column)}
                      </th>
                    ))}
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quoteItems.map((item) => {
                    const manualWarning = getManualWarning(item);
                    const lineTotal = (item.unitPrice || 0) * (item.quantity || 0);

                    return (
                      <Fragment key={item.id}>
                        <tr className="bg-white">
                          <td className="px-3 py-2">
                            {item.isManualLine ? (
                              <div className="space-y-1">
                                <Input
                                  placeholder="Manuel urun adi"
                                  value={item.productName}
                                  onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                                />
                                <div className="text-xs text-gray-500">Kod: {item.productCode}</div>
                                <Badge variant="warning" className="text-xs">Manuel</Badge>
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium text-gray-900">{item.productName}</div>
                                <div className="text-xs text-gray-500">{item.productCode}</div>
                                {manualWarning?.blocked && (
                                  <Badge variant="danger" className="text-xs mt-1">Blok</Badge>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                              className="w-20 rounded border border-gray-300 px-2 py-1"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {item.isManualLine ? (
                              <span className="text-xs text-gray-600">Manuel</span>
                            ) : (
                              <select
                                value={item.priceSource || ''}
                                onChange={(e) => handlePriceSourceChange(item, e.target.value)}
                                className="rounded border border-gray-300 px-2 py-1"
                              >
                                <option value="">Secin</option>
                                <option value="LAST_SALE">Son Satis</option>
                                <option value="PRICE_LIST">Fiyat Listesi</option>
                                <option value="MANUAL">Manuel</option>
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {item.isManualLine ? (
                              <Input
                                placeholder="Birim fiyat"
                                value={item.unitPrice ?? ''}
                                onChange={(e) => handleManualPriceChange(item, e.target.value)}
                              />
                            ) : item.priceSource === 'PRICE_LIST' ? (
                              <select
                                value={item.priceListNo || ''}
                                onChange={(e) => handlePriceListChange(item, e.target.value)}
                                className="rounded border border-gray-300 px-2 py-1"
                              >
                                <option value="">Liste sec</option>
                                {Object.keys(PRICE_LIST_LABELS).map((key) => {
                                  const listNo = Number(key);
                                  const listPrice = getMikroListPrice(item.mikroPriceLists, listNo);
                                  return (
                                    <option key={key} value={key}>
                                      {PRICE_LIST_LABELS[listNo]} ({listPrice ? formatCurrency(listPrice) : 'Fiyat yok'})
                                    </option>
                                  );
                                })}
                              </select>
                            ) : item.priceSource === 'LAST_SALE' ? (
                              item.lastSales?.length ? (
                                <select
                                  value={item.selectedSaleIndex ?? ''}
                                  onChange={(e) => handleLastSaleChange(item, e.target.value)}
                                  className="rounded border border-gray-300 px-2 py-1"
                                >
                                  <option value="">Satis sec</option>
                                  {item.lastSales.map((sale, idx) => (
                                    <option key={idx} value={idx}>
                                      {formatDateShort(sale.saleDate)} - {formatCurrency(sale.unitPrice)} ({sale.quantity})
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-500">Satis yok</span>
                              )
                            ) : item.priceSource === 'MANUAL' ? (
                              <Input
                                placeholder="Birim fiyat"
                                value={item.unitPrice ?? ''}
                                onChange={(e) => handleManualPriceChange(item, e.target.value)}
                              />
                            ) : (
                              <span className="text-xs text-gray-400">Secim bekleniyor</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {item.unitPrice ? formatCurrency(item.unitPrice) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {item.unitPrice ? formatCurrency(lineTotal) : '-'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              {item.isManualLine ? (
                                <select
                                  value={item.manualVatRate === 0.1 ? '0.1' : '0.2'}
                                  onChange={(e) => handleManualVatChange(item, e.target.value)}
                                  className="rounded border border-gray-300 px-2 py-1"
                                >
                                  <option value="0.1">%10</option>
                                  <option value="0.2">%20</option>
                                </select>
                              ) : (
                                <span className="text-xs text-gray-600">%{Math.round(item.vatRate * 100)}</span>
                              )}
                              {!vatZeroed && (
                                <label className="flex items-center gap-1 text-xs text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={item.vatZeroed || false}
                                    onChange={(e) => updateItem(item.id, { vatZeroed: e.target.checked })}
                                  />
                                  KDV 0
                                </label>
                              )}
                              {vatZeroed && <span className="text-xs text-green-600">KDV 0</span>}
                            </div>
                          </td>
                          {selectedColumns.map((column) => (
                            <td key={column} className="px-3 py-2 whitespace-nowrap">
                              {item.isManualLine ? '-' : formatStockValue(stockDataMap[item.productCode]?.[column])}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right">
                            <Button variant="danger" onClick={() => removeItem(item.id)}>
                              Sil
                            </Button>
                          </td>
                        </tr>
                        {manualWarning && (
                          <tr className="bg-yellow-50">
                            <td colSpan={columnsCount} className="px-3 py-2 text-xs text-yellow-800">
                              Manuel fiyat: Son giris {formatCurrency(manualWarning.lastEntry)} ({manualWarning.lastEntryDiff?.toFixed(1) || 0}%),
                              Guncel maliyet {formatCurrency(manualWarning.currentCost)} ({manualWarning.currentCostDiff?.toFixed(1) || 0}%).
                              {manualWarning.blocked && ' Blok: %5 altinda.'}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Ara Toplam</p>
              <p className="text-xl font-semibold">{formatCurrency(totals.totalAmount)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">KDV</p>
              <p className="text-xl font-semibold">{formatCurrency(totals.totalVat)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Genel Toplam</p>
              <p className="text-2xl font-bold text-primary-600">{formatCurrency(totals.grandTotal)}</p>
            </div>
            <div className="flex items-end">
              <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Gonderiliyor...' : 'Teklif Olustur'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <CariSelectModal
        isOpen={showCariModal}
        onClose={() => setShowCariModal(false)}
        cariList={customerOptions}
        onSelect={(cari) => {
          const match = customers.find((customer) => customer.id === cari.userId);
          if (match) {
            setSelectedCustomer(match);
          }
        }}
      />

      {showColumnSelector && (
        <Modal
          isOpen={showColumnSelector}
          onClose={() => setShowColumnSelector(false)}
          title="Goruntulenecek Kolonlar"
          size="xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowColumnSelector(false)}>
                Iptal
              </Button>
              <Button variant="primary" onClick={saveColumnPreferences} disabled={savingColumns || selectedColumns.length === 0}>
                {savingColumns ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableColumns.map((column) => (
              <label key={column} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(column)}
                  onChange={() => {
                    setSelectedColumns((prev) =>
                      prev.includes(column)
                        ? prev.filter((item) => item !== column)
                        : [...prev, column]
                    );
                  }}
                />
                {getColumnDisplayName(column)}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
