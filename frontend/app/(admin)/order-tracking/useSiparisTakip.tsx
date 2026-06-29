'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { apiClient } from '@/lib/api/client';

/**
 * Siparis Takip ekraninin TUM mantigi (state/effect/handler/turetilmis deger + tipler).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */

export interface PendingOrder {
  mikroOrderNumber: string;
  customerName: string;
  customerCode: string;
  orderDate: string;
  deliveryDate: string | null;
  itemCount: number;
  grandTotal: number;
}

export interface OrderItem {
  productCode: string;
  productName: string;
  unit: string;
  warehouseCode?: string | null;
  warehouseStocks?: {
    merkez: number;
    topca: number;
  };
  fulfillment?: {
    preferredWarehouseCode: string | null;
    preferredWarehouseName: string;
    merkezCanFulfill: boolean;
    topcaCanFulfill: boolean;
    preferredCanFulfill: boolean;
    merkezTotalDemand: number;
    topcaTotalDemand: number;
    preferredTotalDemand: number;
    merkezAfterTotalDemand: number;
    topcaAfterTotalDemand: number;
    preferredAfterTotalDemand: number;
    hasAggregateRisk: boolean;
  };
  quantity: number;
  deliveredQty: number;
  remainingQty: number;
  unitPrice: number;
  lineTotal: number;
  vat: number;
}

export interface OrderDetail {
  id: string;
  mikroOrderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  itemCount: number;
  grandTotal: number;
  items: OrderItem[];
}

export interface CustomerSummary {
  customerCode: string;
  customerName: string;
  customerEmail: string | null;
  sectorCode: string | null;
  city?: string | null;
  ordersCount: number;
  totalAmount: number;
  emailSent: boolean;
  lastTransmittedAt?: string | null;
  lastTransmittedByName?: string | null;
  orders: OrderDetail[];
}
export interface SupplierPdfItem {
  productCode: string;
  productName: string;
  unit: string;
  warehouseCode?: string | null;
  totalQty: number;
  totalAmount: number;
  unitPrice: number;
  orderRefs: Array<{
    orderNumber: string;
    orderDate: string;
    orderDateTs: number;
  }>;
}

export interface Settings {
  syncEnabled: boolean;
  syncSchedule: string;
  customerSyncSchedule: string;
  supplierSyncSchedule: string;
  emailEnabled: boolean;
  customerEmailEnabled: boolean;
  supplierEmailEnabled: boolean;
  emailSubject: string;
  customerEmailSubject: string;
  supplierEmailSubject: string;
  lastSyncAt: string | null;
  lastEmailSentAt: string | null;
  lastCustomerEmailSentAt: string | null;
  lastSupplierEmailSentAt: string | null;
}

