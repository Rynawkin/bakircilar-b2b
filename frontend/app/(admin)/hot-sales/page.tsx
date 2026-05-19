'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Search, Truck, ShoppingCart, PackagePlus, ClipboardCheck, Settings, Plus, X } from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils/format';

type TabKey = 'sale' | 'load' | 'orders' | 'close' | 'manage';
type SaleType = 'CASH_INVOICE' | 'INVOICED_DISPATCH' | 'ORDER';
type PaymentType = 'CASH' | 'CARD' | 'TRANSFER' | 'OPEN_ACCOUNT' | 'MIXED';

type CartItem = {
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
};

type NewCustomerForm = {
  customerName: string;
  phone: string;
  taxOffice: string;
  taxNumber: string;
  email: string;
  city: string;
  district: string;
  address: string;
};

const WAREHOUSE_OPTIONS = [
  { value: '1', label: 'Merkez' },
  { value: '6', label: 'Topca' },
];

const priceLabel = (listNo: number) => {
  if (listNo <= 5) return `Perakende ${listNo}`;
  return `Toptan ${listNo - 5}`;
};

const n = (value: any) => Number(value || 0);
const fmtQty = (value: any) => Number(n(value).toFixed(3)).toString();
const fmtDate = (value: any) => (value ? new Date(value).toLocaleDateString('tr-TR') : '-');
const warehouseLabel = (value: any) => WAREHOUSE_OPTIONS.find((item) => item.value === String(value))?.label || String(value || '-');
const minAllowedPrice = (item: CartItem, saleType: SaleType) => {
  const currentCost = n(item.currentCost);
  if (currentCost <= 0) return 0;
  if (saleType === 'CASH_INVOICE') return Math.max(n(item.currentCostVatIncluded), currentCost);
  return currentCost * 1.05;
};

