import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { includesSearch } from '../utils/search';
import { navigateFromNotificationLink } from '../navigation/notificationLinking';
import { useNotifications } from '../context/NotificationContext';
import { Notification } from '../types';

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
  AUDIT: 'Audit',
};

export function NotificationsScreen() {
  const { width } = useWindowDimensions();
  const {
    notifications: items,
    unreadCount,
    loading,
    refresh: fetchNotifications,
    markRead,
    markAllRead: markAllNotificationsRead,
  } = useNotifications();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const isWide = width >= 820;

  const categories = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      const category = String(item.category || 'SYSTEM').toUpperCase();
      values.add(category);
    });
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
  }, [items, readFilter, categoryFilter, search]);

  const handleMarkAllRead = async () => {
    setError(null);
    try {
      await markAllNotificationsRead();
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Bildirimler okundu yapilamadi.'));
    }
  };

  const openNotification = async (item: Notification) => {
    if (!item.isRead) {
      try {
        await markRead([item.id]);
      } catch {
        // Keep navigation usable even if read-state update fails.
      }
    }
    if (item.linkUrl) {
      navigateFromNotificationLink(item.linkUrl);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={isWide ? 'notifications-wide' : 'notifications-phone'}
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? styles.columnWrapper : undefined}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Hesap Bildirimleri</Text>
                <Text style={styles.heroTitle} numberOfLines={1}>Bildirimler</Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>Siparis, teklif, sepet ve vade hareketlerini buradan takip edin.</Text>
              </View>

              <TextInput
                style={styles.searchInput}
                placeholder="Baslik, icerik veya kategori ara"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Toplam</Text>
                  <Text style={styles.summaryValue}>{items.length}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Yeni</Text>
                  <Text style={styles.summaryValue}>{unreadCount}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Filtre</Text>
                  <Text style={styles.summaryValue}>{filteredItems.length}</Text>
                </View>
              </View>

              <View style={styles.filterWrap}>
                {[
                  ['ALL', 'Tum'],
                  ['UNREAD', 'Okunmamis'],
                  ['READ', 'Okunmus'],
                ].map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterChip, readFilter === key && styles.filterChipActive]}
                    onPress={() => setReadFilter(key as typeof readFilter)}
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
                <TouchableOpacity style={styles.secondaryButton} onPress={fetchNotifications}>
                  <Text style={styles.secondaryButtonText}>Yenile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={handleMarkAllRead}>
                  <Text style={styles.primaryButtonText}>Tumunu Oku</Text>
                </TouchableOpacity>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, isWide && styles.gridItem, !item.isRead && styles.cardUnread]}
              activeOpacity={0.88}
              onPress={() => openNotification(item)}
            >
              <View style={styles.cardTop}>
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText} numberOfLines={1}>
                    {CATEGORY_LABELS[String(item.category || 'SYSTEM').toUpperCase()] || item.category || 'Sistem'}
                  </Text>
                </View>
                <Text style={styles.cardDate} numberOfLines={1}>{formatDate(item.createdAt)}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{item.title}</Text>
              {item.body && <Text style={styles.cardMeta} numberOfLines={4} ellipsizeMode="tail">{item.body}</Text>}
              {item.linkUrl && <Text style={styles.linkText} numberOfLines={2} ellipsizeMode="middle">{item.linkUrl}</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Bu filtreye uygun bildirim yok.</Text>
            </View>
          }
        />
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  columnWrapper: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  heroKicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DBEAFE',
    lineHeight: 20,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.textMuted,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 116,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  summaryLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  filterTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  secondaryButton: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  primaryButton: {
    flexGrow: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
  },
  gridItem: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  categoryPill: {
    flexShrink: 1,
    maxWidth: '62%',
    borderRadius: radius.sm,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  categoryPillText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  cardDate: {
    flexShrink: 0,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    lineHeight: fontSizes.lg + 5,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  linkText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
});
