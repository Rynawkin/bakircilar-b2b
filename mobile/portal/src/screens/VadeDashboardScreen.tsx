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
import { VadeAgingKey, VadeDashboard, VadeDistributionItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const agingMeta: Array<{ key: VadeAgingKey; label: string; color: string }> = [
  { key: 'd0_30', label: '1-30 gun', color: '#16A34A' },
  { key: 'd31_60', label: '31-60 gun', color: '#65A30D' },
  { key: 'd61_90', label: '61-90 gun', color: '#CA8A04' },
  { key: 'd91_180', label: '91-180 gun', color: '#EA580C' },
  { key: 'd181_365', label: '181-365 gun', color: '#DC2626' },
  { key: 'd365plus', label: '365+ gun', color: colors.danger },
];

const money = (value: any) =>
  `${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`;

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'blue' | 'amber' }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text
        style={[
          styles.kpiValue,
          tone === 'red' && styles.textDanger,
          tone === 'blue' && styles.textBlue,
          tone === 'amber' && styles.textWarning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function BarRow({
  label,
  amount,
  count,
  max,
  color,
}: {
  label: string;
  amount: number;
  count?: number;
  max: number;
  color: string;
}) {
  const width = max > 0 ? Math.max(2, Math.min(100, (amount / max) * 100)) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.barValueBlock}>
        <Text style={styles.barValue}>{money(amount)}</Text>
        {count !== undefined && <Text style={styles.barCount}>{count} cari</Text>}
      </View>
    </View>
  );
}

function Distribution({ title, rows }: { title: string; rows: VadeDistributionItem[] }) {
  const max = Math.max(...rows.map((item) => Number(item.amount || 0)), 1);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.emptyText}>Veri yok.</Text>
      ) : (
        rows.slice(0, 8).map((item, index) => (
          <BarRow
            key={`${item.label}-${index}`}
            label={item.label || 'Tanimsiz'}
            amount={Number(item.amount || 0)}
            count={item.count}
            max={max}
            color={index % 2 === 0 ? colors.primary : colors.primarySoft}
          />
        ))
      )}
    </View>
  );
}

