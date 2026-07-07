import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

const formatMoney = (value: any) =>
  `${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`;

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('tr-TR');
};

const safeText = (value: any, fallback = '-') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const trustTone = (level?: string) => {
  if (level === 'HIGH') return '#059669';
  if (level === 'MEDIUM') return colors.warning;
  return colors.danger;
};

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'amber' | 'green' }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'red' && styles.textDanger,
          tone === 'amber' && styles.textWarning,
          tone === 'green' && styles.textSuccess,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'red' | 'amber' | 'green' }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          tone === 'red' && styles.textDanger,
          tone === 'amber' && styles.textWarning,
          tone === 'green' && styles.textSuccess,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function Customer360Screen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as { params?: { customerIdOrCode?: string } };
  const initialCustomer = route.params?.customerIdOrCode;

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customer = data?.customer || null;
  const summary = data?.summary || {};
  const priceTrust = data?.priceTrust || null;

  const metrics = useMemo(
    () => [
      { label: 'Bakiye', value: formatMoney(summary.balance ?? customer?.balance), tone: Number(summary.balance || customer?.balance || 0) > 0 ? ('amber' as const) : undefined },
      { label: 'Siparis', value: `${summary.orderCount || 0} / ${formatMoney(summary.orderAmount)}` },
      { label: 'Teklif', value: `${summary.quoteCount || 0} / ${formatMoney(summary.quoteAmount)}` },
      { label: 'Sepet', value: `${summary.cartItemCount || 0} / ${formatMoney(summary.cartTotal)}`, tone: Number(summary.cartTotal || 0) > 0 ? ('green' as const) : undefined },
      { label: 'Aksiyon', value: `${summary.openTaskCount || 0} acik`, tone: Number(summary.overdueTaskCount || 0) > 0 ? ('red' as const) : undefined },
      { label: 'Fatura', value: summary.invoiceCount || 0 },
    ],
    [summary, customer]
  );

  const runSearch = useCallback(async (term?: string) => {
    setSearching(true);
    setError(null);
    try {
      const response = await adminApi.searchCustomer360({
        search: (term ?? search).trim() || undefined,
        limit: 25,
      });
      setResults(response.customers || []);
    } catch (err: any) {
      setResults([]);
      setError(err?.response?.data?.error || 'Cari aramasi yapilamadi.');
    } finally {
      setSearching(false);
    }
  }, [search]);

  const loadCustomer = useCallback(async (customerIdOrCode: string) => {
    const key = String(customerIdOrCode || '').trim();
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getCustomer360(key);
      setData(response.data || null);
    } catch (err: any) {
      setData(null);
      setError(err?.response?.data?.error || 'Cari 360 yuklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCustomer) {
      loadCustomer(initialCustomer);
    } else {
      runSearch('');
    }
  }, [initialCustomer, loadCustomer, runSearch]);

  const selectCustomer = (row: any) => {
    const key = row?.id || row?.mikroCariCode;
    if (!key) {
      Alert.alert('Cari secilemedi', 'Cari kodu veya id bulunamadi.');
      return;
    }
    loadCustomer(key);
  };

  const openCartReport = () => {
    navigation.navigate('Reports');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Cari 360</Text>
          <Text style={styles.subtitle}>Satis, teklif, sepet, vade, temas ve fiyat guveni tek ekranda.</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              placeholder="Cari kodu, unvan, sehir veya sektor"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => runSearch()}
            />
            <TouchableOpacity style={styles.searchButton} onPress={() => runSearch()} disabled={searching}>
              <Text style={styles.searchButtonText}>{searching ? '...' : 'Ara'}</Text>
            </TouchableOpacity>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        {results.length > 0 && (
          <Section title="Cari Secimi">
            {results.map((row) => (
              <TouchableOpacity key={row.id || row.mikroCariCode} style={styles.resultCard} onPress={() => selectCustomer(row)}>
                <View style={styles.resultText}>
                  <Text style={styles.resultTitle}>{safeText(row.displayTitle || row.displayName || row.mikroName || row.name)}</Text>
                  <Text style={styles.resultMeta}>
                    {safeText(row.mikroCariCode)} {row.sectorCode ? `- ${row.sectorCode}` : ''} {row.city ? `- ${row.city}` : ''}
                  </Text>
                </View>
                <Text style={styles.resultBalance}>{formatMoney(row.balance)}</Text>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Cari 360 yukleniyor...</Text>
          </View>
        )}

        {customer && !loading && (
          <>
            <View style={styles.customerCard}>
              <Text style={styles.customerName}>{safeText(customer.displayTitle || customer.displayName || customer.mikroName || customer.name)}</Text>
              <Text style={styles.customerMeta}>
                {safeText(customer.mikroCariCode)} {customer.sectorCode ? `- ${customer.sectorCode}` : ''} {customer.groupCode ? `- ${customer.groupCode}` : ''}
              </Text>
              <Text style={styles.customerMeta}>
                {safeText(customer.city)} / {safeText(customer.district)} - {customer.active === false ? 'Pasif' : 'Aktif'}
              </Text>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('CustomerDetail', { customerId: customer.id })}>
                  <Text style={styles.secondaryButtonText}>Cari Detay</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('VadeCustomer', { customerId: customer.id })}>
                  <Text style={styles.secondaryButtonText}>Vade</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={openCartReport}>
                  <Text style={styles.secondaryButtonText}>Sepet Raporu</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.metricGrid}>
              {metrics.map((metric) => (
                <MetricCard key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
              ))}
            </View>

            <Section title="Fiyat Guven Karti">
              {priceTrust ? (
                <View style={styles.trustCard}>
                  <View style={styles.trustTop}>
                    <Text style={styles.trustScore}>{priceTrust.score || 0}/100</Text>
                    <Text style={[styles.trustLevel, { color: trustTone(priceTrust.level) }]}>{priceTrust.level || '-'}</Text>
                  </View>
                  <InfoRow label="Gorunum" value={priceTrust.priceVisibility || '-'} />
                  <InfoRow label="KDV" value={priceTrust.vatDisplayPreference || '-'} />
                  <InfoRow label="Son fiyat koruma" value={priceTrust.useLastPrices ? 'Acik' : 'Kapali'} tone={priceTrust.useLastPrices ? 'green' : 'red'} />
                  <InfoRow label="Manuel liste" value={`${priceTrust.manualInvoicedListNo || '-'} / ${priceTrust.manualRetailListNo || '-'}`} />
                  <InfoRow label="Onerilen liste" value={`${priceTrust.suggestedInvoicedListNo || '-'} / ${priceTrust.suggestedRetailListNo || '-'}`} />
                  {!!priceTrust.suggestedListComputedAt && <InfoRow label="Oneri tarihi" value={formatDate(priceTrust.suggestedListComputedAt)} />}
                  {(priceTrust.warnings || []).map((warning: string) => (
                    <Text key={warning} style={styles.warningPill}>{warning}</Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Fiyat guveni bilgisi yok.</Text>
              )}
            </Section>

            <Section title="Sepet">
              {data.cart ? (
                <View style={styles.compactCard}>
                  <InfoRow label="Toplam" value={formatMoney(data.cart.total)} tone={Number(data.cart.total || 0) > 0 ? 'green' : undefined} />
                  <InfoRow label="Guncel" value={formatDate(data.cart.updatedAt)} />
                  {(data.cart.items || []).slice(0, 8).map((item: any) => (
                    <View key={item.id} style={styles.lineCard}>
                      <Text style={styles.lineTitle}>{safeText(item.productName || item.product?.name || item.productCode)}</Text>
                      <Text style={styles.lineMeta}>
                        {safeText(item.productCode || item.product?.mikroCode)} - {Number(item.quantity || 0).toLocaleString('tr-TR')} x {formatMoney(item.unitPrice)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Aktif sepet yok.</Text>
              )}
            </Section>

            <Section title="Siparis ve Teklif">
              <View style={styles.twoColumn}>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Son Siparisler</Text>
                  {(data.orders || []).slice(0, 5).map((order: any) => (
                    <TouchableOpacity key={order.id} style={styles.lineCard} onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}>
                      <Text style={styles.lineTitle}>{order.orderNumber || order.id}</Text>
                      <Text style={styles.lineMeta}>{order.status || '-'} - {formatMoney(order.totalAmount)} - {formatDate(order.createdAt)}</Text>
                    </TouchableOpacity>
                  ))}
                  {(data.orders || []).length === 0 && <Text style={styles.emptyText}>Siparis yok.</Text>}
                </View>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Son Teklifler</Text>
                  {(data.quotes || []).slice(0, 5).map((quote: any) => (
                    <TouchableOpacity key={quote.id} style={styles.lineCard} onPress={() => navigation.navigate('QuoteDetail', { quoteId: quote.id })}>
                      <Text style={styles.lineTitle}>{quote.quoteNumber || quote.id}</Text>
                      <Text style={styles.lineMeta}>{quote.status || '-'} - {formatMoney(quote.grandTotal)} - {formatDate(quote.createdAt)}</Text>
                    </TouchableOpacity>
                  ))}
                  {(data.quotes || []).length === 0 && <Text style={styles.emptyText}>Teklif yok.</Text>}
                </View>
              </View>
            </Section>

            <Section title="Vade ve Temas">
              <View style={styles.compactCard}>
                <InfoRow label="Vade bakiyesi" value={formatMoney(data.vade?.balance?.balance ?? summary.balance)} />
                <InfoRow label="Sinif" value={data.vade?.classification?.classCode || '-'} />
                <InfoRow label="Temas sayisi" value={data.engagement?.contactCount ?? 0} />
                <InfoRow label="Son temas" value={formatDate(data.engagement?.lastContactAt)} />
                <InfoRow label="Sonraki takip" value={formatDate(data.engagement?.nextFollowUpDate)} tone={data.engagement?.nextFollowUpDate ? 'amber' : undefined} />
              </View>
              {(data.engagement?.recentContacts || []).slice(0, 4).map((contact: any) => (
                <View key={contact.id} style={styles.lineCard}>
                  <Text style={styles.lineTitle}>{formatDate(contact.contactedAt)} - {contact.channel || 'Genel'}</Text>
                  {!!contact.note && <Text style={styles.lineMeta}>{contact.note}</Text>}
                  <Text style={styles.lineMeta}>{contact.contactedByName || '-'} {contact.outcome ? `- ${contact.outcome}` : ''}</Text>
                </View>
              ))}
              {(data.vade?.notes || []).slice(0, 4).map((note: any) => (
                <View key={note.id} style={styles.lineCard}>
                  <Text style={styles.lineTitle}>Vade Notu - {formatDate(note.createdAt)}</Text>
                  <Text style={styles.lineMeta}>{note.note || note.noteContent || '-'}</Text>
                </View>
              ))}
            </Section>

            <Section title="Aktivite ve Faturalar">
              <View style={styles.compactCard}>
                <InfoRow label="30 gun event" value={summary.activityEventCount30d || 0} />
                <InfoRow label="Son aktivite" value={formatDate(summary.lastActivityAt)} />
                <InfoRow label="Aktif anlasma" value={summary.activeAgreementCount || 0} />
                <InfoRow label="Fatura sayisi" value={data.invoices?.count || 0} />
              </View>
              {(data.activity?.topPages || []).slice(0, 5).map((page: any) => (
                <View key={page.pagePath} style={styles.lineCard}>
                  <Text style={styles.lineTitle}>{page.pageTitle || page.pagePath}</Text>
                  <Text style={styles.lineMeta}>{page.count || 0} ziyaret</Text>
                </View>
              ))}
              {(data.invoices?.recent || []).slice(0, 4).map((invoice: any) => (
                <View key={invoice.id || invoice.invoiceNo} style={styles.lineCard}>
                  <Text style={styles.lineTitle}>{invoice.invoiceNo || invoice.documentNo || 'Fatura'}</Text>
                  <Text style={styles.lineMeta}>{formatDate(invoice.issueDate || invoice.createdAt)} - {formatMoney(invoice.totalAmount || invoice.payableAmount)}</Text>
                </View>
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md },
  header: { gap: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textMuted },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  searchButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  searchButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  error: { fontFamily: fonts.medium, color: colors.danger },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  resultCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  resultText: { flex: 1, minWidth: 0 },
  resultTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  resultMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 2 },
  resultBalance: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primary },
  loading: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  loadingText: { fontFamily: fonts.medium, color: colors.textMuted },
  customerCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  customerName: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF' },
  customerMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DCE8FA' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: {
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primary },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  metricLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text, marginTop: spacing.xs },
  textDanger: { color: colors.danger },
  textWarning: { color: colors.warning },
  textSuccess: { color: '#059669' },
  trustCard: { gap: spacing.xs },
  trustTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trustScore: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: colors.text },
  trustLevel: { fontFamily: fonts.bold, fontSize: fontSizes.md },
  warningPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#92400E',
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  infoLabel: { flex: 1, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  infoValue: { flex: 1, textAlign: 'right', fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  compactCard: { backgroundColor: '#F8FAFC', borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  lineCard: { backgroundColor: '#F8FAFC', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 3 },
  lineTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  lineMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  twoColumn: { gap: spacing.sm },
  halfCard: { gap: spacing.sm },
  subsectionTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
});
