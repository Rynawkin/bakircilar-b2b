import { useEffect, useMemo, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { usePortalAccess } from '../context/PortalAccessContext';
import { PortalStackParamList } from '../navigation/AppNavigator';
import {
  DashboardPrefs,
  DashboardQuickActionKey,
  DashboardReportCardKey,
  DashboardWidgetKey,
  getDashboardPrefs,
  saveDashboardPrefs,
} from '../storage/dashboard';
import { DashboardStats } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type PermissionMap = Record<string, boolean>;

const STOCK_TITLE_KEY = 'msg_S_0870';
const STOCK_CODE_KEY = 'msg_S_0078';
const CUSTOMER_TITLE_KEY = 'msg_S_1033';
const CUSTOMER_CODE_KEY = 'msg_S_1032';

const ALL_WIDGETS: DashboardWidgetKey[] = ['stats', 'quickActions', 'notifications', 'stockSearch', 'customerSearch'];
const PERIOD_OPTIONS: Array<{ key: 'daily' | 'weekly' | 'monthly'; label: string }> = [
  { key: 'daily', label: 'Gunluk' },
  { key: 'weekly', label: 'Haftalik' },
  { key: 'monthly', label: 'Aylik' },
];
const REPORT_CARD_LABELS: Record<DashboardReportCardKey, string> = {
  sales: 'Satis',
  quotes: 'Teklif',
  orders: 'Siparis',
};
const ALL_REPORT_CARDS: DashboardReportCardKey[] = ['sales', 'quotes', 'orders'];
const WIDGET_LABELS: Record<DashboardWidgetKey, string> = {
  stats: 'Istatistik',
  quickActions: 'Hizli Aksiyonlar',
  notifications: 'Bildirimler',
  stockSearch: 'Stok Arama',
  customerSearch: 'Cari Arama',
};

type QuickActionDef = {
  key: DashboardQuickActionKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: keyof PortalStackParamList;
  permission?: string;
};

const QUICK_ACTIONS: QuickActionDef[] = [
  { key: 'quoteCreate', label: 'Yeni Teklif', icon: 'document-text-outline', route: 'QuoteCreate', permission: 'admin:quotes' },
  { key: 'orderCreate', label: 'Manuel Siparis', icon: 'cart-outline', route: 'OrderCreate', permission: 'admin:orders' },
  { key: 'search', label: 'Stok/Cari Ara', icon: 'search-outline', route: 'Search' },
  { key: 'customers', label: 'Musteriler', icon: 'people-outline', route: 'Customers', permission: 'admin:customers' },
  { key: 'reports', label: 'Raporlar', icon: 'bar-chart-outline', route: 'Reports', permission: 'reports:cost-update-alerts' },
  { key: 'sync', label: 'Senkron', icon: 'sync-outline', route: 'Sync', permission: 'admin:sync' },
  { key: 'orderTracking', label: 'Siparis Takip', icon: 'trail-sign-outline', route: 'OrderTracking', permission: 'admin:order-tracking' },
  { key: 'eInvoices', label: 'E-Fatura', icon: 'receipt-outline', route: 'EInvoices', permission: 'admin:einvoices' },
];

const DEFAULT_QUICK_ACTIONS: DashboardQuickActionKey[] = ['quoteCreate', 'orderCreate', 'search', 'customers'];

const labelMap: Record<string, string> = {
  msg_S_0870: 'Urun',
  msg_S_0078: 'Kod',
  msg_S_1033: 'Cari',
  msg_S_1032: 'Cari Kod',
  msg_S_1530: 'Bakiye',
  'Merkez Depo': 'Merkez',
  'Topca Depo': 'Topca',
  'Toplam Satilabilir': 'Satilabilir',
};

const getLabel = (column: string) => labelMap[column] || column;
const toText = (value: any) => (value === null || value === undefined || value === '' ? '-' : String(value));
const formatNotificationTime = (value: string) => {
  try {
    return new Date(value).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return value;
  }
};
const formatCurrencyShort = (amount: number) =>
  Number(amount || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const toIsoDate = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getPeriodRange = (period: 'daily' | 'weekly' | 'monthly') => {
  const now = new Date();
  const start = new Date(now);
  if (period === 'weekly') {
    const day = start.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diffToMonday);
  } else if (period === 'monthly') {
    start.setDate(1);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
};

const withinRange = (value: string | undefined, start: Date, end: Date) => {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
};

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { user, signOut } = useAuth();
  const { permissions, loading: permissionsLoading } = usePortalAccess();
  const { notifications, unreadCount, loading: notificationsLoading, refresh: refreshNotifications, markRead, markAllRead } = useNotifications();
  const { width } = useWindowDimensions();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<DashboardWidgetKey[]>(ALL_WIDGETS);
  const [quickActions, setQuickActions] = useState<DashboardQuickActionKey[]>(DEFAULT_QUICK_ACTIONS);
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportCards, setReportCards] = useState<DashboardReportCardKey[]>(ALL_REPORT_CARDS);

  const [stockColumns, setStockColumns] = useState<string[]>([]);
  const [customerColumns, setCustomerColumns] = useState<string[]>([]);
  const [selectedStockColumns, setSelectedStockColumns] = useState<string[]>([]);
  const [selectedCustomerColumns, setSelectedCustomerColumns] = useState<string[]>([]);
  const [savingStockColumns, setSavingStockColumns] = useState(false);
  const [savingCustomerColumns, setSavingCustomerColumns] = useState(false);

  const [stockTerm, setStockTerm] = useState('');
  const [stockResults, setStockResults] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockColumnsOpen, setStockColumnsOpen] = useState(false);

  const [customerTerm, setCustomerTerm] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerColumnsOpen, setCustomerColumnsOpen] = useState(false);
  const columns = width >= 1080 ? 2 : 1;
  const availableWidth = Math.min(width, 1180) - spacing.xl * 2;
  const cardWidth = columns > 1 ? Math.floor((availableWidth - spacing.md) / 2) : undefined;

  const buildFallbackSummary = async (period: 'daily' | 'weekly' | 'monthly') => {
    const { start, end } = getPeriodRange(period);
    const [ordersResp, quotesResp] = await Promise.all([
      adminApi.getOrders({ page: 1, pageSize: 200 }).catch(() => ({ orders: [] as any[] })),
      adminApi.getQuotes({ page: 1, pageSize: 200 }).catch(() => ({ quotes: [] as any[] })),
    ]);

    const orders = (ordersResp as any)?.orders || [];
    const quotes = (quotesResp as any)?.quotes || [];
    const scopedOrders = orders.filter((item: any) => withinRange(item?.createdAt, start, end));
    const scopedQuotes = quotes.filter((item: any) => withinRange(item?.createdAt, start, end));

    const orderSummary = {
      count: scopedOrders.length,
      amount: scopedOrders.reduce((sum: number, item: any) => sum + Number(item?.totalAmount || 0), 0),
    };
    const quoteSummary = {
      count: scopedQuotes.length,
      amount: scopedQuotes.reduce((sum: number, item: any) => sum + Number(item?.grandTotal ?? item?.totalAmount ?? 0), 0),
    };

    const userAny = user as any;
    const sectorCodes = Array.isArray(userAny?.assignedSectorCodes) && userAny.assignedSectorCodes.length > 0
      ? userAny.assignedSectorCodes
      : userAny?.sectorCode
        ? [String(userAny.sectorCode)]
        : [];

    const salesResponses = sectorCodes.length > 0
      ? await Promise.all(
          sectorCodes.map((sector: string) =>
            adminApi.getTopCustomers({
              startDate: toIsoDate(start),
              endDate: toIsoDate(end),
              sector,
              page: 1,
              limit: 1,
            }).catch(() => null)
          )
        )
      : [
          await adminApi.getTopCustomers({
            startDate: toIsoDate(start),
            endDate: toIsoDate(end),
            page: 1,
            limit: 1,
          }).catch(() => null),
        ];

    const salesSummary = salesResponses.reduce(
      (acc, response: any) => {
        const summary = response?.data?.summary || {};
        const count =
          Number(summary?.totalOrders ?? summary?.orderCount ?? summary?.totalSalesCount ?? 0) || 0;
        const amount = Number(summary?.totalRevenue ?? summary?.revenue ?? summary?.totalAmount ?? 0) || 0;
        acc.count += count;
        acc.amount += amount;
        return acc;
      },
      { count: 0, amount: 0 }
    );

    return {
      period,
      periodRange: { startAt: start.toISOString(), endAt: end.toISOString() },
      sectorScope: {
        mode: sectorCodes.length > 0 ? 'assigned' : 'all',
        codes: sectorCodes,
      },
      summary: {
        sales: salesSummary,
        orders: orderSummary,
        quotes: quoteSummary,
      },
    };
  };

  const can = (permission: string) => !permissionsLoading && (!permissions || permissions[permission] !== false);
  const canSeeStats = () =>
    can('dashboard:orders') || can('dashboard:customers') || can('dashboard:excess-stock');
  const isReportCardAllowed = (card: DashboardReportCardKey) => {
    if (card === 'quotes') return can('admin:quotes');
    if (card === 'orders') return can('dashboard:orders') || can('admin:orders');
    return can('dashboard:orders');
  };
  const canUseSearch = can('dashboard:stok-ara') || can('dashboard:cari-ara');
  const canUseAction = (action: QuickActionDef) => {
    if (action.key === 'search') return canUseSearch;
    if (!action.permission) return true;
    return can(action.permission);
  };
  const isWidgetAllowed = (widget: DashboardWidgetKey) =>
    widget === 'stats'
      ? canSeeStats()
      : widget === 'stockSearch'
      ? can('dashboard:stok-ara')
      : widget === 'customerSearch'
        ? can('dashboard:cari-ara')
        : widget === 'notifications'
          ? can('admin:notifications')
          : true;

  const persistPrefs = async (next: DashboardPrefs) => {
    if (user?.id) await saveDashboardPrefs(user.id, next);
  };

  const applyPrefs = async (nextPermissions: PermissionMap | null) => {
    if (!user?.id) return;
    const stored = await getDashboardPrefs(user.id);
    const allowedWidgets = ALL_WIDGETS.filter((widget) => {
      if (!nextPermissions) return true;
      if (widget === 'stockSearch') return nextPermissions['dashboard:stok-ara'] !== false;
      if (widget === 'customerSearch') return nextPermissions['dashboard:cari-ara'] !== false;
      if (widget === 'notifications') return nextPermissions['admin:notifications'] !== false;
      return true;
    });

    const allowedAction = (key: DashboardQuickActionKey) => {
      const action = QUICK_ACTIONS.find((item) => item.key === key);
      if (!action) return false;
      if (action.key === 'search') {
        if (!nextPermissions) return true;
        return nextPermissions['dashboard:stok-ara'] !== false || nextPermissions['dashboard:cari-ara'] !== false;
      }
      if (!nextPermissions || !action.permission) return true;
      return nextPermissions[action.permission] !== false;
    };
    const allowedReportCard = (card: DashboardReportCardKey) => {
      if (!nextPermissions) return true;
      if (card === 'quotes') return nextPermissions['admin:quotes'] !== false;
      if (card === 'orders') {
        return nextPermissions['dashboard:orders'] !== false || nextPermissions['admin:orders'] !== false;
      }
      return nextPermissions['dashboard:orders'] !== false;
    };

    if (!stored) {
      setVisibleWidgets(allowedWidgets);
      setQuickActions(DEFAULT_QUICK_ACTIONS.filter(allowedAction));
      setReportCards(ALL_REPORT_CARDS.filter(allowedReportCard));
      return;
    }

    const widgets = stored.visibleWidgets.filter((widget) => allowedWidgets.includes(widget));
    const actions = stored.quickActions.filter(allowedAction);
    const cards = (stored.reportCards || ALL_REPORT_CARDS).filter((card) => ALL_REPORT_CARDS.includes(card) && allowedReportCard(card));
    const period = stored.period && PERIOD_OPTIONS.some((item) => item.key === stored.period) ? stored.period : 'daily';
    setVisibleWidgets(widgets.length > 0 ? widgets : allowedWidgets);
    setQuickActions(actions.length > 0 ? actions : DEFAULT_QUICK_ACTIONS.filter(allowedAction));
    setReportCards(cards.length > 0 ? cards : ALL_REPORT_CARDS);
    setSelectedPeriod(period);
  };

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, stockData, customerData, prefsData] = await Promise.all([
        adminApi.getDashboardStats({ period: selectedPeriod }),
        adminApi.getStockColumns().catch(() => ({ columns: [] as string[] })),
        adminApi.getCustomerColumns().catch(() => ({ columns: [] as string[] })),
        adminApi.getSearchPreferences().catch(() => null),
      ]);

      const nextPermissions = permissions || null;
      const statsHasSummary =
        Boolean((statsData as any)?.summary) &&
        typeof (statsData as any)?.summary?.sales?.count === 'number';
      const fallback = statsHasSummary ? null : await buildFallbackSummary(selectedPeriod);
      setStats(fallback ? ({ ...statsData, ...fallback } as DashboardStats) : statsData);
      setStockColumns(stockData.columns || []);
      setCustomerColumns(customerData.columns || []);

      const prefStock = prefsData?.preferences?.stockColumns || [];
      const prefCustomer = prefsData?.preferences?.customerColumns || [];
      setSelectedStockColumns(prefStock.length > 0 ? prefStock : (stockData.columns || []).slice(0, 5));
      setSelectedCustomerColumns(prefCustomer.length > 0 ? prefCustomer : (customerData.columns || []).slice(0, 5));
      await applyPrefs(nextPermissions);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Dashboard verisi yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (permissionsLoading) return;
    loadDashboardData();
  }, [user?.id, selectedPeriod, permissionsLoading, permissions]);

  const toggleWidget = async (widget: DashboardWidgetKey) => {
    if (!isWidgetAllowed(widget)) return;
    const next = visibleWidgets.includes(widget)
      ? visibleWidgets.filter((item) => item !== widget)
      : [...visibleWidgets, widget];
    if (next.length === 0) return;
    setVisibleWidgets(next);
    await persistPrefs({ visibleWidgets: next, quickActions, reportCards, period: selectedPeriod });
    hapticLight();
  };

  const toggleQuickAction = async (key: DashboardQuickActionKey) => {
    const action = QUICK_ACTIONS.find((item) => item.key === key);
    if (action && !canUseAction(action)) return;
    const next = quickActions.includes(key)
      ? quickActions.filter((item) => item !== key)
      : [...quickActions, key];
    if (next.length === 0) return;
    setQuickActions(next);
    await persistPrefs({ visibleWidgets, quickActions: next, reportCards, period: selectedPeriod });
    hapticLight();
  };

  const toggleReportCard = async (key: DashboardReportCardKey) => {
    if (!isReportCardAllowed(key)) return;
    const next = reportCards.includes(key)
      ? reportCards.filter((item) => item !== key)
      : [...reportCards, key];
    if (next.length === 0) return;
    setReportCards(next);
    await persistPrefs({ visibleWidgets, quickActions, reportCards: next, period: selectedPeriod });
    hapticLight();
  };

  const persistStockColumns = async (columns: string[]) => {
    setSavingStockColumns(true);
    try {
      await adminApi.updateSearchPreferences({ stockColumns: columns });
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Stok kolon tercihleri kaydedilemedi.'));
    } finally {
      setSavingStockColumns(false);
    }
  };

  const persistCustomerColumns = async (columns: string[]) => {
    setSavingCustomerColumns(true);
    try {
      await adminApi.updateSearchPreferences({ customerColumns: columns });
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Cari kolon tercihleri kaydedilemedi.'));
    } finally {
      setSavingCustomerColumns(false);
    }
  };

  const toggleStockColumn = (column: string) => {
    const next = selectedStockColumns.includes(column)
      ? selectedStockColumns.filter((item) => item !== column)
      : [...selectedStockColumns, column];
    if (next.length === 0) return;
    setSelectedStockColumns(next);
    persistStockColumns(next);
  };

  const toggleCustomerColumn = (column: string) => {
    const next = selectedCustomerColumns.includes(column)
      ? selectedCustomerColumns.filter((item) => item !== column)
      : [...selectedCustomerColumns, column];
    if (next.length === 0) return;
    setSelectedCustomerColumns(next);
    persistCustomerColumns(next);
  };

  const searchStocks = async () => {
    hapticLight();
    navigation.navigate('Search', {
      mode: 'stocks',
      term: stockTerm.trim(),
      autoRun: true,
    });
  };

  const searchCustomers = async () => {
    hapticLight();
    navigation.navigate('Search', {
      mode: 'customers',
      term: customerTerm.trim(),
      autoRun: true,
    });
  };

  const stockVisibleColumns = useMemo(
    () => selectedStockColumns.filter((column) => ![STOCK_TITLE_KEY, STOCK_CODE_KEY].includes(column)),
    [selectedStockColumns]
  );
  const customerVisibleColumns = useMemo(
    () => selectedCustomerColumns.filter((column) => ![CUSTOMER_TITLE_KEY, CUSTOMER_CODE_KEY].includes(column)),
    [selectedCustomerColumns]
  );

  const activeQuickActions = useMemo(() => {
    const actionMap = new Map(QUICK_ACTIONS.map((item) => [item.key, item]));
    return quickActions
      .map((key) => actionMap.get(key))
      .filter((item): item is QuickActionDef => Boolean(item))
      .filter((item) => canUseAction(item));
  }, [quickActions, permissions]);

  const hasWidget = (widget: DashboardWidgetKey) => visibleWidgets.includes(widget) && isWidgetAllowed(widget);

  return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeader}>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.kicker}>Operasyon Paneli · {PERIOD_OPTIONS.find((item) => item.key === selectedPeriod)?.label}</Text>
              <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">{user?.name || 'Bakircilar'}</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.heroIconButton}
                onPress={() => {
                  hapticLight();
                  refreshNotifications();
                }}
              >
                <Ionicons name="notifications-outline" size={19} color={colors.textSoft} />
                {unreadCount > 0 ? <View style={styles.heroDot} /> : null}
              </TouchableOpacity>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(user?.name || 'BK').split(' ').slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroTitleWrap}>
                <Text style={styles.focusLabel}>Onayli Satis</Text>
                <Text style={styles.focusValue}>₺{formatCurrencyShort(stats?.summary?.sales?.amount || 0)}</Text>
              </View>
              <View style={styles.periodSegment}>
                {PERIOD_OPTIONS.map((option) => {
                  const selected = selectedPeriod === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.periodButton, selected && styles.periodButtonActive]}
                      onPress={async () => {
                        setSelectedPeriod(option.key);
                        await persistPrefs({ visibleWidgets, quickActions, reportCards, period: option.key });
                        hapticLight();
                      }}
                    >
                      <Text style={[styles.periodButtonText, selected && styles.periodButtonTextActive]}>
                        {option.key === 'daily' ? 'Gun' : option.key === 'weekly' ? 'Hafta' : 'Ay'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.focusMetaRow}>
              <View style={styles.focusTrend}>
                <Ionicons name="trending-up" size={13} color={colors.success} />
                <Text style={styles.focusTrendText}>{stats?.summary?.sales?.count ?? 0} belge</Text>
              </View>
              <Text style={styles.focusMeta} numberOfLines={1}>
                {stats?.sectorScope?.codes?.length ? `${stats.sectorScope.codes.length} sektor kapsami` : 'Tum yetkili kapsam'}
              </Text>
            </View>
            <View style={styles.heroMetricRow}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>₺{formatCurrencyShort(stats?.summary?.quotes?.amount || 0)}</Text>
                <Text style={styles.heroMetricLabel}>Teklif · {stats?.summary?.quotes?.count ?? 0}</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>₺{formatCurrencyShort(stats?.summary?.orders?.amount || 0)}</Text>
                <Text style={styles.heroMetricLabel}>Siparis · {stats?.summary?.orders?.count ?? 0}</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={[styles.heroMetricValue, (stats?.orders?.pendingCount || 0) > 0 && styles.heroMetricWarn]}>{stats?.orders?.pendingCount ?? 0}</Text>
                <Text style={styles.heroMetricLabel}>Onay bekleyen</Text>
              </View>
            </View>
          </View>

          <View style={styles.customizeCard}>
          <TouchableOpacity
            style={styles.rowBetween}
            onPress={() => {
              hapticLight();
              setCustomizeOpen((prev) => !prev);
            }}
          >
            <Text style={styles.customizeTitle} numberOfLines={1}>Paneli Kisisellestir</Text>
            <Ionicons name={customizeOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
          </TouchableOpacity>
          {customizeOpen && (
            <>
              <Text style={styles.sectionLabel}>Widgetlar</Text>
              <View style={styles.chipWrap}>
                {ALL_WIDGETS.map((widget) => {
                  const selected = visibleWidgets.includes(widget);
                  const disabled = !isWidgetAllowed(widget);
                  return (
                    <TouchableOpacity
                      key={widget}
                      style={[styles.chip, selected && styles.chipActive, disabled && styles.chipDisabled]}
                      onPress={() => toggleWidget(widget)}
                      disabled={disabled}
                    >
                      <Text style={selected ? styles.chipTextActive : styles.chipText}>{WIDGET_LABELS[widget]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.sectionLabel}>Hizli Aksiyonlar</Text>
              <View style={styles.chipWrap}>
                {QUICK_ACTIONS.map((action) => {
                  const selected = quickActions.includes(action.key);
                  const disabled = !canUseAction(action);
                  return (
                    <TouchableOpacity
                      key={action.key}
                      style={[styles.chip, selected && styles.chipActive, disabled && styles.chipDisabled]}
                      onPress={() => toggleQuickAction(action.key)}
                      disabled={disabled}
                    >
                      <Text style={selected ? styles.chipTextActive : styles.chipText}>{action.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.sectionLabel}>Dashboard Donemi</Text>
              <View style={styles.chipWrap}>
                {PERIOD_OPTIONS.map((option) => {
                  const selected = selectedPeriod === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.chip, selected && styles.chipActive]}
                      onPress={async () => {
                        setSelectedPeriod(option.key);
                        await persistPrefs({
                          visibleWidgets,
                          quickActions,
                          reportCards,
                          period: option.key,
                        });
                        hapticLight();
                      }}
                    >
                      <Text style={selected ? styles.chipTextActive : styles.chipText}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.sectionLabel}>Rapor Kartlari</Text>
              <View style={styles.chipWrap}>
                {ALL_REPORT_CARDS.map((card) => {
                  const selected = reportCards.includes(card);
                  const disabled = !isReportCardAllowed(card);
                  return (
                    <TouchableOpacity
                      key={card}
                      style={[styles.chip, selected && styles.chipActive, disabled && styles.chipDisabled]}
                      onPress={() => toggleReportCard(card)}
                      disabled={disabled}
                    >
                      <Text style={selected ? styles.chipTextActive : styles.chipText}>{REPORT_CARD_LABELS[card]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <>
            {error && (
              <TouchableOpacity style={styles.errorCard} onPress={loadDashboardData}>
                <Text style={styles.error} numberOfLines={3}>{error}</Text>
                <Text style={styles.retryText}>Tekrar dene</Text>
              </TouchableOpacity>
            )}

            {hasWidget('stats') && (
              <View style={styles.section}>
                <Text style={styles.metaText} numberOfLines={2}>
                  Donem: {PERIOD_OPTIONS.find((item) => item.key === selectedPeriod)?.label || 'Gunluk'}
                  {stats?.sectorScope?.codes?.length ? ` | Sektor: ${stats.sectorScope.codes.join(', ')}` : ''}
                </Text>
                <View style={[styles.statGrid, columns > 1 && styles.statGridTablet]}>
                {reportCards.includes('sales') && isReportCardAllowed('sales') && (
                  <View style={[styles.statCard, cardWidth ? { width: cardWidth } : null]}>
                    <Text style={styles.statLabel} numberOfLines={1}>Satis (Onayli)</Text>
                    <Text style={styles.statValue}>{stats?.summary?.sales?.count ?? 0}</Text>
                    <Text style={styles.resultMeta} numberOfLines={1}>{formatCurrencyShort(stats?.summary?.sales?.amount || 0)} TL</Text>
                  </View>
                )}
                {reportCards.includes('quotes') && isReportCardAllowed('quotes') && (
                  <View style={[styles.statCard, cardWidth ? { width: cardWidth } : null]}>
                    <Text style={styles.statLabel} numberOfLines={1}>Teklif</Text>
                    <Text style={styles.statValue}>{stats?.summary?.quotes?.count ?? 0}</Text>
                    <Text style={styles.resultMeta} numberOfLines={1}>{formatCurrencyShort(stats?.summary?.quotes?.amount || 0)} TL</Text>
                  </View>
                )}
                {reportCards.includes('orders') && isReportCardAllowed('orders') && (
                  <View style={[styles.statCard, cardWidth ? { width: cardWidth } : null]}>
                    <Text style={styles.statLabel} numberOfLines={1}>Siparis</Text>
                    <Text style={styles.statValue}>{stats?.summary?.orders?.count ?? 0}</Text>
                    <Text style={styles.resultMeta} numberOfLines={1}>{formatCurrencyShort(stats?.summary?.orders?.amount || 0)} TL</Text>
                  </View>
                )}
                {can('dashboard:orders') ? (
                  <>
                    <View style={[styles.statCard, cardWidth ? { width: cardWidth } : null]}>
                      <Text style={styles.statLabel} numberOfLines={1}>Bekleyen Siparis</Text>
                      <Text style={styles.statValue}>{stats?.orders?.pendingCount ?? 0}</Text>
                    </View>
                    <View style={[styles.statCard, cardWidth ? { width: cardWidth } : null]}>
                      <Text style={styles.statLabel} numberOfLines={1}>Bugun Onay</Text>
                      <Text style={styles.statValue}>{stats?.orders?.approvedToday ?? 0}</Text>
                    </View>
                  </>
                ) : null}
                {can('dashboard:customers') ? (
                  <View style={[styles.statCard, cardWidth ? { width: cardWidth } : null]}>
                    <Text style={styles.statLabel} numberOfLines={1}>Musteri</Text>
                    <Text style={styles.statValue}>{stats?.customerCount ?? 0}</Text>
                  </View>
                ) : null}
                {can('dashboard:excess-stock') ? (
                  <View style={[styles.statCard, cardWidth ? { width: cardWidth } : null]}>
                    <Text style={styles.statLabel} numberOfLines={1}>Fazla Stok</Text>
                    <Text style={styles.statValue}>{stats?.excessProductCount ?? 0}</Text>
                  </View>
                ) : null}
                </View>
              </View>
            )}

            {hasWidget('quickActions') && (
              <View style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={1}>Hizli Aksiyonlar</Text>
                <View style={styles.quickGrid}>
                  {activeQuickActions.map((action, index) => (
                    <TouchableOpacity
                      key={action.key}
                      style={[
                        styles.quickCard,
                        index === 0 && styles.quickCardPrimary,
                        index === 1 && styles.quickCardSuccess,
                        index > 1 && styles.quickCardCompact,
                        cardWidth ? { width: cardWidth } : null,
                      ]}
                      onPress={() => {
                        hapticLight();
                        navigation.navigate(action.route as never);
                      }}
                    >
                      <View style={styles.quickIcon}>
                        <Ionicons name={action.icon} size={18} color={index < 2 ? '#FFFFFF' : colors.primarySoft} />
                      </View>
                      <Text style={styles.quickLabel} numberOfLines={2}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {hasWidget('notifications') && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle} numberOfLines={1}>Bildirimler</Text>
                  <View style={styles.inlineActions}>
                    <TouchableOpacity onPress={() => { hapticLight(); navigation.navigate('Notifications'); }}><Text style={styles.linkText}>Merkez</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { hapticLight(); refreshNotifications(); }}><Text style={styles.linkText}>Yenile</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { hapticLight(); markAllRead(); }}><Text style={styles.linkText}>Tumunu Oku</Text></TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.metaText}>Okunmamis: {unreadCount}</Text>
                {notificationsLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <View style={styles.section}>
                    {notifications.slice(0, 6).map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.resultCard, !item.isRead && styles.resultCardUnread]}
                        onPress={() => {
                          if (!item.isRead) markRead([item.id]);
                          hapticLight();
                          navigation.navigate('Notifications');
                        }}
                      >
                        <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
                        {item.body ? <Text style={styles.resultMeta} numberOfLines={2}>{item.body}</Text> : null}
                        <Text style={styles.resultMeta} numberOfLines={1}>{formatNotificationTime(item.createdAt)}</Text>
                      </TouchableOpacity>
                    ))}
                    {notifications.length === 0 && <Text style={styles.emptyText}>Bildirim yok.</Text>}
                  </View>
                )}
              </View>
            )}

            {hasWidget('stockSearch') && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle} numberOfLines={1}>Stok Ara</Text>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Search', { mode: 'stocks', term: stockTerm.trim(), openColumns: true })}
                  >
                    <Text style={styles.linkText} numberOfLines={1}>Alanlari Sec</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, styles.flex]}
                    placeholder="Stok kodu veya adi"
                    placeholderTextColor={colors.textMuted}
                    value={stockTerm}
                    onChangeText={setStockTerm}
                    onSubmitEditing={searchStocks}
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={searchStocks}>
                    <Text style={styles.primaryBtnText} numberOfLines={1}>Detayli Ara</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.metaText} numberOfLines={2}>Sonuclar ve kolon secimi arama ekraninda acilir.</Text>
              </View>
            )}

            {hasWidget('customerSearch') && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle} numberOfLines={1}>Cari Ara</Text>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Search', { mode: 'customers', term: customerTerm.trim(), openColumns: true })}
                  >
                    <Text style={styles.linkText} numberOfLines={1}>Alanlari Sec</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, styles.flex]}
                    placeholder="Cari kodu veya unvan"
                    placeholderTextColor={colors.textMuted}
                    value={customerTerm}
                    onChangeText={setCustomerTerm}
                    onSubmitEditing={searchCustomers}
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={searchCustomers}>
                    <Text style={styles.primaryBtnText} numberOfLines={1}>Detayli Ara</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.metaText} numberOfLines={2}>Sonuclar ve kolon secimi arama ekraninda acilir.</Text>
              </View>
            )}

            <View style={styles.signOutWrap}>
              <Text style={styles.metaText}>Guvenli cikis</Text>
              <Text style={styles.linkBig} onPress={() => { hapticLight(); signOut(); }}>Cikis Yap</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  loading: { alignItems: 'center', paddingVertical: spacing.xl },
  errorCard: { backgroundColor: colors.dangerSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(248,113,113,0.30)', padding: spacing.md, gap: spacing.xs },
  pageHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hero: { backgroundColor: colors.backgroundRaised, borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md, shadowColor: '#020713', shadowOpacity: 0.34, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  heroTitleWrap: { flex: 1, minWidth: 0 },
  heroIconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#153E73', borderWidth: 1, borderColor: colors.borderStrong },
  avatarText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.textStrong },
  heroDot: { position: 'absolute', right: 8, top: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warning, borderWidth: 2, borderColor: colors.backgroundRaised },
  kicker: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xl, lineHeight: fontSizes.xl + 5, color: colors.textStrong },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, lineHeight: fontSizes.sm + 5, color: colors.textSoft },
  focusLabel: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textSoft },
  focusValue: { marginTop: spacing.xs, fontFamily: fonts.monoSemibold, fontSize: 31, lineHeight: 38, color: colors.textStrong, letterSpacing: -0.5 },
  periodSegment: { flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  periodButton: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 7 },
  periodButtonActive: { backgroundColor: '#FFFFFF' },
  periodButtonText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  periodButtonTextActive: { fontFamily: fonts.bold, color: '#0B1F3F' },
  focusMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  focusTrend: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.successSoft },
  focusTrendText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.success },
  focusMeta: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  heroMetricRow: { flexDirection: 'row', gap: spacing.sm },
  heroMetric: { flex: 1, minWidth: 0, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, gap: 2 },
  heroMetricValue: { fontFamily: fonts.monoSemibold, fontSize: fontSizes.sm, color: colors.textStrong },
  heroMetricWarn: { color: colors.warning },
  heroMetricLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textSoft },
  customizeCard: { backgroundColor: colors.primaryMuted, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, gap: spacing.sm, shadowColor: '#020713', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  customizeTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.primarySoft },
  sectionLabel: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  section: { gap: spacing.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statGridTablet: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, shadowColor: '#020713', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  statCard: { flexGrow: 1, minWidth: 112, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  statLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  statValue: { fontFamily: fonts.monoSemibold, fontSize: fontSizes.lg, color: colors.text },
  cardTitle: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  inlineActions: { flexShrink: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.md },
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surface },
  chipActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  chipDisabled: { opacity: 0.35 },
  chipText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  chipTextActive: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: '#0B1F3F' },
  input: { minWidth: 180, minHeight: 44, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  flex: { flex: 1, minWidth: 0 },
  primaryBtn: { flexShrink: 0, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primaryBtnText: { fontFamily: fonts.semibold, color: '#FFFFFF', fontSize: fontSizes.sm },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickCard: { flexGrow: 1, minWidth: '47%', borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: spacing.md, backgroundColor: colors.surface, flexDirection: 'column', alignItems: 'flex-start', gap: spacing.sm },
  quickCardPrimary: { backgroundColor: '#143E73', borderColor: colors.borderStrong, minHeight: 94 },
  quickCardSuccess: { backgroundColor: '#0E3D2E', borderColor: 'rgba(52,211,153,0.30)', minHeight: 94 },
  quickCardCompact: { flexDirection: 'row', alignItems: 'center', minHeight: 50 },
  quickIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  quickLabel: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.sm, lineHeight: fontSizes.sm + 4, color: colors.text },
  resultCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  resultCardUnread: { borderColor: colors.success, borderLeftWidth: 3, backgroundColor: colors.surfaceAlt },
  resultTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, lineHeight: fontSizes.sm + 5, color: colors.text },
  resultMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, lineHeight: fontSizes.xs + 5, color: colors.textMuted },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  fieldLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted, flex: 1 },
  fieldValue: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.text, flex: 1, textAlign: 'right' },
  metaText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, lineHeight: fontSizes.sm + 5, color: colors.textMuted },
  linkText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.primarySoft },
  linkBig: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.primarySoft, marginTop: spacing.xs },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  signOutWrap: { marginTop: spacing.md, alignItems: 'flex-start' },
  error: { fontFamily: fonts.medium, color: colors.danger },
  retryText: { fontFamily: fonts.semibold, color: colors.danger, fontSize: fontSizes.sm },
});
