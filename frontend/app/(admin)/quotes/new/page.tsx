'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
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
import type { CustomerContact } from '@/types';

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
  manualMarginEntry?: number;
  manualMarginCost?: number;
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

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
};

const roundUp2 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil((value + Number.EPSILON) * 100) / 100;
};

const getPercentTone = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'text-gray-500';
  }
  return value >= 0 ? 'text-emerald-700' : 'text-red-600';
};

export default function AdminQuoteNewPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showCariModal, setShowCariModal] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showProductPoolModal, setShowProductPoolModal] = useState(false);
  const [purchasedProducts, setPurchasedProducts] = useState<QuoteProduct[]>([]);
  const [selectedPurchasedCodes, setSelectedPurchasedCodes] = useState<Set<string>>(new Set());
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
  const [responsibles, setResponsibles] = useState<Array<{ code: string; name: string; surname: string }>>([]);
  const [selectedResponsibleCode, setSelectedResponsibleCode] = useState('');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [stockDataMap, setStockDataMap] = useState<Record<string, any>>({});
  const [bulkPriceListNo, setBulkPriceListNo] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setValidityDate(defaultDate.toISOString().slice(0, 10));
    loadInitialData();
  }, []);

  useEffect(() => {
    setSelectedPurchasedCodes(new Set());
    if (!selectedCustomer) return;
    fetchPurchasedProducts(selectedCustomer.id, lastSalesCount);
  }, [selectedCustomer, lastSalesCount]);

  useEffect(() => {
    setCustomerContacts([]);
    setSelectedContactId('');
    if (!selectedCustomer) return;
    fetchCustomerContacts(selectedCustomer.id);
  }, [selectedCustomer]);

  useEffect(() => {
    if (productTab !== 'search') return;

    if (!searchTerm.trim()) {
      fetchSearchResults('');
      return;
    }

    const timer = setTimeout(() => {
      fetchSearchResults(searchTerm.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, productTab]);

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
      adminApi.getQuoteResponsibles(),
    ]);

    const [
      customersResult,
      quotePrefsResult,
      searchPrefsResult,
      columnResult,
      responsiblesResult,
    ] = results;

    if (customersResult.status === 'fulfilled') {
      setCustomers(customersResult.value.customers || []);
    } else {
      console.error('Musteri listesi yuklenemedi:', customersResult.reason);
      toast.error('Musteri listesi yuklenemedi.');
    }

    if (quotePrefsResult.status === 'fulfilled' && quotePrefsResult.value?.preferences) {
      setLastSalesCount(quotePrefsResult.value.preferences.lastSalesCount || 1);
      setWhatsappTemplate(quotePrefsResult.value.preferences.whatsappTemplate || '');
      setSelectedResponsibleCode(quotePrefsResult.value.preferences.responsibleCode || '');
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

    if (responsiblesResult.status === 'fulfilled') {
      setResponsibles(responsiblesResult.value.responsibles || []);
    } else if (responsiblesResult.status === 'rejected') {
      console.error('Sorumlu listesi yuklenemedi:', responsiblesResult.reason);
    }
  };

  const fetchPurchasedProducts = async (customerId: string, limit: number) => {
    try {
      const { products } = await adminApi.getCustomerPurchasedProducts(customerId, limit);
      setPurchasedProducts(products || []);
      setSelectedPurchasedCodes(new Set());
    } catch (error) {
      console.error('Daha once alinan urunler alinmadi:', error);
      toast.error('Daha once alinan urunler alinmadi.');
      setPurchasedProducts([]);
      setSelectedPurchasedCodes(new Set());
    }
  };

  const fetchCustomerContacts = async (customerId: string) => {
    setContactsLoading(true);
    try {
      const { contacts } = await adminApi.getCustomerContacts(customerId);
      setCustomerContacts(contacts || []);
      if (contacts && contacts.length > 0) {
        setSelectedContactId(contacts[0].id);
      }
    } catch (error) {
      console.error('İletişim kişileri yüklenemedi:', error);
      setCustomerContacts([]);
      setSelectedContactId('');
    } finally {
      setContactsLoading(false);
    }
  };

  const fetchSearchResults = async (term?: string) => {
    const trimmedTerm = term?.trim();
    setSearchLoading(true);
    try {
      const result = await adminApi.getProducts({
        search: trimmedTerm || undefined,
        limit: 50,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      setSearchResults(result.products || []);
    } catch (error) {
      console.error('Urun aramasi basarisiz:', error);
      toast.error('Urun aramasi basarisiz.');
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
        paymentPlanNo: customer.paymentPlanNo ?? null,
        paymentPlanCode: customer.paymentPlanCode ?? null,
        paymentPlanName: customer.paymentPlanName ?? null,
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

  const selectedPurchasedCount = selectedPurchasedCodes.size;

  const togglePurchasedSelection = (code: string) => {
    setSelectedPurchasedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const selectAllPurchased = () => {
    const codes = filteredPurchasedProducts.map((product) => product.mikroCode);
    setSelectedPurchasedCodes(new Set(codes));
  };

  const clearPurchasedSelection = () => {
    setSelectedPurchasedCodes(new Set());
  };

  const addSelectedPurchasedToQuote = () => {
    if (selectedPurchasedCount === 0) {
      toast.error('Secili urun yok.');
      return;
    }
    const selectedProducts = purchasedProducts.filter((product) =>
      selectedPurchasedCodes.has(product.mikroCode)
    );
    addProductsToQuote(selectedProducts);
    setSelectedPurchasedCodes(new Set());
  };

  const buildQuoteItem = (product: QuoteProduct): QuoteItemForm => {
    const purchasedMatch = purchasedProducts.find((item) => item.mikroCode === product.mikroCode);
    const sourceProduct = purchasedMatch || product;

    return {
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
  };

  const addProductsToQuote = (productsToAdd: QuoteProduct[]) => {
    if (!productsToAdd.length) {
      toast.error('Urun bulunamadi.');
      return;
    }

    const existingCodes = new Set(
      quoteItems
        .filter((item) => !item.isManualLine)
        .map((item) => item.productCode)
    );
    const handled = new Set<string>();
    const uniqueProducts = productsToAdd.filter((product) => {
      if (!product?.mikroCode) return false;
      if (existingCodes.has(product.mikroCode) || handled.has(product.mikroCode)) return false;
      handled.add(product.mikroCode);
      return true;
    });

    if (uniqueProducts.length === 0) {
      toast.error('Secili urunler zaten teklifte.');
      return;
    }

    setQuoteItems((prev) => [...prev, ...uniqueProducts.map(buildQuoteItem)]);
    toast.success(`${uniqueProducts.length} urun eklendi.`);
  };

  const addProductToQuote = (product: QuoteProduct) => {
    addProductsToQuote([product]);
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
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
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
      updateItem(item.id, {
        selectedSaleIndex: undefined,
        unitPrice: undefined,
        vatZeroed: false,
      });
      return;
    }
    const saleIndex = Number(value);
    const sale = item.lastSales?.[saleIndex];
    updateItem(item.id, {
      selectedSaleIndex: saleIndex,
      unitPrice: sale?.unitPrice || undefined,
      vatZeroed: sale?.vatZeroed || false,
    });
  };

  const handleManualPriceChange = (item: QuoteItemForm, value: string) => {
    const parsed = Number(value);
    updateItem(item.id, {
      unitPrice: Number.isFinite(parsed) ? parsed : undefined,
      manualMarginEntry: undefined,
      manualMarginCost: undefined,
    });
  };

  const handleManualMarginChange = (
    item: QuoteItemForm,
    source: 'entry' | 'cost',
    value: string
  ) => {
    const parsed = Number(value);
    const margin = Number.isFinite(parsed) ? parsed : undefined;
    const base = source === 'entry' ? (item.lastEntryPrice || 0) : (item.currentCost || 0);
    const nextPrice = base > 0 && margin !== undefined
      ? base * (1 + margin / 100)
      : undefined;

    updateItem(item.id, {
      unitPrice: nextPrice ?? item.unitPrice,
      manualMarginEntry: source === 'entry' ? margin : undefined,
      manualMarginCost: source === 'cost' ? margin : undefined,
    });
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
          selectedSaleIndex: undefined,
          manualMarginEntry: undefined,
          manualMarginCost: undefined,
        };
      })
    );
  };

  const applyLastSaleToAll = () => {
    let applied = 0;
    let missing = 0;

    setQuoteItems((prev) =>
      prev.map((item) => {
        if (item.isManualLine) return item;
        const sale = item.lastSales?.[0];
        if (!sale) {
          missing += 1;
          return item;
        }
        applied += 1;
        return {
          ...item,
          priceSource: 'LAST_SALE',
          selectedSaleIndex: 0,
          unitPrice: sale.unitPrice || undefined,
          vatZeroed: sale.vatZeroed || false,
          priceListNo: undefined,
          manualMarginEntry: undefined,
          manualMarginCost: undefined,
        };
      })
    );

    if (applied === 0) {
      toast.error('Son satis bulunamadi.');
      return;
    }

    if (missing > 0) {
      toast.success(`${applied} satira uygulandi. ${missing} satirda satis yok.`);
      return;
    }

    toast.success('Son satis tum satirlara uygulandi.');
  };

  const handleGlobalVatZeroChange = (value: boolean) => {
    setVatZeroed(value);
    setQuoteItems((prev) => prev.map((item) => ({ ...item, vatZeroed: value })));
  };

  const saveQuotePreferences = async () => {
    try {
      await adminApi.updateQuotePreferences({
        lastSalesCount,
        whatsappTemplate,
        responsibleCode: selectedResponsibleCode || null,
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
      toast.success('Kolon dizilimi kaydedildi.');
    } catch (error) {
      console.error('Kolon tercihleri kaydedilemedi:', error);
      toast.error('Kolon tercihleri kaydedilemedi.');
    } finally {
      setSavingColumns(false);
    }
  };

  const selectAllColumns = () => {
    setSelectedColumns(availableColumns);
  };

  const clearAllColumns = () => {
    setSelectedColumns([]);
  };

  const handleColumnDragStart = (column: string) => (event: DragEvent<HTMLDivElement>) => {
    setDraggingColumn(column);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', column);
  };

  const handleColumnDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleColumnDrop = (targetColumn: string) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceColumn = draggingColumn || event.dataTransfer.getData('text/plain');
    if (!sourceColumn || sourceColumn === targetColumn) {
      setDraggingColumn(null);
      return;
    }

    setSelectedColumns((prev) => {
      const next = prev.filter((column) => column !== sourceColumn);
      const targetIndex = next.indexOf(targetColumn);
      if (targetIndex === -1) {
        next.push(sourceColumn);
      } else {
        next.splice(targetIndex, 0, sourceColumn);
      }
      return next;
    });

    setDraggingColumn(null);
  };

  const handleColumnDragEnd = () => {
    setDraggingColumn(null);
  };

  const getMarginInfo = (item: QuoteItemForm) => {
    if (item.isManualLine) return null;
    const unitPrice = roundUp2(item.unitPrice || 0);
    const lastEntry = item.lastEntryPrice || 0;
    const currentCost = item.currentCost || 0;
    if (!unitPrice || (lastEntry <= 0 && currentCost <= 0)) {
      return null;
    }

    const lastEntryDiff = lastEntry > 0
      ? ((unitPrice - lastEntry) / lastEntry) * 100
      : null;
    const currentCostDiff = currentCost > 0
      ? ((unitPrice - currentCost) / currentCost) * 100
      : null;
    const blocked = item.priceSource === 'MANUAL' && lastEntry > 0 && unitPrice < lastEntry * 1.05;
    const vatRate = item.vatRate || 0;
    const lastEntryWithVat = lastEntry > 0 ? lastEntry * (1 + vatRate) : null;
    const openPurchase = lastEntry > 0 && lastEntryWithVat !== null && Math.abs(lastEntryWithVat - lastEntry) < 0.01;

    return {
      blocked,
      lastEntry,
      currentCost,
      lastEntryDiff,
      currentCostDiff,
      openPurchase,
    };
  };

  const totals = useMemo(() => {
    return quoteItems.reduce(
      (acc, item) => {
        const quantity = item.quantity || 0;
        const unitPrice = roundUp2(item.unitPrice || 0);
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
    return quoteItems.some((item) => getMarginInfo(item)?.blocked);
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
        documentNo: note,
        responsibleCode: selectedResponsibleCode || undefined,
        contactId: selectedContactId || undefined,
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
            unitPrice: roundUp2(item.unitPrice || 0),
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
  const cardShell = 'rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.08)]';

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-[-140px] h-72 w-72 rounded-full bg-primary-200/40 blur-3xl" />
        <div className="absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-slate-200/70 blur-3xl" />
      </div>
      <header className="relative z-10 bg-gradient-to-r from-primary-700 via-primary-600 to-primary-700 shadow-lg">
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

      <div className="relative z-10 container-custom max-w-[1600px] py-8 2xl:px-10">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {showLeftPanel && (
          <div className="xl:col-span-5 space-y-6">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <p className="text-sm font-semibold text-gray-900">Sol Panel</p>
            <p className="text-xs text-gray-500">Musteri ve urun secimi.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLeftPanel(false)}
            className="rounded-full border-slate-200 bg-white text-gray-700 hover:bg-slate-50"
          >
            Sol Paneli Gizle
          </Button>
        </div>
        <Card className={cardShell}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Musteri</h2>
              <p className="text-xs text-gray-500">Teklif icin cari secin.</p>
            </div>
            <Button variant="secondary" onClick={() => setShowCariModal(true)}>
              Musteri Sec
            </Button>
          </div>
          {selectedCustomer ? (
            <CustomerInfoCard customer={selectedCustomer} />
          ) : (
            <div className="text-sm text-gray-500">Teklif icin musteri secin.</div>
          )}
        </Card>
        <Card className={cardShell}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Teklif Ayarlari</h2>
                <p className="text-xs text-gray-500">Son satis ve mesaj tercihleriniz.</p>
              </div>
              <Button variant="secondary" onClick={saveQuotePreferences}>
                Tercihleri Kaydet
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Son Satis Adedi</label>
                <select
                  value={lastSalesCount}
                  onChange={(e) => handleLastSalesCountChange(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                >
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {idx + 1}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Her urun icin son {lastSalesCount} satis gosterilir.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Sablonu</label>
                <textarea
                  value={whatsappTemplate}
                  onChange={(e) => setWhatsappTemplate(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                  placeholder="{{customerName}} {{quoteNumber}}"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Sorumlu</label>
                <select
                  value={selectedResponsibleCode}
                  onChange={(e) => setSelectedResponsibleCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">Sorumlu secin</option>
                  {responsibles.map((person) => (
                    <option key={person.code} value={person.code}>
                      {person.code} - {person.name} {person.surname}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Secilen sorumlu Mikro teklifinde kullanilir. Kaydetmek icin "Tercihleri Kaydet" deyin.
                </p>
              </div>
            </div>
          </div>
        </Card>
        <Card className={cardShell}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Urun Havuzu</h2>
              <p className="text-xs text-gray-500">Son {lastSalesCount} satis gosteriliyor.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={addManualLine} size="sm" className="rounded-full">
                Manuel Satir Ekle
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowProductPoolModal(true)}
                size="sm"
                className="rounded-full"
              >
                Urun Havuzunu Ac
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>Secili urun: {selectedPurchasedCount}</span>
            <span>Toplam urun: {purchasedProducts.length}</span>
            <span>Mod: {productTab === 'purchased' ? 'Daha Once Alinanlar' : 'Tum Urunler'}</span>
          </div>
        </Card>
          </div>
          )}
          <div className={`${showLeftPanel ? 'xl:col-span-7' : 'xl:col-span-12'} space-y-6`}>
            {!showLeftPanel && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-3 text-sm shadow-sm">
                <span className="text-gray-500">Sol panel gizli.</span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowLeftPanel(true)}
                  className="rounded-full px-4"
                >
                  Sol Paneli Goster
                </Button>
              </div>
            )}
            <Card className={cardShell}>
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Teklif Bilgileri</h2>
                  <p className="text-xs text-gray-500">Gecerlilik, not ve KDV ayarlari.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gecerlilik Tarihi</label>
                    <input
                      type="date"
                      value={validityDate}
                      onChange={(e) => setValidityDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">İlgili Kişi</label>
                    <select
                      value={selectedContactId}
                      onChange={(e) => setSelectedContactId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                      disabled={!selectedCustomer || contactsLoading}
                    >
                      <option value="">İlgili seçin</option>
                      {customerContacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.name}
                          {contact.phone ? ` - ${contact.phone}` : ''}
                          {contact.email ? ` (${contact.email})` : ''}
                        </option>
                      ))}
                    </select>
                    {!contactsLoading && selectedCustomer && customerContacts.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">Bu müşteri için kayıtlı kişi yok.</p>
                    )}
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={vatZeroed}
                      onChange={(e) => handleGlobalVatZeroChange(e.target.checked)}
                      className="h-4 w-4 accent-primary-600"
                    />
                    <span className="text-gray-700">Tum satirlarda KDV sifirla</span>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Not</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                      placeholder="Teklif notu"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Not, Mikro'da belge no alanina da yazilir.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
        <Card className={cardShell}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Teklif Kalemleri ({quoteItems.length})</h2>
              <p className="text-xs text-gray-500">Fiyat kaynagini secip satirlari duzenleyin.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
              <select
                value={bulkPriceListNo}
                onChange={(e) => setBulkPriceListNo(e.target.value ? Number(e.target.value) : '')}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm"
              >
                <option value="">Liste Sec</option>
                {Object.keys(PRICE_LIST_LABELS).map((key) => (
                  <option key={key} value={key}>
                    {PRICE_LIST_LABELS[Number(key)]}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={applyPriceListToAll} className="rounded-full">
                Tum Satirlara Uygula
              </Button>
              <Button variant="secondary" size="sm" onClick={applyLastSaleToAll} className="rounded-full">
                Son Satisi Uygula
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowColumnSelector(true)} className="rounded-full">
                Kolonlari Sec
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowProductPoolModal(true)}
                className="rounded-full"
              >
                Urun Havuzunu Ac
              </Button>
            </div>
          </div>

          {hasBlockedPreview && (
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Manuel fiyatli satirlardan bazilari %5 kar altinda. Bu teklif admin onayina gidecek.
            </div>
          )}

          {quoteItems.length === 0 ? (
            <div className="text-sm text-gray-500">Teklife urun eklenmedi.</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-gray-600">
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
                    const marginInfo = getMarginInfo(item);
                    const roundedUnitPrice = roundUp2(item.unitPrice || 0);
                    const lineTotal = roundedUnitPrice * (item.quantity || 0);

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
                                {marginInfo?.blocked && (
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
                              className="w-20 rounded-lg border border-gray-300 px-2 py-1"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {item.isManualLine ? (
                              <span className="text-xs text-gray-600">Manuel</span>
                            ) : (
                              <select
                                value={item.priceSource || ''}
                                onChange={(e) => handlePriceSourceChange(item, e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1"
                              >
                                <option value="">Secin</option>
                                <option value="LAST_SALE">Son Satis</option>
                                <option value="PRICE_LIST">Fiyat Listesi</option>
                                <option value="MANUAL">Manuel</option>
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2 min-w-[240px]">
                            {item.isManualLine ? (
                              <Input
                                placeholder="Birim fiyat"
                                value={item.unitPrice ?? ''}
                                onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                className="min-w-[180px]"
                              />
                            ) : item.priceSource === 'PRICE_LIST' ? (
                              <select
                                value={item.priceListNo || ''}
                                onChange={(e) => handlePriceListChange(item, e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-2 py-1"
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
                                  className="rounded-lg border border-gray-300 bg-white px-2 py-1"
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
                              <div className="space-y-2">
                                <Input
                                  placeholder="Birim fiyat"
                                  value={item.unitPrice ?? ''}
                                  onChange={(e) => handleManualPriceChange(item, e.target.value)}
                                  className="min-w-[180px]"
                                />
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 leading-tight">
                                      Son giris kar (%)
                                    </label>
                                    <input
                                      type="number"
                                      value={item.manualMarginEntry ?? ''}
                                      onChange={(e) => handleManualMarginChange(item, 'entry', e.target.value)}
                                      className="mt-1 w-full min-w-[150px] rounded-lg border border-gray-300 px-2 py-1 text-xs"
                                      placeholder="Orn: 5"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 leading-tight">
                                      Guncel maliyet kar (%)
                                    </label>
                                    <input
                                      type="number"
                                      value={item.manualMarginCost ?? ''}
                                      onChange={(e) => handleManualMarginChange(item, 'cost', e.target.value)}
                                      className="mt-1 w-full min-w-[150px] rounded-lg border border-gray-300 px-2 py-1 text-xs"
                                      placeholder="Orn: 8"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Secim bekleniyor</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {roundedUnitPrice ? formatCurrency(roundedUnitPrice) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {roundedUnitPrice ? formatCurrency(lineTotal) : '-'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              {item.isManualLine ? (
                                <select
                                  value={item.manualVatRate === 0.1 ? '0.1' : '0.2'}
                                  onChange={(e) => handleManualVatChange(item, e.target.value)}
                                  className="rounded-lg border border-gray-300 bg-white px-2 py-1"
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
                            <Button variant="danger" size="sm" onClick={() => removeItem(item.id)}>
                              Sil
                            </Button>
                          </td>
                        </tr>
                        {marginInfo && (
                          <tr className="bg-yellow-50">
                            <td colSpan={columnsCount} className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-full bg-yellow-200/70 px-2 py-1 font-semibold text-yellow-900">
                                  Fiyat analizi
                                </span>
                                <span className="rounded-full border border-yellow-200 bg-white px-2 py-1 text-gray-700">
                                  Son giris (KDV haric): <span className="font-semibold text-gray-900">{formatCurrency(marginInfo.lastEntry)}</span>
                                  <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.lastEntryDiff)}`}>
                                    Kar {formatPercent(marginInfo.lastEntryDiff)}
                                  </span>
                                </span>
                                <span className="rounded-full border border-yellow-200 bg-white px-2 py-1 text-gray-700">
                                  Guncel maliyet (KDV haric): <span className="font-semibold text-gray-900">{formatCurrency(marginInfo.currentCost)}</span>
                                  <span className={`ml-1 font-semibold ${getPercentTone(marginInfo.currentCostDiff)}`}>
                                    Kar {formatPercent(marginInfo.currentCostDiff)}
                                  </span>
                                </span>
                                {marginInfo.openPurchase && (
                                  <span className="rounded-full bg-blue-100 px-2 py-1 font-semibold text-blue-700">
                                    Acik alis (KDV dahil = haric)
                                  </span>
                                )}
                                {marginInfo.blocked && (
                                  <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">
                                    Blok: %5 altinda
                                  </span>
                                )}
                              </div>
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

        <Card className={`${cardShell} border-primary-100 bg-gradient-to-br from-white via-white to-primary-50/60 lg:sticky lg:top-6`}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-500">{quoteItems.length} kalem secili</p>
              <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Gonderiliyor...' : 'Teklif Olustur'}
              </Button>
            </div>
          </div>
        </Card>
          </div>
        </div>
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

      <Modal
        isOpen={showProductPoolModal}
        onClose={() => setShowProductPoolModal(false)}
        title="Urun Havuzu"
        size="full"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-full bg-slate-100 p-1">
                <Button
                  variant="ghost"
                  onClick={() => setProductTab('purchased')}
                  size="sm"
                  className={`rounded-full px-4 ${productTab === 'purchased' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Daha Once Alinanlar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setProductTab('search')}
                  size="sm"
                  className={`rounded-full px-4 ${productTab === 'search' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  Tum Urunler
                </Button>
              </div>
              <Button variant="secondary" onClick={addManualLine} size="sm" className="rounded-full">
                Manuel Satir Ekle
              </Button>
            </div>
            <div className="text-xs text-gray-500">
              Son {lastSalesCount} satis gosteriliyor.
            </div>
          </div>

          {productTab === 'purchased' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Input
                  placeholder="Urun ara..."
                  value={purchasedSearch}
                  onChange={(e) => setPurchasedSearch(e.target.value)}
                  className="lg:max-w-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {selectedPurchasedCount} secili / {filteredPurchasedProducts.length} urun
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearPurchasedSelection}>
                    Secimi Temizle
                  </Button>
                  <Button variant="secondary" size="sm" onClick={selectAllPurchased} className="rounded-full">
                    Tumunu Sec
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={addSelectedPurchasedToQuote}
                    disabled={selectedPurchasedCount === 0}
                    className="rounded-full"
                  >
                    Secilileri Ekle
                  </Button>
                </div>
              </div>
              {filteredPurchasedProducts.length === 0 ? (
                <div className="text-sm text-gray-500">Urun bulunamadi.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3 max-h-[60vh] overflow-y-auto pr-2">
                  {filteredPurchasedProducts.map((product) => {
                    const isSelected = selectedPurchasedCodes.has(product.mikroCode);
                    return (
                      <div
                        key={product.mikroCode}
                        className={`rounded-xl border p-4 transition ${
                          isSelected
                            ? 'border-primary-200 bg-primary-50/70'
                            : 'border-gray-200 bg-white/90 hover:border-primary-200'
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePurchasedSelection(product.mikroCode)}
                              className="mt-1 h-4 w-4 accent-primary-600"
                            />
                            <div>
                              <p className="font-semibold text-gray-900">{product.name}</p>
                              <p className="text-xs text-gray-500">
                                {product.mikroCode}
                                {product.unit ? ` - ${product.unit}` : ''}
                              </p>
                              <div className="mt-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-600">Merkez (1)</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['1'])}
                                <span className="mx-2 text-slate-300">|</span>
                                <span className="font-medium text-slate-600">Topca (6)</span>{' '}
                                {formatStockValue(product.warehouseStocks?.['6'])}
                              </div>
                            </div>
                          </div>
                          <Button variant="secondary" size="sm" onClick={() => addProductToQuote(product)}>
                            Teklife Ekle
                          </Button>
                        </div>
                        {product.lastSales?.length ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {product.lastSales.map((sale, idx) => (
                              <div
                                key={idx}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                              >
                                <span className="font-medium text-gray-700">{formatDateShort(sale.saleDate)}</span>
                                <span className="text-gray-500">{sale.quantity} adet</span>
                                <span className="font-semibold text-gray-900">{formatCurrency(sale.unitPrice)}</span>
                                {sale.vatZeroed && <Badge variant="info" className="text-[10px]">KDV 0</Badge>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-gray-400">Satis yok</p>
                        )}
                      </div>
                    );
                  })}
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 max-h-[60vh] overflow-y-auto pr-2">
                  {searchResults.map((product) => (
                    <div key={product.mikroCode} className="rounded-xl border border-gray-200 bg-white/90 p-4">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.mikroCode}</p>
                          <div className="mt-1 text-xs text-slate-500">
                            <span className="font-medium text-slate-600">Merkez (1)</span>{' '}
                            {formatStockValue(product.warehouseStocks?.['1'])}
                            <span className="mx-2 text-slate-300">|</span>
                            <span className="font-medium text-slate-600">Topca (6)</span>{' '}
                            {formatStockValue(product.warehouseStocks?.['6'])}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => addProductToQuote(product)}>
                          Teklife Ekle
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

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
              <Button variant="primary" onClick={saveColumnPreferences} disabled={savingColumns}>
                {savingColumns ? 'Kaydediliyor...' : 'Dizilimi Kaydet'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
              <p className="text-xs text-gray-500">Kolonlari secin ve siralamayi surukleyin.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={selectAllColumns} className="rounded-full">
                  Tumunu Sec
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAllColumns} className="rounded-full">
                  Tumunu Kaldir
                </Button>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Secili Kolonlar (surukle birak)</div>
              {selectedColumns.length === 0 ? (
                <div className="text-xs text-gray-400">Secili kolon yok.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedColumns.map((column) => (
                    <div
                      key={column}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={handleColumnDragStart(column)}
                      onDragOver={handleColumnDragOver}
                      onDrop={handleColumnDrop(column)}
                      onDragEnd={handleColumnDragEnd}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                        draggingColumn === column
                          ? 'border-primary-200 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}
                      title="Surukleyerek sirala"
                    >
                      <span className="text-gray-400">::</span>
                      {getColumnDisplayName(column)}
                    </div>
                  ))}
                </div>
              )}
            </div>

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
          </div>
        </Modal>
      )}
    </div>
  );
}
