import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { hapticSuccess } from '../utils/haptics';

const formatMoney = (value: any) =>
  `${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`;

const formatNumber = (value: any) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('tr-TR');
};

const productCode = (product: any) => String(product?.mikroCode || product?.productCode || '').trim();

function MiniMetric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'amber' | 'green' }) {
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

export function FieldSalesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as { params?: { customerIdOrCode?: string } };

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [safeMode, setSafeMode] = useState(true);

  const [note, setNote] = useState('');
  const [demand, setDemand] = useState('');
  const [competitorInfo, setCompetitorInfo] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerKey = selectedCustomer?.id || selectedCustomer?.mikroCariCode || snapshot?.customer?.id || snapshot?.customer?.mikroCariCode || '';

  const snapshotMetrics = useMemo(() => {
    const summary = snapshot?.summary || {};
    return [
      { label: 'Bakiye', value: formatMoney(summary.balance), tone: Number(summary.balance || 0) > 0 ? ('amber' as const) : undefined },
      { label: 'Acik Siparis', value: summary.openOrderCount || 0 },
      { label: 'Acik Teklif', value: summary.openQuoteCount || 0 },
      { label: 'Sepet', value: summary.cartItemCount || 0, tone: Number(summary.cartItemCount || 0) > 0 ? ('green' as const) : undefined },
    ];
  }, [snapshot]);

  const searchCustomers = useCallback(async () => {
    const term = customerSearch.trim();
    setCustomerLoading(true);
    setError(null);
    try {
      const result = await adminApi.searchFieldSalesCustomers({ search: term || undefined, limit: 25 });
      setCustomerResults(result.customers || []);
    } catch (err: any) {
      setCustomerResults([]);
      setError(err?.response?.data?.error || 'Cari aramasi yapilamadi.');
    } finally {
      setCustomerLoading(false);
    }
  }, [customerSearch]);

  const loadCustomerSnapshot = useCallback(async (customerIdOrCode: string) => {
    const key = String(customerIdOrCode || '').trim();
    if (!key) return;
    setSnapshotLoading(true);
    setError(null);
    try {
      const result = await adminApi.getFieldSalesCustomer(key);
      setSnapshot(result.data || null);
      setSelectedCustomer(result.data?.customer || selectedCustomer);
    } catch (err: any) {
      setSnapshot(null);
      setError(err?.response?.data?.error || 'Cari bilgileri alinamadi.');
    } finally {
      setSnapshotLoading(false);
    }
  }, [selectedCustomer]);

  const selectCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.displayTitle || customer.mikroCariCode || '');
    setCustomerResults([]);
    loadCustomerSnapshot(customer.id || customer.mikroCariCode);
  };

  const searchProducts = useCallback(async () => {
    const term = productSearch.trim();
    if (term.length < 2) {
      Alert.alert('Arama', 'En az 2 karakter yazin.');
      return;
    }
    setProductsLoading(true);
    setError(null);
    try {
      const result = await adminApi.searchFieldSalesProducts({
        search: term,
        customerId: customerKey || undefined,
        limit: 40,
        safeMode,
      });
      setProducts(result.products || []);
    } catch (err: any) {
      setProducts([]);
      setError(err?.response?.data?.error || 'Urun aramasi yapilamadi.');
    } finally {
      setProductsLoading(false);
    }
  }, [customerKey, productSearch, safeMode]);

  const loadProductDetail = async (product: any) => {
    const code = productCode(product);
    if (!code) return;
    setSelectedProduct(product);
    try {
      const result = await adminApi.getFieldSalesProduct(code, {
        customerId: customerKey || undefined,
        safeMode,
      });
      setSelectedProduct(result.data?.product || product);
    } catch {
      setSelectedProduct(product);
    }
  };

  const saveVisitNote = async () => {
    if (!customerKey) {
      Alert.alert('Cari secin', 'Ziyaret notu icin once cari secilmeli.');
      return;
    }
    if (!note.trim()) {
      Alert.alert('Not gerekli', 'Ziyaret notu bos olamaz.');
      return;
    }
    setNoteSaving(true);
    try {
      await adminApi.createFieldSalesVisitNote(customerKey, {
        note: note.trim(),
        demand: demand.trim() || null,
        competitorInfo: competitorInfo.trim() || null,
      });
      setNote('');
      setDemand('');
      setCompetitorInfo('');
      hapticSuccess();
      await loadCustomerSnapshot(customerKey);
    } catch (err: any) {
      Alert.alert('Not kaydedilemedi', err?.response?.data?.error || 'Islem tamamlanamadi.');
    } finally {
      setNoteSaving(false);
    }
  };

  useEffect(() => {
    if (route.params?.customerIdOrCode) {
      loadCustomerSnapshot(route.params.customerIdOrCode);
    } else {
      searchCustomers();
    }
  }, []);

  const renderProduct = (product: any) => {
    const customerPrice = product.customerPrice || {};
    const warehouses = product.warehouses || [];
    const code = productCode(product);
    const lastSales = customerPrice.lastSales || product.lastSales || [];

    return (
      <TouchableOpacity key={code || product.name} style={styles.productCard} onPress={() => loadProductDetail(product)}>
        <Text style={styles.productTitle}>{product.name || product.productName || '-'}</Text>
        <Text style={styles.productCode}>{code || '-'}</Text>
        <View style={styles.productMetaGrid}>
          <Text style={styles.metaPill}>Stok {formatNumber(product.totalSellable ?? product.totalStock)}</Text>
          <Text style={styles.metaPill}>Birim {product.unit || '-'}</Text>
          {!!product.categoryName && <Text style={styles.metaPill}>{product.categoryName}</Text>}
        </View>
        <View style={styles.priceRow}>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>Faturali</Text>
            <Text style={styles.priceValue}>{formatMoney(customerPrice.invoiced)}</Text>
          </View>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>Beyaz</Text>
            <Text style={styles.priceValue}>{formatMoney(customerPrice.white)}</Text>
          </View>
        </View>
        {warehouses.length > 0 && (
          <View style={styles.warehouseRow}>
            {warehouses.slice(0, 4).map((warehouse: any) => (
              <Text key={warehouse.key || warehouse.no} style={styles.warehousePill}>
                {warehouse.label}: {formatNumber(warehouse.sellable ?? warehouse.stock)}
              </Text>
            ))}
          </View>
        )}
        {lastSales.length > 0 && (
          <View style={styles.lastSalesBox}>
            <Text style={styles.subsectionTitle}>Son satis</Text>
            {lastSales.slice(0, 3).map((sale: any) => (
              <Text key={`${sale.documentNo}-${sale.saleDate}`} style={styles.smallText}>
                {formatDate(sale.saleDate)} - {formatNumber(sale.quantity)} {product.unit || ''} - {formatMoney(sale.unitPrice)}
              </Text>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Saha Satis</Text>
          <Text style={styles.subtitle}>Cari odakli urun arama, fiyat/stok kontrolu ve ziyaret notu.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cari Secimi</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              placeholder="Cari kodu, unvan, sehir"
              placeholderTextColor={colors.textMuted}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              onSubmitEditing={searchCustomers}
            />
            <TouchableOpacity style={styles.searchButton} onPress={searchCustomers} disabled={customerLoading}>
              <Text style={styles.searchButtonText}>{customerLoading ? '...' : 'Ara'}</Text>
            </TouchableOpacity>
          </View>
          {customerResults.map((customer) => (
            <TouchableOpacity key={customer.id || customer.mikroCariCode} style={styles.customerResult} onPress={() => selectCustomer(customer)}>
              <Text style={styles.customerTitle}>{customer.displayTitle || customer.displayName || customer.mikroName || customer.name}</Text>
              <Text style={styles.smallText}>
                {customer.mikroCariCode || '-'} {customer.sectorCode ? `- ${customer.sectorCode}` : ''} {customer.city ? `- ${customer.city}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        {snapshotLoading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {snapshot?.customer && (
          <View style={styles.customerCard}>
            <Text style={styles.customerName}>{snapshot.customer.displayTitle || snapshot.customer.mikroCariCode}</Text>
            <Text style={styles.customerMeta}>
              {snapshot.customer.mikroCariCode || '-'} {snapshot.customer.sectorCode ? `- ${snapshot.customer.sectorCode}` : ''}
            </Text>
            <View style={styles.metricGrid}>
              {snapshotMetrics.map((metric) => (
                <MiniMetric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
              ))}
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Customer360', { customerIdOrCode: customerKey })}>
                <Text style={styles.secondaryButtonText}>Cari 360</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('CustomerDetail', { customerId: snapshot.customer.id })}>
                <Text style={styles.secondaryButtonText}>Cari Detay</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Urun Arama</Text>
            <TouchableOpacity
              style={[styles.modeChip, !safeMode && styles.modeChipActive]}
              onPress={() => setSafeMode((value) => !value)}
            >
              <Text style={!safeMode ? styles.modeChipTextActive : styles.modeChipText}>
                {safeMode ? 'Maliyet gizli' : 'Maliyet acik'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              placeholder="Stok kodu veya urun adi"
              placeholderTextColor={colors.textMuted}
              value={productSearch}
              onChangeText={setProductSearch}
              onSubmitEditing={searchProducts}
            />
            <TouchableOpacity style={styles.searchButton} onPress={searchProducts} disabled={productsLoading}>
              <Text style={styles.searchButtonText}>{productsLoading ? '...' : 'Ara'}</Text>
            </TouchableOpacity>
          </View>
          {productsLoading ? <ActivityIndicator color={colors.primary} /> : products.map(renderProduct)}
        </View>

        {selectedProduct && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Secili Urun</Text>
            {renderProduct(selectedProduct)}
          </View>
        )}

        {snapshot?.customer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Firsatlar ve Ziyaret Notu</Text>
            {(snapshot.opportunities?.stalePurchased || []).slice(0, 4).map((item: any) => (
              <View key={`stale-${item.productCode}`} style={styles.opportunityCard}>
                <Text style={styles.opportunityTitle}>{item.productName || item.productCode}</Text>
                <Text style={styles.smallText}>{item.reason || 'Tekrar takip edilebilir.'}</Text>
              </View>
            ))}
            {(snapshot.opportunities?.similarSector || []).slice(0, 4).map((item: any) => (
              <View key={`similar-${item.productCode}`} style={styles.opportunityCard}>
                <Text style={styles.opportunityTitle}>{item.productName || item.productCode}</Text>
                <Text style={styles.smallText}>{item.reason || 'Benzer cariler aliyor.'}</Text>
              </View>
            ))}
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ziyaret notu"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Talep / ihtiyac"
              placeholderTextColor={colors.textMuted}
              value={demand}
              onChangeText={setDemand}
            />
            <TextInput
              style={styles.input}
              placeholder="Rakip / piyasa bilgisi"
              placeholderTextColor={colors.textMuted}
              value={competitorInfo}
              onChangeText={setCompetitorInfo}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={saveVisitNote} disabled={noteSaving}>
              <Text style={styles.primaryButtonText}>{noteSaving ? 'Kaydediliyor' : 'Notu Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md },
  header: { gap: spacing.xs },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textMuted },
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'center' },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  subsectionTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  searchButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  searchButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  customerResult: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  customerTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text },
  customerCard: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  customerName: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF' },
  customerMeta: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DCE8FA' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: { width: '48%', backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.md },
  metricLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text, marginTop: spacing.xs },
  productCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  productTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  productCode: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primary },
  productMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metaPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  priceRow: { flexDirection: 'row', gap: spacing.sm },
  priceBox: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.sm },
  priceLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  priceValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  warehouseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  warehousePill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  lastSalesBox: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.sm, gap: 4 },
  smallText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secondaryButton: { backgroundColor: '#FFFFFF', borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  secondaryButtonText: { fontFamily: fonts.semibold, color: colors.primary },
  modeChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeChipText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  modeChipTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  opportunityCard: { backgroundColor: '#EFF6FF', borderRadius: radius.md, padding: spacing.md, gap: 4 },
  opportunityTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryButtonText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  loading: { padding: spacing.lg, alignItems: 'center' },
  error: { fontFamily: fonts.medium, color: colors.danger },
  textDanger: { color: colors.danger },
  textWarning: { color: colors.warning },
  textSuccess: { color: '#059669' },
});
