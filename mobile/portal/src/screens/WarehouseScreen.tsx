import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  WarehouseDispatchCatalog,
  WarehouseOrderDetail,
  WarehouseOverviewOrder,
  WarehouseRetailProduct,
  WarehouseWorkflowStatus,
  adminApi,
} from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';
import { normalizeSearchText } from '../utils/search';

type ViewKey = 'orders' | 'detail' | 'dispatch' | 'retail';
type WarehouseNo = 1 | 6 | 0;
type PriceLevel = 1 | 2 | 3 | 4 | 5;
type PaymentType = 'CASH' | 'CARD';

type LineDraft = {
  pickedQty: string;
  extraQty: string;
  shelfCode: string;
};

type RetailCartItem = {
  product: WarehouseRetailProduct;
  quantity: number;
  unitPrice: number;
};

const statusOptions: Array<{ value: 'ALL' | WarehouseWorkflowStatus; label: string }> = [
  { value: 'ALL', label: 'Tum' },
  { value: 'PENDING', label: 'Bekleyen' },
  { value: 'PICKING', label: 'Toplaniyor' },
  { value: 'READY_FOR_LOADING', label: 'Yuklemeye Hazir' },
  { value: 'LOADED', label: 'Yuklendi' },
  { value: 'DISPATCHED', label: 'Sevk' },
];

