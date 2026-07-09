import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const numberText = (value: any) => Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const pctText = (value: any) => `%${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
const moneyText = (value: any) =>
  `${Number(value || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

function Section({ title, children, style }: { title: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function OperationsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [seriesText, setSeriesText] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const series = useMemo(() => seriesText.split(',').map((item) => item.trim()).filter(Boolean), [seriesText]);

  const fetchData = async (initial = false) => {
    if (!initial && (loading || refreshing)) return;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const response = await adminApi.getOperationsCommandCenter({ series, orderLimit: 120, customerLimit: 60 });
      setData(response.data || null);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Operasyon verisi alinamadi.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = data?.summary || {};
  const atpOrders = Array.isArray(data?.atp?.orders) ? data.atp.orders : [];
  const waves = Array.isArray(data?.orchestration?.waves) ? data.orchestration.waves : [];
  const customers = Array.isArray(data?.customerIntent?.customers) ? data.customerIntent.customers : [];
  const risks = Array.isArray(data?.risk?.orders) ? data.risk.orders : [];
  const substitutions = Array.isArray(data?.substitution?.suggestions) ? data.substitution.suggestions : [];
  const checks = Array.isArray(data?.dataQuality?.checks) ? data.dataQuality.checks : [];

  const toggleExpanded = (key: string) => {
    setExpandedKey((current) => (current === key ? null : key));
  };

  const renderDetailGrid = (items: Array<{ label: string; value: string | number | null | undefined }>) => (
    <View style={styles.detailGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.detailCell}>
          <Text style={styles.detailLabel}>{item.label}</Text>
          <Text style={styles.detailValue}>{item.value === null || item.value === undefined || item.value === '' ? '-' : item.value}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Operasyon Radari</Text>
          <Text style={styles.title}>Operasyon Komuta Merkezi</Text>
          <Text style={styles.subtitle}>ATP, depo is yuku, musteri niyeti, risk, ikame ve veri kalitesini tek mobil panelde izleyin.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{numberText(summary.openOrderCount)}</Text>
              <Text style={styles.heroMetricLabel}>Acik Siparis</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={[styles.heroMetricValue, styles.heroMetricDanger]}>{numberText(summary.highRiskOrderCount)}</Text>
              <Text style={styles.heroMetricLabel}>Kritik Risk</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={[styles.heroMetricValue, styles.heroMetricGood]}>{numberText(summary.hotCustomerCount)}</Text>
              <Text style={styles.heroMetricLabel}>Sicak Cari</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{numberText(summary.blockedDataChecks)}</Text>
              <Text style={styles.heroMetricLabel}>Veri Blok</Text>
            </View>
          </View>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.seriesInput}
              value={seriesText}
              onChangeText={setSeriesText}
              placeholder="Seri filtre: HENDEK, ADAPAZARI"
              placeholderTextColor="#DDE8FF"
            />
            <TouchableOpacity style={styles.refreshButton} onPress={() => fetchData(false)} disabled={loading || refreshing}>
              <Text style={styles.refreshText}>{refreshing ? 'Yenileniyor' : 'Yenile'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : data ? (
          <>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Acil ATP</Text>
                <Text style={styles.summaryValue}>{numberText(summary.lowCoverageOrderCount)} siparis</Text>
                <Text style={styles.summaryHint}>Acik: {numberText(summary.openOrderCount)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Kritik Risk</Text>
                <Text style={[styles.summaryValue, styles.dangerText]}>{numberText(summary.highRiskOrderCount)} siparis</Text>
                <Text style={styles.summaryHint}>Shortage: {numberText(summary.shortageQty)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Sicak Musteri</Text>
                <Text style={[styles.summaryValue, styles.successText]}>{numberText(summary.hotCustomerCount)} cari</Text>
                <Text style={styles.summaryHint}>Picker: {numberText(summary.activePickerCount)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Ikame</Text>
                <Text style={styles.summaryValue}>{numberText(summary.substitutionNeedCount)} satir</Text>
                <Text style={styles.summaryHint}>Data block: {numberText(summary.blockedDataChecks)}</Text>
              </View>
            </View>

            <View style={[styles.sectionGrid, isWide && styles.sectionGridWide]}>
              <Section title="ATP / Tahsis" style={isWide && styles.sectionGridItem}>
                {atpOrders.slice(0, 12).map((order: any) => (
                  <TouchableOpacity key={String(order.mikroOrderNumber || order.orderId)} style={styles.rowCard} onPress={() => toggleExpanded(`atp:${order.mikroOrderNumber}`)}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{order.mikroOrderNumber || order.orderNumber || '-'}</Text>
                      <Text style={[styles.badge, Number(order.shortageQty || 0) > 0 && styles.badgeDanger]}>{order.coverageStatus || pctText(order.coveredPercent)}</Text>
                    </View>
                    <Text style={styles.rowMeta}>{order.customerName || '-'}</Text>
                    <Text style={styles.rowMeta}>Kalan {numberText(order.remainingQty)} - Shortage {numberText(order.shortageQty)} - Kapsama {pctText(order.coveredPercent)}</Text>
                    {expandedKey === `atp:${order.mikroOrderNumber}` && (
                      <View style={styles.detailPanel}>
                        {renderDetailGrid([
                          { label: 'Seri', value: `${order.orderSeries || '-'}-${order.orderSequence || '-'}` },
                          { label: 'Oncelik', value: numberText(order.priorityScore) },
                          { label: 'Cover', value: numberText(order.coverableQty) },
                          { label: 'Satir', value: numberText(order.lineCount) },
                        ])}
                        {(order.lines || []).slice(0, 6).map((line: any) => (
                          <View key={String(line.lineKey)} style={styles.detailLine}>
                            <Text style={styles.detailLineTitle} numberOfLines={2}>{line.productCode} - {line.productName}</Text>
                            <Text style={styles.rowMeta}>
                              Kalan {numberText(line.remainingQty)} | Stok {numberText(line.stockQty)} | ATP {numberText(line.atpQty)} | Eksik {numberText(line.shortageQty)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
                {atpOrders.length === 0 && <Text style={styles.emptyText}>ATP kaydi yok.</Text>}
              </Section>

              <Section title="Depo Orkestrasyonu" style={isWide && styles.sectionGridItem}>
                {waves.slice(0, 8).map((wave: any) => (
                  <TouchableOpacity key={String(wave.waveId || wave.id)} style={styles.rowCard} onPress={() => toggleExpanded(`wave:${wave.waveId || wave.id}`)}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{wave.waveId || 'Dalga'}</Text>
                      <Text style={styles.badge}>{wave.status || `${numberText(wave.orderCount)} siparis`}</Text>
                    </View>
                    <Text style={styles.rowMeta}>Picker: {wave.pickerName || wave.picker || '-'}</Text>
                    <Text style={styles.rowMeta}>Satir: {numberText(wave.lineCount)} - Kalan: {numberText(wave.remainingLineCount)}</Text>
                    {expandedKey === `wave:${wave.waveId || wave.id}` && (
                      <View style={styles.detailPanel}>
                        {renderDetailGrid([
                          { label: 'Sure', value: `${numberText(wave.estimatedMinutes)} dk` },
                          { label: 'Picker onerisi', value: numberText(wave.recommendedPickerCount) },
                          { label: 'Shortage', value: numberText(wave.shortageQty) },
                          { label: 'Seri', value: wave.orderSeries || '-' },
                        ])}
                        {(wave.orders || []).slice(0, 8).map((order: any) => (
                          <View key={String(order.mikroOrderNumber)} style={styles.detailLine}>
                            <Text style={styles.detailLineTitle} numberOfLines={2}>{order.mikroOrderNumber} - {order.customerName}</Text>
                            <Text style={styles.rowMeta}>
                              Satir {numberText(order.lineCount)} | Kalan {numberText(order.remainingQty)} | Eksik {numberText(order.shortageQty)} | {order.coverageStatus}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
                {waves.length === 0 && <Text style={styles.emptyText}>Depo dalgasi yok.</Text>}
              </Section>
            </View>

            <View style={[styles.sectionGrid, isWide && styles.sectionGridWide]}>
              <Section title="Musteri Niyeti" style={isWide && styles.sectionGridItem}>
                {customers.slice(0, 8).map((customer: any) => (
                  <TouchableOpacity key={String(customer.customerId || customer.customerCode || customer.name)} style={styles.rowCard} onPress={() => toggleExpanded(`customer:${customer.customerId || customer.customerCode || customer.name}`)}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={2}>{customer.customerName || customer.name || '-'}</Text>
                      <Text style={[styles.badge, customer.segment === 'HOT' && styles.badgeSuccess]}>{customer.segment || '-'}</Text>
                    </View>
                    <Text style={styles.rowMeta}>{customer.customerCode || customer.mikroCariCode || ''}</Text>
                    <Text style={styles.rowMeta}>Sepet {numberText(customer.cartCount)} - Teklif {numberText(customer.quoteCount)} - Siparis {numberText(customer.orderCount)}</Text>
                    {expandedKey === `customer:${customer.customerId || customer.customerCode || customer.name}` && (
                      <View style={styles.detailPanel}>
                        {renderDetailGrid([
                          { label: 'Intent', value: numberText(customer.intentScore) },
                          { label: 'Churn', value: customer.churnRisk || '-' },
                          { label: 'Sepet tutari', value: moneyText(customer.cartAmount) },
                          { label: 'Aktif dk', value: numberText(customer.activeMinutes) },
                        ])}
                        <Text style={styles.detailLineTitle} numberOfLines={1}>Oncelikli aksiyon</Text>
                        <Text style={styles.rowMeta} numberOfLines={3}>{customer.nextBestAction || 'Aksiyon onerisi yok.'}</Text>
                        <Text style={styles.rowMeta}>
                          Sayfa {numberText(customer.pageViews)} | Urun {numberText(customer.productViews)} | Arama {numberText(customer.searches)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
                {customers.length === 0 && <Text style={styles.emptyText}>Musteri niyeti kaydi yok.</Text>}
              </Section>

              <Section title="Risk ve Ikame" style={isWide && styles.sectionGridItem}>
              {risks.slice(0, 8).map((order: any) => (
                <TouchableOpacity key={String(order.orderId || order.mikroOrderNumber)} style={styles.rowCard} onPress={() => toggleExpanded(`risk:${order.orderId || order.mikroOrderNumber}`)}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{order.mikroOrderNumber || order.orderNumber || '-'}</Text>
                    <Text style={[styles.badge, styles.badgeDanger]}>{order.riskLevel || order.decision || 'Risk'}</Text>
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>{order.customerName || '-'}</Text>
                  <Text style={styles.rowMeta} numberOfLines={2}>{order.reason || order.primaryReason || 'Risk incelemesi gerekli'}</Text>
                  {expandedKey === `risk:${order.orderId || order.mikroOrderNumber}` && (
                    <View style={styles.detailPanel}>
                      {renderDetailGrid([
                        { label: 'Tutar', value: moneyText(order.orderAmount) },
                        { label: 'Risk skoru', value: numberText(order.riskScore) },
                        { label: 'Vadesi gecmis', value: moneyText(order.pastDueBalance) },
                        { label: 'Bekleme', value: `${numberText(order.pendingDays)} gun` },
                      ])}
                      {(order.reasons || []).map((reason: string, index: number) => (
                        <Text key={`${index}-${reason}`} style={styles.reasonText}>- {reason}</Text>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {substitutions.slice(0, 8).map((row: any) => (
                <TouchableOpacity key={`${row.mikroOrderNumber || ''}-${row.lineKey || row.productCode || Math.random()}`} style={styles.rowCard} onPress={() => toggleExpanded(`sub:${row.mikroOrderNumber || ''}:${row.lineKey || row.productCode}`)}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{row.sourceProductName || row.sourceProductCode || row.productName || row.productCode || 'Ikame satiri'}</Text>
                    <Text style={styles.badge}>{numberText((row.candidates || []).length || row.suggestionCount || row.alternativeCount)} ikame</Text>
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>{row.mikroOrderNumber || ''} - {row.customerName || ''}</Text>
                  {expandedKey === `sub:${row.mikroOrderNumber || ''}:${row.lineKey || row.productCode}` && (
                    <View style={styles.detailPanel}>
                      {renderDetailGrid([
                        { label: 'Kaynak', value: row.sourceProductCode || row.productCode || '-' },
                        { label: 'Ihtiyac', value: numberText(row.neededQty) },
                        { label: 'Eksik', value: numberText(row.shortageQty) },
                        { label: 'Kategori', value: row.categoryName || '-' },
                      ])}
                      {(row.candidates || []).slice(0, 4).map((candidate: any) => (
                        <View key={String(candidate.productCode)} style={styles.detailLine}>
                          <Text style={styles.detailLineTitle} numberOfLines={2}>{candidate.productCode} - {candidate.productName}</Text>
                          <Text style={styles.rowMeta} numberOfLines={2}>Stok {numberText(candidate.stockQty)} | Skor {numberText(candidate.score)} | {candidate.reason}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {risks.length === 0 && substitutions.length === 0 && <Text style={styles.emptyText}>Risk/ikame kaydi yok.</Text>}
              </Section>
            </View>

            <Section title="Veri Kalitesi">
              {checks.slice(0, 12).map((check: any) => (
                <TouchableOpacity key={String(check.code || check.title)} style={styles.rowCard} onPress={() => toggleExpanded(`check:${check.code || check.title}`)}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{check.title || check.code || '-'}</Text>
                    <Text style={[styles.badge, Number(check.count || check.failedCount || 0) > 0 && styles.badgeDanger]}>{numberText(check.count || check.failedCount)}</Text>
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={2}>{check.description || check.message || ''}</Text>
                  {expandedKey === `check:${check.code || check.title}` && (
                    <View style={styles.detailPanel}>
                      {renderDetailGrid([
                        { label: 'Kod', value: check.code || '-' },
                        { label: 'Seviye', value: check.severity || '-' },
                        { label: 'Blok', value: check.blocked ? 'Evet' : 'Hayir' },
                        { label: 'Adet', value: numberText(check.count || check.failedCount) },
                      ])}
                      {(check.sample || []).slice(0, 6).map((sample: any) => (
                        <View key={`${sample.code}-${sample.detail}`} style={styles.detailLine}>
                          <Text style={styles.detailLineTitle} numberOfLines={2}>{sample.code} - {sample.name}</Text>
                          <Text style={styles.rowMeta} numberOfLines={2}>{sample.detail}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              {checks.length === 0 && <Text style={styles.emptyText}>Veri kalite uyarisi yok.</Text>}
            </Section>
          </>
        ) : (
          <Text style={styles.emptyText}>Operasyon verisi yok.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
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
  heroMetricDanger: { color: '#FECACA' },
  heroMetricGood: { color: '#BBF7D0' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  seriesInput: { flex: 1, minWidth: 190, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fonts.regular, color: '#FFFFFF' },
  refreshButton: { backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center' },
  refreshText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  loading: { alignItems: 'center', padding: spacing.xl },
  error: { fontFamily: fonts.medium, color: colors.danger },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryCard: { flexGrow: 1, minWidth: 146, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  summaryLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  summaryValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text, marginTop: spacing.xs },
  summaryHint: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  dangerText: { color: colors.danger },
  successText: { color: colors.success },
  sectionGrid: { gap: spacing.md },
  sectionGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  sectionGridItem: { flex: 1, minWidth: 0 },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  rowCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceMuted, gap: spacing.xs },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'flex-start' },
  rowTitle: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text, lineHeight: 20 },
  rowMeta: { minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  detailPanel: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailCell: {
    flexGrow: 1,
    minWidth: 118,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  detailLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  detailValue: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text, marginTop: 2 },
  detailLine: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  detailLineTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text, lineHeight: 18 },
  reasonText: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  badge: { overflow: 'hidden', borderRadius: 999, backgroundColor: colors.primaryMuted, paddingHorizontal: spacing.sm, paddingVertical: 3, fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.primarySoft },
  badgeDanger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  badgeSuccess: { backgroundColor: colors.successSoft, color: colors.success },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
});
