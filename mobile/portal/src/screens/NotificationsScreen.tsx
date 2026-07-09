import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Device from 'expo-device';
import * as ExpoNotifications from 'expo-notifications';

import { adminApi } from '../api/admin';
import { Notification, NotificationPreference } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { includesSearch } from '../utils/search';
import { navigateFromNotificationLink } from '../navigation/notificationLinking';
import { savePushToken } from '../storage/push';
import { inferDeviceName, inferPlatform, registerPushToken } from '../utils/pushNotifications';

type ReadFilter = 'ALL' | 'UNREAD' | 'READ';
type PushStatus = 'checking' | 'granted' | 'denied' | 'undetermined' | 'unavailable';

const CATEGORY_LABELS: Record<string, string> = {
  SYSTEM: 'Sistem',
  ORDER: 'Siparis',
  QUOTE: 'Teklif',
  VADE: 'Vade',
  TASK: 'Talep',
  CART: 'Sepet',
  PRICE: 'Fiyat',
  STOCK: 'Stok',
  PACKAGE: 'Paket',
  IMAGE: 'Gorsel',
  AUDIT: 'Denetim',
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function NotificationsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [items, setItems] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [savingPreferenceKey, setSavingPreferenceKey] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking');
  const [pushSaving, setPushSaving] = useState(false);
  const [pushTesting, setPushTesting] = useState(false);
  const requestSeqRef = useRef(0);
  const preferenceSeqRef = useRef(0);
  const savingPreferenceRef = useRef<string | null>(null);
  const pushSavingRef = useRef(false);
  const pushTestingRef = useRef(false);

  const loadNotifications = async () => {
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getNotifications({ limit: 100, offset: 0 });
      if (requestSeq !== requestSeqRef.current) return;
      setItems(response.notifications || []);
      setUnreadCount(response.unreadCount || 0);
    } catch (err: any) {
      if (requestSeq !== requestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Bildirimler yuklenemedi.'));
    } finally {
      if (requestSeq === requestSeqRef.current) setLoading(false);
    }
  };

  const loadPreferences = async () => {
    const requestSeq = ++preferenceSeqRef.current;
    setPreferencesLoading(true);
    try {
      const response = await adminApi.getNotificationPreferences();
      if (requestSeq !== preferenceSeqRef.current) return;
      setPreferences(response.categories || []);
    } catch (err: any) {
      if (requestSeq !== preferenceSeqRef.current) return;
      Alert.alert('Bildirim Tercihleri', getApiErrorMessage(err, 'Bildirim tercihleri yuklenemedi.'));
      setPreferences([]);
    } finally {
      if (requestSeq === preferenceSeqRef.current) setPreferencesLoading(false);
    }
  };

  const refreshPushStatus = async () => {
    if (!Device.isDevice) {
      setPushStatus('unavailable');
      return;
    }
    setPushStatus('checking');
    try {
      const permission = await ExpoNotifications.getPermissionsAsync();
      setPushStatus(permission.status as PushStatus);
    } catch {
      setPushStatus('undetermined');
    }
  };

  useEffect(() => {
    loadNotifications();
    loadPreferences();
    refreshPushStatus();
  }, []);

  const categories = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => values.add(String(item.category || 'SYSTEM').toUpperCase()));
    return ['ALL', ...Array.from(values).sort((a, b) => a.localeCompare(b, 'tr-TR'))];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const category = String(item.category || 'SYSTEM').toUpperCase();
      const matchesRead =
        readFilter === 'ALL' ||
        (readFilter === 'UNREAD' && !item.isRead) ||
        (readFilter === 'READ' && item.isRead);
      const matchesCategory = categoryFilter === 'ALL' || category === categoryFilter;
      const haystack = [item.title, item.body, category, CATEGORY_LABELS[category], item.linkUrl].join(' ');
      return matchesRead && matchesCategory && includesSearch(haystack, search);
    });
  }, [categoryFilter, items, readFilter, search]);

  const markAllRead = async () => {
    try {
      await adminApi.markAllNotificationsRead();
      await loadNotifications();
    } catch (err: any) {
      Alert.alert('Bildirimler', getApiErrorMessage(err, 'Bildirimler okundu yapilamadi.'));
    }
  };

  const openNotification = async (item: Notification) => {
    if (!item.isRead) {
      try {
        await adminApi.markNotificationsRead([item.id]);
        setItems((current) => current.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)));
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        // Navigation is more important than read-state feedback.
      }
    }
    if (item.linkUrl) {
      navigateFromNotificationLink(item.linkUrl);
    }
  };

  const togglePreference = async (key: string, enabled: boolean) => {
    if (savingPreferenceRef.current) return;
    savingPreferenceRef.current = key;
    const previous = preferences;
    const next = previous.map((item) => (item.key === key ? { ...item, enabled } : item));
    setPreferences(next);
    setSavingPreferenceKey(key);
    try {
      const response = await adminApi.updateNotificationPreferences(
        next.map((item) => ({ category: item.key, enabled: item.enabled }))
      );
      setPreferences(response.categories || next);
    } catch (err: any) {
      setPreferences(previous);
      Alert.alert('Bildirim Tercihleri', getApiErrorMessage(err, 'Bildirim tercihi kaydedilemedi.'));
    } finally {
      savingPreferenceRef.current = null;
      setSavingPreferenceKey(null);
    }
  };

  const enablePushNotifications = async () => {
    if (pushSavingRef.current) return;
    pushSavingRef.current = true;
    setPushSaving(true);
    try {
      const token = await registerPushToken();
      await refreshPushStatus();
      if (!token) {
        Alert.alert('Bildirimler', 'Bildirim izni verilemedi veya cihaz push desteklemiyor.');
        return;
      }
      await adminApi.registerPushToken({
        token,
        platform: inferPlatform(),
        appName: 'portal',
        deviceName: inferDeviceName() || undefined,
      });
      await savePushToken(token);
      setPushStatus('granted');
      Alert.alert('Bildirimler', 'Bildirimler bu cihaz icin acildi.');
    } catch (err: any) {
      Alert.alert('Bildirimler', getApiErrorMessage(err, 'Bildirim acilamadi.'));
    } finally {
      pushSavingRef.current = false;
      setPushSaving(false);
    }
  };

  const sendTestPush = async () => {
    if (pushTestingRef.current) return;
    pushTestingRef.current = true;
    setPushTesting(true);
    try {
      await adminApi.sendTestPush({
        title: 'Bakircilar Portal',
        body: 'Test bildirimi basariyla ulasti.',
        linkUrl: '/admin/dashboard',
      });
      Alert.alert('Test bildirimi', 'Test bildirimi gonderildi.');
    } catch (err: any) {
      Alert.alert('Test bildirimi', getApiErrorMessage(err, 'Test bildirimi gonderilemedi.'));
    } finally {
      pushTestingRef.current = false;
      setPushTesting(false);
    }
  };

  const pushStatusLabel = () => {
    if (pushStatus === 'granted') return 'Acik';
    if (pushStatus === 'denied') return 'Kapali';
    if (pushStatus === 'unavailable') return 'Bu cihazda yok';
    if (pushStatus === 'checking') return 'Kontrol ediliyor';
    return 'Izin bekliyor';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        key={isWide ? 'notifications-wide' : 'notifications-phone'}
        data={loading ? [] : filteredItems}
        keyExtractor={(item) => item.id}
        numColumns={isWide ? 2 : 1}
        columnWrapperStyle={isWide ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.hero}>
              <Text style={styles.kicker}>Portal Bildirimleri</Text>
              <Text style={styles.title}>Bildirim Merkezi</Text>
              <Text style={styles.subtitle}>Siparis, teklif, sepet, vade ve operasyon uyarilarini tek ekrandan yonetin.</Text>
              <View style={styles.heroMetrics}>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{items.length}</Text>
                  <Text style={styles.heroMetricLabel}>Toplam</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{unreadCount}</Text>
                  <Text style={styles.heroMetricLabel}>Yeni</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{pushStatusLabel()}</Text>
                  <Text style={styles.heroMetricLabel}>Push</Text>
                </View>
              </View>
            </View>

            <View style={styles.controlCard}>
              <TextInput
                style={styles.input}
                placeholder="Baslik, icerik veya kategori ara"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              <View style={styles.filterWrap}>
                {([
                  ['ALL', 'Tum'],
                  ['UNREAD', 'Okunmamis'],
                  ['READ', 'Okunmus'],
                ] as Array<[ReadFilter, string]>).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterChip, readFilter === key && styles.filterChipActive]}
                    onPress={() => setReadFilter(key)}
                  >
                    <Text style={readFilter === key ? styles.filterTextActive : styles.filterText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.filterWrap}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.filterChip, categoryFilter === category && styles.filterChipActive]}
                    onPress={() => setCategoryFilter(category)}
                  >
                    <Text style={categoryFilter === category ? styles.filterTextActive : styles.filterText}>
                      {category === 'ALL' ? 'Tum kategoriler' : CATEGORY_LABELS[category] || category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={loadNotifications}>
                  <Text style={styles.secondaryButtonText}>Yenile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={markAllRead}>
                  <Text style={styles.primaryButtonText}>Tumunu Oku</Text>
                </TouchableOpacity>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            <View style={styles.controlCard}>
              <View style={styles.pushHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Push ve kategori tercihleri</Text>
                  <Text style={styles.helper}>Durum: {pushStatusLabel()}</Text>
                </View>
                {pushStatus === 'checking' || preferencesLoading ? <ActivityIndicator color={colors.primary} /> : null}
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.secondaryButton, pushStatus === 'granted' && styles.primaryButton]}
                  onPress={enablePushNotifications}
                  disabled={pushSaving || pushStatus === 'checking'}
                >
                  <Text style={pushStatus === 'granted' ? styles.primaryButtonText : styles.secondaryButtonText}>
                    {pushSaving ? 'Aciliyor...' : pushStatus === 'granted' ? 'Tekrar Kaydet' : 'Bildirimleri Ac'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, pushStatus !== 'granted' && styles.disabled]}
                  onPress={sendTestPush}
                  disabled={pushTesting || pushStatus !== 'granted'}
                >
                  <Text style={styles.secondaryButtonText}>{pushTesting ? 'Gonderiliyor...' : 'Test Gonder'}</Text>
                </TouchableOpacity>
              </View>
              {!preferencesLoading && preferences.length === 0 ? (
                <Text style={styles.helper}>Bildirim kategorisi bulunamadi.</Text>
              ) : (
                preferences.map((item) => (
                  <View key={item.key} style={styles.preferenceRow}>
                    <View style={styles.preferenceTextWrap}>
                      <Text style={styles.preferenceTitle}>{item.label}</Text>
                      <Text style={styles.preferenceKey}>{item.key}</Text>
                    </View>
                    <Switch
                      value={item.enabled}
                      disabled={savingPreferenceKey === item.key}
                      onValueChange={(value) => togglePreference(item.key, value)}
                      trackColor={{ false: '#D8E2F5', true: '#9CB8F8' }}
                      thumbColor={item.enabled ? colors.primary : '#FFFFFF'}
                    />
                  </View>
                ))
              )}
            </View>

            {loading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const category = String(item.category || 'SYSTEM').toUpperCase();
          return (
            <TouchableOpacity
              style={[styles.card, isWide && styles.gridItem, !item.isRead && styles.cardUnread]}
              activeOpacity={0.88}
              onPress={() => openNotification(item)}
            >
              <View style={styles.cardTop}>
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>{CATEGORY_LABELS[category] || category}</Text>
                </View>
                <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              {item.body ? <Text style={styles.cardBody} numberOfLines={3}>{item.body}</Text> : null}
              {item.linkUrl ? <Text style={styles.linkText} numberOfLines={1}>{item.linkUrl}</Text> : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Bu filtreye uygun bildirim yok.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  columnWrapper: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.md,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
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
    color: '#DCEAFE',
    lineHeight: 20,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 94,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  controlCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  input: {
    minHeight: 46,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  filterTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  primaryButton: {
    flexGrow: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  disabled: {
    opacity: 0.5,
  },
  pushHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  helper: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  preferenceTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  preferenceTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  preferenceKey: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  gridItem: {
    flex: 1,
  },
  cardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primarySoft,
    backgroundColor: colors.surfaceMuted,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryPill: {
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  categoryPillText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
  },
  cardDate: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  cardTitle: {
    minWidth: 0,
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
    lineHeight: 22,
  },
  cardBody: {
    minWidth: 0,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  linkText: {
    minWidth: 0,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
  loadingBlock: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
