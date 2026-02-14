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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { PortalStackParamList } from '../navigation/AppNavigator';
import {
  DashboardPrefs,
  DashboardQuickActionKey,
  DashboardWidgetKey,
  getDashboardPrefs,
  saveDashboardPrefs,
} from '../storage/dashboard';
import { DashboardStats } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type PermissionMap = Record<string, boolean>;

const STOCK_TITLE_KEY = 'msg_S_0870';
const STOCK_CODE_KEY = 'msg_S_0078';
const CUSTOMER_TITLE_KEY = 'msg_S_1033';
const CUSTOMER_CODE_KEY = 'msg_S_1032';

const ALL_WIDGETS: DashboardWidgetKey[] = ['stats', 'quickActions', 'notifications', 'stockSearch', 'customerSearch'];
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

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { user, signOut } = useAuth();
  const { notifications, unreadCount, loading: notificationsLoading, refresh: refreshNotifications, markRead, markAllRead } = useNotifications();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<DashboardWidgetKey[]>(ALL_WIDGETS);
  const [quickActions, setQuickActions] = useState<DashboardQuickActionKey[]>(DEFAULT_QUICK_ACTIONS);

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

  const can = (permission: string) => !permissions || permissions[permission] !== false;
  const canUseSearch = can('dashboard:stok-ara') || can('dashboard:cari-ara');
  const canUseAction = (action: QuickActionDef) => {
    if (action.key === 'search') return canUseSearch;
    if (!action.permission) return true;
    return can(action.permission);
  };
  const isWidgetAllowed = (widget: DashboardWidgetKey) =>
    widget === 'stockSearch'
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

    if (!stored) {
      setVisibleWidgets(allowedWidgets);
      setQuickActions(DEFAULT_QUICK_ACTIONS.filter(allowedAction));
      return;
    }

    const widgets = stored.visibleWidgets.filter((widget) => allowedWidgets.includes(widget));
    const actions = stored.quickActions.filter(allowedAction);
    setVisibleWidgets(widgets.length > 0 ? widgets : allowedWidgets);
    setQuickActions(actions.length > 0 ? actions : DEFAULT_QUICK_ACTIONS.filter(allowedAction));
  };

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, permsData, stockData, customerData, prefsData] = await Promise.all([
        adminApi.getDashboardStats(),
        adminApi.getMyPermissions().catch(() => null),
        adminApi.getStockColumns().catch(() => ({ columns: [] as string[] })),
        adminApi.getCustomerColumns().catch(() => ({ columns: [] as string[] })),
        adminApi.getSearchPreferences().catch(() => null),
      ]);

      const nextPermissions = permsData?.permissions || null;
      setStats(statsData);
      setPermissions(nextPermissions);
      setStockColumns(stockData.columns || []);
      setCustomerColumns(customerData.columns || []);

      const prefStock = prefsData?.preferences?.stockColumns || [];
      const prefCustomer = prefsData?.preferences?.customerColumns || [];
      setSelectedStockColumns(prefStock.length > 0 ? prefStock : (stockData.columns || []).slice(0, 5));
      setSelectedCustomerColumns(prefCustomer.length > 0 ? prefCustomer : (customerData.columns || []).slice(0, 5));
      await applyPrefs(nextPermissions);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Dashboard verisi yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [user?.id]);

  const toggleWidget = async (widget: DashboardWidgetKey) => {
    if (!isWidgetAllowed(widget)) return;
    const next = visibleWidgets.includes(widget)
      ? visibleWidgets.filter((item) => item !== widget)
      : [...visibleWidgets, widget];
    if (next.length === 0) return;
    setVisibleWidgets(next);
    await persistPrefs({ visibleWidgets: next, quickActions });
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
    await persistPrefs({ visibleWidgets, quickActions: next });
    hapticLight();
  };

  const persistStockColumns = async (columns: string[]) => {
    setSavingStockColumns(true);
    try {
      await adminApi.updateSearchPreferences({ stockColumns: columns });
      hapticSuccess();
    } catch {
      Alert.alert('Hata', 'Stok kolon tercihleri kaydedilemedi.');
    } finally {
      setSavingStockColumns(false);
    }
  };

  const persistCustomerColumns = async (columns: string[]) => {
    setSavingCustomerColumns(true);
    try {
      await adminApi.updateSearchPreferences({ customerColumns: columns });
      hapticSuccess();
    } catch {
      Alert.alert('Hata', 'Cari kolon tercihleri kaydedilemedi.');
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
    setStockLoading(true);
    try {
      const response = await adminApi.searchStocks({ searchTerm: stockTerm.trim(), limit: 10, offset: 0 });
      setStockResults(response.data || []);
      hapticLight();
    } catch {
      setStockResults([]);
      Alert.alert('Hata', 'Stok aramasi basarisiz.');
    } finally {
      setStockLoading(false);
    }
  };

  const searchCustomers = async () => {
    setCustomerLoading(true);
    try {
      const response = await adminApi.searchCustomers({ searchTerm: customerTerm.trim(), limit: 10, offset: 0 });
      setCustomerResults(response.data || []);
      hapticLight();
    } catch {
      setCustomerResults([]);
      Alert.alert('Hata', 'Cari aramasi basarisiz.');
    } finally {
      setCustomerLoading(false);
    }
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
        <Text style={styles.kicker}>Operasyon Paneli</Text>
        <Text style={styles.title}>{user?.name || 'Bakircilar'}</Text>
        <Text style={styles.subtitle}>Push bildirimli ve kisilestirilebilir dashboard.</Text>

        <View style={styles.customizeCard}>
          <TouchableOpacity
            style={styles.rowBetween}
            onPress={() => {
              hapticLight();
              setCustomizeOpen((prev) => !prev);
            }}
          >
            <Text style={styles.customizeTitle}>Paneli Kisisellestir</Text>
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
            </>
          )}
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <>
            {error && <Text style={styles.error}>{error}</Text>}

            {hasWidget('stats') && (
              <View style={styles.section}>
                <View style={styles.statCard}><Text style={styles.statLabel}>Bekleyen Siparis</Text><Text style={styles.statValue}>{stats?.orders?.pendingCount ?? 0}</Text></View>
                <View style={styles.statCard}><Text style={styles.statLabel}>Bugun Onay</Text><Text style={styles.statValue}>{stats?.orders?.approvedToday ?? 0}</Text></View>
                <View style={styles.statCard}><Text style={styles.statLabel}>Musteri</Text><Text style={styles.statValue}>{stats?.customerCount ?? 0}</Text></View>
                <View style={styles.statCard}><Text style={styles.statLabel}>Fazla Stok</Text><Text style={styles.statValue}>{stats?.excessProductCount ?? 0}</Text></View>
              </View>
            )}

            {hasWidget('quickActions') && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Hizli Aksiyonlar</Text>
                <View style={styles.quickGrid}>
                  {activeQuickActions.map((action) => (
                    <TouchableOpacity
                      key={action.key}
                      style={styles.quickCard}
                      onPress={() => {
                        hapticLight();
                        navigation.navigate(action.route as never);
                      }}
                    >
                      <Ionicons name={action.icon} size={18} color={colors.primary} />
                      <Text style={styles.quickLabel}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {hasWidget('notifications') && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Bildirimler</Text>
                  <View style={styles.inlineActions}>
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
                        }}
                      >
                        <Text style={styles.resultTitle}>{item.title}</Text>
                        {item.body ? <Text style={styles.resultMeta}>{item.body}</Text> : null}
                        <Text style={styles.resultMeta}>{formatNotificationTime(item.createdAt)}</Text>
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
                  <Text style={styles.cardTitle}>Stok Ara</Text>
                  <TouchableOpacity onPress={() => setStockColumnsOpen((prev) => !prev)}><Text style={styles.linkText}>{stockColumnsOpen ? 'Alanlari Gizle' : 'Alanlari Sec'}</Text></TouchableOpacity>
                </View>
                {stockColumnsOpen && (
                  <View style={styles.chipWrap}>
                    {stockColumns.map((column) => {
                      const selected = selectedStockColumns.includes(column);
                      return (
                        <TouchableOpacity key={column} style={[styles.chip, selected && styles.chipActive]} onPress={() => toggleStockColumn(column)} disabled={savingStockColumns}>
                          <Text style={selected ? styles.chipTextActive : styles.chipText}>{getLabel(column)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                <View style={styles.searchRow}>
                  <TextInput style={[styles.input, styles.flex]} placeholder="Stok kodu veya adi" placeholderTextColor={colors.textMuted} value={stockTerm} onChangeText={setStockTerm} onSubmitEditing={searchStocks} />
                  <TouchableOpacity style={styles.primaryBtn} onPress={searchStocks}><Text style={styles.primaryBtnText}>Ara</Text></TouchableOpacity>
                </View>
                {stockLoading ? <ActivityIndicator color={colors.primary} /> : (
                  <View style={styles.section}>
                    {stockResults.map((row, index) => (
                      <View key={`${row[STOCK_CODE_KEY] || index}`} style={styles.resultCard}>
                        <Text style={styles.resultTitle}>{toText(row[STOCK_TITLE_KEY])}</Text>
                        <Text style={styles.resultMeta}>{toText(row[STOCK_CODE_KEY])}</Text>
                        {stockVisibleColumns.map((column) => (
                          <View key={`${row[STOCK_CODE_KEY]}-${column}`} style={styles.fieldRow}>
                            <Text style={styles.fieldLabel}>{getLabel(column)}</Text>
                            <Text style={styles.fieldValue}>{toText(row[column])}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                    {stockResults.length === 0 && <Text style={styles.emptyText}>Arama sonucu yok.</Text>}
                  </View>
                )}
              </View>
            )}

            {hasWidget('customerSearch') && (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Cari Ara</Text>
                  <TouchableOpacity onPress={() => setCustomerColumnsOpen((prev) => !prev)}><Text style={styles.linkText}>{customerColumnsOpen ? 'Alanlari Gizle' : 'Alanlari Sec'}</Text></TouchableOpacity>
                </View>
                {customerColumnsOpen && (
                  <View style={styles.chipWrap}>
                    {customerColumns.map((column) => {
                      const selected = selectedCustomerColumns.includes(column);
                      return (
                        <TouchableOpacity key={column} style={[styles.chip, selected && styles.chipActive]} onPress={() => toggleCustomerColumn(column)} disabled={savingCustomerColumns}>
                          <Text style={selected ? styles.chipTextActive : styles.chipText}>{getLabel(column)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                <View style={styles.searchRow}>
                  <TextInput style={[styles.input, styles.flex]} placeholder="Cari kodu veya unvan" placeholderTextColor={colors.textMuted} value={customerTerm} onChangeText={setCustomerTerm} onSubmitEditing={searchCustomers} />
                  <TouchableOpacity style={styles.primaryBtn} onPress={searchCustomers}><Text style={styles.primaryBtnText}>Ara</Text></TouchableOpacity>
                </View>
                {customerLoading ? <ActivityIndicator color={colors.primary} /> : (
                  <View style={styles.section}>
                    {customerResults.map((row, index) => (
                      <View key={`${row[CUSTOMER_CODE_KEY] || index}`} style={styles.resultCard}>
                        <Text style={styles.resultTitle}>{toText(row[CUSTOMER_TITLE_KEY])}</Text>
                        <Text style={styles.resultMeta}>{toText(row[CUSTOMER_CODE_KEY])}</Text>
                        {customerVisibleColumns.map((column) => (
                          <View key={`${row[CUSTOMER_CODE_KEY]}-${column}`} style={styles.fieldRow}>
                            <Text style={styles.fieldLabel}>{getLabel(column)}</Text>
                            <Text style={styles.fieldValue}>{toText(row[column])}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                    {customerResults.length === 0 && <Text style={styles.emptyText}>Arama sonucu yok.</Text>}
                  </View>
                )}
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
  container: { padding: spacing.xl, gap: spacing.md },
  loading: { alignItems: 'center', paddingVertical: spacing.xl },
  kicker: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  customizeCard: { backgroundColor: '#EAF1FF', borderRadius: radius.lg, borderWidth: 1, borderColor: '#C7D7F8', padding: spacing.md, gap: spacing.sm },
  customizeTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.primary },
  sectionLabel: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  section: { gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  statCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  statLabel: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  statValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.text },
  cardTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  inlineActions: { flexDirection: 'row', gap: spacing.md },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDisabled: { opacity: 0.35 },
  chipText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  chipTextActive: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#FFFFFF' },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  flex: { flex: 1 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primaryBtnText: { fontFamily: fonts.semibold, color: '#FFFFFF', fontSize: fontSizes.sm },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickCard: { width: '48%', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quickLabel: { flex: 1, fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.text },
  resultCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  resultCardUnread: { borderColor: colors.primarySoft, backgroundColor: '#EBF2FF' },
  resultTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  resultMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  fieldLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted, flex: 1 },
  fieldValue: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.text, flex: 1, textAlign: 'right' },
  metaText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  linkText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.primary },
  linkBig: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.primary, marginTop: spacing.xs },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  signOutWrap: { marginTop: spacing.md, alignItems: 'flex-start' },
  error: { fontFamily: fonts.medium, color: colors.danger },
});