const statusLabel: Record<WarehouseWorkflowStatus, string> = {
  PENDING: 'Bekleyen',
  PICKING: 'Toplaniyor',
  READY_FOR_LOADING: 'Yuklemeye Hazir',
  PARTIALLY_LOADED: 'Kismi Yuklu',
  LOADED: 'Yuklendi',
  DISPATCHED: 'Sevk Edildi',
};

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const money = (value: unknown) =>
  `${n(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

const qtyText = (value: unknown) =>
  n(value).toLocaleString('tr-TR', { maximumFractionDigits: 3 });

const dateText = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('tr-TR');
};

const priceForLevel = (product: WarehouseRetailProduct, level: PriceLevel) =>
  n(product[`perakende${level}` as keyof WarehouseRetailProduct]);

const compactSearchText = (value?: string | number | null) => normalizeSearchText(value).replace(/\s+/g, '');

const lineSearchHaystack = (line: WarehouseOrderDetail['lines'][number]) =>
  [
    line.productCode,
    line.productName,
    line.shelfCode,
    line.lineKey,
    line.rowNumber,
    line.unit,
  ]
    .map((value) => `${normalizeSearchText(value)} ${compactSearchText(value)}`)
    .join(' ');

const lineMatchesQuery = (line: WarehouseOrderDetail['lines'][number], query: string) => {
  const normalized = normalizeSearchText(query);
  const compact = compactSearchText(query);
  if (!normalized && !compact) return true;
  const haystack = lineSearchHaystack(line);
  return Boolean((normalized && haystack.includes(normalized)) || (compact && haystack.includes(compact)));
};

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
    <TouchableOpacity style={[styles.chip, active && styles.chipActive, danger && styles.chipDanger]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive, danger && styles.chipTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'green' | 'amber' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'red' && styles.textDanger, tone === 'green' && styles.textSuccess, tone === 'amber' && styles.textWarning]}>
        {value}
      </Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function WarehouseScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [view, setView] = useState<ViewKey>('orders');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState<'ALL' | WarehouseWorkflowStatus>('ALL');
  const [search, setSearch] = useState('');
  const [overview, setOverview] = useState<{ series: any[]; orders: WarehouseOverviewOrder[] }>({ series: [], orders: [] });

  const [activeOrderNumber, setActiveOrderNumber] = useState('');
  const [detail, setDetail] = useState<WarehouseOrderDetail | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const [reportedLines, setReportedLines] = useState<Record<string, boolean>>({});
  const [lineSearch, setLineSearch] = useState('');
  const [highlightedLineKey, setHighlightedLineKey] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<WarehouseDispatchCatalog>({ drivers: [], vehicles: [] });
  const [deliverySeries, setDeliverySeries] = useState('IRS');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');

  const [retailSearch, setRetailSearch] = useState('');
  const [retailWarehouse, setRetailWarehouse] = useState<WarehouseNo>(1);
  const [priceLevel, setPriceLevel] = useState<PriceLevel>(1);
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH');
  const [retailProducts, setRetailProducts] = useState<WarehouseRetailProduct[]>([]);
  const [retailCart, setRetailCart] = useState<Record<string, RetailCartItem>>({});
  const [lastRetailSale, setLastRetailSale] = useState<{ invoiceNo: string; totalAmount: number } | null>(null);
  const actionLoadingRef = useRef(false);
  const overviewRequestSeqRef = useRef(0);
  const catalogRequestSeqRef = useRef(0);
  const orderDetailRequestSeqRef = useRef(0);
  const retailRequestSeqRef = useRef(0);

  const beginAction = () => {
    if (actionLoadingRef.current) return false;
    actionLoadingRef.current = true;
    setActionLoading(true);
    return true;
  };

  const endAction = () => {
    actionLoadingRef.current = false;
    setActionLoading(false);
  };

  const activeDrivers = useMemo(() => catalog.drivers.filter((row) => row.active), [catalog.drivers]);
  const activeVehicles = useMemo(() => catalog.vehicles.filter((row) => row.active), [catalog.vehicles]);
  const selectedDriver = activeDrivers.find((row) => row.id === driverId);
  const selectedVehicle = activeVehicles.find((row) => row.id === vehicleId);
  const retailCartItems = Object.values(retailCart);
  const retailTotal = retailCartItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const visibleDetailLines = useMemo(() => {
    const lines = detail?.lines || [];
    return lines.filter((line) => lineMatchesQuery(line, lineSearch));
  }, [detail?.lines, lineSearch]);

  useEffect(() => {
    loadOverview();
    loadCatalog();
  }, []);

  const loadOverview = async () => {
    const requestSeq = overviewRequestSeqRef.current + 1;
    overviewRequestSeqRef.current = requestSeq;
    setLoading(true);
    try {
      const result = await adminApi.getWarehouseOverview({
        status,
        search: search.trim() || undefined,
      });
      if (requestSeq === overviewRequestSeqRef.current) {
        setOverview(result);
      }
    } catch (err: any) {
      if (requestSeq === overviewRequestSeqRef.current) {
        Alert.alert('Depo siparisleri', getApiErrorMessage(err, 'Siparis listesi alinamadi.'));
      }
    } finally {
      if (requestSeq === overviewRequestSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const loadCatalog = async () => {
    const requestSeq = catalogRequestSeqRef.current + 1;
    catalogRequestSeqRef.current = requestSeq;
    try {
      const result = await adminApi.getWarehouseDispatchCatalog();
      if (requestSeq === catalogRequestSeqRef.current) {
        setCatalog(result);
        setDriverId((current) => current || result.drivers.find((row) => row.active)?.id || '');
        setVehicleId((current) => current || result.vehicles.find((row) => row.active)?.id || '');
      }
    } catch {
      if (requestSeq === catalogRequestSeqRef.current) {
        setCatalog({ drivers: [], vehicles: [] });
      }
    }
  };

  const loadOrderDetail = async (mikroOrderNumber: string, openDetail = true) => {
    const requestSeq = orderDetailRequestSeqRef.current + 1;
    orderDetailRequestSeqRef.current = requestSeq;
    setActionLoading(true);
    try {
      const result = await adminApi.getWarehouseOrderDetail(mikroOrderNumber);
      if (requestSeq !== orderDetailRequestSeqRef.current) return;
      setActiveOrderNumber(mikroOrderNumber);
      setDetail(result);
      setLineSearch('');
      setHighlightedLineKey(null);
      const drafts: Record<string, LineDraft> = {};
      for (const line of result.lines) {
        drafts[line.lineKey] = {
          pickedQty: String(line.pickedQty || 0),
          extraQty: String(line.extraQty || 0),
          shelfCode: line.shelfCode || '',
        };
      }
      setLineDrafts(drafts);
      if (openDetail) setView('detail');
    } catch (err: any) {
      if (requestSeq === orderDetailRequestSeqRef.current) {
        Alert.alert('Siparis detayi', getApiErrorMessage(err, 'Siparis detayi alinamadi.'));
      }
    } finally {
      if (requestSeq === orderDetailRequestSeqRef.current) {
        setActionLoading(actionLoadingRef.current);
      }
    }
  };

  const refreshActiveOrder = async () => {
    if (activeOrderNumber) await loadOrderDetail(activeOrderNumber, false);
    await loadOverview();
  };

  const syncOrders = () => {
    if (actionLoadingRef.current) return;
    Alert.alert('Mikro senkron', 'Depo siparislerini Mikrodan yeniden cekmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Senkronize Et',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            const result = await adminApi.syncWarehouseOrders();
            await loadOverview();
            Alert.alert('Senkron tamam', result.message || `${result.ordersCount} siparis kontrol edildi.`);
          } catch (err: any) {
            Alert.alert('Senkron', getApiErrorMessage(err, 'Senkron basarisiz.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const startPicking = () => {
    if (actionLoadingRef.current) return;
    if (!activeOrderNumber) return;
    Alert.alert('Toplama baslat', 'Bu siparis icin toplama baslatilsin mi?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Baslat',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            await adminApi.startWarehousePicking(activeOrderNumber);
            await refreshActiveOrder();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Toplama', getApiErrorMessage(err, 'Toplama baslatilamadi.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const updateDraft = (lineKey: string, patch: Partial<LineDraft>) => {
    setLineDrafts((prev) => ({
      ...prev,
      [lineKey]: { ...(prev[lineKey] || { pickedQty: '0', extraQty: '0', shelfCode: '' }), ...patch },
    }));
  };

  const saveLine = async (line: WarehouseOrderDetail['lines'][number], draftOverride?: LineDraft) => {
    if (actionLoadingRef.current) return;
    if (!activeOrderNumber) return;
    const draft = draftOverride || lineDrafts[line.lineKey] || { pickedQty: '0', extraQty: '0', shelfCode: '' };
    if (!beginAction()) return;
    try {
      await adminApi.updateWarehouseItem(activeOrderNumber, line.lineKey, {
        pickedQty: Math.max(0, n(draft.pickedQty)),
        extraQty: Math.max(0, n(draft.extraQty)),
        shelfCode: draft.shelfCode.trim() || null,
      });
      await refreshActiveOrder();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Satir guncelleme', getApiErrorMessage(err, 'Satir guncellenemedi.'));
    } finally {
      endAction();
    }
  };

  const fillLineRemaining = (line: WarehouseOrderDetail['lines'][number]) => {
    updateDraft(line.lineKey, { pickedQty: String(line.remainingQty), extraQty: '0' });
    setHighlightedLineKey(line.lineKey);
  };

  const completeLine = async (line: WarehouseOrderDetail['lines'][number]) => {
    const draft = {
      ...(lineDrafts[line.lineKey] || { pickedQty: '0', extraQty: '0', shelfCode: line.shelfCode || '' }),
      pickedQty: String(line.remainingQty),
      extraQty: '0',
    };
    updateDraft(line.lineKey, draft);
    await saveLine(line, draft);
  };

  const focusLineSearch = () => {
    if (!detail) return;
    const query = lineSearch.trim();
    if (!query) {
      setHighlightedLineKey(null);
      return;
    }
    const match = detail.lines.find((line) => lineMatchesQuery(line, query));
    if (!match) {
      setHighlightedLineKey(null);
      Alert.alert('Satir bulunamadi', 'Urun kodu, raf, isim veya satir numarasi ile eslesen kalem yok.');
      return;
    }
    setHighlightedLineKey(match.lineKey);
    hapticSuccess();
  };

  const fillHighlightedLine = () => {
    if (!detail || !highlightedLineKey) return;
    const line = detail.lines.find((row) => row.lineKey === highlightedLineKey);
    if (line) fillLineRemaining(line);
  };

  const reportImageIssue = async (line: WarehouseOrderDetail['lines'][number]) => {
    if (actionLoadingRef.current) return;
    if (!activeOrderNumber) return;
    if (!beginAction()) return;
    try {
      const result = await adminApi.reportWarehouseImageIssue(activeOrderNumber, line.lineKey);
      setReportedLines((prev) => ({ ...prev, [line.lineKey]: true }));
      Alert.alert('Gorsel hata', result.alreadyReported ? 'Bu satir icin acik talep zaten var.' : 'Gorsel hata talebi acildi.');
    } catch (err: any) {
      Alert.alert('Gorsel hata', getApiErrorMessage(err, 'Talep acilamadi.'));
    } finally {
      endAction();
    }
  };

  const markLoaded = () => {
    if (actionLoadingRef.current) return;
    if (!activeOrderNumber) return;
    Alert.alert('Yuklendi', 'Siparis yuklendi olarak isaretlensin mi?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Yuklendi',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            await adminApi.markWarehouseLoaded(activeOrderNumber);
            await refreshActiveOrder();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Yukleme', getApiErrorMessage(err, 'Yuklendi isareti verilemedi.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const dispatchOrder = () => {
    if (actionLoadingRef.current) return;
    if (!activeOrderNumber) return;
    if (!deliverySeries.trim() || !selectedDriver || !selectedVehicle) {
      Alert.alert('Irsaliye', 'Irsaliye serisi, sofor ve arac secimi zorunlu.');
      return;
    }
    Alert.alert('Irsaliyelestir', 'Bu siparis Mikroda irsaliyeye cevrilsin mi?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Irsaliye Kes',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            const result = await adminApi.markWarehouseDispatched(activeOrderNumber, {
              deliverySeries: deliverySeries.trim(),
              transport: {
                driverFirstName: selectedDriver.firstName,
                driverLastName: selectedDriver.lastName,
                driverTcNo: selectedDriver.tcNo,
                vehicleName: selectedVehicle.name,
                vehiclePlate: selectedVehicle.plate,
              },
            });
            await refreshActiveOrder();
            hapticSuccess();
            Alert.alert('Irsaliye tamam', result.workflow?.mikroDeliveryNoteNo || result.mikroDeliveryNoteNo || 'Irsaliye olusturuldu.');
          } catch (err: any) {
            Alert.alert('Irsaliye', getApiErrorMessage(err, 'Irsaliyelestirme basarisiz.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const searchRetailProducts = async () => {
    if (actionLoadingRef.current) return;
    if (!retailSearch.trim()) {
      Alert.alert('Perakende', 'Urun kodu veya adi girin.');
      return;
    }
    const requestSeq = retailRequestSeqRef.current + 1;
    retailRequestSeqRef.current = requestSeq;
    if (!beginAction()) return;
    try {
      const result = await adminApi.getWarehouseRetailProducts({
        search: retailSearch.trim(),
        limit: 40,
        warehouseNo: retailWarehouse,
        onlyInStock: true,
      });
      if (requestSeq === retailRequestSeqRef.current) {
        setRetailProducts(result.products || []);
      }
    } catch (err: any) {
      if (requestSeq === retailRequestSeqRef.current) {
        Alert.alert('Perakende', getApiErrorMessage(err, 'Urunler alinamadi.'));
      }
    } finally {
      if (requestSeq === retailRequestSeqRef.current) {
        endAction();
      }
    }
  };

  const addRetailProduct = (product: WarehouseRetailProduct) => {
    const unitPrice = priceForLevel(product, priceLevel);
    if (!unitPrice) {
      Alert.alert('Fiyat yok', `Perakende-${priceLevel} fiyati sifir.`);
      return;
    }
    setRetailCart((prev) => {
      const current = prev[product.productCode];
      return {
        ...prev,
        [product.productCode]: {
          product,
          quantity: (current?.quantity || 0) + 1,
          unitPrice,
        },
      };
    });
  };

  const changeRetailQty = (productCode: string, diff: number) => {
    setRetailCart((prev) => {
      const current = prev[productCode];
      if (!current) return prev;
      const quantity = Math.max(0, current.quantity + diff);
      if (!quantity) {
        const next = { ...prev };
        delete next[productCode];
        return next;
      }
      return { ...prev, [productCode]: { ...current, quantity } };
    });
  };

  const createRetailSale = () => {
    if (actionLoadingRef.current) return;
    if (!retailCartItems.length) {
      Alert.alert('Perakende', 'Sepet bos.');
      return;
    }
    Alert.alert('Perakende satis', `${money(retailTotal)} tutarinda satis olusturulsun mu?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Satis Olustur',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            const result = await adminApi.createWarehouseRetailSale({
              paymentType,
              priceLevel,
              items: retailCartItems.map((item) => ({
                productCode: item.product.productCode,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              })),
            });
            setLastRetailSale({ invoiceNo: result.invoiceNo, totalAmount: result.totalAmount });
            setRetailCart({});
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Perakende satis', getApiErrorMessage(err, 'Satis olusturulamadi.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const renderOrderCard = (order: WarehouseOverviewOrder) => (
    <TouchableOpacity key={order.mikroOrderNumber} style={[styles.card, isWide && styles.gridItem]} onPress={() => loadOrderDetail(order.mikroOrderNumber)}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={2}>{order.customerName}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{order.customerCode} · {order.mikroOrderNumber}</Text>
        </View>
        <View style={[styles.statusPill, order.workflowStatus === 'DISPATCHED' && styles.statusDone]}>
          <Text style={styles.statusText}>{statusLabel[order.workflowStatus]}</Text>
        </View>
      </View>
      <View style={styles.metricRow}>
        <Metric label="Kalem" value={order.itemCount} />
        <Metric label="Kapsam" value={`%${Math.round(order.coverage.coveredPercent || 0)}`} tone={order.coverageStatus === 'FULL' ? 'green' : order.coverageStatus === 'NONE' ? 'red' : 'amber'} />
        <Metric label="Tutar" value={money(order.grandTotal)} />
      </View>
      <Text style={styles.cardMeta} numberOfLines={1}>Siparis: {dateText(order.orderDate)} · Teslim: {dateText(order.deliveryDate)}</Text>
    </TouchableOpacity>
  );

  const renderOrders = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Depo siparisleri</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={search}
            onChangeText={setSearch}
            placeholder="Cari, seri veya siparis ara"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={loadOverview}
          />
          <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={loadOverview} disabled={loading}>
            <Text style={styles.primaryButtonText}>Ara</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {statusOptions.map((option) => (
            <Chip key={option.value} label={option.label} active={status === option.value} onPress={() => setStatus(option.value)} />
          ))}
        </ScrollView>
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.secondaryButton, loading && styles.buttonDisabled]} onPress={loadOverview} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Yenile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.warningButton, actionLoading && styles.buttonDisabled]} onPress={syncOrders} disabled={actionLoading}>
            <Text style={styles.warningButtonText}>Mikro Senkron</Text>
          </TouchableOpacity>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : overview.orders.length ? (
        <View style={isWide ? styles.grid : undefined}>{overview.orders.map(renderOrderCard)}</View>
      ) : (
        <Empty text="Siparis bulunamadi." />
      )}
    </>
  );

  const renderLine = (line: WarehouseOrderDetail['lines'][number]) => {
    const draft = lineDrafts[line.lineKey] || { pickedQty: '0', extraQty: '0', shelfCode: '' };
    const isHighlighted = highlightedLineKey === line.lineKey;
    return (
      <View key={line.lineKey} style={[styles.lineCard, isWide && styles.gridItem, isHighlighted && styles.lineHighlighted]}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.productTitle} numberOfLines={3}>{line.productName}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>Satir {line.rowNumber}</Text>
            <Text style={styles.cardMeta} numberOfLines={1}>{line.productCode} · {line.unit}</Text>
          </View>
          <View style={[styles.statusPill, line.stockCoverageStatus === 'FULL' && styles.statusDone, line.stockCoverageStatus === 'NONE' && styles.statusDanger]}>
            <Text style={styles.statusText}>{line.stockCoverageStatus}</Text>
          </View>
        </View>
        <View style={styles.metricRow}>
          <Metric label="Kalan" value={qtyText(line.remainingQty)} />
          <Metric label="Stok" value={qtyText(line.stockAvailable)} tone={line.stockCoverageStatus === 'FULL' ? 'green' : 'red'} />
          <Metric label="Raf" value={line.shelfCode || '-'} />
          <Metric label="Toplanan" value={qtyText(draft.pickedQty)} />
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.smallInput}
            value={draft.pickedQty}
            onChangeText={(value) => updateDraft(line.lineKey, { pickedQty: value })}
            keyboardType="decimal-pad"
            placeholder="Toplanan"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={styles.smallInput}
            value={draft.extraQty}
            onChangeText={(value) => updateDraft(line.lineKey, { extraQty: value })}
            keyboardType="decimal-pad"
            placeholder="Ek"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={[styles.smallInput, styles.flex]}
            value={draft.shelfCode}
            onChangeText={(value) => updateDraft(line.lineKey, { shelfCode: value })}
            placeholder="Raf"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.ghostButton, actionLoading && styles.buttonDisabled]} onPress={() => fillLineRemaining(line)} disabled={actionLoading}>
            <Text style={styles.ghostButtonText}>Kalani Forma Yaz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, actionLoading && styles.buttonDisabled]} onPress={() => completeLine(line)} disabled={actionLoading}>
            <Text style={styles.secondaryButtonText}>Tamami Kaydet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, actionLoading && styles.buttonDisabled]} onPress={() => saveLine(line)} disabled={actionLoading}>
            <Text style={styles.primaryButtonText}>Kaydet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ghostButton, (actionLoading || reportedLines[line.lineKey]) && styles.buttonDisabled]} onPress={() => reportImageIssue(line)} disabled={actionLoading || reportedLines[line.lineKey]}>
            <Text style={styles.ghostButtonText}>{reportedLines[line.lineKey] ? 'Bildirildi' : 'Gorsel Hata'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDetail = () => {
    if (!detail) return <Empty text="Siparis secin." />;
    return (
      <>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle} numberOfLines={2}>{detail.order.customerName}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>{detail.order.customerCode} · {detail.order.mikroOrderNumber}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{detail.workflow ? statusLabel[detail.workflow.status] : 'Bekleyen'}</Text>
            </View>
          </View>
          <View style={styles.metricRow}>
            <Metric label="Kalem" value={detail.order.itemCount} />
            <Metric label="Kapsam" value={`%${Math.round(detail.coverage.coveredPercent || 0)}`} />
            <Metric label="Tutar" value={money(detail.order.grandTotal)} />
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setView('orders')}>
              <Text style={styles.secondaryButtonText}>Liste</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, actionLoading && styles.buttonDisabled]} onPress={startPicking} disabled={actionLoading}>
              <Text style={styles.primaryButtonText}>Toplama Baslat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.warningButton, actionLoading && styles.buttonDisabled]} onPress={markLoaded} disabled={actionLoading}>
              <Text style={styles.warningButtonText}>Yuklendi</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Hizli okutma / satir bul</Text>
          <Text style={styles.cardMeta}>Urun kodu, isim, raf veya satir numarasi girin. Eslesen satir vurgulanir; otomatik kayit yapmaz.</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={lineSearch}
              onChangeText={(value) => {
                setLineSearch(value);
                if (!value.trim()) setHighlightedLineKey(null);
              }}
              placeholder="Barkod, urun kodu, raf..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              returnKeyType="search"
              onSubmitEditing={focusLineSearch}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={focusLineSearch}>
              <Text style={styles.primaryButtonText}>Bul</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.secondaryButton, (!highlightedLineKey || actionLoading) && styles.buttonDisabled]} onPress={fillHighlightedLine} disabled={!highlightedLineKey || actionLoading}>
              <Text style={styles.secondaryButtonText}>Kalani Doldur</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() => {
                setLineSearch('');
                setHighlightedLineKey(null);
              }}
            >
              <Text style={styles.ghostButtonText}>Temizle</Text>
            </TouchableOpacity>
            <Text style={styles.resultText}>{visibleDetailLines.length}/{detail.lines.length} satir</Text>
          </View>
        </View>
        {visibleDetailLines.length ? (
          <View style={isWide ? styles.grid : undefined}>{visibleDetailLines.map(renderLine)}</View>
        ) : (
          <Empty text="Bu aramayla eslesen siparis satiri yok." />
        )}
      </>
    );
  };

  const renderDispatch = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Irsaliye ve sevk</Text>
      <Text style={styles.cardMeta} numberOfLines={1}>{activeOrderNumber ? `Aktif siparis: ${activeOrderNumber}` : 'Once bir siparis secin.'}</Text>
      <TextInput
        style={styles.input}
        value={deliverySeries}
        onChangeText={setDeliverySeries}
        placeholder="Irsaliye serisi"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
      />
      <Text style={styles.label}>Sofor</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {activeDrivers.map((driver) => (
          <Chip key={driver.id} label={`${driver.firstName} ${driver.lastName}`} active={driverId === driver.id} onPress={() => setDriverId(driver.id)} />
        ))}
      </ScrollView>
      <Text style={styles.label}>Arac</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {activeVehicles.map((vehicle) => (
          <Chip key={vehicle.id} label={`${vehicle.name} ${vehicle.plate}`} active={vehicleId === vehicle.id} onPress={() => setVehicleId(vehicle.id)} />
        ))}
      </ScrollView>
      <TouchableOpacity style={[styles.primaryButton, (!activeOrderNumber || actionLoading) && styles.buttonDisabled]} onPress={dispatchOrder} disabled={!activeOrderNumber || actionLoading}>
        <Text style={styles.primaryButtonText}>Irsaliye Kes ve Sevk Et</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRetail = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Perakende satis</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={retailSearch}
            onChangeText={setRetailSearch}
            placeholder="Urun ara"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={searchRetailProducts}
          />
          <TouchableOpacity style={[styles.primaryButton, actionLoading && styles.buttonDisabled]} onPress={searchRetailProducts} disabled={actionLoading}>
            <Text style={styles.primaryButtonText}>Ara</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="Merkez" active={retailWarehouse === 1} onPress={() => setRetailWarehouse(1)} />
          <Chip label="Topca" active={retailWarehouse === 6} onPress={() => setRetailWarehouse(6)} />
          <Chip label="Tum Depolar" active={retailWarehouse === 0} onPress={() => setRetailWarehouse(0)} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {[1, 2, 3, 4, 5].map((level) => (
            <Chip key={level} label={`P${level}`} active={priceLevel === level} onPress={() => setPriceLevel(level as PriceLevel)} />
          ))}
          <Chip label="Nakit" active={paymentType === 'CASH'} onPress={() => setPaymentType('CASH')} />
          <Chip label="Kart" active={paymentType === 'CARD'} onPress={() => setPaymentType('CARD')} />
        </ScrollView>
      </View>
      <View style={isWide ? styles.grid : undefined}>
      {retailProducts.map((product) => (
        <TouchableOpacity key={product.productCode} style={[styles.card, isWide && styles.gridItem]} onPress={() => addRetailProduct(product)}>
          <Text style={styles.productTitle} numberOfLines={3}>{product.productName}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{product.productCode} · {product.unit}</Text>
          <View style={styles.metricRow}>
            <Metric label="Secili Stok" value={qtyText(product.stockSelected)} />
            <Metric label={`P${priceLevel}`} value={money(priceForLevel(product, priceLevel))} />
          </View>
        </TouchableOpacity>
      ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sepet</Text>
        {retailCartItems.length ? (
          retailCartItems.map((item) => (
            <View key={item.product.productCode} style={styles.cartLine}>
              <View style={styles.flex}>
                <Text style={styles.productTitle} numberOfLines={3}>{item.product.productName}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>{item.product.productCode} · {money(item.unitPrice)}</Text>
              </View>
              <View style={styles.qtyButtons}>
                <TouchableOpacity style={styles.roundButton} onPress={() => changeRetailQty(item.product.productCode, -1)}>
                  <Text style={styles.roundButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{qtyText(item.quantity)}</Text>
                <TouchableOpacity style={styles.roundButton} onPress={() => changeRetailQty(item.product.productCode, 1)}>
                  <Text style={styles.roundButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <Empty text="Sepet bos." />
        )}
        {lastRetailSale ? <Text style={styles.successText}>Son satis: {lastRetailSale.invoiceNo} · {money(lastRetailSale.totalAmount)}</Text> : null}
        <View style={styles.rowBetween}>
          <Text style={styles.totalLabel}>Toplam</Text>
          <Text style={styles.totalValue}>{money(retailTotal)}</Text>
        </View>
        <TouchableOpacity style={[styles.primaryButton, (!retailCartItems.length || actionLoading) && styles.buttonDisabled]} onPress={createRetailSale} disabled={!retailCartItems.length || actionLoading}>
          <Text style={styles.primaryButtonText}>Satis Olustur</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Depo Operasyonu</Text>
          <Text style={styles.title}>Depo Kiosk</Text>
          <Text style={styles.subtitle}>Toplama, yukleme, irsaliye ve perakende satis.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{overview.orders.length}</Text>
              <Text style={styles.heroMetricLabel}>Siparis</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{overview.series.length}</Text>
              <Text style={styles.heroMetricLabel}>Seri</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{detail?.lines?.length || 0}</Text>
              <Text style={styles.heroMetricLabel}>Detay Satiri</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={[styles.heroMetricValue, retailCartItems.length > 0 && styles.heroMetricGood]}>{retailCartItems.length}</Text>
              <Text style={styles.heroMetricLabel}>Perakende Sepet</Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label="Siparisler" active={view === 'orders'} onPress={() => setView('orders')} />
          <Chip label="Detay" active={view === 'detail'} onPress={() => setView('detail')} />
          <Chip label="Sevk" active={view === 'dispatch'} onPress={() => setView('dispatch')} />
          <Chip label="Perakende" active={view === 'retail'} onPress={() => setView('retail')} />
        </ScrollView>
        {actionLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {view === 'orders' ? renderOrders() : null}
        {view === 'detail' ? renderDetail() : null}
        {view === 'dispatch' ? renderDispatch() : null}
        {view === 'retail' ? renderRetail() : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DDE8FF', lineHeight: 20 },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroMetric: {
    flex: 1,
    minWidth: 118,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: spacing.md,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF' },
  heroMetricGood: { color: '#BBF7D0' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  tabRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDanger: { borderColor: colors.danger },
  chipText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  chipTextDanger: { color: colors.danger },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridItem: {
    width: '48.5%',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  lineCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  lineHighlighted: {
    backgroundColor: colors.warningSoft,
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  productTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  flex: { flex: 1 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text, marginTop: 2 },
  statusPill: {
    borderRadius: radius.sm,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusDone: { backgroundColor: colors.successSoft },
  statusDanger: { backgroundColor: colors.dangerSoft },
  statusText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  smallInput: {
    minWidth: 82,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  secondaryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  warningButton: {
    backgroundColor: colors.warningSoft,
    borderColor: '#FDBA74',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.warning },
  ghostButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  buttonDisabled: { opacity: 0.55 },
  resultText: { alignSelf: 'center', fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  qtyButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roundButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: '#FFFFFF' },
  qtyValue: { minWidth: 38, textAlign: 'center', fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text },
  totalLabel: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  totalValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.primarySoft },
  successText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.success },
  textDanger: { color: colors.danger },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
});