export function VadeDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [data, setData] = useState<VadeDashboard | null>(null);
  const [filters, setFilters] = useState<{ sectorCodes: string[]; groupCodes: string[] }>({ sectorCodes: [], groupCodes: [] });
  const [sectorCode, setSectorCode] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getVadeDashboard({
        sectorCode: sectorCode || undefined,
        groupCode: groupCode || undefined,
      });
      setData(result);
    } catch (err: any) {
      setData(null);
      setError(getApiErrorMessage(err, 'Vade paneli yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    adminApi.getVadeFilters()
      .then((result) => setFilters({ sectorCodes: result.sectorCodes || [], groupCodes: result.groupCodes || [] }))
      .catch(() => setFilters({ sectorCodes: [], groupCodes: [] }));
  }, []);

  useEffect(() => {
    fetchData();
  }, [sectorCode, groupCode]);

  const agingMax = useMemo(() => {
    if (!data?.aging) return 1;
    return Math.max(...agingMeta.map((item) => data.aging?.[item.key]?.amount || 0), 1);
  }, [data]);

  const overdue = Number(data?.kpis?.overdue || 0);
  const concentrationRows = data?.concentration
    ? [
        { label: 'En buyuk 10', amount: data.concentration.top10 },
        { label: 'En buyuk 20', amount: data.concentration.top20 },
        { label: 'En buyuk 50', amount: data.concentration.top50 },
      ]
    : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Vade Paneli</Text>
          <Text style={styles.subtitle}>Alacak yaslandirmasi, yogunlasma ve once aranacak cariler.</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Vade')}>
              <Text style={styles.secondaryButtonText}>Liste</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('VadeAnalytics')}>
              <Text style={styles.secondaryButtonText}>Analiz</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('VadeManagement')}>
              <Text style={styles.secondaryButtonText}>Yonetim</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButtonSmall, loading && styles.buttonDisabled]}
              disabled={loading}
              onPress={fetchData}
            >
              <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor' : 'Yenile'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterTitle}>Sektor</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {[{ label: 'Tumu', value: '' }, ...filters.sectorCodes.map((item) => ({ label: item, value: item }))].map((item) => (
              <TouchableOpacity
                key={`sector-${item.value || 'all'}`}
                style={[styles.chip, sectorCode === item.value && styles.chipActive]}
                onPress={() => setSectorCode(item.value)}
              >
                <Text style={sectorCode === item.value ? styles.chipTextActive : styles.chipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.filterTitle}>Grup</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {[{ label: 'Tumu', value: '' }, ...filters.groupCodes.map((item) => ({ label: item, value: item }))].map((item) => (
              <TouchableOpacity
                key={`group-${item.value || 'all'}`}
                style={[styles.chip, groupCode === item.value && styles.chipActive]}
                onPress={() => setGroupCode(item.value)}
              >
                <Text style={groupCode === item.value ? styles.chipTextActive : styles.chipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
            <View style={styles.kpiGrid}>
              <Kpi label="Toplam Cari" value={data?.kpis.count || 0} />
              <Kpi label="Vadesi Gecen" value={money(data?.kpis.overdue)} tone="red" />
              <Kpi label="Vadesi Gelmemis" value={money(data?.kpis.upcoming)} tone="blue" />
              <Kpi label="Toplam" value={money(data?.kpis.total)} tone="amber" />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Vadesi Gecen Yaslandirma</Text>
              {data?.aging ? (
                agingMeta.map((item) => {
                  const bucket = data.aging?.[item.key] || { amount: 0, count: 0 };
                  return (
                    <BarRow
                      key={item.key}
                      label={item.label}
                      amount={bucket.amount}
                      count={bucket.count}
                      max={agingMax}
                      color={item.color}
                    />
                  );
                })
              ) : (
                <Text style={styles.emptyText}>Yaslandirma verisi yok.</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Yogunlasma</Text>
              <Text style={styles.sectionText}>
                Vadesi gecmis {data?.concentration.overdueCount || 0} cari var. Buyuk tutarlara once odaklanin.
              </Text>
              {concentrationRows.map((row) => (
                <BarRow
                  key={row.label}
                  label={`${row.label} (%${overdue > 0 ? Math.round((row.amount / overdue) * 100) : 0})`}
                  amount={row.amount}
                  max={Math.max(overdue, 1)}
                  color={colors.primary}
                />
              ))}
            </View>

            <Distribution title="Sektor Dagilimi" rows={data?.sectorDistribution || []} />
            <Distribution title="Grup Dagilimi" rows={data?.groupDistribution || []} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Once Aranacak Cariler</Text>
              {(data?.topOverdue || []).length === 0 ? (
                <Text style={styles.emptyText}>Geciken cari yok.</Text>
              ) : (
                (data?.topOverdue || []).map((item) => (
                  <TouchableOpacity
                    key={item.id || item.code}
                    style={styles.customerCard}
                    onPress={() => item.id && navigation.navigate('VadeCustomer', { customerId: item.id })}
                  >
                    <View style={styles.customerText}>
                      <Text style={styles.customerTitle}>{item.name || item.code || '-'}</Text>
                      <Text style={styles.customerMeta}>{item.code || '-'} - {item.sector || '-'}</Text>
                    </View>
                    <View style={styles.customerAmount}>
                      <Text style={styles.customerMoney}>{money(item.pastDue)}</Text>
                      <Text style={styles.customerMeta}>{item.valor || 0} gun</Text>
                    </View>
                  </TouchableOpacity>
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
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryButtonSmall: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  secondaryButton: { backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.primarySoft },
  filterSection: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  filterTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  chipRow: { gap: spacing.sm, paddingBottom: 2 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceMuted },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  chipTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpiCard: { width: '48%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  kpiLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  kpiValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text, marginTop: spacing.xs },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  sectionText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
  barRow: { gap: spacing.xs },
  barLabel: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  barTrack: { height: 12, backgroundColor: colors.background, borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 99 },
  barValueBlock: { flexDirection: 'row', justifyContent: 'space-between' },
  barValue: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  barCount: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  customerCard: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  customerText: { flex: 1, minWidth: 0 },
  customerTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  customerMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  customerAmount: { alignItems: 'flex-end', flexShrink: 0 },
  customerMoney: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.danger },
  loading: { alignItems: 'center', padding: spacing.xl },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
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
  textDanger: { color: colors.danger },
  textBlue: { color: colors.primarySoft },
  textWarning: { color: colors.warning },
});
