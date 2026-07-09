import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { VadeAnalytics } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const dayOptions = [30, 90, 180];

const dateText = (value?: string | null) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('tr-TR');
  } catch {
    return value.slice(0, 10);
  }
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function VadeAnalyticsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<VadeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getVadeAnalytics({ days });
      setData(response);
    } catch (err: any) {
      setData(null);
      setError(getApiErrorMessage(err, 'Vade analizi yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [days]);

  const stats = useMemo(() => {
    const customers = data?.customerBehavior || [];
    const staff = data?.staffPerformance || [];
    return {
      customerCount: customers.length,
      totalNotes: customers.reduce((sum, item) => sum + Number(item.noteCount || 0), 0),
      totalPromises: customers.reduce((sum, item) => sum + Number(item.promiseCount || 0), 0),
      staffCount: staff.length,
    };
  }, [data]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Vade Analiz</Text>
          <Text style={styles.subtitle}>Musteri davranisi ve personel not performansi.</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('VadeDashboard')}>
              <Text style={styles.secondaryButtonText}>Panel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Vade')}>
              <Text style={styles.secondaryButtonText}>Liste</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('VadeManagement')}>
              <Text style={styles.secondaryButtonText}>Yonetim</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.segment}>
          {dayOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.segmentButton, days === option && styles.segmentButtonActive]}
              onPress={() => setDays(option)}
            >
              <Text style={days === option ? styles.segmentTextActive : styles.segmentText}>{option} gun</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !data ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <TouchableOpacity style={styles.errorCard} onPress={fetchData}>
            <Text style={styles.error}>{error}</Text>
            <Text style={styles.retryText}>Tekrar dene</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.statGrid}>
              <StatCard label="Cari" value={stats.customerCount} />
              <StatCard label="Toplam Not" value={stats.totalNotes} />
              <StatCard label="Soz" value={stats.totalPromises} />
              <StatCard label="Personel" value={stats.staffCount} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Musteri Iletisim Analizi</Text>
              {(data?.customerBehavior || []).length === 0 ? (
                <Text style={styles.emptyText}>Kayit yok.</Text>
              ) : (
                (data?.customerBehavior || []).slice(0, 50).map((item) => (
                  <TouchableOpacity
                    key={`${item.code}-${item.name}`}
                    style={styles.card}
                    onPress={() => navigation.navigate('Customer360', { customerIdOrCode: item.code })}
                  >
                    <View style={styles.cardTop}>
                      <View style={styles.flexText}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{item.name || item.code}</Text>
                        <Text style={styles.cardMeta}>{item.code || '-'} - {item.sector || '-'}</Text>
                      </View>
                      <View style={styles.scorePill}>
                        <Text style={styles.scoreText}>{item.noteCount || 0} not</Text>
                      </View>
                    </View>
                    <View style={styles.metaGrid}>
                      <Text style={styles.metricText}>Soz: {item.promiseCount || 0}</Text>
                      <Text style={styles.metricText}>Son not: {dateText(item.lastNoteAt)}</Text>
                      <Text style={styles.metricText}>
                        Etiket: {item.mostUsedTag ? `${item.mostUsedTag} (${item.mostUsedTagCount})` : '-'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personel Performansi</Text>
              {(data?.staffPerformance || []).length === 0 ? (
                <Text style={styles.emptyText}>Kayit yok.</Text>
              ) : (
                (data?.staffPerformance || []).map((item) => (
                  <View key={`${item.name}-${item.role}`} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.flexText}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.cardMeta}>{item.role || 'Personel'}</Text>
                      </View>
                      <View style={styles.scorePillBlue}>
                        <Text style={styles.scoreTextBlue}>{item.totalNotes || 0} not</Text>
                      </View>
                    </View>
                    <View style={styles.metaGrid}>
                      <Text style={styles.metricText}>Soz: {item.promiseNotes || 0}</Text>
                      <Text style={styles.metricText}>Etiketli: {item.taggedNotes || 0}</Text>
                      <Text style={styles.metricText}>Benzersiz cari: {item.uniqueCustomers || 0}</Text>
                      <Text style={styles.metricText}>Cari/not: {Number(item.avgNotesPerCustomer || 0).toFixed(1)}</Text>
                    </View>
                  </View>
                ))
              )}
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
  header: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.primarySoft, fontSize: fontSizes.sm },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: { flex: 1, alignItems: 'center', borderRadius: radius.sm, paddingVertical: spacing.sm },
  segmentButtonActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  loading: { padding: spacing.xl, alignItems: 'center' },
  errorCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    padding: spacing.md,
    gap: spacing.xs,
  },
  error: { fontFamily: fonts.medium, color: colors.danger },
  retryText: { fontFamily: fonts.semibold, color: colors.danger, fontSize: fontSizes.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  statValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text, marginTop: spacing.xs },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  flexText: { flex: 1, minWidth: 0 },
  cardTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18, marginTop: 2 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  scorePill: { backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  scorePillBlue: { backgroundColor: colors.primaryMuted, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  scoreText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.warning },
  scoreTextBlue: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.primarySoft },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
});
