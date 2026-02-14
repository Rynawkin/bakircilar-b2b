import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { Customer } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type StatusFilter = 'all' | 'active' | 'inactive';

export function PortfolioScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getCustomers();
      setCustomers(response.customers || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Portfoy yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const counts = useMemo(() => {
    const active = customers.filter((customer) => customer.active).length;
    return {
      total: customers.length,
      active,
      inactive: customers.length - active,
    };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (statusFilter === 'active' && !customer.active) return false;
      if (statusFilter === 'inactive' && customer.active) return false;
      if (!term) return true;
      const haystack = [
        customer.name,
        customer.mikroCariCode,
        customer.email,
        customer.city,
        customer.district,
        customer.phone,
        customer.sectorCode,
        customer.groupCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [customers, search, statusFilter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Musteri Portfoyum</Text>
              <Text style={styles.subtitle}>Atanan musterilerinizi tek ekranda takip edin.</Text>

              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Toplam</Text>
                  <Text style={styles.summaryValue}>{counts.total}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Aktif</Text>
                  <Text style={styles.summaryValue}>{counts.active}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Pasif</Text>
                  <Text style={styles.summaryValue}>{counts.inactive}</Text>
                </View>
              </View>

              <TextInput
                style={styles.search}
                placeholder="Cari kodu, isim, sehir, telefon..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              <View style={styles.filterRow}>
                {(
                  [
                    { id: 'all', label: 'Hepsi' },
                    { id: 'active', label: 'Aktif' },
                    { id: 'inactive', label: 'Pasif' },
                  ] as const
                ).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.filterButton, statusFilter === item.id && styles.filterButtonActive]}
                    onPress={() => setStatusFilter(item.id)}
                  >
                    <Text
                      style={statusFilter === item.id ? styles.filterTextActive : styles.filterText}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <View style={[styles.badge, item.active ? styles.badgeActive : styles.badgeInactive]}>
                  <Text style={item.active ? styles.badgeTextActive : styles.badgeTextInactive}>
                    {item.active ? 'Aktif' : 'Pasif'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardMeta}>Cari: {item.mikroCariCode || '-'}</Text>
              <Text style={styles.cardMeta}>E-posta: {item.email || '-'}</Text>
              <Text style={styles.cardMeta}>Sehir: {item.city || '-'}</Text>
              <Text style={styles.cardMeta}>Ilce: {item.district || '-'}</Text>
              <Text style={styles.cardMeta}>Telefon: {item.phone || '-'}</Text>
              <Text style={styles.cardMeta}>Sektor: {item.sectorCode || '-'}</Text>
              <Text style={styles.cardMeta}>Grup: {item.groupCode || '-'}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Kayit bulunamadi.</Text>
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
  header: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  summaryLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filterButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  filterButtonActive: {
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
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  badgeInactive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  badgeTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#166534',
  },
  badgeTextInactive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#991B1B',
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
