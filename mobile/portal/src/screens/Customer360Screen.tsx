import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

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

const taskStatusLabel = (status?: string) => {
  if (status === 'NEW') return 'Yeni';
  if (status === 'TRIAGE') return 'Triyaj';
  if (status === 'IN_PROGRESS') return 'Devam';
  if (status === 'WAITING') return 'Beklemede';
  if (status === 'REVIEW') return 'Kontrol';
  if (status === 'DONE') return 'Tamam';
  if (status === 'CANCELLED') return 'Iptal';
  return safeText(status);
};

const activityTypeLabel = (type?: string) => {
  if (type === 'PAGE_VIEW') return 'Sayfa';
  if (type === 'PRODUCT_VIEW') return 'Urun';
  if (type === 'CART_ADD') return 'Sepete Ekleme';
  if (type === 'SEARCH') return 'Arama';
  if (type === 'LOGIN') return 'Giris';
  return safeText(type, 'Aktivite');
};

const cell = (value: any) => {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' && item ? JSON.stringify(item) : String(item ?? ''))).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const numberCell = (value: any) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildCustomer360WorkbookRows = (payload: any) => {
  const customer = payload?.customer || {};
  const summary = payload?.summary || {};
  const priceTrust = payload?.priceTrust || {};
  const cart = payload?.cart || {};
  const vade = payload?.vade || {};
  const engagement = payload?.engagement || {};
  const activity = payload?.activity || {};
  const invoices = payload?.invoices || {};

  const overview = [
    ['Alan', 'Deger'],
    ['Cari', cell(customer.displayTitle || customer.displayName || customer.mikroName || customer.name)],
    ['Cari Kodu', cell(customer.mikroCariCode)],
    ['Sektor', cell(customer.sectorCode)],
    ['Grup', cell(customer.groupCode)],
    ['Sehir', cell(customer.city)],
    ['Ilce', cell(customer.district)],
    ['Durum', customer.active === false ? 'Pasif' : 'Aktif'],
    ['Bakiye', numberCell(summary.balance ?? customer.balance)],
    ['Siparis Adedi', numberCell(summary.orderCount)],
    ['Siparis Tutari', numberCell(summary.orderAmount)],
    ['Teklif Adedi', numberCell(summary.quoteCount)],
    ['Teklif Tutari', numberCell(summary.quoteAmount)],
    ['Sepet Kalemi', numberCell(summary.cartItemCount)],
    ['Sepet Tutari', numberCell(summary.cartTotal)],
    ['Acik Aksiyon', numberCell(summary.openTaskCount)],
    ['Geciken Aksiyon', numberCell(summary.overdueTaskCount)],
    ['Fatura Sayisi', numberCell(summary.invoiceCount || invoices.count)],
    ['Son Aktivite', cell(formatDate(summary.lastActivityAt))],
  ];

  const sales = [
    ['Tip', 'No/ID', 'Durum', 'Tarih', 'Tutar'],
    ...(payload?.orders || []).map((order: any) => [
      'Siparis',
      cell(order.orderNumber || order.id),
      cell(order.status),
      cell(formatDate(order.createdAt)),
      numberCell(order.totalAmount),
    ]),
    ...(payload?.quotes || []).map((quote: any) => [
      'Teklif',
      cell(quote.quoteNumber || quote.id),
      cell(quote.status),
      cell(formatDate(quote.createdAt)),
      numberCell(quote.grandTotal),
    ]),
  ];

  const cartRows = [
    ['Urun Kodu', 'Urun', 'Miktar', 'Birim Fiyat', 'Toplam', 'Guncelleme'],
    ...(cart.items || []).map((item: any) => [
      cell(item.productCode || item.product?.mikroCode),
      cell(item.productName || item.product?.name),
      numberCell(item.quantity),
      numberCell(item.unitPrice),
      numberCell(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
      cell(formatDate(item.updatedAt)),
    ]),
  ];

  const priceRows = [
    ['Alan', 'Deger'],
    ['Skor', numberCell(priceTrust.score)],
    ['Seviye', cell(priceTrust.level)],
    ['Fiyat Gorunumu', cell(priceTrust.priceVisibility)],
    ['KDV Tercihi', cell(priceTrust.vatDisplayPreference)],
    ['Son Fiyat Koruma', priceTrust.useLastPrices ? 'Acik' : 'Kapali'],
    ['Manuel Faturali Liste', cell(priceTrust.manualInvoicedListNo)],
    ['Manuel Perakende Liste', cell(priceTrust.manualRetailListNo)],
    ['Onerilen Faturali Liste', cell(priceTrust.suggestedInvoicedListNo)],
    ['Onerilen Perakende Liste', cell(priceTrust.suggestedRetailListNo)],
    ['Oneri Tarihi', cell(formatDate(priceTrust.suggestedListComputedAt))],
    ['Uyarilar', cell(priceTrust.warnings || [])],
  ];

  const vadeRows = [
    ['Tip', 'Tarih', 'Not/Kanal', 'Yazar/Sonuc', 'Tutar/Takip'],
    ['Vade Ozeti', cell(formatDate(vade.balance?.updatedAt)), cell(vade.classification?.classCode), cell(vade.classification?.riskScore), numberCell(vade.balance?.balance ?? summary.balance)],
    ...(vade.notes || []).map((note: any) => [
      'Vade Notu',
      cell(formatDate(note.createdAt)),
      cell(note.note || note.noteContent),
      cell(note.author?.name || note.authorName),
      numberCell(note.balanceAtTime),
    ]),
    ...(engagement.recentContacts || []).map((contact: any) => [
      'Temas',
      cell(formatDate(contact.contactedAt)),
      cell(contact.note || contact.channel),
      cell(contact.contactedByName || contact.outcome),
      cell(formatDate(contact.followUpDate)),
    ]),
  ];

  const activityRows = [
    ['Sayfa/Olay', 'Baslik', 'Adet', 'Son Aktivite'],
    ...(activity.topPages || []).map((page: any) => [
      cell(page.pagePath),
      cell(page.pageTitle),
      numberCell(page.count),
      '',
    ]),
    ...(activity.recent || activity.events || []).map((event: any) => [
      cell(event.eventType || event.type || event.pagePath),
      cell(event.pageTitle || event.description),
      1,
      cell(formatDate(event.createdAt)),
    ]),
  ];

  const invoiceRows = [
    ['Fatura No', 'Tarih', 'Tutar', 'Durum', 'Dosya'],
    ...(invoices.recent || []).map((invoice: any) => [
      cell(invoice.invoiceNo || invoice.documentNo),
      cell(formatDate(invoice.issueDate || invoice.createdAt)),
      numberCell(invoice.totalAmount || invoice.payableAmount),
      cell(invoice.status || invoice.matchStatus),
      cell(invoice.documentUrl || invoice.fileName),
    ]),
  ];

  return [
    { name: 'Ozet', rows: overview },
    { name: 'Satis-Teklif', rows: sales },
    { name: 'Sepet', rows: cartRows },
    { name: 'Fiyat Guven', rows: priceRows },
    { name: 'Vade-Temas', rows: vadeRows },
    { name: 'Aktivite', rows: activityRows },
    { name: 'Faturalar', rows: invoiceRows },
  ];
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
  const { width } = useWindowDimensions();
  const isWide = width >= 840;

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCustomerKey, setLastCustomerKey] = useState('');
  const searchRequestSeqRef = useRef(0);
  const customerRequestSeqRef = useRef(0);
  const clearingCartRef = useRef(false);
  const exportingRef = useRef(false);

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
    const requestSeq = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestSeq;
    setLastCustomerKey('');
    setSearching(true);
    setError(null);
    try {
      const response = await adminApi.searchCustomer360({
        search: (term ?? search).trim() || undefined,
        limit: 25,
      });
      if (requestSeq === searchRequestSeqRef.current) {
        setResults(response.customers || []);
      }
    } catch (err: any) {
      if (requestSeq === searchRequestSeqRef.current) {
        setResults([]);
        setError(getApiErrorMessage(err, 'Cari aramasi yapilamadi.'));
      }
    } finally {
      if (requestSeq === searchRequestSeqRef.current) {
        setSearching(false);
      }
    }
  }, [search]);

  const loadCustomer = useCallback(async (customerIdOrCode: string) => {
    const key = String(customerIdOrCode || '').trim();
    if (!key) return;
    const requestSeq = customerRequestSeqRef.current + 1;
    customerRequestSeqRef.current = requestSeq;
    setLastCustomerKey(key);
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getCustomer360(key);
      if (requestSeq === customerRequestSeqRef.current) {
        setData(response.data || null);
      }
    } catch (err: any) {
      if (requestSeq === customerRequestSeqRef.current) {
        setData(null);
        setError(getApiErrorMessage(err, 'Cari 360 yuklenemedi.'));
      }
    } finally {
      if (requestSeq === customerRequestSeqRef.current) {
        setLoading(false);
      }
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

  const clearCurrentCart = () => {
    if (clearingCartRef.current) return;
    const cartId = data?.cart?.id;
    const itemCount = Number(data?.cart?.items?.length || summary.cartItemCount || 0);
    if (!cartId || itemCount <= 0) return;
    Alert.alert(
      'Sepeti temizle?',
      `${safeText(customer?.mikroCariCode || customer?.name, 'Bu cari')} sepetindeki ${itemCount} kalem silinecek.`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: async () => {
            if (clearingCartRef.current) return;
            clearingCartRef.current = true;
            setClearingCart(true);
            try {
              const result = await adminApi.clearCustomerCart(cartId);
              const deletedCount = result.data?.deletedCount ?? itemCount;
              Alert.alert('Sepet temizlendi', `${deletedCount} kalem silindi.`);
              await loadCustomer(customer?.id || customer?.mikroCariCode);
            } catch (err: any) {
              Alert.alert('Sepet temizlenemedi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
            } finally {
              clearingCartRef.current = false;
              setClearingCart(false);
            }
          },
        },
      ],
    );
  };

  const exportCustomer360 = async () => {
    if (!data || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const sections = buildCustomer360WorkbookRows(data);
      sections.forEach((section) => {
        const ws = XLSX.utils.aoa_to_sheet(section.rows);
        ws['!cols'] = (section.rows[0] || []).map((header: unknown) => ({
          wch: Math.min(Math.max(String(header || '').length + 6, 12), 44),
        }));
        XLSX.utils.book_append_sheet(wb, ws, section.name.slice(0, 31));
      });

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const code = String(customer?.mikroCariCode || customer?.id || 'cari').replace(/[^a-zA-Z0-9._-]+/g, '-');
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}cari-360-${code}-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Cari 360 Excel',
        });
      } else {
        Alert.alert('Excel olusturuldu', target);
      }
    } catch (err: any) {
      Alert.alert('Excel olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const retryLastAction = () => {
    if (lastCustomerKey) {
      loadCustomer(lastCustomerKey);
      return;
    }
    runSearch();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Cari Komuta Merkezi</Text>
          <Text style={styles.heroTitle}>Cari 360</Text>
          <Text style={styles.heroSubtitle}>Satis, teklif, sepet, vade, temas ve fiyat guveni tek ekranda.</Text>
          <View style={styles.heroMetricRow}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{customer ? '1' : results.length}</Text>
              <Text style={styles.heroMetricLabel}>{customer ? 'Secili Cari' : 'Arama Sonucu'}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={[styles.heroMetricValue, Number(summary.cartTotal || 0) > 0 && styles.heroMetricGood]}>
                {Number(summary.cartItemCount || 0).toLocaleString('tr-TR')}
              </Text>
              <Text style={styles.heroMetricLabel}>Sepet Kalemi</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={[styles.heroMetricValue, Number(summary.overdueTaskCount || 0) > 0 && styles.heroMetricDanger]}>
                {Number(summary.openTaskCount || 0).toLocaleString('tr-TR')}
              </Text>
              <Text style={styles.heroMetricLabel}>Acik Aksiyon</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={[styles.heroMetricValue, priceTrust?.level === 'HIGH' && styles.heroMetricGood]}>
                {priceTrust?.score ?? '-'}
              </Text>
              <Text style={styles.heroMetricLabel}>Fiyat Guveni</Text>
            </View>
          </View>
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
          {error && (
            <TouchableOpacity style={styles.errorCard} onPress={retryLastAction}>
              <Text style={styles.error}>{error}</Text>
              <Text style={styles.retryText}>Tekrar dene</Text>
            </TouchableOpacity>
          )}
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
              <Text style={styles.customerName} numberOfLines={2}>{safeText(customer.displayTitle || customer.displayName || customer.mikroName || customer.name)}</Text>
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
                <TouchableOpacity style={styles.exportButton} onPress={exportCustomer360} disabled={exporting}>
                  <Text style={styles.exportButtonText}>{exporting ? 'Hazirlaniyor' : 'Excel'}</Text>
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
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.secondaryButton} onPress={openCartReport}>
                      <Text style={styles.secondaryButtonText}>Sepet Raporu</Text>
                    </TouchableOpacity>
                    {(data.cart.items || []).length > 0 ? (
                      <TouchableOpacity style={[styles.dangerButton, clearingCart && styles.buttonDisabled]} onPress={clearCurrentCart} disabled={clearingCart}>
                        <Text style={styles.dangerButtonText}>{clearingCart ? 'Temizleniyor' : 'Sepeti Temizle'}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {(data.cart.items || []).slice(0, 12).map((item: any) => (
                    <View key={item.id} style={styles.lineCard}>
                      <Text style={styles.lineTitle} numberOfLines={2}>{safeText(item.productName || item.product?.name || item.productCode)}</Text>
                      <Text style={styles.lineMeta}>
                        {safeText(item.productCode || item.product?.mikroCode)} - {Number(item.quantity || 0).toLocaleString('tr-TR')} x {formatMoney(item.unitPrice)}
                      </Text>
                    </View>
                  ))}
                  {(data.cart.items || []).length > 12 && (
                    <Text style={styles.emptyText}>{(data.cart.items || []).length - 12} kalem daha var. Tum liste icin Sepet Raporu'nu acin.</Text>
                  )}
                </View>
              ) : (
                <Text style={styles.emptyText}>Aktif sepet yok.</Text>
              )}
            </Section>

            <Section title="Siparis ve Teklif">
              <View style={[styles.twoColumn, isWide && styles.twoColumnWide]}>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Son Siparisler</Text>
                  {(data.orders || []).slice(0, 5).map((order: any) => (
                    <TouchableOpacity key={order.id} style={styles.lineCard} onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}>
                      <Text style={styles.lineTitle} numberOfLines={1}>{order.orderNumber || order.id}</Text>
                      <Text style={styles.lineMeta}>{order.status || '-'} - {formatMoney(order.totalAmount)} - {formatDate(order.createdAt)}</Text>
                      <Text style={styles.lineMeta}>
                        {order._count?.items || 0} kalem
                        {order.requestedBy?.name ? ` - Giren: ${order.requestedBy.name}` : ''}
                        {order.customerOrderNumber ? ` - Belge: ${order.customerOrderNumber}` : ''}
                      </Text>
                      {(order.items || []).slice(0, 3).map((item: any) => (
                        <Text key={`${order.id}-${item.mikroCode}-${item.productName}`} style={styles.detailLine}>
                          {safeText(item.mikroCode)} - {safeText(item.productName)} - {Number(item.quantity || 0).toLocaleString('tr-TR')} {safeText(item.unit, '')}
                        </Text>
                      ))}
                    </TouchableOpacity>
                  ))}
                  {(data.orders || []).length === 0 && <Text style={styles.emptyText}>Siparis yok.</Text>}
                </View>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Son Teklifler</Text>
                  {(data.quotes || []).slice(0, 5).map((quote: any) => (
                    <TouchableOpacity key={quote.id} style={styles.lineCard} onPress={() => navigation.navigate('QuoteDetail', { quoteId: quote.id })}>
                      <Text style={styles.lineTitle} numberOfLines={1}>{quote.quoteNumber || quote.id}</Text>
                      <Text style={styles.lineMeta}>{quote.status || '-'} - {formatMoney(quote.grandTotal)} - {formatDate(quote.createdAt)}</Text>
                      <Text style={styles.lineMeta}>
                        {quote._count?.items || 0} kalem
                        {quote.createdBy?.name ? ` - Hazirlayan: ${quote.createdBy.name}` : ''}
                        {quote.validityDate ? ` - Gecerlilik: ${formatDate(quote.validityDate)}` : ''}
                      </Text>
                      {(quote.items || []).slice(0, 3).map((item: any) => (
                        <Text key={`${quote.id}-${item.productCode}-${item.productName}`} style={styles.detailLine}>
                          {safeText(item.productCode)} - {safeText(item.productName)} - {Number(item.quantity || 0).toLocaleString('tr-TR')} {safeText(item.unit, '')}
                        </Text>
                      ))}
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
                  <Text style={styles.lineTitle} numberOfLines={1}>{formatDate(contact.contactedAt)} - {contact.channel || 'Genel'}</Text>
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

            <Section title="Aksiyonlar ve Talepler">
              <View style={[styles.twoColumn, isWide && styles.twoColumnWide]}>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Gorevler</Text>
                  {(data.tasks || []).slice(0, 6).map((task: any) => (
                    <TouchableOpacity key={task.id} style={styles.lineCard} onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}>
                      <Text style={styles.lineTitle} numberOfLines={2}>{safeText(task.title)}</Text>
                      <Text style={styles.lineMeta}>
                        {taskStatusLabel(task.status)} - {safeText(task.priority)}
                        {task.dueDate ? ` - Termin: ${formatDate(task.dueDate)}` : ''}
                      </Text>
                      <Text style={styles.lineMeta}>
                        {task.assignedTo?.name ? `Sorumlu: ${task.assignedTo.name}` : 'Sorumlu yok'}
                        {task._count?.comments ? ` - ${task._count.comments} yorum` : ''}
                        {task._count?.attachments ? ` - ${task._count.attachments} dosya` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {(data.tasks || []).length === 0 && <Text style={styles.emptyText}>Gorev yok.</Text>}
                </View>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Geri Kazanma / Talep</Text>
                  {(data.recoveryActions || []).slice(0, 4).map((action: any) => (
                    <View key={action.id} style={styles.lineCard}>
                      <Text style={styles.lineTitle} numberOfLines={2}>{safeText(action.title || action.actionType || action.reason, 'Aksiyon')}</Text>
                      <Text style={styles.lineMeta}>
                        {safeText(action.status)} - {formatDate(action.createdAt)}
                        {action.assignedTo?.name ? ` - ${action.assignedTo.name}` : ''}
                      </Text>
                      {!!action.note && <Text style={styles.detailLine}>{action.note}</Text>}
                    </View>
                  ))}
                  {(data.orderRequests || []).slice(0, 4).map((request: any) => (
                    <View key={request.id} style={styles.lineCard}>
                      <Text style={styles.lineTitle}>Musteri talebi - {safeText(request.status)}</Text>
                      <Text style={styles.lineMeta}>
                        {formatDate(request.createdAt)} - {request._count?.items || 0} kalem
                        {request.requestedBy?.name ? ` - ${request.requestedBy.name}` : ''}
                      </Text>
                      {!!request.note && <Text style={styles.detailLine}>{request.note}</Text>}
                      {request.order?.orderNumber ? <Text style={styles.lineMeta}>Siparis: {request.order.orderNumber}</Text> : null}
                    </View>
                  ))}
                  {(data.recoveryActions || []).length === 0 && (data.orderRequests || []).length === 0 && (
                    <Text style={styles.emptyText}>Aksiyon veya talep yok.</Text>
                  )}
                </View>
              </View>
            </Section>

            <Section title="Anlasma, Iletisim ve Kullanicilar">
              <View style={[styles.twoColumn, isWide && styles.twoColumnWide]}>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Aktif Anlasmalar</Text>
                  {(data.agreements?.recent || []).slice(0, 6).map((agreement: any) => (
                    <View key={agreement.id} style={styles.lineCard}>
                      <Text style={styles.lineTitle} numberOfLines={2}>{safeText(agreement.product?.name || agreement.product?.mikroCode || agreement.customerProductCode)}</Text>
                      <Text style={styles.lineMeta}>
                        {safeText(agreement.product?.mikroCode || agreement.customerProductCode)} - Min {Number(agreement.minQuantity || 0).toLocaleString('tr-TR')}
                      </Text>
                      <Text style={styles.lineMeta}>
                        Faturali {formatMoney(agreement.priceInvoiced)} / Beyaz {formatMoney(agreement.priceWhite)}
                      </Text>
                      <Text style={styles.detailLine}>{formatDate(agreement.validFrom)} - {formatDate(agreement.validTo)}</Text>
                    </View>
                  ))}
                  {(data.agreements?.recent || []).length === 0 && <Text style={styles.emptyText}>Aktif anlasma yok.</Text>}
                </View>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Iletisim / Alt Kullanici</Text>
                  {(data.contacts || []).slice(0, 6).map((contact: any) => (
                    <View key={contact.id} style={styles.lineCard}>
                      <Text style={styles.lineTitle} numberOfLines={1}>{safeText(contact.name || contact.title || contact.email, 'Kisi')}</Text>
                      <Text style={styles.lineMeta}>{safeText(contact.phone || contact.mobilePhone, '')} {contact.email ? `- ${contact.email}` : ''}</Text>
                      {!!contact.note && <Text style={styles.detailLine}>{contact.note}</Text>}
                    </View>
                  ))}
                  {(data.subUsers || []).slice(0, 6).map((subUser: any) => (
                    <View key={subUser.id} style={styles.lineCard}>
                      <Text style={styles.lineTitle} numberOfLines={1}>{safeText(subUser.displayName || subUser.name || subUser.email, 'Alt kullanici')}</Text>
                      <Text style={styles.lineMeta}>
                        {safeText(subUser.email)} - {subUser.active === false ? 'Pasif' : 'Aktif'} - {safeText(subUser.priceVisibility)}
                      </Text>
                    </View>
                  ))}
                  {(data.contacts || []).length === 0 && (data.subUsers || []).length === 0 && (
                    <Text style={styles.emptyText}>Iletisim veya alt kullanici yok.</Text>
                  )}
                </View>
              </View>
            </Section>

            <Section title="Aktivite ve Faturalar">
              <View style={[styles.twoColumn, isWide && styles.twoColumnWide]}>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Davranis</Text>
                  <View style={styles.compactCard}>
                    <InfoRow label="30 gun event" value={summary.activityEventCount30d || 0} />
                    <InfoRow label="Son aktivite" value={formatDate(summary.lastActivityAt)} />
                    <InfoRow label="Aktif anlasma" value={summary.activeAgreementCount || 0} />
                    <InfoRow label="Fatura sayisi" value={data.invoices?.count || 0} />
                  </View>
                  {(data.activity?.topPages || []).slice(0, 5).map((page: any) => (
                    <View key={page.pagePath} style={styles.lineCard}>
                      <Text style={styles.lineTitle} numberOfLines={1}>{page.pageTitle || page.pagePath}</Text>
                      <Text style={styles.lineMeta}>{page.count || 0} ziyaret</Text>
                    </View>
                  ))}
                  {(data.activity?.topProducts || []).slice(0, 5).map((product: any) => (
                    <View key={product.productCode} style={styles.lineCard}>
                      <Text style={styles.lineTitle} numberOfLines={2}>{safeText(product.productName || product.productCode)}</Text>
                      <Text style={styles.lineMeta}>{safeText(product.productCode)} - {product.count || 0} aktivite</Text>
                    </View>
                  ))}
                  {(data.activity?.lastEvents || []).slice(0, 5).map((event: any) => (
                    <View key={event.id} style={styles.lineCard}>
                      <Text style={styles.lineTitle} numberOfLines={1}>{activityTypeLabel(event.type)} - {formatDate(event.createdAt)}</Text>
                      <Text style={styles.lineMeta}>{safeText(event.pageTitle || event.pagePath || event.product?.name || event.productCode)}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.halfCard}>
                  <Text style={styles.subsectionTitle}>Faturalar</Text>
                  {(data.invoices?.recent || []).slice(0, 8).map((invoice: any) => (
                    <TouchableOpacity key={invoice.id || invoice.invoiceNo} style={styles.lineCard} onPress={() => navigation.navigate('EInvoices')}>
                      <Text style={styles.lineTitle} numberOfLines={1}>{invoice.invoiceNo || invoice.documentNo || 'Fatura'}</Text>
                      <Text style={styles.lineMeta}>
                        {formatDate(invoice.issueDate || invoice.createdAt)} - {formatMoney(invoice.totalAmount || invoice.payableAmount)}
                      </Text>
                      <Text style={styles.detailLine}>{safeText(invoice.currency, 'TRY')} - {safeText(invoice.matchStatus)}</Text>
                    </TouchableOpacity>
                  ))}
                  {(data.invoices?.recent || []).length === 0 && <Text style={styles.emptyText}>Fatura yok.</Text>}
                </View>
              </View>
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
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroKicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#9EC5FF', textTransform: 'uppercase' },
  heroTitle: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  heroSubtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DCE8FA', lineHeight: 21 },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroMetric: {
    flexGrow: 1,
    minWidth: 118,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: '#FFFFFF' },
  heroMetricGood: { color: '#BBF7D0' },
  heroMetricDanger: { color: '#FECACA' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#DCE8FA' },
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
  errorCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    padding: spacing.md,
    gap: 4,
  },
  error: { fontFamily: fonts.medium, color: colors.danger },
  retryText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
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
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  resultText: { flex: 1, minWidth: 0 },
  resultTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  resultMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 2 },
  resultBalance: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  loading: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  loadingText: { fontFamily: fonts.medium, color: colors.textMuted },
  customerCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    gap: spacing.sm,
    shadowColor: '#071B3A',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  customerName: { minWidth: 0, fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF', lineHeight: 28 },
  customerMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DCE8FA' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  dangerButton: {
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dangerButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  buttonDisabled: { opacity: 0.6 },
  exportButton: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  exportButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 145,
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
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.warning,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  infoLabel: { flex: 1, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  infoValue: { flex: 1, textAlign: 'right', fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  compactCard: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  lineCard: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 3 },
  lineTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text, lineHeight: 20 },
  lineMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  detailLine: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.text, lineHeight: 18 },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  twoColumn: { gap: spacing.sm },
  twoColumnWide: { flexDirection: 'row', alignItems: 'flex-start' },
  halfCard: { flex: 1, gap: spacing.sm },
  subsectionTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
});