export function useSiparisTakip() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary[]>([]);
  const [supplierSummary, setSupplierSummary] = useState<CustomerSummary[]>([]);
  const [customerWarehouseFilter, setCustomerWarehouseFilter] = useState<'ALL' | '1' | '6'>('ALL');
  const [customerFulfillmentFilter, setCustomerFulfillmentFilter] = useState<
    'ALL' | 'ANY_UNFULFILLED' | 'MERKEZ_UNFULFILLED' | 'TOPCA_UNFULFILLED'
  >('ALL');
  const [supplierCityFilter, setSupplierCityFilter] = useState('ALL');
  const [supplierCitySort, setSupplierCitySort] = useState<'none' | 'asc' | 'desc'>('none');
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [sendingToCustomer, setSendingToCustomer] = useState<string | null>(null);
  const [downloadingSupplier, setDownloadingSupplier] = useState<string | null>(null);
  const [downloadingCustomerStatementPdf, setDownloadingCustomerStatementPdf] = useState<string | null>(null);
  const [downloadingCustomerPdf, setDownloadingCustomerPdf] = useState<string | null>(null);
  const [downloadingSupplierExcel, setDownloadingSupplierExcel] = useState<string | null>(null);
  const [downloadingSelectedCustomerStatements, setDownloadingSelectedCustomerStatements] = useState(false);
  const [downloadingSelectedCustomers, setDownloadingSelectedCustomers] = useState(false);
  const [downloadingSelectedSuppliers, setDownloadingSelectedSuppliers] = useState(false);
  const [selectedCustomerCodes, setSelectedCustomerCodes] = useState<Set<string>>(new Set());
  const [selectedSupplierCodes, setSelectedSupplierCodes] = useState<Set<string>>(new Set());
  const [markingSupplierTransmission, setMarkingSupplierTransmission] = useState<string | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    customerEmailEnabled: true,
    customerEmailSubject: '',
    customerDays: [] as number[],
    customerHour: 8,
    supplierEmailEnabled: true,
    supplierEmailSubject: '',
    supplierDays: [] as number[],
    supplierHour: 8,
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'success' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:order-tracking')) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [user, permissionsLoading, router, hasPermission]);

  // Cron string'ini parse et
  const parseCronSchedule = (cronString: string) => {
    // Format: "0 8 * * 2,5" => hour=8, days=[2,5]
    const parts = cronString.split(' ');
    const hour = parseInt(parts[1]);
    const daysStr = parts[4];
    const days = daysStr.split(',').map((d) => parseInt(d));
    return { hour, days };
  };

  // Gün ve saati cron string'e çevir
  const generateCronSchedule = (days: number[], hour: number) => {
    return `0 ${hour} * * ${days.join(',')}`;
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, ordersRes, summaryRes, supplierRes] = await Promise.all([
        apiClient.get('/order-tracking/admin/settings'),
        apiClient.get('/order-tracking/admin/pending-orders'),
        apiClient.get('/order-tracking/admin/summary'),
        apiClient.get('/order-tracking/admin/supplier-summary'),
      ]);

      const loadedSettings = settingsRes.data;
      setSettings(loadedSettings);
      setOrders(ordersRes.data);
      setCustomerSummary(summaryRes.data);
      setSupplierSummary(supplierRes.data);

      // Settings form'u doldur
      const customerSchedule = parseCronSchedule(loadedSettings.customerSyncSchedule);
      const supplierSchedule = parseCronSchedule(loadedSettings.supplierSyncSchedule);

      setSettingsForm({
        customerEmailEnabled: loadedSettings.customerEmailEnabled,
        customerEmailSubject: loadedSettings.customerEmailSubject,
        customerDays: customerSchedule.days,
        customerHour: customerSchedule.hour,
        supplierEmailEnabled: loadedSettings.supplierEmailEnabled,
        supplierEmailSubject: loadedSettings.supplierEmailSubject,
        supplierDays: supplierSchedule.days,
        supplierHour: supplierSchedule.hour,
      });
    } catch (error: any) {
      console.error('Veri yükleme hatası:', error);
      toast.error('Veriler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const payload = {
        customerEmailEnabled: settingsForm.customerEmailEnabled,
        customerEmailSubject: settingsForm.customerEmailSubject,
        customerSyncSchedule: generateCronSchedule(settingsForm.customerDays, settingsForm.customerHour),
        supplierEmailEnabled: settingsForm.supplierEmailEnabled,
        supplierEmailSubject: settingsForm.supplierEmailSubject,
        supplierSyncSchedule: generateCronSchedule(settingsForm.supplierDays, settingsForm.supplierHour),
      };

      await apiClient.put('/order-tracking/admin/settings', payload);
      toast.success('Ayarlar kaydedildi!');
      setShowSettingsModal(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Ayarlar kaydedilemedi');
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await apiClient.post('/order-tracking/admin/sync');
      toast.success('Sipariş sync başlatıldı!');
      setTimeout(fetchData, 3000);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Sync başarısız');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSendCustomerEmails = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Müşterilere Mail Gönder',
      message: 'Tüm müşterilere mail gönderilsin mi?',
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        setIsSendingEmails(true);
        try {
          const res = await apiClient.post('/order-tracking/admin/send-customer-emails');
          toast.success(`${res.data.sentCount} müşteriye mail gönderildi!`);
          fetchData();
        } catch (error: any) {
          toast.error(error.response?.data?.message || 'Mail gönderilemedi');
        } finally {
          setIsSendingEmails(false);
        }
      },
    });
  };

  const handleSendSupplierEmails = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Tedarikçilere Mail Gönder',
      message: 'Tüm tedarikçilere mail gönderilsin mi?',
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        setIsSendingEmails(true);
        try {
          const res = await apiClient.post('/order-tracking/admin/send-supplier-emails');
          toast.success(`${res.data.sentCount} tedarikçiye mail gönderildi!`);
          fetchData();
        } catch (error: any) {
          toast.error(error.response?.data?.message || 'Mail gönderilemedi');
        } finally {
          setIsSendingEmails(false);
        }
      },
    });
  };

  const handleSyncAndSend = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Sync ve Mail Gönder',
      message: 'Sync + Tüm mailleri gönder (müşteri + tedarikçi)?',
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        setIsSyncing(true);
        setIsSendingEmails(true);
        try {
          // 1. Sync
          await apiClient.post('/order-tracking/admin/sync');

          // 2. Müşterilere mail gönder
          const customerRes = await apiClient.post('/order-tracking/admin/send-customer-emails');

          // 3. Tedarikçilere mail gönder
          const supplierRes = await apiClient.post('/order-tracking/admin/send-supplier-emails');

          toast.success(
            `Sync tamamlandı! ${customerRes.data.sentCount} müşteri + ${supplierRes.data.sentCount} tedarikçi = ${
              customerRes.data.sentCount + supplierRes.data.sentCount
            } mail gönderildi`
          );
          fetchData();
        } catch (error: any) {
          toast.error(error.response?.data?.message || 'İşlem başarısız');
        } finally {
          setIsSyncing(false);
          setIsSendingEmails(false);
        }
      },
    });
  };

  const handleSendToCustomer = async (customerCode: string) => {
    const emailOverride = emailOverrides[customerCode]?.trim();

    const message = emailOverride
      ? `${customerCode} kodlu müşterinin siparişleri ${emailOverride} adresine gönderilsin mi?`
      : `${customerCode} kodlu müşteriye mail gönderilsin mi?`;

    setConfirmDialog({
      isOpen: true,
      title: 'Müşteriye Mail Gönder',
      message,
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        setSendingToCustomer(customerCode);
        try {
          const res = await apiClient.post(`/order-tracking/admin/send-email/${customerCode}`, {
            emailOverride: emailOverride || undefined,
          });
          toast.success(res.data.message);
          // Email override'ı temizle
          if (emailOverride) {
            setEmailOverrides((prev) => {
              const updated = { ...prev };
              delete updated[customerCode];
              return updated;
            });
          }
          fetchData();
        } catch (error: any) {
          toast.error(error.response?.data?.message || 'Mail gönderilemedi');
        } finally {
          setSendingToCustomer(null);
        }
      },
    });
  };

  const toggleCustomerExpanded = (customerCode: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(customerCode)) {
      newExpanded.delete(customerCode);
    } else {
      newExpanded.add(customerCode);
    }
    setExpandedCustomers(newExpanded);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Intl.DateTimeFormat('tr-TR').format(new Date(date));
  };

  const formatDateTime = (date: string | null) => {
    if (!date) return '-';
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return '-';
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(value);
  };

  const formatCurrencyPdf = (value: number) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    return `${formatNumber(safeValue)} TL`;
  };

  const formatWarehouseName = (warehouseCode?: string | null) => {
    const code = String(warehouseCode || '').trim();
    if (code === '1') return 'Merkez';
    if (code === '6') return 'Topca';
    return code || '-';
  };

  const getOrderWarehouseCodes = (order: OrderDetail) => {
    return Array.from(
      new Set(
        order.items
          .map((item) => String(item.warehouseCode || '').trim())
          .filter((code) => code.length > 0)
      )
    );
  };

  const getOrderWarehouseLabel = (order: OrderDetail) => {
    const codes = getOrderWarehouseCodes(order);
    if (codes.length === 0) return '-';
    if (codes.length === 1) return formatWarehouseName(codes[0]);
    return `Karma: ${codes.map(formatWarehouseName).join(' / ')}`;
  };

  const getItemStock = (item: OrderItem, warehouseCode: '1' | '6') => {
    const stocks = item.warehouseStocks || { merkez: 0, topca: 0 };
    return warehouseCode === '6' ? stocks.topca || 0 : stocks.merkez || 0;
  };

  const itemCanFulfill = (item: OrderItem, warehouseCode: '1' | '6') => {
    const fulfillment = item.fulfillment;
    if (warehouseCode === '6') return fulfillment?.topcaCanFulfill ?? getItemStock(item, '6') >= item.remainingQty;
    return fulfillment?.merkezCanFulfill ?? getItemStock(item, '1') >= item.remainingQty;
  };

  const itemHasPreferredWarehouseRisk = (item: OrderItem) => {
    if (item.remainingQty <= 0) return false;
    if (item.fulfillment) {
      return !item.fulfillment.preferredCanFulfill || item.fulfillment.hasAggregateRisk;
    }
    const warehouseCode = String(item.warehouseCode || '').trim();
    if (warehouseCode === '6') return !itemCanFulfill(item, '6');
    return !itemCanFulfill(item, '1');
  };

  const customerHasUnfulfilled = (customer: CustomerSummary, warehouseCode?: '1' | '6') =>
    customer.orders.some((order) =>
      order.items.some((item) => {
        if (item.remainingQty <= 0) return false;
        if (warehouseCode) return !itemCanFulfill(item, warehouseCode);
        return itemHasPreferredWarehouseRisk(item);
      })
    );

  const customerMatchesWarehouseFilter = (customer: CustomerSummary) => {
    if (customerWarehouseFilter === 'ALL') return true;
    return customer.orders.some((order) =>
      order.items.some((item) => String(item.warehouseCode || '').trim() === customerWarehouseFilter)
    );
  };

  const customerMatchesFulfillmentFilter = (customer: CustomerSummary) => {
    if (customerFulfillmentFilter === 'ALL') return true;
    if (customerFulfillmentFilter === 'MERKEZ_UNFULFILLED') return customerHasUnfulfilled(customer, '1');
    if (customerFulfillmentFilter === 'TOPCA_UNFULFILLED') return customerHasUnfulfilled(customer, '6');
    return customerHasUnfulfilled(customer);
  };

  const getFulfillmentBadgeClass = (canFulfill: boolean, highlighted: boolean) => {
    if (canFulfill) {
      return highlighted
        ? 'bg-green-600 text-white border-green-700'
        : 'bg-green-50 text-green-700 border-green-200';
    }
    return highlighted
      ? 'bg-red-600 text-white border-red-700'
      : 'bg-red-50 text-red-700 border-red-200';
  };

  const getFulfillmentText = (canFulfill: boolean) => (canFulfill ? 'Karsilar' : 'Yetmez');

  const getWarehouseBreakdown = (orders: OrderDetail[]) => {
    const breakdown = {
      merkezOrders: 0,
      merkezItems: 0,
      topcaOrders: 0,
      topcaItems: 0,
      otherOrders: 0,
      otherItems: 0,
    };

    orders.forEach((order) => {
      const orderWarehouses = new Set<string>();
      order.items.forEach((item) => {
        if (item.remainingQty <= 0) return;
        const code = String(item.warehouseCode || '').trim();
        orderWarehouses.add(code || 'OTHER');
        if (code === '1') {
          breakdown.merkezItems += 1;
        } else if (code === '6') {
          breakdown.topcaItems += 1;
        } else {
          breakdown.otherItems += 1;
        }
      });

      if (orderWarehouses.has('1')) breakdown.merkezOrders += 1;
      if (orderWarehouses.has('6')) breakdown.topcaOrders += 1;
      if (Array.from(orderWarehouses).some((code) => code !== '1' && code !== '6')) {
        breakdown.otherOrders += 1;
      }
    });

    return breakdown;
  };

  const cleanPdfText = (value: string) => {
    return value
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'I')
      .replace(/ğ/g, 'g')
      .replace(/Ğ/g, 'G')
      .replace(/ş/g, 's')
      .replace(/Ş/g, 'S')
      .replace(/ü/g, 'u')
      .replace(/Ü/g, 'U')
      .replace(/ö/g, 'o')
      .replace(/Ö/g, 'O')
      .replace(/ç/g, 'c')
      .replace(/Ç/g, 'C');
  };

  const buildSupplierPdfItems = (supplier: CustomerSummary): SupplierPdfItem[] => {
    const itemMap = new Map<string, SupplierPdfItem>();

    supplier.orders.forEach((order) => {
      const orderDateRaw = order.orderDate || '';
      const orderDateTs = Number.isFinite(new Date(orderDateRaw).getTime())
        ? new Date(orderDateRaw).getTime()
        : Number.POSITIVE_INFINITY;

      order.items.forEach((item) => {
        if (item.remainingQty <= 0) return;
        const warehouseCode = String(item.warehouseCode || '').trim() || null;
        const key = `${item.productCode}||${item.unit}||${warehouseCode || '-'}`;
        const lineTotal = Number.isFinite(item.lineTotal)
          ? item.lineTotal
          : item.remainingQty * item.unitPrice;
        const existing = itemMap.get(key);
        if (existing) {
          existing.totalQty += item.remainingQty;
          existing.totalAmount += lineTotal;
          existing.unitPrice = existing.totalQty > 0 ? existing.totalAmount / existing.totalQty : existing.unitPrice;
          if (!existing.orderRefs.some((ref) => ref.orderNumber === order.mikroOrderNumber)) {
            existing.orderRefs.push({
              orderNumber: order.mikroOrderNumber,
              orderDate: orderDateRaw,
              orderDateTs,
            });
          }
          return;
        }

        const unitPrice = item.remainingQty > 0 ? lineTotal / item.remainingQty : item.unitPrice;
        itemMap.set(key, {
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          warehouseCode,
          totalQty: item.remainingQty,
          totalAmount: lineTotal,
          unitPrice,
          orderRefs: [
            {
              orderNumber: order.mikroOrderNumber,
              orderDate: orderDateRaw,
              orderDateTs,
            },
          ],
        });
      });
    });

    const items = Array.from(itemMap.values());
    items.forEach((item) => {
      item.orderRefs.sort((a, b) => {
        if (a.orderDateTs !== b.orderDateTs) return a.orderDateTs - b.orderDateTs;
        return a.orderNumber.localeCompare(b.orderNumber, 'tr');
      });
    });

    return items.sort((a, b) => {
      const minDateA = a.orderRefs.length > 0 ? a.orderRefs[0].orderDateTs : Number.POSITIVE_INFINITY;
      const minDateB = b.orderRefs.length > 0 ? b.orderRefs[0].orderDateTs : Number.POSITIVE_INFINITY;
      if (minDateA !== minDateB) return minDateA - minDateB;
      const nameCompare = a.productName.localeCompare(b.productName, 'tr');
      if (nameCompare !== 0) return nameCompare;
      return a.productCode.localeCompare(b.productCode, 'tr');
    });
  };

  const supplierHasPendingItems = (supplier: CustomerSummary) =>
    supplier.orders.some((order) => order.items.some((item) => item.remainingQty > 0));

  const customerHasPendingItems = (customer: CustomerSummary) =>
    customer.orders.some((order) => order.items.some((item) => item.remainingQty > 0));

  const toggleCustomerSelection = (customerCode: string, selected: boolean) => {
    const code = String(customerCode || '').trim();
    if (!code) return;
    setSelectedCustomerCodes((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  };

  const setVisibleCustomerSelection = (customers: CustomerSummary[], selected: boolean) => {
    setSelectedCustomerCodes((prev) => {
      const next = new Set(prev);
      customers.forEach((customer) => {
        if (!customerHasPendingItems(customer)) return;
        if (selected) {
          next.add(customer.customerCode);
        } else {
          next.delete(customer.customerCode);
        }
      });
      return next;
    });
  };

  const toggleSupplierSelection = (supplierCode: string, selected: boolean) => {
    const code = String(supplierCode || '').trim();
    if (!code) return;
    setSelectedSupplierCodes((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  };

  const setVisibleSupplierSelection = (suppliers: CustomerSummary[], selected: boolean) => {
    setSelectedSupplierCodes((prev) => {
      const next = new Set(prev);
      suppliers.forEach((supplier) => {
        if (!supplierHasPendingItems(supplier)) return;
        if (selected) {
          next.add(supplier.customerCode);
        } else {
          next.delete(supplier.customerCode);
        }
      });
      return next;
    });
  };

  const collectSupplierOrderNumbers = (supplier: CustomerSummary) => {
    const seen = new Set<string>();
    return supplier.orders
      .filter((order) => order.items.some((item) => item.remainingQty > 0))
      .map((order) => {
        const orderNumber = String(order.mikroOrderNumber || '').trim();
        const orderDateRaw = order.orderDate || '';
        const orderDateTs = Number.isFinite(new Date(orderDateRaw).getTime())
          ? new Date(orderDateRaw).getTime()
          : Number.POSITIVE_INFINITY;
        return {
          key: `${orderNumber}||${orderDateRaw}`,
          orderNumber,
          orderDateText: formatDate(orderDateRaw || null),
          orderDateTs,
        };
      })
      .filter((order) => {
        if (!order.orderNumber || seen.has(order.key)) return false;
        seen.add(order.key);
        return true;
      })
      .sort((a, b) => {
        if (a.orderDateTs !== b.orderDateTs) return a.orderDateTs - b.orderDateTs;
        return a.orderNumber.localeCompare(b.orderNumber, 'tr');
      })
      .map((order) => `${order.orderNumber} (${order.orderDateText})`)
      .join(', ');
  };

  const buildCustomerPdf = async (customers: CustomerSummary[], filePrefix: string) => {
    const { default: jsPDF } = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
    if (typeof autoTable !== 'function') {
      throw new Error('autoTable is not available');
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 10;
    const today = new Date().toLocaleString('tr-TR');
    let isFirstCustomer = true;

    customers.forEach((customer) => {
      if (!isFirstCustomer) {
        doc.addPage();
      }
      isFirstCustomer = false;

      const riskItems = customer.orders.flatMap((order) =>
        order.items
          .filter((item) => item.remainingQty > 0)
          .filter((item) => itemHasPreferredWarehouseRisk(item))
          .map((item) => ({
            order,
            item,
          }))
      );

      doc.setFillColor(239, 246, 255);
      doc.rect(0, 0, pageWidth, 24, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text(cleanPdfText('Musteri Bekleyen Siparisleri'), marginX, 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(cleanPdfText(`Olusturma: ${today}`), pageWidth - marginX, 10, { align: 'right' });
      doc.text(cleanPdfText(`${customer.customerCode} - ${customer.customerName}`), marginX, 17);
      doc.text(cleanPdfText(`Toplam: ${formatCurrencyPdf(customer.totalAmount)} | Siparis: ${customer.ordersCount} | Riskli satir: ${riskItems.length}`), pageWidth - marginX, 17, { align: 'right' });

      let startY = 30;
      customer.orders.forEach((order) => {
        if (startY > 175) {
          doc.addPage();
          startY = 14;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(
          cleanPdfText(
            `${order.mikroOrderNumber} | Depo: ${getOrderWarehouseLabel(order)} | Tarih: ${formatDate(order.orderDate)} | Tutar: ${formatCurrencyPdf(order.grandTotal)}`
          ),
          marginX,
          startY
        );

        autoTable(doc, {
          startY: startY + 4,
          head: [[
            'Urun',
            'Depo',
            'Siparis',
            'Kalan',
            'Merkez Stok',
            'Topca Stok',
            'Merkez',
            'Topca',
            'Risk',
            'Kalan Tutar',
          ].map(cleanPdfText)],
          body: order.items.map((item) => {
            const preferredWarehouse = String(item.warehouseCode || '').trim();
            const riskText = item.fulfillment?.hasAggregateRisk
              ? `Toplam talep riski (${formatNumber(item.fulfillment.preferredAfterTotalDemand)})`
              : '-';
            return [
              cleanPdfText(`${item.productName}\n${item.productCode}`),
              cleanPdfText(formatWarehouseName(item.warehouseCode)),
              cleanPdfText(`${formatNumber(item.quantity)} ${item.unit}`),
              cleanPdfText(formatNumber(item.remainingQty)),
              cleanPdfText(formatNumber(getItemStock(item, '1'))),
              cleanPdfText(formatNumber(getItemStock(item, '6'))),
              cleanPdfText(`${preferredWarehouse === '1' ? '* ' : ''}${getFulfillmentText(itemCanFulfill(item, '1'))}`),
              cleanPdfText(`${preferredWarehouse === '6' ? '* ' : ''}${getFulfillmentText(itemCanFulfill(item, '6'))}`),
              cleanPdfText(riskText),
              cleanPdfText(formatCurrencyPdf(item.lineTotal)),
            ];
          }),
          theme: 'striped',
          styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
          headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontSize: 7 },
          margin: { left: marginX, right: marginX },
          columnStyles: {
            0: { cellWidth: 54 },
            1: { cellWidth: 18, halign: 'center' },
            2: { cellWidth: 22, halign: 'right' },
            3: { cellWidth: 18, halign: 'right' },
            4: { cellWidth: 20, halign: 'right' },
            5: { cellWidth: 20, halign: 'right' },
            6: { cellWidth: 18, halign: 'center' },
            7: { cellWidth: 18, halign: 'center' },
            8: { cellWidth: 50 },
            9: { cellWidth: 24, halign: 'right' },
          },
        });

        startY = ((doc as any).lastAutoTable?.finalY || startY + 12) + 7;
      });

      if (riskItems.length > 0) {
        if (startY > 150) {
          doc.addPage();
          startY = 14;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(185, 28, 28);
        doc.text(cleanPdfText('Eksik / Riskli Urunler'), marginX, startY);
        autoTable(doc, {
          startY: startY + 4,
          head: [['Siparis', 'Urun', 'Depo', 'Kalan', 'Merkez Stok', 'Topca Stok', 'Risk'].map(cleanPdfText)],
          body: riskItems.map(({ order, item }) => [
            cleanPdfText(order.mikroOrderNumber),
            cleanPdfText(`${item.productName}\n${item.productCode}`),
            cleanPdfText(formatWarehouseName(item.warehouseCode)),
            cleanPdfText(formatNumber(item.remainingQty)),
            cleanPdfText(formatNumber(getItemStock(item, '1'))),
            cleanPdfText(formatNumber(getItemStock(item, '6'))),
            cleanPdfText(
              item.fulfillment?.hasAggregateRisk
                ? `Toplam talep stoktan fazla. Kalan: ${formatNumber(item.fulfillment.preferredAfterTotalDemand)}`
                : 'Satir bazinda stok yetersiz'
            ),
          ]),
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
          headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255] },
          margin: { left: marginX, right: marginX },
          columnStyles: {
            1: { cellWidth: 72 },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { cellWidth: 70 },
          },
        });
      }
    });

    const safePrefix = filePrefix.replace(/[^a-zA-Z0-9-_]/g, '_');
    doc.save(`${safePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const buildCustomerStatementPdf = async (customers: CustomerSummary[], filePrefix: string) => {
    const { default: jsPDF } = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
    if (typeof autoTable !== 'function') {
      throw new Error('autoTable is not available');
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 12;
    let isFirstCustomer = true;

    customers.forEach((customer) => {
      if (!isFirstCustomer) {
        doc.addPage();
      }
      isFirstCustomer = false;

      doc.setFillColor(239, 246, 255);
      doc.rect(0, 0, pageWidth, 28, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text(cleanPdfText('Bakircilar Ambalaj Siparis Bakiyesi'), marginX, 11);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(cleanPdfText(`Musteri: ${customer.customerName}`), marginX, 18);
      doc.text(cleanPdfText(`Kod: ${customer.customerCode}`), marginX, 23);
      doc.text(cleanPdfText(`Olusturma: ${new Date().toLocaleString('tr-TR')}`), pageWidth - marginX, 18, { align: 'right' });

      let startY = 34;
      customer.orders.forEach((order) => {
        if (startY > 245) {
          doc.addPage();
          startY = 14;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(
          cleanPdfText(
            `Siparis No: ${order.mikroOrderNumber} | Tarih: ${formatDate(order.orderDate)} | Teslimat: ${formatDate(order.deliveryDate)}`
          ),
          marginX,
          startY
        );

        autoTable(doc, {
          startY: startY + 4,
          head: [['Urun', 'Siparis', 'Teslim', 'Kalan', 'Birim', 'Birim Fiyat', 'Kalan Tutar'].map(cleanPdfText)],
          body: order.items.map((item) => [
            cleanPdfText(`${item.productName}\n${item.productCode}`),
            cleanPdfText(formatNumber(item.quantity)),
            cleanPdfText(formatNumber(item.deliveredQty)),
            cleanPdfText(formatNumber(item.remainingQty)),
            cleanPdfText(item.unit),
            cleanPdfText(formatCurrencyPdf(item.unitPrice)),
            cleanPdfText(formatCurrencyPdf(item.lineTotal)),
          ]),
          theme: 'striped',
          styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak' },
          headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontSize: 7.5 },
          margin: { left: marginX, right: marginX },
          columnStyles: {
            0: { cellWidth: 58 },
            1: { halign: 'right', cellWidth: 18 },
            2: { halign: 'right', cellWidth: 18 },
            3: { halign: 'right', cellWidth: 18 },
            4: { halign: 'center', cellWidth: 16 },
            5: { halign: 'right', cellWidth: 28 },
            6: { halign: 'right', cellWidth: 28 },
          },
        });

        startY = ((doc as any).lastAutoTable?.finalY || startY + 12) + 7;
      });

      if (startY > 260) {
        doc.addPage();
        startY = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(37, 99, 235);
      doc.text(cleanPdfText(`Toplam Bakiye: ${formatCurrencyPdf(customer.totalAmount)}`), pageWidth - marginX, startY, {
        align: 'right',
      });
    });

    const safePrefix = filePrefix.replace(/[^a-zA-Z0-9-_]/g, '_');
    doc.save(`${safePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleDownloadCustomerPdf = async (customer: CustomerSummary) => {
    if (downloadingCustomerPdf || downloadingSelectedCustomers) return;
    setDownloadingCustomerPdf(customer.customerCode);
    try {
      await buildCustomerPdf([customer], `musteri_${customer.customerCode}_bekleyen_siparis`);
    } catch (error) {
      console.error('Musteri PDF indirilemedi:', error);
      toast.error('Musteri PDF indirilemedi.');
    } finally {
      setDownloadingCustomerPdf(null);
    }
  };

  const handleDownloadCustomerStatementPdf = async (customer: CustomerSummary) => {
    if (downloadingCustomerStatementPdf || downloadingSelectedCustomerStatements) return;
    setDownloadingCustomerStatementPdf(customer.customerCode);
    try {
      await buildCustomerStatementPdf([customer], `musteri_${customer.customerCode}_siparis_bakiyesi`);
    } catch (error) {
      console.error('Musteri bakiye PDF indirilemedi:', error);
      toast.error('Musteri bakiye PDF indirilemedi.');
    } finally {
      setDownloadingCustomerStatementPdf(null);
    }
  };

  const handleDownloadSelectedCustomersPdf = async (customers: CustomerSummary[]) => {
    if (downloadingCustomerPdf || downloadingSelectedCustomers) return;
    const selectedCustomers = customers.filter(
      (customer) => selectedCustomerCodes.has(customer.customerCode) && customerHasPendingItems(customer)
    );
    if (selectedCustomers.length === 0) {
      toast.error('Indirmek icin en az bir musteri secin.');
      return;
    }

    setDownloadingSelectedCustomers(true);
    try {
      await buildCustomerPdf(selectedCustomers, 'secili_musteriler_bekleyen_siparis');
    } catch (error) {
      console.error('Secili musteri PDF indirilemedi:', error);
      toast.error('Secili musteri PDF indirilemedi.');
    } finally {
      setDownloadingSelectedCustomers(false);
    }
  };

  const handleDownloadSelectedCustomerStatementsPdf = async (customers: CustomerSummary[]) => {
    if (downloadingCustomerStatementPdf || downloadingSelectedCustomerStatements) return;
    const selectedCustomers = customers.filter(
      (customer) => selectedCustomerCodes.has(customer.customerCode) && customerHasPendingItems(customer)
    );
    if (selectedCustomers.length === 0) {
      toast.error('Indirmek icin en az bir musteri secin.');
      return;
    }

    setDownloadingSelectedCustomerStatements(true);
    try {
      await buildCustomerStatementPdf(selectedCustomers, 'secili_musteriler_siparis_bakiyesi');
    } catch (error) {
      console.error('Secili musteri bakiye PDF indirilemedi:', error);
      toast.error('Secili musteri bakiye PDF indirilemedi.');
    } finally {
      setDownloadingSelectedCustomerStatements(false);
    }
  };

  const handleDownloadSelectedSuppliersApprovalPdf = async (suppliers: CustomerSummary[]) => {
    if (downloadingSelectedSuppliers || downloadingSupplier || downloadingSupplierExcel) return;
    const selectedSuppliers = suppliers.filter(
      (supplier) => selectedSupplierCodes.has(supplier.customerCode) && supplierHasPendingItems(supplier)
    );
    if (selectedSuppliers.length === 0) {
      toast.error('Indirmek icin en az bir tedarikci secin.');
      return;
    }

    setDownloadingSelectedSuppliers(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
      if (typeof autoTable !== 'function') {
        throw new Error('autoTable is not available');
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const writeHeader = (subTitle: string) => {
        doc.setFillColor(240, 253, 250);
        doc.rect(0, 0, pageWidth, 26, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(13, 148, 136);
        doc.text(cleanPdfText('Toplu Siparis Yonetici Onay Ozeti'), 12, 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(cleanPdfText(subTitle), 12, 17);
        doc.text(cleanPdfText(new Date().toLocaleString('tr-TR')), pageWidth - 12, 17, { align: 'right' });
      };

      writeHeader('Cari bazinda bekleyen tedarikci siparis ve tutar listesi');
      const supplierRows = selectedSuppliers
        .map((supplier) => {
          const items = buildSupplierPdfItems(supplier);
          const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
          const oldestOrderDateTs = items.reduce((oldest, item) => {
            const firstOrderTs = item.orderRefs[0]?.orderDateTs ?? Number.POSITIVE_INFINITY;
            return Math.min(oldest, firstOrderTs);
          }, Number.POSITIVE_INFINITY);
          return {
            supplier,
            items,
            orderRefsText: collectSupplierOrderNumbers(supplier),
            totalAmount,
            oldestOrderDateTs,
          };
        })
        .sort((a, b) => {
          if (a.oldestOrderDateTs !== b.oldestOrderDateTs) {
            return a.oldestOrderDateTs - b.oldestOrderDateTs;
          }
          const nameCompare = a.supplier.customerName.localeCompare(b.supplier.customerName, 'tr');
          if (nameCompare !== 0) return nameCompare;
          return a.supplier.customerCode.localeCompare(b.supplier.customerCode, 'tr');
        });
      const grandTotal = supplierRows.reduce((sum, row) => sum + row.totalAmount, 0);

      autoTable(doc, {
        startY: 30,
        head: [['Cari Kodu', 'Cari Unvan', 'Siparis No / Tarih', 'Kalem', 'Tutar (TL)'].map(cleanPdfText)],
        body: supplierRows.map((row) => [
          cleanPdfText(row.supplier.customerCode),
          cleanPdfText(row.supplier.customerName),
          cleanPdfText(row.orderRefsText || '-'),
          cleanPdfText(row.items.length.toLocaleString('tr-TR')),
          cleanPdfText(formatCurrencyPdf(row.totalAmount)),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: { 3: { halign: 'right', cellWidth: 16 }, 4: { halign: 'right', cellWidth: 30 } },
      });

      let startY = ((doc as any).lastAutoTable?.finalY || 36) + 8;
      supplierRows.forEach((row, index) => {
        if (startY > 250) {
          doc.addPage();
          startY = 16;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        const titleLines = doc.splitTextToSize(
          cleanPdfText(`${index + 1}) ${row.supplier.customerCode} - ${row.supplier.customerName} | ${row.orderRefsText || '-'}`),
          pageWidth - 24
        ) as string[];
        doc.text(titleLines, 12, startY);
        autoTable(doc, {
          startY: startY + titleLines.length * 4 + 2,
          head: [['Stok', 'Urun', 'Depo', 'Miktar', 'Birim Fiyat', 'Tutar'].map(cleanPdfText)],
          body: row.items.map((item) => [
            cleanPdfText(item.productCode),
            cleanPdfText(item.productName),
            cleanPdfText(formatWarehouseName(item.warehouseCode)),
            cleanPdfText(item.totalQty.toLocaleString('tr-TR')),
            cleanPdfText(formatCurrencyPdf(item.unitPrice)),
            cleanPdfText(formatCurrencyPdf(item.totalAmount)),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [55, 65, 81], textColor: [255, 255, 255], fontSize: 8 },
          styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak' },
          margin: { left: 12, right: 12 },
          columnStyles: {
            2: { halign: 'center', cellWidth: 18 },
            3: { halign: 'right', cellWidth: 16 },
            4: { halign: 'right', cellWidth: 24 },
            5: { halign: 'right', cellWidth: 24 },
          },
        });
        startY = ((doc as any).lastAutoTable?.finalY || startY + 12) + 6;
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(
        cleanPdfText(`Genel Toplam: ${formatCurrencyPdf(grandTotal)}`),
        pageWidth - 12,
        Math.min(288, startY + 4),
        { align: 'right' }
      );
      doc.save(`tedarikci-yonetici-onay-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Secili tedarikci PDF indirilemedi:', error);
      toast.error('Secili tedarikci PDF indirilemedi.');
    } finally {
      setDownloadingSelectedSuppliers(false);
    }
  };

  const handleDownloadSupplierPdf = async (supplier: CustomerSummary) => {
    if (downloadingSupplier || downloadingSupplierExcel) return;
    setDownloadingSupplier(supplier.customerCode);

    try {
      const items = buildSupplierPdfItems(supplier);
      if (items.length === 0) {
        toast.error('Bekleyen urun yok.');
        return;
      }

      const { default: jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = (autoTableModule as any).default || (autoTableModule as any).autoTable;
      if (typeof autoTable !== 'function') {
        throw new Error('autoTable is not available');
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;
      const headerHeight = 26;
      const colors = {
        primary: [234, 88, 12] as const,
        dark: [15, 23, 42] as const,
        muted: [71, 85, 105] as const,
        light: [255, 247, 237] as const,
        border: [254, 215, 170] as const,
      };

      doc.setFillColor(...colors.light);
      doc.rect(0, 0, pageWidth, headerHeight, 'F');

      doc.setFontSize(16);
      doc.setTextColor(...colors.primary);
      doc.text('BEKLEYEN SIPARISLER', marginX, 17);

      doc.setFontSize(9);
      doc.setTextColor(...colors.muted);
      doc.text(`Olusturma: ${formatDate(new Date().toISOString())}`, pageWidth - marginX, 17, { align: 'right' });

      const infoTop = headerHeight + 6;
      const boxWidth = pageWidth - marginX * 2;
      const boxHeight = 22;

      const writeLines = (lines: string[], x: number, startY: number, width: number) => {
        const lineGap = 4;
        let currentY = startY;
        lines.forEach((line) => {
          const wrapped = doc.splitTextToSize(cleanPdfText(line), width) as string[];
          wrapped.forEach((chunk) => {
            doc.text(chunk, x, currentY);
            currentY += lineGap;
          });
        });
      };

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...colors.border);
      doc.roundedRect(marginX, infoTop, boxWidth, boxHeight, 2, 2, 'F');

      doc.setFontSize(8);
      doc.setTextColor(...colors.muted);
      doc.text('TEDARIKCI', marginX + 4, infoTop + 6);

      doc.setFontSize(9);
      doc.setTextColor(...colors.dark);
      writeLines(
        [
          `Tedarikci: ${supplier.customerName}`,
          `Kod: ${supplier.customerCode}`,
          `Email: ${supplier.customerEmail || '-'}`,
        ],
        marginX + 4,
        infoTop + 11,
        boxWidth - 8
      );

      const tableStartY = infoTop + boxHeight + 10;
      const rows = items.map((item) => {
        const ordersText = item.orderRefs.length
          ? `Siparis: ${item.orderRefs
              .map((ref) => `${ref.orderNumber} (${formatDate(ref.orderDate)})`)
              .join(', ')}`
          : '';
        const productText = [item.productName, item.productCode, ordersText]
          .filter(Boolean)
          .map((value) => cleanPdfText(String(value)))
          .join('\n');
        return [
          productText,
          formatWarehouseName(item.warehouseCode),
          formatNumber(item.totalQty),
          item.unit,
          formatCurrencyPdf(item.unitPrice),
          formatCurrencyPdf(item.totalAmount),
        ];
      });

      autoTable(doc, {
        startY: tableStartY,
        head: [['Urun / Siparisler', 'Depo', 'Kalan Miktar', 'Birim', 'Birim Fiyat', 'Kalan Tutar']],
        body: rows,
        styles: {
          fontSize: 8,
          textColor: colors.dark,
          cellPadding: 2,
          valign: 'middle',
        },
        headStyles: {
          fillColor: colors.primary,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [255, 251, 235],
        },
        columnStyles: {
          0: { cellWidth: 58, overflow: 'linebreak' },
          1: { halign: 'center', cellWidth: 18 },
          2: { halign: 'right', cellWidth: 22 },
          3: { halign: 'center', cellWidth: 14 },
          4: { halign: 'right', cellWidth: 35 },
          5: { halign: 'right', cellWidth: 35 },
        },
      });

      const safeCode = supplier.customerCode.replace(/[^a-zA-Z0-9-_]/g, '_');
      const dateStamp = new Date().toISOString().slice(0, 10);
      doc.save(`supplier_${safeCode}_pending_${dateStamp}.pdf`);
    } catch (error) {
      console.error('Supplier PDF indirilemedi:', error);
      toast.error('PDF indirilemedi.');
    } finally {
      setDownloadingSupplier(null);
    }
  };

  const handleDownloadSupplierExcel = async (supplier: CustomerSummary) => {
    if (downloadingSupplier || downloadingSupplierExcel) return;
    setDownloadingSupplierExcel(supplier.customerCode);

    try {
      const items = buildSupplierPdfItems(supplier);
      if (items.length === 0) {
        toast.error('Bekleyen urun yok.');
        return;
      }

      const XLSX = await import('xlsx');
      const rows: Array<Array<string | number>> = [
        [
          'Urun Kodu',
          'Urun Adi',
          'Depo',
          'Kalan Miktar',
          'Birim',
          'Birim Fiyat (TL)',
          'Kalan Tutar (TL)',
          'Siparis Nolari / Tarihleri',
        ],
      ];

      items.forEach((item) => {
        const orderRefs = item.orderRefs
          .map((ref) => `${ref.orderNumber} (${formatDate(ref.orderDate)})`)
          .join(', ');

        rows.push([
          item.productCode,
          item.productName,
          formatWarehouseName(item.warehouseCode),
          Number(item.totalQty.toFixed(2)),
          item.unit,
          Number(item.unitPrice.toFixed(2)),
          Number(item.totalAmount.toFixed(2)),
          orderRefs,
        ]);
      });

      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Bekleyen Siparisler');

      const safeCode = supplier.customerCode.replace(/[^a-zA-Z0-9-_]/g, '_');
      const dateStamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `supplier_${safeCode}_pending_${dateStamp}.xlsx`);
    } catch (error) {
      console.error('Supplier Excel indirilemedi:', error);
      toast.error('Excel indirilemedi.');
    } finally {
      setDownloadingSupplierExcel(null);
    }
  };

  const handleMarkSupplierTransmitted = async (supplier: CustomerSummary) => {
    if (!supplier.customerCode || markingSupplierTransmission) return;
    setMarkingSupplierTransmission(supplier.customerCode);
    try {
      const response = await apiClient.post(
        `/order-tracking/admin/supplier-transmissions/${encodeURIComponent(supplier.customerCode)}`,
        { customerName: supplier.customerName }
      );

      const transmittedAt = response?.data?.transmittedAt
        ? String(response.data.transmittedAt)
        : new Date().toISOString();
      const transmittedByName = response?.data?.transmittedByName
        ? String(response.data.transmittedByName)
        : null;

      setSupplierSummary((prev) =>
        prev.map((row) =>
          row.customerCode === supplier.customerCode
            ? {
                ...row,
                lastTransmittedAt: transmittedAt,
                lastTransmittedByName: transmittedByName,
              }
            : row
        )
      );

      toast.success('Tedarikci iletildi olarak isaretlendi.');
    } catch (error: any) {
      console.error('Tedarikci iletim isaretleme hatasi:', error);
      toast.error(error?.response?.data?.error || 'Iletim isaretlenemedi.');
    } finally {
      setMarkingSupplierTransmission(null);
    }
  };


  // Cron schedule'ı kullanıcı dostu formatta göster
  const formatSchedule = (cronString: string) => {
    const { hour, days } = parseCronSchedule(cronString);
    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const selectedDays = days.map((d) => dayNames[d]).join(', ');
    return `${selectedDays} - Saat ${hour.toString().padStart(2, '0')}:00`;
  };

  // --- Turetilmis degerler (eski page.tsx'teki `return (` oncesi hesaplamalar) ---
  // NOT: Erken donus kosulu (!user || isLoading) gorsel oldugu icin Classic/New icinde
  //      render edilir; burada turetilmis degerler her zaman guvenli sekilde hesaplanir.

  const customerAmount = customerSummary.reduce((sum, c) => sum + c.totalAmount, 0);
  const supplierAmount = supplierSummary.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalAmount = customerAmount + supplierAmount;

  const isSupplierTab = activeTab === 'suppliers';
  const supplierCities = Array.from(
    new Set(
      supplierSummary
        .map((supplier) => (supplier.city || '').trim())
        .filter((city) => city.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));

  const filteredCustomerSummary = customerSummary.filter(
    (customer) => customerMatchesWarehouseFilter(customer) && customerMatchesFulfillmentFilter(customer)
  );

  const filteredSupplierSummary = supplierSummary
    .filter((supplier) => {
      if (supplierCityFilter === 'ALL') return true;
      return (supplier.city || '').trim() === supplierCityFilter;
    })
    .sort((a, b) => {
      if (supplierCitySort === 'none') return 0;

      const cityA = (a.city || '').trim();
      const cityB = (b.city || '').trim();
      const cityCompare = cityA.localeCompare(cityB, 'tr', { sensitivity: 'base' });
      if (cityCompare !== 0) {
        return supplierCitySort === 'asc' ? cityCompare : -cityCompare;
      }

      return a.customerName.localeCompare(b.customerName, 'tr', { sensitivity: 'base' });
    });

  const currentSummary = isSupplierTab ? filteredSupplierSummary : filteredCustomerSummary;
  const currentAmount = currentSummary.reduce((sum, item) => sum + item.totalAmount, 0);
  const visibleSelectableCustomers = filteredCustomerSummary.filter(customerHasPendingItems);
  const selectedVisibleCustomerCount = visibleSelectableCustomers.filter((customer) =>
    selectedCustomerCodes.has(customer.customerCode)
  ).length;
  const visibleSelectableSuppliers = filteredSupplierSummary.filter(supplierHasPendingItems);
  const selectedVisibleSupplierCount = visibleSelectableSuppliers.filter((supplier) =>
    selectedSupplierCodes.has(supplier.customerCode)
  ).length;

  return {
    // router & auth & permissions
    router,
    user,
    permissionsLoading,
    hasPermission,
    // state
    settings,
    orders,
    customerSummary,
    supplierSummary,
    customerWarehouseFilter,
    setCustomerWarehouseFilter,
    customerFulfillmentFilter,
    setCustomerFulfillmentFilter,
    supplierCityFilter,
    setSupplierCityFilter,
    supplierCitySort,
    setSupplierCitySort,
    activeTab,
    setActiveTab,
    isLoading,
    isSyncing,
    isSendingEmails,
    sendingToCustomer,
    downloadingSupplier,
    downloadingCustomerStatementPdf,
    downloadingCustomerPdf,
    downloadingSupplierExcel,
    downloadingSelectedCustomerStatements,
    downloadingSelectedCustomers,
    downloadingSelectedSuppliers,
    selectedCustomerCodes,
    selectedSupplierCodes,
    markingSupplierTransmission,
    expandedCustomers,
    emailOverrides,
    setEmailOverrides,
    showSettingsModal,
    setShowSettingsModal,
    settingsForm,
    setSettingsForm,
    confirmDialog,
    setConfirmDialog,
    // handlers
    handleSaveSettings,
    handleSync,
    handleSendCustomerEmails,
    handleSendSupplierEmails,
    handleSyncAndSend,
    handleSendToCustomer,
    toggleCustomerExpanded,
    toggleCustomerSelection,
    setVisibleCustomerSelection,
    toggleSupplierSelection,
    setVisibleSupplierSelection,
    handleDownloadCustomerPdf,
    handleDownloadCustomerStatementPdf,
    handleDownloadSelectedCustomersPdf,
    handleDownloadSelectedCustomerStatementsPdf,
    handleDownloadSelectedSuppliersApprovalPdf,
    handleDownloadSupplierPdf,
    handleDownloadSupplierExcel,
    handleMarkSupplierTransmitted,
    // formatters & helpers (JSX'te kullanilanlar)
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNumber,
    formatWarehouseName,
    getOrderWarehouseLabel,
    getItemStock,
    itemCanFulfill,
    getFulfillmentBadgeClass,
    getFulfillmentText,
    getWarehouseBreakdown,
    supplierHasPendingItems,
    customerHasPendingItems,
    formatSchedule,
    // turetilmis degerler
    customerAmount,
    supplierAmount,
    totalAmount,
    isSupplierTab,
    supplierCities,
    filteredCustomerSummary,
    filteredSupplierSummary,
    currentSummary,
    currentAmount,
    visibleSelectableCustomers,
    selectedVisibleCustomerCount,
    visibleSelectableSuppliers,
    selectedVisibleSupplierCount,
  };
}

export default useSiparisTakip;
