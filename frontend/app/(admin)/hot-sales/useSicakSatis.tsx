'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Sicak Satis ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 * Tipler/sabitler/yardimci fonksiyonlar Classic/New JSX'lerin ihtiyaci icin re-export edilir.
 */

export type TabKey = 'sale' | 'load' | 'orders' | 'close' | 'report' | 'manage';
export type SaleType = 'CASH_INVOICE' | 'INVOICED_DISPATCH' | 'ORDER';
export type PaymentType = 'CASH' | 'CARD' | 'TRANSFER' | 'OPEN_ACCOUNT' | 'MIXED';

export type CartItem = {
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  priceListNo: number;
  priceLists?: Record<string, number>;
  vatRate?: number;
  currentCost?: number | null;
  currentCostVatIncluded?: number | null;
  imageUrl?: string | null;
  vehicleStock?: number;
  hotWarehouseStock?: number;
  stockMerkez?: number;
  stockTopca?: number;
  totalVisibleStock?: number;
};

export type NewCustomerForm = {
  customerName: string;
  phone: string;
  taxOffice: string;
  taxNumber: string;
  email: string;
  city: string;
  district: string;
  address: string;
};

export const WAREHOUSE_OPTIONS = [
  { value: '1', label: 'Merkez' },
  { value: '6', label: 'Topca' },
];

export const priceLabel = (listNo: number) => {
  if (listNo <= 5) return `Perakende ${listNo}`;
  return `Toptan ${listNo - 5}`;
};

export const n = (value: any) => Number(value || 0);
export const fmtQty = (value: any) => Number(n(value).toFixed(3)).toString();
export const fmtDate = (value: any) => (value ? new Date(value).toLocaleDateString('tr-TR') : '-');
export const fmtDateTime = (value: any) => (value ? new Date(value).toLocaleString('tr-TR') : '-');
export const warehouseLabel = (value: any) => WAREHOUSE_OPTIONS.find((item) => item.value === String(value))?.label || String(value || '-');
export const localDateInput = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
export const typeLabel = (value: string) => ({
  CASH_INVOICE: 'Faturasiz Satis',
  INVOICED_DISPATCH: 'Faturali Irsaliye',
  ORDER: 'Siparis',
  ORDER_DELIVERY: 'Siparisten Irsaliye',
}[value] || value);
export const paymentLabel = (value: string) => ({
  CASH: 'Nakit',
  CARD: 'Kart',
  TRANSFER: 'Havale',
  OPEN_ACCOUNT: 'Acik Hesap',
  MIXED: 'Parcali',
}[value] || value);
export const movementLabel = (value: string) => ({
  LOAD: 'Yukleme',
  SALE: 'Satis Cikisi',
  ORDER_RESERVE: 'Siparis Rezerv',
  RETURN_TO_DEPOT: 'Depoya Donus',
  KEEP_ON_VEHICLE: 'Aracta Birak',
  ADJUSTMENT: 'Sayim Farki',
  FIRE: 'Fire',
  COUNT: 'Sayim',
}[value] || value);
export const minAllowedPrice = (item: CartItem, saleType: SaleType) => {
  const currentCost = n(item.currentCost);
  if (currentCost <= 0) return 0;
  if (saleType === 'CASH_INVOICE') return Math.max(n(item.currentCostVatIncluded), currentCost);
  return currentCost * 1.05;
};
export const costMissing = (item: CartItem) => n(item.currentCost) <= 0;
export const itemAvailableFor = (item: CartItem, mode: 'sale' | 'load', saleType?: SaleType, sourceWarehouseNo?: string) => {
  if (mode === 'load') return sourceWarehouseNo === '6' ? n(item.stockTopca) : n(item.stockMerkez);
  if (saleType === 'ORDER') return Number.POSITIVE_INFINITY;
  return n(item.vehicleStock);
};

