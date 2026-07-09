import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import {
  HotSaleCartItem,
  HotSaleClosureAction,
  HotSaleCustomer,
  HotSaleDailyReport,
  HotSaleDashboard,
  HotSaleInventoryItem,
  HotSaleOpenOrder,
  HotSalePaymentType,
  HotSaleProduct,
  HotSaleSession,
  HotSaleTransactionType,
} from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';

type ViewKey = 'dashboard' | 'sale' | 'load' | 'orders' | 'close' | 'report' | 'manage';

const priceLists = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const sourceWarehouses = [
  { value: 1, label: 'Merkez' },
  { value: 6, label: 'Topca' },
];

const saleTypes: Array<{ value: HotSaleTransactionType; label: string; priceList: number; needsCustomer: boolean }> = [
  { value: 'CASH_INVOICE', label: 'Faturasiz', priceList: 5, needsCustomer: false },
  { value: 'INVOICED_DISPATCH', label: 'Irsaliye', priceList: 6, needsCustomer: true },
  { value: 'ORDER', label: 'Siparis', priceList: 6, needsCustomer: true },
];

const paymentTypes: Array<{ value: HotSalePaymentType; label: string }> = [
  { value: 'CASH', label: 'Nakit' },
  { value: 'CARD', label: 'Kart' },
  { value: 'TRANSFER', label: 'Havale' },
  { value: 'OPEN_ACCOUNT', label: 'Cari' },
];

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const money = (value: unknown) =>
  `${n(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;

const numberText = (value: unknown) =>
  n(value).toLocaleString('tr-TR', { maximumFractionDigits: 3 });

const dateText = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleString('tr-TR');
};

const todayInput = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const customerName = (customer?: HotSaleCustomer | null) =>
  customer?.displayTitle || customer?.displayName || customer?.mikroName || customer?.name || customer?.mikroCariCode || '-';

const sessionUserName = (session?: HotSaleSession | null) =>
  session?.user?.displayName || session?.user?.name || session?.user?.email || '-';

const productPrice = (product: HotSaleProduct, listNo: number) =>
  n(product.priceLists?.[String(listNo)] ?? product.priceLists?.[listNo as any]);

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'green' | 'amber' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'red' && styles.textDanger,
          tone === 'green' && styles.textSuccess,
          tone === 'amber' && styles.textWarning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  danger,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive, danger && styles.chipDanger]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive, danger && styles.chipTextDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function HotSalesScreen() {
  const [view, setView] = useState<ViewKey>('dashboard');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dashboard, setDashboard] = useState<HotSaleDashboard | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionDetail, setSessionDetail] = useState<{ session: HotSaleSession; inventory: HotSaleInventoryItem[] } | null>(null);

  const [sessionVehicleId, setSessionVehicleId] = useState('');
  const [sourceWarehouseNo, setSourceWarehouseNo] = useState('1');
  const [openingCash, setOpeningCash] = useState('0');
  const [startKm, setStartKm] = useState('');
  const [sessionNote, setSessionNote] = useState('');

  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<HotSaleCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<HotSaleCustomer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    customerName: '',
    phone: '',
    taxOffice: '',
    taxNumber: '',
    email: '',
    city: '',
    district: '',
    address: '',
  });

  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<HotSaleProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [cart, setCart] = useState<HotSaleCartItem[]>([]);
  const [loadCart, setLoadCart] = useState<HotSaleCartItem[]>([]);
  const [saleType, setSaleType] = useState<HotSaleTransactionType>('CASH_INVOICE');
  const [paymentType, setPaymentType] = useState<HotSalePaymentType>('CASH');
  const [priceListNo, setPriceListNo] = useState(5);

  const [orderSearch, setOrderSearch] = useState('');
  const [openOrders, setOpenOrders] = useState<HotSaleOpenOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [deliveryQuantities, setDeliveryQuantities] = useState<Record<string, string>>({});

  const [closingCash, setClosingCash] = useState('0');
  const [closingNote, setClosingNote] = useState('');
  const [closingCounts, setClosingCounts] = useState<Record<string, { countedQty: string; action: HotSaleClosureAction; note: string }>>({});

  const [reportStartDate, setReportStartDate] = useState(todayInput());
  const [reportEndDate, setReportEndDate] = useState(todayInput());
  const [dailyReport, setDailyReport] = useState<HotSaleDailyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [vehicleForm, setVehicleForm] = useState({ name: '', plate: '', defaultSourceWarehouseNo: '1', note: '' });
  const submittingRef = useRef(false);
  const dashboardRequestSeqRef = useRef(0);
  const sessionRequestSeqRef = useRef(0);
  const customerRequestSeqRef = useRef(0);
  const productRequestSeqRef = useRef(0);
  const orderRequestSeqRef = useRef(0);
  const reportRequestSeqRef = useRef(0);

  const beginSubmitting = () => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);
    return true;
  };

  const endSubmitting = () => {
    submittingRef.current = false;
    setSubmitting(false);
  };

  const activeSession = useMemo(() => {
    if (sessionDetail?.session) return sessionDetail.session;
    if (selectedSessionId) return dashboard?.openSessions?.find((session) => session.id === selectedSessionId) || null;
    return dashboard?.myOpenSession || dashboard?.openSessions?.[0] || null;
  }, [dashboard, selectedSessionId, sessionDetail]);

  const activeVehicleId = activeSession?.vehicleId || '';
  const activeVehicleName = activeSession?.vehicle?.name || dashboard?.vehicles?.find((vehicle) => vehicle.id === activeVehicleId)?.name || '-';
  const inventory = sessionDetail?.inventory || [];

  const saleTotal = useMemo(() => cart.reduce((sum, item) => sum + n(item.quantity) * n(item.unitPrice), 0), [cart]);
  const loadTotalQty = useMemo(() => loadCart.reduce((sum, item) => sum + n(item.quantity), 0), [loadCart]);

  const loadDashboard = useCallback(async () => {
    const requestSeq = dashboardRequestSeqRef.current + 1;
    dashboardRequestSeqRef.current = requestSeq;
    setLoading(true);
    try {
      const result = await adminApi.getHotSalesDashboard();
      if (requestSeq !== dashboardRequestSeqRef.current) return;
      setDashboard(result);
      const preferred = result.myOpenSession || result.openSessions?.[0];
      if (preferred?.id) {
        setSelectedSessionId((current) => current || preferred.id);
      }
      if (!sessionVehicleId && result.vehicles?.[0]?.id) {
        setSessionVehicleId(result.vehicles[0].id);
      }
    } catch (err: any) {
      if (requestSeq === dashboardRequestSeqRef.current) {
        Alert.alert('Sicak satis', getApiErrorMessage(err, 'Panel verisi alinamadi.'));
      }
    } finally {
      if (requestSeq === dashboardRequestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [sessionVehicleId]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    const requestSeq = sessionRequestSeqRef.current + 1;
    sessionRequestSeqRef.current = requestSeq;
    try {
      const result = await adminApi.getHotSaleSession(sessionId);
      if (requestSeq !== sessionRequestSeqRef.current) return;
      setSessionDetail(result);
      setSelectedSessionId(sessionId);
      setClosingCash(String(result.session.closingCash ?? result.session.openingCash ?? 0));
      setClosingCounts((prev) => {
        const next = { ...prev };
        result.inventory.forEach((item) => {
          if (!next[item.productCode]) {
            next[item.productCode] = {
              countedQty: String(item.quantity ?? 0),
              action: 'KEEP_ON_VEHICLE',
              note: '',
            };
          }
        });
        return next;
      });
    } catch (err: any) {
      if (requestSeq === sessionRequestSeqRef.current) {
        Alert.alert('Oturum', getApiErrorMessage(err, 'Oturum detayi alinamadi.'));
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      loadSession(selectedSessionId);
    }
  }, [selectedSessionId, loadSession]);

  useEffect(() => {
    const selected = saleTypes.find((item) => item.value === saleType);
    if (selected) setPriceListNo(selected.priceList);
    if (saleType === 'INVOICED_DISPATCH') setPaymentType('OPEN_ACCOUNT');
    if (saleType === 'CASH_INVOICE' && paymentType === 'OPEN_ACCOUNT') setPaymentType('CASH');
  }, [saleType]);

  const selectSession = (session: HotSaleSession) => {
    setSelectedSessionId(session.id);
    setView('sale');
  };

  const searchCustomers = async () => {
    if (customerLoading) return;
    const requestSeq = customerRequestSeqRef.current + 1;
    customerRequestSeqRef.current = requestSeq;
    setCustomerLoading(true);
    try {
      const result = await adminApi.searchHotSaleCustomers({
        search: customerSearch.trim() || undefined,
        limit: 30,
      });
      if (requestSeq === customerRequestSeqRef.current) {
        setCustomers(result.customers || []);
      }
    } catch (err: any) {
      if (requestSeq === customerRequestSeqRef.current) {
        setCustomers([]);
        Alert.alert('Cari arama', getApiErrorMessage(err, 'Cari aramasi yapilamadi.'));
      }
    } finally {
      if (requestSeq === customerRequestSeqRef.current) {
        setCustomerLoading(false);
      }
    }
  };

  const createHotCustomer = async () => {
    if (submittingRef.current) return;
    if (!newCustomer.customerName.trim() || !newCustomer.phone.trim() || !newCustomer.taxOffice.trim() || !newCustomer.taxNumber.trim()) {
      Alert.alert('Eksik bilgi', 'Cari unvani, telefon, vergi dairesi ve vergi no zorunlu.');
      return;
    }
    if (!beginSubmitting()) return;
    try {
      const result = await adminApi.createHotSaleCustomer(newCustomer);
      setSelectedCustomer(result.customer);
      setCustomerSearch(customerName(result.customer));
      setCustomers([]);
      setShowNewCustomer(false);
      setNewCustomer({ customerName: '', phone: '', taxOffice: '', taxNumber: '', email: '', city: '', district: '', address: '' });
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Cari acilamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      endSubmitting();
    }
  };

  const searchProducts = async () => {
    if (productsLoading) return;
    const requestSeq = productRequestSeqRef.current + 1;
    productRequestSeqRef.current = requestSeq;
    const search = productSearch.trim();
    if (!activeVehicleId && !search) {
      Alert.alert('Oturum gerekli', 'Arac stok listesini gormek icin once acik oturum secin.');
      return;
    }
    setProductsLoading(true);
    try {
      const result = await adminApi.searchHotSaleProducts({
        search: search || undefined,
        vehicleId: activeVehicleId || undefined,
        customerIdOrCode: selectedCustomer?.id || selectedCustomer?.mikroCariCode || undefined,
        limit: search ? 60 : 120,
      });
      if (requestSeq === productRequestSeqRef.current) {
        setProducts(result.products || []);
      }
    } catch (err: any) {
      if (requestSeq === productRequestSeqRef.current) {
        setProducts([]);
        Alert.alert('Urun arama', getApiErrorMessage(err, 'Urun aramasi yapilamadi.'));
      }
    } finally {
      if (requestSeq === productRequestSeqRef.current) {
        setProductsLoading(false);
      }
    }
  };

  const upsertCart = (target: 'sale' | 'load', product: HotSaleProduct) => {
    const setter = target === 'load' ? setLoadCart : setCart;
    const code = product.productCode;
    setter((prev) => {
      const exists = prev.find((item) => item.productCode === code);
      if (exists) {
        return prev.map((item) => (item.productCode === code ? { ...item, quantity: n(item.quantity) + 1 } : item));
      }
      return [
        ...prev,
        {
          productCode: code,
          productName: product.productName,
          unit: product.unit,
          quantity: 1,
          unitPrice: target === 'load' ? 0 : productPrice(product, priceListNo),
          priceListNo,
          vatRate: product.vatRate,
          currentCost: product.currentCost,
          currentCostVatIncluded: product.currentCostVatIncluded,
          vehicleStock: product.vehicleStock,
          hotWarehouseStock: product.hotWarehouseStock,
          stockMerkez: product.stockMerkez,
          stockTopca: product.stockTopca,
        },
      ];
    });
    hapticSuccess();
  };

  const updateCart = (target: 'sale' | 'load', code: string, patch: Partial<HotSaleCartItem>) => {
    const setter = target === 'load' ? setLoadCart : setCart;
    setter((prev) => prev.map((item) => (item.productCode === code ? { ...item, ...patch } : item)));
  };

  const removeCart = (target: 'sale' | 'load', code: string) => {
    const setter = target === 'load' ? setLoadCart : setCart;
    setter((prev) => prev.filter((item) => item.productCode !== code));
  };

  const startSession = async () => {
    if (submittingRef.current) return;
    if (!sessionVehicleId) {
      Alert.alert('Arac secin', 'Oturum acmak icin arac secilmeli.');
      return;
    }
    Alert.alert('Oturum acilsin mi?', 'Secili arac icin sicak satis oturumu acilacak.', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Ac',
        onPress: async () => {
          if (!beginSubmitting()) return;
          try {
            const result = await adminApi.startHotSaleSession({
              vehicleId: sessionVehicleId,
              sourceWarehouseNo: n(sourceWarehouseNo, 1),
              openingCash: n(openingCash),
              startKm: startKm ? n(startKm) : undefined,
              note: sessionNote.trim(),
              loadItems: loadCart.map((item) => ({ productCode: item.productCode, quantity: n(item.quantity) })),
            });
            setLoadCart([]);
            setSelectedSessionId(result.session.id);
            await loadDashboard();
            await loadSession(result.session.id);
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Oturum acilamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
          } finally {
            endSubmitting();
          }
        },
      },
    ]);
  };

  const addLoad = async () => {
    if (submittingRef.current) return;
    if (!activeSession?.id) return;
    if (!loadCart.length) {
      Alert.alert('Yukleme', 'Yuklenecek urun yok.');
      return;
    }
    Alert.alert('Araca yukleme yapilsin mi?', `${loadCart.length} kalem / ${numberText(loadTotalQty)} miktar Mikro transferi olusacak.`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Yukle',
        onPress: async () => {
          if (!beginSubmitting()) return;
          try {
            await adminApi.addHotSaleLoad(activeSession.id, {
              sourceWarehouseNo: n(sourceWarehouseNo, activeSession.sourceWarehouseNo || 1),
              items: loadCart.map((item) => ({ productCode: item.productCode, quantity: n(item.quantity) })),
            });
            setLoadCart([]);
            await loadSession(activeSession.id);
            await loadDashboard();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Yukleme yapilamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
          } finally {
            endSubmitting();
          }
        },
      },
    ]);
  };

  const submitSale = async () => {
    if (submittingRef.current) return;
    if (!activeSession?.id) {
      Alert.alert('Oturum gerekli', 'Once acik arac oturumu secin.');
      return;
    }
    if (!cart.length) {
      Alert.alert('Sepet bos', 'Satis icin urun ekleyin.');
      return;
    }
    const typeInfo = saleTypes.find((item) => item.value === saleType);
    if (typeInfo?.needsCustomer && !selectedCustomer?.id) {
      Alert.alert('Cari gerekli', 'Irsaliye ve siparis icin cari secilmeli.');
      return;
    }
    Alert.alert('Islem kaydedilsin mi?', `${typeInfo?.label || 'Satis'} icin toplam ${money(saleTotal)}. Mikro islemi olusabilir.`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Kaydet',
        onPress: async () => {
          if (!beginSubmitting()) return;
          try {
            const result = await adminApi.createHotSaleTransaction(activeSession.id, {
              type: saleType,
              customerId: selectedCustomer?.id,
              customerCode: selectedCustomer?.mikroCariCode,
              customerName: customerName(selectedCustomer),
              paymentType,
              priceListNo,
              items: cart.map((item) => ({
                productCode: item.productCode,
                quantity: n(item.quantity),
                unitPrice: n(item.unitPrice),
                priceListNo: item.priceListNo || priceListNo,
                unit: item.unit || undefined,
              })),
            });
            setCart([]);
            await loadSession(activeSession.id);
            await loadDashboard();
            hapticSuccess();
            Alert.alert('Kaydedildi', result.transaction.mikroDocumentNo || result.transaction.linkedOrderNumber || 'Islem olustu.');
          } catch (err: any) {
            Alert.alert('Satis kaydedilemedi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
          } finally {
            endSubmitting();
          }
        },
      },
    ]);
  };

  const fetchOpenOrders = async () => {
    if (ordersLoading) return;
    const requestSeq = orderRequestSeqRef.current + 1;
    orderRequestSeqRef.current = requestSeq;
    setOrdersLoading(true);
    try {
      const result = await adminApi.getHotSaleOpenOrders({
        search: orderSearch.trim() || undefined,
        vehicleId: activeVehicleId || undefined,
        customerIdOrCode: selectedCustomer?.id || selectedCustomer?.mikroCariCode || undefined,
        limit: 40,
      });
      if (requestSeq === orderRequestSeqRef.current) {
        setOpenOrders(result.orders || []);
      }
    } catch (err: any) {
      if (requestSeq === orderRequestSeqRef.current) {
        setOpenOrders([]);
        Alert.alert('Siparisler', getApiErrorMessage(err, 'Acik siparisler alinamadi.'));
      }
    } finally {
      if (requestSeq === orderRequestSeqRef.current) {
        setOrdersLoading(false);
      }
    }
  };

  const fillOrderRemaining = (order: HotSaleOpenOrder) => {
    setDeliveryQuantities((prev) => {
      const next = { ...prev };
      order.items.forEach((item) => {
        next[`${order.orderNumber}:${item.orderGuid}`] = String(Math.min(n(item.remainingQty), n(item.vehicleStock)));
      });
      return next;
    });
  };

  const deliverOrder = async (order: HotSaleOpenOrder) => {
    if (submittingRef.current) return;
    if (!activeSession?.id) {
      Alert.alert('Oturum gerekli', 'Teslim icin acik arac oturumu secin.');
      return;
    }
    const items = order.items
      .map((item) => ({
        item,
        quantity: n(deliveryQuantities[`${order.orderNumber}:${item.orderGuid}`]),
      }))
      .filter((row) => row.quantity > 0);
    if (!items.length) {
      Alert.alert('Miktar girin', 'Teslim edilecek miktar yok.');
      return;
    }
    Alert.alert('Siparis teslim edilsin mi?', `${order.orderNumber} icin ${items.length} satir irsaliye kesilecek.`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Teslim Et',
        onPress: async () => {
          if (!beginSubmitting()) return;
          try {
            await adminApi.deliverHotSaleOrder(activeSession.id, {
              orderNumber: order.orderNumber,
              items: items.map(({ item, quantity }) => ({
                orderGuid: item.orderGuid,
                productCode: item.productCode,
                quantity,
              })),
            });
            await loadSession(activeSession.id);
            await fetchOpenOrders();
            await loadDashboard();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Teslim edilemedi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
          } finally {
            endSubmitting();
          }
        },
      },
    ]);
  };

  const submitClose = async () => {
    if (submittingRef.current) return;
    if (!activeSession?.id) return;
    if (inventory.length && inventory.some((item) => !closingCounts[item.productCode])) {
      Alert.alert('Sayim eksik', 'Aractaki tum urunler icin sayim gerekli.');
      return;
    }
    Alert.alert('Gun sonu kapatilsin mi?', 'Kapanis sonrasi oturum kapanir ve iade secilenler Mikro transferi olusturur.', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Kapat',
        style: 'destructive',
        onPress: async () => {
          if (!beginSubmitting()) return;
          try {
            await adminApi.closeHotSaleSession(activeSession.id, {
              closingCash: n(closingCash),
              note: closingNote.trim(),
              counts: inventory.map((item) => ({
                productCode: item.productCode,
                countedQty: n(closingCounts[item.productCode]?.countedQty),
                action: closingCounts[item.productCode]?.action || 'KEEP_ON_VEHICLE',
                note: closingCounts[item.productCode]?.note || undefined,
              })),
            });
            setSessionDetail(null);
            setSelectedSessionId('');
            setClosingCounts({});
            await loadDashboard();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Gun sonu kapatilamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
          } finally {
            endSubmitting();
          }
        },
      },
    ]);
  };

  const fetchDailyReport = async () => {
    if (reportLoading) return;
    const requestSeq = reportRequestSeqRef.current + 1;
    reportRequestSeqRef.current = requestSeq;
    setReportLoading(true);
    try {
      const result = await adminApi.getHotSaleDailyReport({
        startDate: reportStartDate,
        endDate: reportEndDate,
        vehicleId: activeVehicleId || undefined,
        limit: 300,
      });
      if (requestSeq === reportRequestSeqRef.current) {
        setDailyReport(result);
      }
    } catch (err: any) {
      if (requestSeq === reportRequestSeqRef.current) {
        setDailyReport(null);
        Alert.alert('Rapor', getApiErrorMessage(err, 'Rapor alinamadi.'));
      }
    } finally {
      if (requestSeq === reportRequestSeqRef.current) {
        setReportLoading(false);
      }
    }
  };

  const saveVehicle = async () => {
    if (submittingRef.current) return;
    if (!vehicleForm.name.trim() || !vehicleForm.plate.trim()) {
      Alert.alert('Eksik bilgi', 'Arac adi ve plaka zorunlu.');
      return;
    }
    if (!beginSubmitting()) return;
    try {
      await adminApi.saveHotSaleVehicle({
        name: vehicleForm.name.trim(),
        plate: vehicleForm.plate.trim(),
        defaultSourceWarehouseNo: n(vehicleForm.defaultSourceWarehouseNo, 1),
        note: vehicleForm.note.trim() || null,
      });
      setVehicleForm({ name: '', plate: '', defaultSourceWarehouseNo: '1', note: '' });
      await loadDashboard();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Arac kaydedilemedi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      endSubmitting();
    }
  };

  const renderHeader = () => {
    const syncFailed = dashboard?.recentTransactions?.filter((item) => item.status === 'SYNC_FAILED').length || 0;
    return (
    <View style={styles.header}>
      <Text style={styles.kicker}>Saha Tahsilat ve Arac</Text>
      <Text style={styles.title}>Sicak Satis</Text>
      <Text style={styles.subtitle}>Arac stogu, anlik satis, siparis teslimi ve gun sonu.</Text>
      <View style={styles.heroMetricRow}>
        <View style={styles.heroMetric}>
          <Text style={[styles.heroMetricValue, activeSession && styles.heroMetricGood]}>{dashboard?.openSessions?.length || 0}</Text>
          <Text style={styles.heroMetricLabel}>Acik Oturum</Text>
        </View>
        <View style={styles.heroMetric}>
          <Text style={styles.heroMetricValue}>{dashboard?.vehicles?.length || 0}</Text>
          <Text style={styles.heroMetricLabel}>Arac</Text>
        </View>
        <View style={styles.heroMetric}>
          <Text style={styles.heroMetricValue}>{dashboard?.recentTransactions?.length || 0}</Text>
          <Text style={styles.heroMetricLabel}>Son Islem</Text>
        </View>
        <View style={styles.heroMetric}>
          <Text style={[styles.heroMetricValue, syncFailed > 0 && styles.heroMetricDanger]}>{syncFailed}</Text>
          <Text style={styles.heroMetricLabel}>Mikro Risk</Text>
        </View>
      </View>
      <View style={styles.sessionStrip}>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionLabel}>Aktif oturum</Text>
          <Text style={styles.sessionTitle} numberOfLines={2}>{activeSession ? activeVehicleName : 'Secili oturum yok'}</Text>
          <Text style={styles.sessionMeta} numberOfLines={2}>{activeSession ? `${sessionUserName(activeSession)} - ${dateText(activeSession.startedAt)}` : 'Arac secip oturum acin.'}</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={loadDashboard} disabled={loading || submitting}>
          <Text style={styles.refreshText}>Yenile</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {([
          ['dashboard', 'Panel'],
          ['sale', 'Satis'],
          ['load', 'Yukleme'],
          ['orders', 'Siparis'],
          ['close', 'Gun Sonu'],
          ['report', 'Rapor'],
          ['manage', 'Araclar'],
        ] as Array<[ViewKey, string]>).map(([key, label]) => (
          <Chip key={key} label={label} active={view === key} onPress={() => setView(key)} />
        ))}
      </ScrollView>
    </View>
  );
  };

  const renderDashboard = () => {
    const syncFailed = dashboard?.recentTransactions?.filter((item) => item.status === 'SYNC_FAILED').length || 0;
    return (
      <View style={styles.section}>
        <View style={styles.metricGrid}>
          <Metric label="Acik Oturum" value={dashboard?.openSessions?.length || 0} tone="green" />
          <Metric label="Arac" value={dashboard?.vehicles?.length || 0} />
          <Metric label="Son Islem" value={dashboard?.recentTransactions?.length || 0} />
          <Metric label="Mikro Risk" value={syncFailed} tone={syncFailed ? 'red' : undefined} />
        </View>

        <Text style={styles.sectionTitle}>Acik oturumlar</Text>
        {dashboard?.openSessions?.length ? (
          dashboard.openSessions.map((session) => (
            <TouchableOpacity key={session.id} style={styles.card} onPress={() => selectSession(session)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={2}>{session.vehicle?.name || 'Arac'}</Text>
                <Text style={styles.badgeOpen}>ACIK</Text>
              </View>
              <Text style={styles.cardMeta}>{session.vehicle?.plate || '-'} - {sessionUserName(session)}</Text>
              <Text style={styles.cardMeta}>Acilis: {dateText(session.startedAt)} / Kasa: {money(session.openingCash)}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Empty text="Acik sicak satis oturumu yok." />
        )}

        <Text style={styles.sectionTitle}>Son islemler</Text>
        {(dashboard?.recentTransactions || []).slice(0, 10).map((transaction) => (
          <View key={transaction.id} style={styles.compactRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle} numberOfLines={2}>{transaction.customerName || transaction.customerCode || transaction.type}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>{transaction.type} - {dateText(transaction.createdAt)}</Text>
            </View>
            <Text style={[styles.rowAmount, transaction.status === 'SYNC_FAILED' && styles.textDanger]}>{money(transaction.totalAmount)}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderSessionStarter = () => (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Oturum ac</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vehicleList}>
        {(dashboard?.vehicles || []).map((vehicle) => (
          <Chip
            key={vehicle.id}
            label={`${vehicle.name} / ${vehicle.plate}`}
            active={sessionVehicleId === vehicle.id}
            onPress={() => {
              setSessionVehicleId(vehicle.id);
              setSourceWarehouseNo(String(vehicle.defaultSourceWarehouseNo || 1));
            }}
          />
        ))}
      </ScrollView>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={openingCash}
          onChangeText={setOpeningCash}
          keyboardType="numeric"
          placeholder="Acilis kasa"
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          style={[styles.input, styles.flex]}
          value={startKm}
          onChangeText={setStartKm}
          keyboardType="numeric"
          placeholder="Baslangic km"
          placeholderTextColor={colors.textMuted}
        />
      </View>
      <View style={styles.chipRow}>
        {sourceWarehouses.map((warehouse) => (
          <Chip
            key={warehouse.value}
            label={`${warehouse.label} (${warehouse.value})`}
            active={sourceWarehouseNo === String(warehouse.value)}
            onPress={() => setSourceWarehouseNo(String(warehouse.value))}
          />
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={sessionNote}
        onChangeText={setSessionNote}
        placeholder="Oturum notu"
        placeholderTextColor={colors.textMuted}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={startSession} disabled={submitting}>
        <Text style={styles.primaryButtonText}>{submitting ? 'Isleniyor...' : 'Oturum Ac'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCustomerPicker = () => (
    <View style={styles.panel}>
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>Cari</Text>
        <TouchableOpacity onPress={() => setShowNewCustomer((value) => !value)}>
          <Text style={styles.linkText}>{showNewCustomer ? 'Arama' : 'Yeni SICAK cari'}</Text>
        </TouchableOpacity>
      </View>
      {selectedCustomer && (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedTitle} numberOfLines={3}>{customerName(selectedCustomer)}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{selectedCustomer.mikroCariCode || '-'} {selectedCustomer.phone ? `- ${selectedCustomer.phone}` : ''}</Text>
          <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
            <Text style={styles.linkText}>Cariyi kaldir</Text>
          </TouchableOpacity>
        </View>
      )}
      {showNewCustomer ? (
        <View style={styles.formGrid}>
          <TextInput style={styles.input} value={newCustomer.customerName} onChangeText={(v) => setNewCustomer((p) => ({ ...p, customerName: v }))} placeholder="Cari unvani" placeholderTextColor={colors.textMuted} />
          <TextInput style={styles.input} value={newCustomer.phone} onChangeText={(v) => setNewCustomer((p) => ({ ...p, phone: v }))} placeholder="Telefon" placeholderTextColor={colors.textMuted} />
          <TextInput style={styles.input} value={newCustomer.taxOffice} onChangeText={(v) => setNewCustomer((p) => ({ ...p, taxOffice: v }))} placeholder="Vergi dairesi" placeholderTextColor={colors.textMuted} />
          <TextInput style={styles.input} value={newCustomer.taxNumber} onChangeText={(v) => setNewCustomer((p) => ({ ...p, taxNumber: v }))} placeholder="Vergi no" placeholderTextColor={colors.textMuted} />
          <TouchableOpacity style={styles.secondaryButton} onPress={createHotCustomer} disabled={submitting}>
            <Text style={styles.secondaryButtonText}>Cari Ac</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              onSubmitEditing={searchCustomers}
              placeholder="Cari adi, kodu, telefon..."
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.smallButton} onPress={searchCustomers}>
              <Text style={styles.smallButtonText}>{customerLoading ? '...' : 'Ara'}</Text>
            </TouchableOpacity>
          </View>
          {customers.map((customer) => (
            <TouchableOpacity
              key={customer.id}
              style={styles.searchResult}
              onPress={() => {
                setSelectedCustomer(customer);
                setCustomerSearch(customerName(customer));
                setCustomers([]);
              }}
            >
              <Text style={styles.rowTitle} numberOfLines={3}>{customerName(customer)}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>{customer.mikroCariCode || '-'} {customer.city ? `- ${customer.city}` : ''}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );

  const renderProductSearch = () => (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Urun arama</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={productSearch}
          onChangeText={setProductSearch}
          onSubmitEditing={searchProducts}
          placeholder={activeSession ? 'Urun, barkod veya stok kodu...' : 'Oturum acmadan genel arama'}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.smallButton} onPress={searchProducts}>
          <Text style={styles.smallButtonText}>{productsLoading ? '...' : 'Ara'}</Text>
        </TouchableOpacity>
      </View>
      {!productSearch.trim() && activeSession && (
        <TouchableOpacity style={styles.secondaryButton} onPress={searchProducts}>
          <Text style={styles.secondaryButtonText}>Aractaki Urunleri Getir</Text>
        </TouchableOpacity>
      )}
      {productsLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {products.map((product) => (
        <View key={product.productCode} style={styles.productCard}>
          <Text style={styles.productTitle} numberOfLines={5} ellipsizeMode="tail">{product.productName}</Text>
          <Text style={styles.productCode} numberOfLines={1} ellipsizeMode="middle">{product.productCode} - {product.unit || 'ADET'}</Text>
          <View style={styles.stockGrid}>
            <Text style={styles.stockPill} numberOfLines={1}>Arac {numberText(product.vehicleStock)}</Text>
            <Text style={styles.stockPill} numberOfLines={1}>Depo11 {numberText(product.hotWarehouseStock)}</Text>
            <Text style={styles.stockPill} numberOfLines={1}>Merkez {numberText(product.stockMerkez)}</Text>
            <Text style={styles.stockPill} numberOfLines={1}>Topca {numberText(product.stockTopca)}</Text>
          </View>
          <View style={styles.cardHeader}>
            <Text style={styles.priceText} numberOfLines={1}>Liste {priceListNo}: {money(productPrice(product, priceListNo))}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.addButton} onPress={() => upsertCart('sale', product)}>
                <Text style={styles.addButtonText}>Satis</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButtonAlt} onPress={() => upsertCart('load', product)}>
                <Text style={styles.addButtonText}>Yukle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  const renderCart = (target: 'sale' | 'load') => {
    const rows = target === 'load' ? loadCart : cart;
    if (!rows.length) return <Empty text={target === 'load' ? 'Yukleme sepeti bos.' : 'Satis sepeti bos.'} />;
    return (
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>{target === 'load' ? 'Yukleme sepeti' : 'Satis sepeti'}</Text>
        {rows.map((item) => (
          <View key={item.productCode} style={styles.cartRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle} numberOfLines={5} ellipsizeMode="tail">{item.productName}</Text>
              <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">{item.productCode} - Arac stok {numberText(item.vehicleStock)}</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.qtyInput]}
                  value={String(item.quantity)}
                  onChangeText={(value) => updateCart(target, item.productCode, { quantity: n(value) })}
                  keyboardType="numeric"
                />
                {target === 'sale' && (
                  <TextInput
                    style={[styles.input, styles.priceInput]}
                    value={String(item.unitPrice)}
                    onChangeText={(value) => updateCart(target, item.productCode, { unitPrice: n(value) })}
                    keyboardType="numeric"
                  />
                )}
              </View>
            </View>
            <View style={styles.cartActions}>
              {target === 'sale' && <Text style={styles.rowAmount}>{money(n(item.quantity) * n(item.unitPrice))}</Text>}
              <TouchableOpacity onPress={() => removeCart(target, item.productCode)}>
                <Text style={styles.deleteText}>Sil</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderSale = () => (
    <View style={styles.section}>
      {!activeSession && renderSessionStarter()}
      {renderCustomerPicker()}
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Satis tipi</Text>
        <View style={styles.chipRow}>
          {saleTypes.map((type) => (
            <Chip key={type.value} label={type.label} active={saleType === type.value} onPress={() => setSaleType(type.value)} />
          ))}
        </View>
        <View style={styles.chipRow}>
          {paymentTypes.map((type) => (
            <Chip key={type.value} label={type.label} active={paymentType === type.value} onPress={() => setPaymentType(type.value)} />
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {priceLists.map((listNo) => (
            <Chip key={listNo} label={`L${listNo}`} active={priceListNo === listNo} onPress={() => setPriceListNo(listNo)} />
          ))}
        </ScrollView>
      </View>
      {renderProductSearch()}
      {renderCart('sale')}
      <View style={styles.totalBar}>
        <Text style={styles.totalLabel}>Toplam</Text>
        <Text style={styles.totalValue}>{money(saleTotal)}</Text>
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={submitSale} disabled={submitting}>
        <Text style={styles.primaryButtonText}>{submitting ? 'Kaydediliyor...' : 'Satis / Siparis Kaydet'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLoad = () => (
    <View style={styles.section}>
      {!activeSession && renderSessionStarter()}
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Kaynak depo</Text>
        <View style={styles.chipRow}>
          {sourceWarehouses.map((warehouse) => (
            <Chip
              key={warehouse.value}
              label={`${warehouse.label} (${warehouse.value})`}
              active={sourceWarehouseNo === String(warehouse.value)}
              onPress={() => setSourceWarehouseNo(String(warehouse.value))}
            />
          ))}
        </View>
      </View>
      {renderProductSearch()}
      {renderCart('load')}
      {activeSession ? (
        <TouchableOpacity style={styles.primaryButton} onPress={addLoad} disabled={submitting}>
          <Text style={styles.primaryButtonText}>{submitting ? 'Yukleniyor...' : 'Araca Yukle'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderOrders = () => (
    <View style={styles.section}>
      {renderCustomerPicker()}
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Acik SICAK siparisleri</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={orderSearch}
            onChangeText={setOrderSearch}
            onSubmitEditing={fetchOpenOrders}
            placeholder="Siparis, cari veya urun ara"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.smallButton} onPress={fetchOpenOrders}>
            <Text style={styles.smallButtonText}>{ordersLoading ? '...' : 'Getir'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {openOrders.map((order) => (
        <View key={order.orderNumber} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>{order.orderNumber}</Text>
            <Text style={order.canDeliverAll ? styles.badgeOpen : styles.badgeRisk}>
              {order.canDeliverAll ? 'Hazir' : 'Eksik'}
            </Text>
          </View>
          <Text style={styles.cardMeta} numberOfLines={2}>{order.customerName || order.customerCode || '-'} - {money(order.totalAmount)}</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => fillOrderRemaining(order)}>
            <Text style={styles.secondaryButtonText}>Arac stok kadar doldur</Text>
          </TouchableOpacity>
          {order.items.map((item) => (
            <View key={item.orderGuid} style={styles.orderLine}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={3}>{item.productName}</Text>
                <Text style={styles.cardMeta} numberOfLines={2}>{item.productCode} - Kalan {numberText(item.remainingQty)} / Arac {numberText(item.vehicleStock)}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.qtyInput]}
                value={deliveryQuantities[`${order.orderNumber}:${item.orderGuid}`] || ''}
                onChangeText={(value) => setDeliveryQuantities((prev) => ({ ...prev, [`${order.orderNumber}:${item.orderGuid}`]: value }))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ))}
          <TouchableOpacity style={styles.primaryButton} onPress={() => deliverOrder(order)} disabled={submitting}>
            <Text style={styles.primaryButtonText}>Teslim Et / Irsaliye Kes</Text>
          </TouchableOpacity>
        </View>
      ))}
      {!openOrders.length && <Empty text="Siparis listesi icin Getir'e basin." />}
    </View>
  );

  const renderClose = () => (
    <View style={styles.section}>
      {!activeSession ? (
        <Empty text="Gun sonu icin acik oturum secin." />
      ) : (
        <>
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Kasa kapanisi</Text>
            <TextInput
              style={styles.input}
              value={closingCash}
              onChangeText={setClosingCash}
              keyboardType="numeric"
              placeholder="Kapanis nakit"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={closingNote}
              onChangeText={setClosingNote}
              placeholder="Kapanis notu"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          {inventory.map((item) => {
            const state = closingCounts[item.productCode] || { countedQty: String(item.quantity || 0), action: 'KEEP_ON_VEHICLE' as HotSaleClosureAction, note: '' };
            return (
              <View key={item.productCode} style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={3}>{item.productName || item.productCode}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>{item.productCode} - Beklenen {numberText(item.quantity)} {item.unit || ''}</Text>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.flex]}
                    value={state.countedQty}
                    onChangeText={(value) => setClosingCounts((prev) => ({
                      ...prev,
                      [item.productCode]: { ...state, countedQty: value },
                    }))}
                    keyboardType="numeric"
                    placeholder="Sayilan miktar"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.chipRow}>
                  <Chip
                    label="Aracta kalsin"
                    active={state.action === 'KEEP_ON_VEHICLE'}
                    onPress={() => setClosingCounts((prev) => ({ ...prev, [item.productCode]: { ...state, action: 'KEEP_ON_VEHICLE' } }))}
                  />
                  <Chip
                    label="Depoya donsun"
                    active={state.action === 'RETURN_TO_DEPOT'}
                    onPress={() => setClosingCounts((prev) => ({ ...prev, [item.productCode]: { ...state, action: 'RETURN_TO_DEPOT' } }))}
                    danger
                  />
                </View>
              </View>
            );
          })}
          {!inventory.length && <Empty text="Arac stogu yok veya oturum detayi yuklenmedi." />}
          <TouchableOpacity style={styles.dangerButton} onPress={submitClose} disabled={submitting}>
            <Text style={styles.dangerButtonText}>{submitting ? 'Kapatiliyor...' : 'Gun Sonu Kapat'}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const renderReport = () => (
    <View style={styles.section}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Gunluk rapor</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={reportStartDate} onChangeText={setReportStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
          <TextInput style={[styles.input, styles.flex]} value={reportEndDate} onChangeText={setReportEndDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
        </View>
        <TouchableOpacity style={styles.secondaryButton} onPress={fetchDailyReport}>
          <Text style={styles.secondaryButtonText}>{reportLoading ? 'Aliniyor...' : 'Raporu Getir'}</Text>
        </TouchableOpacity>
      </View>
      {dailyReport && (
        <>
          <View style={styles.metricGrid}>
            <Metric label="Ciro" value={money(dailyReport.summary?.totalRevenue)} tone="green" />
            <Metric label="Nakit" value={money(dailyReport.summary?.cashSales)} />
            <Metric label="Beklenen" value={money(dailyReport.summary?.expectedCash)} />
            <Metric label="Fark" value={money(dailyReport.summary?.cashDifference)} tone={n(dailyReport.summary?.cashDifference) ? 'amber' : undefined} />
          </View>
          {(dailyReport.sessions || []).slice(0, 20).map((session: any) => (
            <View key={session.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={2}>{session.vehicleName || 'Arac'}</Text>
                <Text style={session.status === 'OPEN' ? styles.badgeOpen : styles.badgeClosed}>{session.status}</Text>
              </View>
              <Text style={styles.cardMeta} numberOfLines={2}>{session.userName || '-'} - Ciro {money(session.revenue)} - Islem {session.transactionCount}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );

  const renderManage = () => (
    <View style={styles.section}>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Arac kaydi</Text>
        <TextInput style={styles.input} value={vehicleForm.name} onChangeText={(v) => setVehicleForm((p) => ({ ...p, name: v }))} placeholder="Arac adi" placeholderTextColor={colors.textMuted} />
        <TextInput style={styles.input} value={vehicleForm.plate} onChangeText={(v) => setVehicleForm((p) => ({ ...p, plate: v }))} placeholder="Plaka" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />
        <TextInput style={styles.input} value={vehicleForm.defaultSourceWarehouseNo} onChangeText={(v) => setVehicleForm((p) => ({ ...p, defaultSourceWarehouseNo: v }))} placeholder="Varsayilan depo" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
        <TextInput style={styles.input} value={vehicleForm.note} onChangeText={(v) => setVehicleForm((p) => ({ ...p, note: v }))} placeholder="Not" placeholderTextColor={colors.textMuted} />
        <TouchableOpacity style={styles.secondaryButton} onPress={saveVehicle} disabled={submitting}>
          <Text style={styles.secondaryButtonText}>Arac Kaydet</Text>
        </TouchableOpacity>
      </View>
      {(dashboard?.vehicles || []).map((vehicle) => (
        <View key={vehicle.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>{vehicle.name}</Text>
            <Text style={vehicle.active ? styles.badgeOpen : styles.badgeClosed}>{vehicle.active ? 'Aktif' : 'Pasif'}</Text>
          </View>
          <Text style={styles.cardMeta} numberOfLines={1}>{vehicle.plate} - Kaynak depo {vehicle.defaultSourceWarehouseNo || 1}</Text>
        </View>
      ))}
    </View>
  );

  const content = () => {
    if (view === 'dashboard') return renderDashboard();
    if (view === 'sale') return renderSale();
    if (view === 'load') return renderLoad();
    if (view === 'orders') return renderOrders();
    if (view === 'close') return renderClose();
    if (view === 'report') return renderReport();
    return renderManage();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {renderHeader()}
          {content()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#9EC5FF',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#D7E7FF',
    lineHeight: 20,
  },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroMetric: {
    flexGrow: 1,
    minWidth: 118,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: '#FFFFFF' },
  heroMetricGood: { color: '#BBF7D0' },
  heroMetricDanger: { color: '#FECACA' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#D7E7FF' },
  sessionStrip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionLabel: {
    fontFamily: fonts.medium,
    color: '#BFD7FF',
    fontSize: fontSizes.xs,
  },
  sessionTitle: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: fontSizes.lg,
    marginTop: 2,
  },
  sessionMeta: {
    fontFamily: fonts.regular,
    color: '#D7E7FF',
    fontSize: fontSizes.xs,
    marginTop: 4,
  },
  refreshButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  refreshText: {
    fontFamily: fonts.semibold,
    color: colors.primarySoft,
    fontSize: fontSizes.sm,
  },
  tabs: {
    gap: spacing.sm,
    paddingRight: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metric: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  metricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  metricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
    marginTop: spacing.xs,
  },
  textDanger: {
    color: colors.danger,
  },
  textSuccess: {
    color: colors.success,
  },
  textWarning: {
    color: colors.warning,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipDanger: {
    borderColor: '#FCA5A5',
  },
  chipText: {
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  chipTextDanger: {
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
    lineHeight: 22,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
  badgeOpen: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.success,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeClosed: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeRisk: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  compactRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  rowAmount: {
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  vehicleList: {
    gap: spacing.sm,
    paddingRight: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  input: {
    minWidth: 0,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
  },
  qtyInput: {
    width: 86,
  },
  priceInput: {
    width: 116,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: fontSizes.md,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.bold,
    color: colors.primarySoft,
    fontSize: fontSizes.sm,
  },
  smallButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 46,
    justifyContent: 'center',
  },
  smallButtonText: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  dangerButtonText: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: fontSizes.md,
  },
  linkText: {
    fontFamily: fonts.bold,
    color: colors.primarySoft,
    fontSize: fontSizes.sm,
  },
  selectedBox: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.xs,
  },
  selectedTitle: {
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: fontSizes.md,
  },
  formGrid: {
    gap: spacing.sm,
  },
  searchResult: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  productCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  productTitle: {
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: fontSizes.md,
    lineHeight: 23,
    minWidth: 0,
  },
  productCode: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    minWidth: 0,
  },
  stockGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  stockPill: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  priceText: {
    flex: 1,
    minWidth: 150,
    fontFamily: fonts.bold,
    color: colors.primarySoft,
    fontSize: fontSizes.md,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addButtonAlt: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: fontSizes.xs,
  },
  cartRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  cartActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  deleteText: {
    fontFamily: fonts.bold,
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  totalBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  totalLabel: {
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  totalValue: {
    fontFamily: fonts.bold,
    color: colors.primarySoft,
    fontSize: fontSizes.xl,
  },
  orderLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});
