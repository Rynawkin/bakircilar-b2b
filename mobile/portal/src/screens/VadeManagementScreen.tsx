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
import { VadeManagement } from '../types';
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

function TrendBar({ date, value, max }: { date: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(3, Math.min(100, (value / max) * 100)) : 0;
  return (
    <View style={styles.trendRow}>
      <Text style={styles.trendDate}>{date.slice(5)}</Text>
      <View style={styles.trendTrack}>
        <View style={[styles.trendFill, { width: `${width}%` }]} />
      </View>
      <Text style={styles.trendValue}>{value}</Text>
    </View>
  );
}

export function VadeManagementScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [days, setDays] = useState(90);
  const [data, setData] = useState<VadeManagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getVadeManagement({ days });
      setData(response);
    } catch (err: any) {
      setData(null);
      setError(getApiErrorMessage(err, 'Vade yonetim raporu yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [days]);

  const maxTrend = useMemo(() => {
    return Math.max(...(data?.dailyTrend || []).map((item) => Number(item.notes || 0)), 1);
  }, [data]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Vade Yonetim</Text>
          <Text style={styles.subtitle}>Takip disiplini, personel performansi ve sorun tespiti.</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('VadeDashboard')}>
              <Text style={styles.secondaryButtonText}>Panel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Vade')}>
              <Text style={styles.secondaryButtonText}>Liste</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('VadeAnalytics')}>
              <Text style={styles.secondaryButtonText}>Analiz</Text>
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
              <StatCard label="Kullanici" value={data?.summary.totalUsers || 0} />
              <StatCard label="Aktif" value={data?.summary.activeUsers || 0} />
              <StatCard label="Not" value={data?.summary.totalNotes || 0} />
              <StatCard label="Atama" value={data?.summary.totalAssignments || 0} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sorun Tespiti</Text>
              {(data?.issues || []).length === 0 ? (
                <Text style={styles.emptyText}>Kritik sorun yok.</Text>
              ) : (
                (data?.issues || []).map((issue, index) => (
                  <View
                    key={`${issue.title}-${index}`}
                    style={[
                      styles.issueCard,
                      issue.type === 'error' && styles.issueError,
                      issue.type === 'warning' && styles.issueWarning,
                    ]}
                  >
                    <Text style={styles.issueTitle}>{issue.title}</Text>
                    <Text style={styles.issueBody}>{issue.names?.join(', ') || '-'}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gunluk Aktivite</Text>
              {(data?.dailyTrend || []).slice(-14).map((item) => (
                <TrendBar key={item.date} date={item.date} value={Number(item.notes || 0)} max={maxTrend} />
              ))}
              {(data?.dailyTrend || []).length === 0 && <Text style={styles.emptyText}>Trend kaydi yok.</Text>}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personel Performansi</Text>
              {(data?.topPerformers || []).length === 0 ? (
                <Text style={styles.emptyText}>Kayit yok.</Text>
              ) : (
                (data?.topPerformers || []).map((item, index) => (
                  <View key={item.id || `${item.name}-${index}`} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.flexText}>
                        <Text style={styles.cardTitle}>
                          {index + 1}. {item.name}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {item.role || 'Personel'} - Son aktivite: {dateText(item.lastActivity)}
                        </Text>
                      </View>
                      <View style={styles.scorePill}>
                        <Text style={styles.scoreText}>{item.activityScore || 0}</Text>
                      </View>
                    </View>
                    <View style={styles.metaGrid}>
                      <Text style={styles.metricText}>Not: {item.noteCount || 0}</Text>
                      <Text style={styles.metricText}>Atama: {item.assignedCustomers || 0}</Text>
                      <Text style={styles.metricText}>Verim: {Number(item.efficiency || 0).toFixed(2)}</Text>
                      <Text style={styles.metricText}>
                        Pasif: {item.daysSinceActivity === null || item.daysSinceActivity === undefined ? '-' : `${item.daysSinceActivity} gun`}
                      </Text>
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
  issueCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.primaryMuted,
    padding: spacing.md,
  },
  issueWarning: { borderColor: '#FDE68A', backgroundColor: colors.warningSoft },
  issueError: { borderColor: 'rgba(248,113,113,0.30)', backgroundColor: colors.dangerSoft },
  issueTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text },
  issueBody: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 20 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trendDate: { width: 48, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  trendTrack: { flex: 1, height: 12, backgroundColor: colors.background, borderRadius: 99, overflow: 'hidden' },
  trendFill: { height: '100%', backgroundColor: colors.primarySoft, borderRadius: 99 },
  trendValue: { width: 28, textAlign: 'right', fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.text },
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
  scorePill: { minWidth: 42, alignItems: 'center', backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  scoreText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.success },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
});