export function useSicakSatis() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [activeTab, setActiveTab] = useState<TabKey>('sale');
  const [dashboard, setDashboard] = useState<any>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionDetail, setSessionDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [openOrders, setOpenOrders] = useState<any[]>([]);
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [saleType, setSaleType] = useState<SaleType>('CASH_INVOICE');
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [priceListNo, setPriceListNo] = useState(5);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadCart, setLoadCart] = useState<CartItem[]>([]);
  const [deliveryQuantities, setDeliveryQuantities] = useState<Record<string, string>>({});
  const [closingCounts, setClosingCounts] = useState<Record<string, { countedQty: string; action: 'KEEP_ON_VEHICLE' | 'RETURN_TO_DEPOT'; note: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [dailyReport, setDailyReport] = useState<any>(null);
  const [reportFilters, setReportFilters] = useState({
    startDate: localDateInput(),
    endDate: localDateInput(),
    vehicleId: '',
    userId: '',
  });

  const [sessionForm, setSessionForm] = useState({
    vehicleId: '',
    sourceWarehouseNo: '1',
    openingCash: '',
    startKm: '',
    note: '',
  });

  const [vehicleForm, setVehicleForm] = useState({
    name: '',
    plate: '',
    defaultSourceWarehouseNo: '1',
    note: '',
  });

  const [newCustomerForm, setNewCustomerForm] = useState<NewCustomerForm>({
    customerName: '',
    phone: '',
    taxOffice: '',
    taxNumber: '',
    email: '',
    city: '',
    district: '',
    address: '',
  });

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:hot-sales')) router.push('/dashboard');
  }, [user, permissionsLoading, hasPermission, router]);

  const refreshDashboard = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getHotSalesDashboard();
      setDashboard(data);
      setVehicles(data.vehicles || []);
      const active = data.myOpenSession || data.openSessions?.[0] || null;
      if (active && !selectedSessionId) setSelectedSessionId(active.id);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Sicak satis verileri alinamadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshDashboard();
  }, []);

  const loadSession = async (sessionId: string) => {
    if (!sessionId) {
      setSessionDetail(null);
      return;
    }
    try {
      const data = await adminApi.getHotSaleSession(sessionId);
      setSessionDetail(data);
      const counts: Record<string, { countedQty: string; action: 'KEEP_ON_VEHICLE' | 'RETURN_TO_DEPOT'; note: string }> = {};
      (data.inventory || []).forEach((row: any) => {
        counts[row.productCode] = {
          countedQty: fmtQty(row.quantity),
          action: 'KEEP_ON_VEHICLE',
          note: '',
        };
      });
      setClosingCounts(counts);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Oturum yuklenemedi');
    }
  };

  useEffect(() => {
    loadSession(selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!customerSearch.trim()) {
        setCustomers([]);
        return;
      }
      try {
        const result = await adminApi.searchHotSaleCustomers({ search: customerSearch, limit: 20 });
        setCustomers(result.customers || []);
      } catch {
        setCustomers([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const vehicleId = sessionDetail?.session?.vehicleId;
      if (!productSearch.trim() && !vehicleId) {
        setProducts([]);
        return;
      }
      try {
        const result = await adminApi.searchHotSaleProducts({
          search: productSearch,
          limit: productSearch.trim() ? 60 : 500,
          vehicleId,
          customerIdOrCode: selectedCustomer?.id || selectedCustomer?.mikroCariCode,
        });
        setProducts(result.products || []);
      } catch {
        setProducts([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch, sessionDetail?.session?.vehicleId, selectedCustomer?.id]);

  const refreshOpenOrders = async () => {
    try {
      const result = await adminApi.getHotSaleOpenOrders({
        search: orderSearch,
        limit: 30,
        vehicleId: sessionDetail?.session?.vehicleId,
        customerIdOrCode: selectedCustomer?.mikroCariCode || selectedCustomer?.id,
      });
      const orders = result.orders || [];
      setOpenOrders(orders);
      setDeliveryQuantities((prev) => {
        const next: Record<string, string> = {};
        orders.forEach((order: any) => {
          order.items.forEach((item: any) => {
            const key = `${order.orderNumber}:${item.orderGuid || item.rowNumber}`;
            const defaultQty = Math.max(Math.min(n(item.remainingQty), n(item.vehicleStock)), 0);
            next[key] = prev[key] ?? (defaultQty > 0 ? fmtQty(defaultQty) : '0');
          });
        });
        return next;
      });
    } catch {
      setOpenOrders([]);
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (activeTab !== 'orders') return;
      await refreshOpenOrders();
    }, 250);
    return () => clearTimeout(timer);
  }, [activeTab, orderSearch, sessionDetail?.session?.vehicleId, selectedCustomer?.id, selectedCustomer?.mikroCariCode]);

  useEffect(() => {
    if (activeTab === 'manage') {
      void refreshReconciliation();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'report') {
      void refreshDailyReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (saleType === 'CASH_INVOICE') {
      setPaymentType('CASH');
      setPriceListNo(5);
    } else if (saleType === 'INVOICED_DISPATCH') {
      setPaymentType('OPEN_ACCOUNT');
      setPriceListNo(6);
    } else {
      setPaymentType('OPEN_ACCOUNT');
      setPriceListNo(6);
    }
  }, [saleType]);

  const saleTotal = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [cart]);
  const loadTotalQty = useMemo(() => loadCart.reduce((sum, item) => sum + item.quantity, 0), [loadCart]);
  const priceViolations = useMemo(
    () => cart.filter((item) => costMissing(item) || (minAllowedPrice(item, saleType) > 0 && n(item.unitPrice) + 0.0001 < minAllowedPrice(item, saleType))),
    [cart, saleType]
  );
  const saleStockViolations = useMemo(
    () => cart.filter((item) => n(item.quantity) > itemAvailableFor(item, 'sale', saleType) + 0.0001),
    [cart, saleType]
  );
  const loadStockViolations = useMemo(
    () => loadCart.filter((item) => n(item.quantity) > itemAvailableFor(item, 'load', undefined, sessionForm.sourceWarehouseNo) + 0.0001),
    [loadCart, sessionForm.sourceWarehouseNo]
  );
  const activeSession = sessionDetail?.session || null;
  const inventory = sessionDetail?.inventory || [];

  const addToCart = (product: any, target: 'sale' | 'load', forcedListNo?: number) => {
    const listNo = target === 'load' ? 1 : forcedListNo || priceListNo;
    const unitPrice = target === 'load' ? 0 : n(product.priceLists?.[listNo]);
    if (target === 'sale' && n(product.currentCost) <= 0) {
      toast.error(`${product.productCode} guncel maliyeti yok, satisa eklenemez`);
      return;
    }
    if (target === 'sale' && unitPrice <= 0) {
      toast.error(`${priceLabel(listNo)} fiyati yok`);
      return;
    }
    const setter = target === 'load' ? setLoadCart : setCart;
    setter((prev) => {
      const existing = prev.find((row) => row.productCode === product.productCode);
      if (existing) {
        return prev.map((row) =>
          row.productCode === product.productCode
            ? {
                ...row,
                quantity: Number((row.quantity + 1).toFixed(3)),
                ...(target === 'sale' && forcedListNo ? { unitPrice, priceListNo: listNo } : {}),
              }
            : row
        );
      }
      return [
        ...prev,
        {
          productCode: product.productCode,
          productName: product.productName,
          unit: product.unit || 'ADET',
          quantity: 1,
          unitPrice,
          priceListNo: listNo,
          priceLists: product.priceLists || {},
          vatRate: product.vatRate,
          currentCost: product.currentCost,
          currentCostVatIncluded: product.currentCostVatIncluded,
          imageUrl: product.imageUrl,
          vehicleStock: product.vehicleStock,
          hotWarehouseStock: product.hotWarehouseStock,
          stockMerkez: product.stockMerkez,
          stockTopca: product.stockTopca,
          totalVisibleStock: product.totalVisibleStock,
        },
      ];
    });
  };

  const updateCart = (target: 'sale' | 'load', code: string, patch: Partial<CartItem>) => {
    const setter = target === 'load' ? setLoadCart : setCart;
    setter((prev) => prev.map((row) => (row.productCode === code ? { ...row, ...patch } : row)));
  };

  const removeCart = (target: 'sale' | 'load', code: string) => {
    const setter = target === 'load' ? setLoadCart : setCart;
    setter((prev) => prev.filter((row) => row.productCode !== code));
  };

  const startSession = async () => {
    if (!sessionForm.vehicleId) {
      toast.error('Arac secin');
      return;
    }
    if (loadStockViolations.length > 0) {
      toast.error(`Kaynak depo stogu yetersiz: ${loadStockViolations.map((item) => item.productCode).join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await adminApi.startHotSaleSession({
        vehicleId: sessionForm.vehicleId,
        sourceWarehouseNo: Number(sessionForm.sourceWarehouseNo || 1),
        openingCash: Number(sessionForm.openingCash || 0),
        startKm: sessionForm.startKm ? Number(sessionForm.startKm) : undefined,
        note: sessionForm.note,
        loadItems: loadCart.map((row) => ({ productCode: row.productCode, quantity: row.quantity })),
      });
      setSelectedSessionId(result.session.id);
      setLoadCart([]);
      await refreshDashboard();
      toast.success('Sicak satis oturumu acildi');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Oturum acilamadi');
    } finally {
      setSubmitting(false);
    }
  };

  const addLoad = async () => {
    if (!activeSession) return;
    if (loadCart.length === 0) {
      toast.error('Yuklenecek urun yok');
      return;
    }
    if (loadStockViolations.length > 0) {
      toast.error(`Kaynak depo stogu yetersiz: ${loadStockViolations.map((item) => item.productCode).join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.addHotSaleLoad(activeSession.id, {
        sourceWarehouseNo: Number(sessionForm.sourceWarehouseNo || activeSession.sourceWarehouseNo || 1),
        items: loadCart.map((row) => ({ productCode: row.productCode, quantity: row.quantity })),
      });
      setLoadCart([]);
      await loadSession(activeSession.id);
      toast.success('Arac yukleme kaydedildi');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Yukleme yapilamadi');
    } finally {
      setSubmitting(false);
    }
  };

  const submitSale = async () => {
    if (!activeSession) {
      toast.error('Once oturum acin');
      return;
    }
    if (cart.length === 0) {
      toast.error('Sepet bos');
      return;
    }
    if (saleType !== 'CASH_INVOICE' && !selectedCustomer?.id) {
      toast.error('Faturali irsaliye ve siparis icin cari secin');
      return;
    }
    if (priceViolations.length > 0) {
      toast.error('Maliyet eksik veya alt limitin altinda fiyat var');
      return;
    }
    if (saleStockViolations.length > 0) {
      toast.error(`Arac stogu yetersiz: ${saleStockViolations.map((item) => item.productCode).join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await adminApi.createHotSaleTransaction(activeSession.id, {
        type: saleType,
        customerId: selectedCustomer?.id,
        customerCode: selectedCustomer?.mikroCariCode,
        customerName: selectedCustomer?.displayName || selectedCustomer?.mikroName || selectedCustomer?.name,
        paymentType,
        priceListNo,
        items: cart.map((row) => ({
          productCode: row.productCode,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          priceListNo: row.priceListNo,
          unit: row.unit,
        })),
      });
      setCart([]);
      await loadSession(activeSession.id);
      await refreshDashboard();
      toast.success(`Islem olustu: ${result.transaction.mikroDocumentNo || result.transaction.linkedOrderNumber || '-'}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Sicak satis kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const deliverOrder = async (order: any) => {
    if (!activeSession) {
      toast.error('Once arac oturumu acin');
      return;
    }
    const selectedItems = order.items
      .map((item: any) => {
        const key = `${order.orderNumber}:${item.orderGuid || item.rowNumber}`;
        const quantity = Number(String(deliveryQuantities[key] || '0').replace(',', '.')) || 0;
        return { item, quantity };
      })
      .filter((row: any) => row.quantity > 0);
    if (selectedItems.length === 0) {
      toast.error('Teslim miktari girin');
      return;
    }
    const totalsByCode = new Map<string, { requested: number; available: number }>();
    selectedItems.forEach((row: any) => {
      const code = row.item.productCode;
      const current = totalsByCode.get(code) || { requested: 0, available: n(row.item.vehicleStock) };
      current.requested += row.quantity;
      current.available = Math.min(current.available, n(row.item.vehicleStock));
      totalsByCode.set(code, current);
    });
    const totalInvalid = Array.from(totalsByCode.entries()).find(([, row]) => row.requested > row.available + 0.0001);
    if (totalInvalid) {
      toast.error(`${totalInvalid[0]} icin toplam kesilecek miktar arac stoktan fazla`);
      return;
    }
    const invalid = selectedItems.find((row: any) => row.quantity > n(row.item.remainingQty) + 0.0001 || row.quantity > n(row.item.vehicleStock) + 0.0001);
    if (invalid) {
      toast.error(`${invalid.item.productCode} icin miktar kalan/arac stoktan fazla`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await adminApi.deliverHotSaleOrder(selectedSessionId, {
        orderNumber: order.orderNumber,
        items: selectedItems.map(({ item, quantity }: any) => ({
          orderGuid: item.orderGuid,
          productCode: item.productCode,
          quantity,
        })),
      });
      toast.success(`Siparisten irsaliye olustu: ${result.transaction?.mikroDocumentNo || ''}`);
      await loadSession(selectedSessionId);
      await refreshOpenOrders();
      await refreshDashboard();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Siparis teslim edilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const closeSession = async () => {
    if (!activeSession) return;
    setSubmitting(true);
    try {
      await adminApi.closeHotSaleSession(activeSession.id, {
        closingCash: Number(prompt('Kapanis nakit tutari') || 0),
        counts: Object.entries(closingCounts).map(([productCode, row]) => ({
          productCode,
          countedQty: Number(String(row.countedQty || '0').replace(',', '.')),
          action: row.action,
          note: row.note,
        })),
      });
      toast.success('Gun sonu kapatildi');
      setSelectedSessionId('');
      setSessionDetail(null);
      await refreshDashboard();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Gun sonu kapatilamadi');
    } finally {
      setSubmitting(false);
    }
  };

  const saveVehicle = async () => {
    if (!vehicleForm.name.trim() || !vehicleForm.plate.trim()) {
      toast.error('Arac adi ve plaka zorunlu');
      return;
    }
    try {
      await adminApi.saveHotSaleVehicle({
        name: vehicleForm.name,
        plate: vehicleForm.plate,
        defaultSourceWarehouseNo: Number(vehicleForm.defaultSourceWarehouseNo || 1),
        note: vehicleForm.note,
      });
      setVehicleForm({ name: '', plate: '', defaultSourceWarehouseNo: '1', note: '' });
      await refreshDashboard();
      toast.success('Arac kaydedildi');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Arac kaydedilemedi');
    }
  };

  const refreshReconciliation = async () => {
    setReconciliationLoading(true);
    try {
      const result = await adminApi.getHotSaleReconciliation({ limit: 100 });
      setReconciliation(result);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Mutabakat alinamadi');
    } finally {
      setReconciliationLoading(false);
    }
  };

  const refreshDailyReport = async () => {
    setReportLoading(true);
    try {
      const result = await adminApi.getHotSaleDailyReport({
        startDate: reportFilters.startDate,
        endDate: reportFilters.endDate,
        vehicleId: reportFilters.vehicleId || undefined,
        userId: reportFilters.userId || undefined,
        limit: 500,
      });
      setDailyReport(result);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Sicak satis raporu alinamadi');
    } finally {
      setReportLoading(false);
    }
  };

  const exportDailyReportCsv = () => {
    if (!dailyReport) return;
    const rows = [
      ['Baslik', 'Deger'],
      ['Tarih', `${dailyReport.filters?.startDate || ''} / ${dailyReport.filters?.endDate || ''}`],
      ['Toplam ciro', dailyReport.summary?.totalRevenue || 0],
      ['Nakit satis', dailyReport.summary?.cashSales || 0],
      ['Beklenen kasa', dailyReport.summary?.expectedCash || 0],
      ['Kapanis nakit', dailyReport.summary?.closingCash || 0],
      ['Kasa farki', dailyReport.summary?.cashDifference || 0],
      [],
      ['Oturum', 'Arac', 'Personel', 'Durum', 'Acilis', 'Nakit Satis', 'Beklenen', 'Kapanis', 'Fark', 'Ciro', 'Islem', 'Mikro Risk', 'Sayim Fark'],
      ...(dailyReport.sessions || []).map((row: any) => [
        row.id,
        row.vehicleName || '',
        row.userName || '',
        row.status || '',
        row.openingCash || 0,
        row.cashSales || 0,
        row.expectedCash || 0,
        row.closingCash ?? '',
        row.cashDifference ?? '',
        row.revenue || 0,
        row.transactionCount || 0,
        row.syncFailedCount || 0,
        row.stockDifferenceCount || 0,
      ]),
      [],
      ['Islem', 'Tarih', 'Arac', 'Personel', 'Cari', 'Tip', 'Odeme', 'Durum', 'Evrak', 'Tutar'],
      ...(dailyReport.transactions || []).map((row: any) => [
        row.id,
        fmtDateTime(row.createdAt),
        row.vehicleName || '',
        row.userName || '',
        row.customerName || row.customerCode || '',
        typeLabel(row.type),
        paymentLabel(row.paymentType),
        row.status,
        row.documentNo || '',
        row.totalAmount || 0,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell: any) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sicak-satis-raporu-${dailyReport.filters?.startDate || 'rapor'}-${dailyReport.filters?.endDate || ''}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cancelLocalTransaction = async (transactionId: string) => {
    const note = prompt('Bu islem B2B tarafinda iptal isaretlenecek ve arac stogu geri alinacak. Not girin:') || '';
    if (!note.trim()) {
      toast.error('Iptal/duzeltme notu zorunlu');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.cancelHotSaleTransactionLocally(transactionId, { note });
      toast.success('Islem yerel iptal isaretlendi');
      await refreshReconciliation();
      if (selectedSessionId) await loadSession(selectedSessionId);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Islem iptal edilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  const createHotCustomer = async () => {
    if (!newCustomerForm.customerName.trim() || !newCustomerForm.phone.trim() || !newCustomerForm.taxOffice.trim() || !newCustomerForm.taxNumber.trim()) {
      toast.error('Cari unvani, cep telefonu, vergi dairesi ve vergi no zorunlu');
      return;
    }
    setSubmitting(true);
    try {
      const result = await adminApi.createHotSaleCustomer(newCustomerForm);
      setSelectedCustomer(result.customer);
      setCustomerSearch(result.customer.displayName || result.customer.mikroName || result.customer.name || result.customer.mikroCariCode);
      setCustomers([]);
      setShowCustomerForm(false);
      setNewCustomerForm({ customerName: '', phone: '', taxOffice: '', taxNumber: '', email: '', city: '', district: '', address: '' });
      toast.success(`SICAK cari acildi: ${result.customer.mikroCariCode}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Cari acilamadi');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    // router
    router,
    // sekme
    activeTab,
    setActiveTab,
    // ana veri
    dashboard,
    selectedSessionId,
    setSelectedSessionId,
    sessionDetail,
    loading,
    vehicles,
    customers,
    setCustomers,
    products,
    openOrders,
    reconciliation,
    // arama / secim
    customerSearch,
    setCustomerSearch,
    productSearch,
    setProductSearch,
    orderSearch,
    setOrderSearch,
    selectedCustomer,
    setSelectedCustomer,
    showCustomerForm,
    setShowCustomerForm,
    // satis ayarlari
    saleType,
    setSaleType,
    paymentType,
    setPaymentType,
    priceListNo,
    setPriceListNo,
    // sepetler
    cart,
    setCart,
    loadCart,
    setLoadCart,
    deliveryQuantities,
    setDeliveryQuantities,
    closingCounts,
    setClosingCounts,
    // durumlar
    submitting,
    reconciliationLoading,
    reportLoading,
    dailyReport,
    reportFilters,
    setReportFilters,
    // formlar
    sessionForm,
    setSessionForm,
    vehicleForm,
    setVehicleForm,
    newCustomerForm,
    setNewCustomerForm,
    // turetilmis degerler
    saleTotal,
    loadTotalQty,
    priceViolations,
    saleStockViolations,
    loadStockViolations,
    activeSession,
    inventory,
    // handler'lar
    refreshDashboard,
    loadSession,
    refreshOpenOrders,
    addToCart,
    updateCart,
    removeCart,
    startSession,
    addLoad,
    submitSale,
    deliverOrder,
    closeSession,
    saveVehicle,
    refreshReconciliation,
    refreshDailyReport,
    exportDailyReportCsv,
    cancelLocalTransaction,
    createHotCustomer,
  };
}

export default useSicakSatis;