export default function HotSalesPage() {
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
          limit: 60,
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
    () => cart.filter((item) => minAllowedPrice(item, saleType) > 0 && n(item.unitPrice) + 0.0001 < minAllowedPrice(item, saleType)),
    [cart, saleType]
  );
  const activeSession = sessionDetail?.session || null;
  const inventory = sessionDetail?.inventory || [];

  const addToCart = (product: any, target: 'sale' | 'load', forcedListNo?: number) => {
    const listNo = target === 'load' ? 1 : forcedListNo || priceListNo;
    const unitPrice = target === 'load' ? 0 : n(product.priceLists?.[listNo]);
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
      toast.error('Maliyet alt limitinin altinda fiyat var');
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

  if (loading && !dashboard) {
    return <div className="p-6 text-sm text-slate-500">Sicak satis yukleniyor...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f6f1e8] p-3 text-slate-950 md:p-5">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <header className="overflow-hidden rounded-[2rem] bg-[#18231d] text-white shadow-2xl">
          <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr] lg:p-7">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-amber-100">
                <Truck className="h-4 w-4" /> Depo 11 Sicak Depo
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">Sicak Satis Operasyon Paneli</h1>
              <p className="mt-2 max-w-3xl text-sm text-amber-50/80 md:text-base">
                Arac yukleme, faturasiz anlik satis faturasi, faturali irsaliye, siparis ve gun sonu sayimi tek ekranda.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2">
              <Metric title="Aktif Arac" value={dashboard?.openSessions?.length || 0} />
              <Metric title="Arac" value={vehicles.length} />
              <Metric title="Son Islem" value={dashboard?.recentTransactions?.length || 0} />
              <Metric title="Aktif Seri" value="SICAK" />
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
              <h2 className="mb-3 text-lg font-black">Oturum</h2>
              {activeSession ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <p className="text-xs font-bold text-emerald-700">ACIK OTURUM</p>
                    <p className="text-lg font-black">{activeSession.vehicle?.name}</p>
                    <p className="text-sm text-emerald-900">{activeSession.vehicle?.plate} / Kaynak depo {warehouseLabel(activeSession.sourceWarehouseNo)}</p>
                  </div>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold"
                  >
                    {(dashboard?.openSessions || []).map((session: any) => (
                      <option key={session.id} value={session.id}>
                        {session.vehicle?.name} - {session.user?.displayName || session.user?.name || session.user?.email}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <select
                    value={sessionForm.vehicleId}
                    onChange={(e) => setSessionForm((prev) => ({ ...prev, vehicleId: e.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold"
                  >
                    <option value="">Arac sec</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>{vehicle.name} - {vehicle.plate}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <WarehouseSelect value={sessionForm.sourceWarehouseNo} onChange={(value: string) => setSessionForm((p) => ({ ...p, sourceWarehouseNo: value }))} />
                    <Input placeholder="Baslangic nakit" value={sessionForm.openingCash} onChange={(e) => setSessionForm((p) => ({ ...p, openingCash: e.target.value }))} />
                  </div>
                  <Button onClick={startSession} disabled={submitting} className="w-full rounded-2xl">
                    Oturumu Ac
                  </Button>
                </div>
              )}
            </Card>

            <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
              <h2 className="mb-3 text-lg font-black">Arac Stogu</h2>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {inventory.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Arac stogu yok.</p>}
                {inventory.map((row: any) => (
                  <div key={row.productCode} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-2">
                    <ProductImage src={row.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{row.productName}</p>
                      <p className="text-xs text-slate-500">{row.productCode}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2 text-right text-sm font-black text-emerald-700">
                      {fmtQty(row.quantity)} {row.unit}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <main className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-[2rem] bg-white p-2 shadow-xl md:grid-cols-5">
              <TabButton active={activeTab === 'sale'} icon={<ShoppingCart className="h-4 w-4" />} label="Satis" onClick={() => setActiveTab('sale')} />
              <TabButton active={activeTab === 'load'} icon={<PackagePlus className="h-4 w-4" />} label="Yukleme" onClick={() => setActiveTab('load')} />
              <TabButton active={activeTab === 'orders'} icon={<ClipboardCheck className="h-4 w-4" />} label="Siparis Teslim" onClick={() => setActiveTab('orders')} />
              <TabButton active={activeTab === 'close'} icon={<ClipboardCheck className="h-4 w-4" />} label="Gun Sonu" onClick={() => setActiveTab('close')} />
              <TabButton active={activeTab === 'manage'} icon={<Settings className="h-4 w-4" />} label="Yonetim" onClick={() => setActiveTab('manage')} />
            </div>

            {activeTab === 'sale' && (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <div className="mb-4 grid gap-3 lg:grid-cols-3">
                    <select value={saleType} onChange={(e) => setSaleType(e.target.value as SaleType)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black">
                      <option value="CASH_INVOICE">Faturasiz Anlik Satis</option>
                      <option value="INVOICED_DISPATCH">Faturali Irsaliye</option>
                      <option value="ORDER">Aracta Yoksa Siparis</option>
                    </select>
                    <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black">
                      <option value="CASH">Nakit</option>
                      <option value="CARD">Kart</option>
                      <option value="TRANSFER">Havale</option>
                      <option value="OPEN_ACCOUNT">Acik Hesap</option>
                    </select>
                    <select value={priceListNo} onChange={(e) => setPriceListNo(Number(e.target.value))} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black">
                      {Array.from({ length: 10 }, (_, index) => index + 1).map((listNo) => (
                        <option key={listNo} value={listNo}>{priceLabel(listNo)}</option>
                      ))}
                    </select>
                  </div>

                  <CustomerPicker
                    value={customerSearch}
                    onChange={setCustomerSearch}
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    onCreateRequest={() => setShowCustomerForm((value) => !value)}
                    onSelect={(customer: any) => {
                      setSelectedCustomer(customer);
                      setCustomerSearch(customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode);
                      setCustomers([]);
                    }}
                  />
                  {showCustomerForm && (
                    <NewCustomerPanel
                      form={newCustomerForm}
                      onChange={(patch: Partial<NewCustomerForm>) => setNewCustomerForm((prev) => ({ ...prev, ...patch }))}
                      onSubmit={createHotCustomer}
                      submitting={submitting}
                    />
                  )}

                  <ProductSearch
                    value={productSearch}
                    onChange={setProductSearch}
                    products={products}
                    actionLabel={activeSession ? 'Sepete Ekle' : 'Oturum gerekli'}
                    onAdd={(product: any, listNo?: number) => addToCart(product, 'sale', listNo)}
                  />
                </Card>

                <CartPanel
                  title="Satis Sepeti"
                  cart={cart}
                  total={saleTotal}
                  onUpdate={(code: string, patch: Partial<CartItem>) => updateCart('sale', code, patch)}
                  onRemove={(code: string) => removeCart('sale', code)}
                  onSubmit={submitSale}
                  submitLabel={saleType === 'ORDER' ? 'Siparis Olustur' : saleType === 'INVOICED_DISPATCH' ? 'Irsaliye Kes' : 'Satis Faturasi Kes'}
                  disabled={submitting || !activeSession || priceViolations.length > 0}
                  saleType={saleType}
                />
              </section>
            )}

            {activeTab === 'load' && (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <WarehouseSelect value={sessionForm.sourceWarehouseNo} onChange={(value: string) => setSessionForm((p) => ({ ...p, sourceWarehouseNo: value }))} />
                    <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">Hedef: Sicak Depo (11)</div>
                  </div>
                  <ProductSearch value={productSearch} onChange={setProductSearch} products={products} actionLabel="Yuklemeye Ekle" onAdd={(product: any) => addToCart(product, 'load')} />
                </Card>
                <CartPanel
                  title="Yukleme Listesi"
                  cart={loadCart}
                  total={loadTotalQty}
                  totalLabel="Toplam miktar"
                  onUpdate={(code: string, patch: Partial<CartItem>) => updateCart('load', code, patch)}
                  onRemove={(code: string) => removeCart('load', code)}
                  onSubmit={activeSession ? addLoad : startSession}
                  submitLabel={activeSession ? 'Araca Yukle' : 'Yukleyerek Oturum Ac'}
                  disabled={submitting}
                  hidePrice
                />
              </section>
            )}

            {activeTab === 'orders' && (
              <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <label className="mb-1 block text-sm font-black">Acik SICAK Siparis Ara</label>
                    <Input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Siparis no, cari veya urun" />
                  </div>
                  <CustomerPicker
                    value={customerSearch}
                    onChange={setCustomerSearch}
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    onCreateRequest={() => setShowCustomerForm((value) => !value)}
                    onSelect={(customer: any) => {
                      setSelectedCustomer(customer);
                      setCustomerSearch(customer.displayName || customer.mikroName || customer.name || customer.mikroCariCode);
                      setCustomers([]);
                    }}
                  />
                </div>
                {showCustomerForm && (
                  <NewCustomerPanel
                    form={newCustomerForm}
                    onChange={(patch: Partial<NewCustomerForm>) => setNewCustomerForm((prev) => ({ ...prev, ...patch }))}
                    onSubmit={createHotCustomer}
                    submitting={submitting}
                  />
                )}
                <div className="grid gap-4 xl:grid-cols-2">
                  {openOrders.length === 0 && <p className="rounded-3xl bg-slate-50 p-5 text-sm font-bold text-slate-500">Teslim edilecek acik SICAK siparis bulunamadi.</p>}
                  {openOrders.map((order: any) => (
                    <article key={order.orderNumber} className="overflow-hidden rounded-[2rem] border border-slate-100 bg-slate-50 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3 bg-slate-950 p-4 text-white">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Siparisten Irsaliye</p>
                          <h3 className="text-2xl font-black">{order.orderNumber}</h3>
                          <p className="text-sm text-white/70">{fmtDate(order.orderDate)} / {order.customerName || order.customerCode}</p>
                        </div>
                        <div className="rounded-2xl bg-white/10 px-4 py-2 text-right">
                          <p className="text-xs text-white/60">Kalan tutar</p>
                          <p className="font-black">{formatCurrency(order.totalAmount || 0)}</p>
                        </div>
                      </div>
                      <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                        {order.items.map((item: any) => {
                          const enough = n(item.vehicleStock) + 0.0001 >= n(item.remainingQty);
                          const key = `${order.orderNumber}:${item.orderGuid || item.rowNumber}`;
                          const deliverQty = deliveryQuantities[key] ?? '0';
                          const deliverNumber = Number(String(deliverQty).replace(',', '.')) || 0;
                          const invalidQty = deliverNumber > n(item.remainingQty) + 0.0001 || deliverNumber > n(item.vehicleStock) + 0.0001;
                          return (
                            <div key={`${order.orderNumber}-${item.rowNumber}`} className={`flex gap-3 rounded-2xl bg-white p-3 ${invalidQty ? 'ring-2 ring-red-300' : ''}`}>
                              <ProductImage src={item.imageUrl} large />
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm font-black">{item.productName}</p>
                                <p className="text-xs text-slate-500">{item.productCode}</p>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black">
                                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Kalan {fmtQty(item.remainingQty)} {item.unit}</span>
                                  <span className={`rounded-full px-2 py-1 ${enough ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    Arac {fmtQty(item.vehicleStock)}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{formatCurrency(item.unitPrice || 0)}</span>
                                </div>
                              </div>
                              <div className="w-28 shrink-0">
                                <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">Kesilecek</label>
                                <input
                                  value={deliverQty}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setDeliveryQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                                  className={`h-11 w-full rounded-2xl border bg-slate-50 px-3 text-sm font-black outline-none ${invalidQty ? 'border-red-400 text-red-700' : 'border-slate-200'}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-slate-100 p-3">
                        <Button onClick={() => deliverOrder(order)} disabled={!activeSession || submitting} className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500">
                          Girilen Miktarlari Irsaliye Kes
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </Card>
            )}

            {activeTab === 'close' && (
              <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">Gun Sonu Sayimi</h2>
                    <p className="text-sm text-slate-500">Tum arac stogu sayilmadan oturum kapatilmaz.</p>
                  </div>
                  <Button onClick={closeSession} disabled={!activeSession || submitting} className="rounded-2xl">Gun Sonunu Kapat</Button>
                </div>
                <div className="grid gap-3">
                  {inventory.map((row: any) => {
                    const count = closingCounts[row.productCode] || { countedQty: '', action: 'KEEP_ON_VEHICLE', note: '' };
                    const diff = Number(String(count.countedQty || '0').replace(',', '.')) - n(row.quantity);
                    return (
                      <div key={row.productCode} className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[80px_minmax(0,1fr)_120px_170px_100px]">
                        <ProductImage src={row.imageUrl} large />
                        <div className="min-w-0">
                          <p className="font-black">{row.productName}</p>
                          <p className="text-xs text-slate-500">{row.productCode} / Beklenen {fmtQty(row.quantity)} {row.unit}</p>
                        </div>
                        <Input value={count.countedQty} onChange={(e) => setClosingCounts((prev) => ({ ...prev, [row.productCode]: { ...count, countedQty: e.target.value } }))} />
                        <select value={count.action} onChange={(e) => setClosingCounts((prev) => ({ ...prev, [row.productCode]: { ...count, action: e.target.value as any } }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold">
                          <option value="KEEP_ON_VEHICLE">Aracta Birak</option>
                          <option value="RETURN_TO_DEPOT">Depoya Indir</option>
                        </select>
                        <div className={`rounded-2xl px-3 py-2 text-center text-sm font-black ${Math.abs(diff) > 0.001 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          Fark {fmtQty(diff)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {activeTab === 'manage' && (
              <section className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <h2 className="mb-3 text-xl font-black">Arac Tanimla</h2>
                  <div className="grid gap-3">
                    <Input placeholder="Arac adi" value={vehicleForm.name} onChange={(e) => setVehicleForm((p) => ({ ...p, name: e.target.value }))} />
                    <Input placeholder="Plaka" value={vehicleForm.plate} onChange={(e) => setVehicleForm((p) => ({ ...p, plate: e.target.value }))} />
                    <WarehouseSelect value={vehicleForm.defaultSourceWarehouseNo} onChange={(value: string) => setVehicleForm((p) => ({ ...p, defaultSourceWarehouseNo: value }))} label="Varsayilan kaynak depo" />
                    <Input placeholder="Not" value={vehicleForm.note} onChange={(e) => setVehicleForm((p) => ({ ...p, note: e.target.value }))} />
                    <Button onClick={saveVehicle} className="rounded-2xl">Araci Kaydet</Button>
                  </div>
                </Card>
                <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
                  <h2 className="mb-3 text-xl font-black">Son Islemler</h2>
                  <div className="max-h-[520px] space-y-2 overflow-y-auto">
                    {(dashboard?.recentTransactions || []).map((row: any) => (
                      <div key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black">{row.mikroDocumentNo || row.linkedOrderNumber || row.type}</p>
                          <p className="font-black text-emerald-700">{formatCurrency(row.totalAmount || 0)}</p>
                        </div>
                        <p className="text-xs text-slate-500">{row.customerName || row.customerCode || '-'} / {row.session?.vehicle?.name || '-'}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}
          </main>
        </section>
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-100/70">{title}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-12 items-center justify-center gap-2 rounded-3xl text-sm font-black transition ${active ? 'bg-slate-950 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
      {icon}
      {label}
    </button>
  );
}

function ProductImage({ src, large }: { src?: string | null; large?: boolean }) {
  return (
    <div className={`${large ? 'h-16 w-16' : 'h-12 w-12'} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Truck className="h-5 w-5 text-slate-300" />}
    </div>
  );
}

function WarehouseSelect({ value, onChange, label = 'Kaynak depo' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black">
        {WAREHOUSE_OPTIONS.map((warehouse) => (
          <option key={warehouse.value} value={warehouse.value}>{warehouse.label}</option>
        ))}
      </select>
    </label>
  );
}

function CustomerPicker({ value, onChange, customers, selectedCustomer, onSelect, onCreateRequest }: any) {
  return (
    <div className="relative mb-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-sm font-black">Cari</label>
        <button type="button" onClick={onCreateRequest} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900 hover:bg-amber-200">
          Yeni SICAK Cari
        </button>
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Cari kodu veya unvan ara" />
      {selectedCustomer && <p className="mt-1 text-xs font-bold text-emerald-700">Secili: {selectedCustomer.displayName || selectedCustomer.mikroName || selectedCustomer.name}</p>}
      {customers.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl">
          {customers.map((customer: any) => (
            <button key={customer.id} onClick={() => onSelect(customer)} className="block w-full rounded-2xl p-3 text-left hover:bg-amber-50">
              <p className="font-black">{customer.displayName || customer.mikroName || customer.name}</p>
              <p className="text-xs text-slate-500">{customer.mikroCariCode} / {customer.city || '-'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewCustomerPanel({ form, onChange, onSubmit, submitting }: { form: NewCustomerForm; onChange: (patch: Partial<NewCustomerForm>) => void; onSubmit: () => void; submitting: boolean }) {
  return (
    <div className="mb-4 rounded-[1.6rem] border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3">
        <h3 className="text-lg font-black text-amber-950">Yeni SICAK Cari Ac</h3>
        <p className="text-xs font-bold text-amber-800">Zorunlu: unvan, cep telefonu, vergi dairesi, vergi no. Odeme plani Pesin, sektor/grup SICAK olarak acilir.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Input placeholder="Cari unvani *" value={form.customerName} onChange={(e) => onChange({ customerName: e.target.value })} />
        <Input placeholder="Cep telefonu *" value={form.phone} onChange={(e) => onChange({ phone: e.target.value })} />
        <Input placeholder="Vergi dairesi *" value={form.taxOffice} onChange={(e) => onChange({ taxOffice: e.target.value })} />
        <Input placeholder="Vergi no *" value={form.taxNumber} onChange={(e) => onChange({ taxNumber: e.target.value })} />
        <Input placeholder="E-posta" value={form.email} onChange={(e) => onChange({ email: e.target.value })} />
        <Input placeholder="Il" value={form.city} onChange={(e) => onChange({ city: e.target.value })} />
        <Input placeholder="Ilce" value={form.district} onChange={(e) => onChange({ district: e.target.value })} />
        <Input placeholder="Adres" value={form.address} onChange={(e) => onChange({ address: e.target.value })} />
      </div>
      <Button onClick={onSubmit} disabled={submitting} className="mt-3 rounded-2xl bg-slate-950 text-white hover:bg-slate-800">
        Cariyi Ac ve Sec
      </Button>
    </div>
  );
}

function ProductSearch({ value, onChange, products, onAdd, actionLabel }: any) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black">Urun Ara</label>
      <div className="relative">
        <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="h-14 w-full rounded-3xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-bold outline-none focus:border-amber-400" placeholder="Kod, isim veya barkod; bosken arac stogu listelenir" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {products.map((product: any) => {
          const vehicleStock = n(product.vehicleStock);
          const noStock = n(product.totalVisibleStock) <= 0;
          const cardClass = vehicleStock > 0 ? 'border-emerald-200 bg-emerald-50' : noStock ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50';
          return (
            <article key={product.productCode} className={`overflow-hidden rounded-3xl border shadow-sm ${cardClass}`}>
              <div className="flex gap-3 p-3">
                <ProductImage src={product.imageUrl} large />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-black">{product.productName}</p>
                  <p className="text-xs text-slate-500">{product.productCode}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-black">
                    <span className={`rounded-full px-2 py-1 ${vehicleStock > 0 ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700'}`}>Arac {fmtQty(product.vehicleStock)}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-blue-700">Sicak Depo {fmtQty(product.hotWarehouseStock)}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-slate-700">Merkez {fmtQty(product.stockMerkez)}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-slate-700">Topca {fmtQty(product.stockTopca)}</span>
                    {noStock && <span className="rounded-full bg-red-600 px-2 py-1 text-white">Stok Yok</span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-white/70 p-3 text-xs">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((listNo) => (
                  <button key={listNo} type="button" onClick={() => onAdd(product, listNo)} className="rounded-2xl bg-white px-2 py-2 text-left font-black shadow-sm hover:bg-slate-950 hover:text-white">
                    {priceLabel(listNo)}: {formatCurrency(product.priceLists?.[listNo] || 0)}
                  </button>
                ))}
              </div>
              <button onClick={() => onAdd(product)} className="flex h-11 w-full items-center justify-center gap-2 bg-slate-950 text-sm font-black text-white">
                <Plus className="h-4 w-4" /> {actionLabel}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function CartPanel({ title, cart, total, totalLabel = 'Toplam', onUpdate, onRemove, onSubmit, submitLabel, disabled, hidePrice, saleType }: any) {
  return (
    <Card className="rounded-[2rem] border-0 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-black">{title}</h2>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">{cart.length} kalem</span>
      </div>
      <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {cart.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Liste bos.</p>}
        {cart.map((item: CartItem) => (
          <div key={item.productCode} className="rounded-3xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex gap-3">
              <ProductImage src={item.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-black">{item.productName}</p>
                <p className="text-xs text-slate-500">{item.productCode}</p>
              </div>
              <button onClick={() => onRemove(item.productCode)} className="h-9 w-9 rounded-full bg-white text-slate-500"><X className="mx-auto h-4 w-4" /></button>
            </div>
            <div className={`mt-3 grid gap-2 ${hidePrice ? 'grid-cols-1' : 'grid-cols-3'}`}>
              <input value={item.quantity} onFocus={(e) => e.currentTarget.select()} onChange={(e) => onUpdate(item.productCode, { quantity: Number(e.target.value.replace(',', '.')) || 0 })} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black" />
              {!hidePrice && (
                <select
                  value={item.priceListNo}
                  onChange={(e) => {
                    const listNo = Number(e.target.value);
                    onUpdate(item.productCode, { priceListNo: listNo, unitPrice: n(item.priceLists?.[listNo]) || item.unitPrice });
                  }}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black"
                >
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((listNo) => (
                    <option key={listNo} value={listNo}>{priceLabel(listNo)}</option>
                  ))}
                </select>
              )}
              {!hidePrice && <input value={item.unitPrice} onFocus={(e) => e.currentTarget.select()} onChange={(e) => onUpdate(item.productCode, { unitPrice: Number(e.target.value.replace(',', '.')) || 0 })} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black" />}
            </div>
            {!hidePrice && minAllowedPrice(item, saleType) > 0 && (
              <p className={`mt-2 rounded-2xl px-3 py-2 text-xs font-black ${n(item.unitPrice) + 0.0001 >= minAllowedPrice(item, saleType) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                Alt limit: {formatCurrency(minAllowedPrice(item, saleType))} / Guncel maliyet: {formatCurrency(n(item.currentCost))}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-3xl bg-slate-950 p-4 text-white">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-white/70">{totalLabel}</span>
          <span className="text-2xl font-black">{hidePrice ? fmtQty(total) : formatCurrency(total)}</span>
        </div>
        <Button onClick={onSubmit} disabled={disabled} className="w-full rounded-2xl bg-amber-400 text-slate-950 hover:bg-amber-300">
          {submitLabel}
        </Button>
      </div>
    </Card>
  );
}
