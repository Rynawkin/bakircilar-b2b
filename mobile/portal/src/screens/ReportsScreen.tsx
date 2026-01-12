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
import { CostUpdateAlert, CostUpdateSummary, MarginComplianceRow, PriceHistoryChange } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type ReportType =
  | 'cost'
  | 'margin'
  | 'profit'
  | 'price'
  | 'priceNew'
  | 'topProducts'
  | 'topCustomers'
  | 'productCustomers';

export function ReportsScreen() {
  const [reportType, setReportType] = useState<ReportType>('cost');

  const [costData, setCostData] = useState<CostUpdateAlert[]>([]);
  const [costSummary, setCostSummary] = useState<CostUpdateSummary | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [dayDiff, setDayDiff] = useState('');
  const [percentDiff, setPercentDiff] = useState('');

  const [marginData, setMarginData] = useState<MarginComplianceRow[]>([]);
  const [marginSummary, setMarginSummary] = useState<any>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginError, setMarginError] = useState<string | null>(null);
  const [marginStatus, setMarginStatus] = useState('');
  const [marginStartDate, setMarginStartDate] = useState('');
  const [marginEndDate, setMarginEndDate] = useState('');

  const [priceData, setPriceData] = useState<PriceHistoryChange[]>([]);
  const [priceSummary, setPriceSummary] = useState<any>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceSearch, setPriceSearch] = useState('');
  const [priceStartDate, setPriceStartDate] = useState('');
  const [priceEndDate, setPriceEndDate] = useState('');

  const [priceNewData, setPriceNewData] = useState<any[]>([]);
  const [priceNewSummary, setPriceNewSummary] = useState<any>(null);
  const [priceNewLoading, setPriceNewLoading] = useState(false);
  const [priceNewError, setPriceNewError] = useState<string | null>(null);
  const [priceNewSearch, setPriceNewSearch] = useState('');

  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topProductsSummary, setTopProductsSummary] = useState<any>(null);
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const [topProductsError, setTopProductsError] = useState<string | null>(null);
  const [topProductsStartDate, setTopProductsStartDate] = useState('');
  const [topProductsEndDate, setTopProductsEndDate] = useState('');

  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [topCustomersSummary, setTopCustomersSummary] = useState<any>(null);
  const [topCustomersLoading, setTopCustomersLoading] = useState(false);
  const [topCustomersError, setTopCustomersError] = useState<string | null>(null);
  const [topCustomersStartDate, setTopCustomersStartDate] = useState('');
  const [topCustomersEndDate, setTopCustomersEndDate] = useState('');

  const [productCustomers, setProductCustomers] = useState<any[]>([]);
  const [productCustomersSummary, setProductCustomersSummary] = useState<any>(null);
  const [productCustomersLoading, setProductCustomersLoading] = useState(false);
  const [productCustomersError, setProductCustomersError] = useState<string | null>(null);
  const [productCustomerCode, setProductCustomerCode] = useState('');

  const fetchCost = async () => {
    setCostLoading(true);
    setCostError(null);
    try {
      const response = await adminApi.getCostUpdateAlerts({
        dayDiff: dayDiff ? Number(dayDiff) : undefined,
        percentDiff: percentDiff ? Number(percentDiff) : undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setCostData(response.data.products || []);
        setCostSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setCostError(err?.response?.data?.error || 'Rapor yuklenemedi.');
    } finally {
      setCostLoading(false);
    }
  };

  const fetchMargin = async () => {
    setMarginLoading(true);
    setMarginError(null);
    try {
      const response = await adminApi.getMarginComplianceReport({
        startDate: marginStartDate ? marginStartDate.replace(/-/g, '') : undefined,
        endDate: marginEndDate ? marginEndDate.replace(/-/g, '') : undefined,
        includeCompleted: 1,
        page: 1,
        limit: 50,
        sortBy: 'OrtalamaKarYuzde',
        sortOrder: 'desc',
        status: marginStatus || undefined,
      });
      if (response.success) {
        setMarginData(response.data.data || []);
        setMarginSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setMarginError(err?.response?.data?.error || 'Rapor yuklenemedi.');
    } finally {
      setMarginLoading(false);
    }
  };

  const fetchPrice = async () => {
    setPriceLoading(true);
    setPriceError(null);
    try {
      const response = await adminApi.getPriceHistory({
        page: 1,
        limit: 50,
        sortBy: 'changeDate',
        sortOrder: 'desc',
        productName: priceSearch || undefined,
        startDate: priceStartDate || undefined,
        endDate: priceEndDate || undefined,
      });
      if (response.success) {
        setPriceData(response.data.changes || []);
        setPriceSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setPriceError(err?.response?.data?.error || 'Rapor yuklenemedi.');
    } finally {
      setPriceLoading(false);
    }
  };

  const fetchPriceNew = async () => {
    setPriceNewLoading(true);
    setPriceNewError(null);
    try {
      const response = await adminApi.getPriceHistoryNew({
        productName: priceNewSearch || undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setPriceNewData(response.data.products || []);
      }
      const summary = await adminApi.getPriceSummaryStats();
      if (summary.success) {
        setPriceNewSummary(summary.data || null);
      }
    } catch (err: any) {
      setPriceNewError(err?.response?.data?.error || 'Rapor yuklenemedi.');
    } finally {
      setPriceNewLoading(false);
    }
  };

  const fetchTopProducts = async () => {
    setTopProductsLoading(true);
    setTopProductsError(null);
    try {
      const response = await adminApi.getTopProducts({
        startDate: topProductsStartDate || undefined,
        endDate: topProductsEndDate || undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setTopProducts(response.data.products || []);
        setTopProductsSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setTopProductsError(err?.response?.data?.error || 'Rapor yuklenemedi.');
    } finally {
      setTopProductsLoading(false);
    }
  };

  const fetchTopCustomers = async () => {
    setTopCustomersLoading(true);
    setTopCustomersError(null);
    try {
      const response = await adminApi.getTopCustomers({
        startDate: topCustomersStartDate || undefined,
        endDate: topCustomersEndDate || undefined,
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setTopCustomers(response.data.customers || []);
        setTopCustomersSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setTopCustomersError(err?.response?.data?.error || 'Rapor yuklenemedi.');
    } finally {
      setTopCustomersLoading(false);
    }
  };

  const fetchProductCustomers = async () => {
    if (!productCustomerCode.trim()) return;
    setProductCustomersLoading(true);
    setProductCustomersError(null);
    try {
      const response = await adminApi.getProductCustomers({
        productCode: productCustomerCode.trim(),
        page: 1,
        limit: 50,
      });
      if (response.success) {
        setProductCustomers(response.data.customers || []);
        setProductCustomersSummary(response.data.summary || null);
      }
    } catch (err: any) {
      setProductCustomersError(err?.response?.data?.error || 'Rapor yuklenemedi.');
    } finally {
      setProductCustomersLoading(false);
    }
  };

  useEffect(() => {
    if (reportType === 'cost' && costData.length === 0 && !costLoading) {
      fetchCost();
    }
    if ((reportType === 'margin' || reportType === 'profit') && marginData.length === 0 && !marginLoading) {
      fetchMargin();
    }
    if (reportType === 'price' && priceData.length === 0 && !priceLoading) {
      fetchPrice();
    }
    if (reportType === 'priceNew' && priceNewData.length === 0 && !priceNewLoading) {
      fetchPriceNew();
    }
    if (reportType === 'topProducts' && topProducts.length === 0 && !topProductsLoading) {
      fetchTopProducts();
    }
    if (reportType === 'topCustomers' && topCustomers.length === 0 && !topCustomersLoading) {
      fetchTopCustomers();
    }
  }, [reportType]);

  const data =
    reportType === 'cost'
      ? costData
      : reportType === 'margin' || reportType === 'profit'
        ? marginData
        : reportType === 'price'
          ? priceData
          : reportType === 'priceNew'
            ? priceNewData
            : reportType === 'topProducts'
              ? topProducts
              : reportType === 'topCustomers'
                ? topCustomers
                : productCustomers;

  const headerContent = useMemo(() => {
    if (reportType === 'cost') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Maliyet Guncelleme</Text>
          <Text style={styles.sectionSubtitle}>Maliyeti geriden gelen urunler.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Gun farki"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={dayDiff}
              onChangeText={setDayDiff}
            />
            <TextInput
              style={styles.input}
              placeholder="Yuzde farki"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={percentDiff}
              onChangeText={setPercentDiff}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchCost}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {costSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Kayit: {costSummary.totalAlerts}</Text>
              <Text style={styles.summaryText}>Risk: {costSummary.totalRiskAmount.toFixed(2)} TL</Text>
              <Text style={styles.summaryText}>Ortalama: {costSummary.avgDiffPercent.toFixed(2)}%</Text>
            </View>
          )}
          {costError && <Text style={styles.error}>{costError}</Text>}
        </View>
      );
    }

    if (reportType === 'margin' || reportType === 'profit') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Kar Marji Analizi</Text>
          <Text style={styles.sectionSubtitle}>Siparis ve fatura marj kontrolu.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={marginStartDate}
              onChangeText={setMarginStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={marginEndDate}
              onChangeText={setMarginEndDate}
            />
          </View>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Durum (HIGH/LOW/NEGATIVE/OK)"
              placeholderTextColor={colors.textMuted}
              value={marginStatus}
              onChangeText={setMarginStatus}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchMargin}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {marginSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Kayit: {marginSummary.totalRecords}</Text>
              <Text style={styles.summaryText}>Ortalama: {marginSummary.avgMargin?.toFixed?.(2) ?? '-'}%</Text>
            </View>
          )}
          {marginError && <Text style={styles.error}>{marginError}</Text>}
        </View>
      );
    }

    if (reportType === 'price') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Fiyat Degisimleri</Text>
          <Text style={styles.sectionSubtitle}>Liste bazli degisim raporu.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Urun adi"
              placeholderTextColor={colors.textMuted}
              value={priceSearch}
              onChangeText={setPriceSearch}
            />
          </View>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={priceStartDate}
              onChangeText={setPriceStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={priceEndDate}
              onChangeText={setPriceEndDate}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchPrice}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {priceSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Degisim: {priceSummary.totalChanges}</Text>
              <Text style={styles.summaryText}>Tutarlilik: {priceSummary.consistencyRate?.toFixed?.(1) ?? '-'}%</Text>
            </View>
          )}
          {priceError && <Text style={styles.error}>{priceError}</Text>}
        </View>
      );
    }

    if (reportType === 'priceNew') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Fiyat Degisimi (Yeni)</Text>
          <Text style={styles.sectionSubtitle}>PostgreSQL fiyat listesi.</Text>
          <TextInput
            style={styles.input}
            placeholder="Urun adi"
            placeholderTextColor={colors.textMuted}
            value={priceNewSearch}
            onChangeText={setPriceNewSearch}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={fetchPriceNew}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {priceNewSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Urun: {priceNewSummary.totalProducts}</Text>
              <Text style={styles.summaryText}>Degisim: {priceNewSummary.totalChanges}</Text>
            </View>
          )}
          {priceNewError && <Text style={styles.error}>{priceNewError}</Text>}
        </View>
      );
    }

    if (reportType === 'topProducts') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Top Urunler</Text>
          <Text style={styles.sectionSubtitle}>Ciro ve kar listesi.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={topProductsStartDate}
              onChangeText={setTopProductsStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={topProductsEndDate}
              onChangeText={setTopProductsEndDate}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchTopProducts}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {topProductsSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Urun: {topProductsSummary.totalProducts}</Text>
              <Text style={styles.summaryText}>Ciro: {topProductsSummary.totalRevenue?.toFixed?.(2) ?? '-'}</Text>
            </View>
          )}
          {topProductsError && <Text style={styles.error}>{topProductsError}</Text>}
        </View>
      );
    }

    if (reportType === 'topCustomers') {
      return (
        <View style={styles.headerSection}>
          <Text style={styles.sectionTitle}>Top Cariler</Text>
          <Text style={styles.sectionSubtitle}>Ciro ve kar listesi.</Text>
          <View style={styles.filterRow}>
            <TextInput
              style={styles.input}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={topCustomersStartDate}
              onChangeText={setTopCustomersStartDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={topCustomersEndDate}
              onChangeText={setTopCustomersEndDate}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={fetchTopCustomers}>
            <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
          </TouchableOpacity>
          {topCustomersSummary && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>Cari: {topCustomersSummary.totalCustomers}</Text>
              <Text style={styles.summaryText}>Ciro: {topCustomersSummary.totalRevenue?.toFixed?.(2) ?? '-'}</Text>
            </View>
          )}
          {topCustomersError && <Text style={styles.error}>{topCustomersError}</Text>}
        </View>
      );
    }

    return (
      <View style={styles.headerSection}>
        <Text style={styles.sectionTitle}>Urun Musterileri</Text>
        <Text style={styles.sectionSubtitle}>Urun bazli cari listesi.</Text>
        <TextInput
          style={styles.input}
          placeholder="Urun kodu"
          placeholderTextColor={colors.textMuted}
          value={productCustomerCode}
          onChangeText={setProductCustomerCode}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={fetchProductCustomers}>
          <Text style={styles.primaryButtonText}>Raporu Yenile</Text>
        </TouchableOpacity>
        {productCustomersSummary && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>Cari: {productCustomersSummary.totalCustomers}</Text>
            <Text style={styles.summaryText}>Ciro: {productCustomersSummary.totalRevenue?.toFixed?.(2) ?? '-'}</Text>
          </View>
        )}
        {productCustomersError && <Text style={styles.error}>{productCustomersError}</Text>}
      </View>
    );
  }, [
    reportType,
    dayDiff,
    percentDiff,
    costSummary,
    costError,
    marginStartDate,
    marginEndDate,
    marginStatus,
    marginSummary,
    marginError,
    priceSearch,
    priceStartDate,
    priceEndDate,
    priceSummary,
    priceError,
    priceNewSearch,
    priceNewSummary,
    priceNewError,
    topProductsStartDate,
    topProductsEndDate,
    topProductsSummary,
    topProductsError,
    topCustomersStartDate,
    topCustomersEndDate,
    topCustomersSummary,
    topCustomersError,
    productCustomerCode,
    productCustomersSummary,
    productCustomersError,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={data}
        keyExtractor={(_, index) => `${reportType}-${index}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Raporlar</Text>
            <Text style={styles.subtitle}>Guncel analizler ve kontrol listeleri.</Text>

            <View style={styles.segmentWrap}>
              {(
                [
                  { key: 'cost', label: 'Maliyet' },
                  { key: 'margin', label: 'Kar' },
                  { key: 'profit', label: 'Kar+' },
                  { key: 'price', label: 'Fiyat' },
                  { key: 'priceNew', label: 'FiyatYeni' },
                  { key: 'topProducts', label: 'TopUrun' },
                  { key: 'topCustomers', label: 'TopCari' },
                  { key: 'productCustomers', label: 'UrunCari' },
                ] as const
              ).map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.segmentButton, reportType === item.key && styles.segmentButtonActive]}
                  onPress={() => setReportType(item.key)}
                >
                  <Text style={reportType === item.key ? styles.segmentTextActive : styles.segmentText}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {headerContent}
          </View>
        }
        renderItem={({ item }) => {
          if (reportType === 'cost') {
            const row = item as CostUpdateAlert;
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{row.productName}</Text>
                <Text style={styles.cardMeta}>Kod: {row.productCode}</Text>
                <Text style={styles.cardMeta}>Fark: {row.diffPercent.toFixed(2)}%</Text>
                <Text style={styles.cardMeta}>Gun: {row.dayDiff}</Text>
                <Text style={styles.cardMeta}>Risk: {row.riskAmount.toFixed(2)} TL</Text>
              </View>
            );
          }

          if (reportType === 'margin' || reportType === 'profit') {
            const row = item as MarginComplianceRow;
            const cariName = row['Cari Ismi'] || row['Cari ismi'] || row['Cari Ismi'] || '-';
            const stokName = row['Stok Ismi'] || row['Stok Ismi'] || '-';
            const amount = row.TutarKDV ?? row.Tutar ?? 0;
            const margin = row.OrtalamaKarYuzde ?? row['SO-KarYuzde'] ?? 0;
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{stokName}</Text>
                <Text style={styles.cardMeta}>Cari: {cariName}</Text>
                <Text style={styles.cardMeta}>Tutar: {Number(amount).toFixed(2)} TL</Text>
                <Text style={styles.cardMeta}>Kar: {Number(margin).toFixed(2)}%</Text>
              </View>
            );
          }

          if (reportType === 'price') {
            const row = item as PriceHistoryChange;
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{row.productName}</Text>
                <Text style={styles.cardMeta}>Kod: {row.productCode}</Text>
                <Text style={styles.cardMeta}>Degisim: {row.avgChangePercent.toFixed(2)}%</Text>
                <Text style={styles.cardMeta}>Liste: {row.updatedListsCount}</Text>
                <Text style={styles.cardMeta}>Tutarlilik: {row.isConsistent ? 'Evet' : 'Hayir'}</Text>
              </View>
            );
          }

          if (reportType === 'priceNew') {
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.productName}</Text>
                <Text style={styles.cardMeta}>Kod: {item.productCode}</Text>
                <Text style={styles.cardMeta}>Degisim: {item.totalChanges}</Text>
                <Text style={styles.cardMeta}>Stok: {item.currentStock}</Text>
              </View>
            );
          }

          if (reportType === 'topProducts') {
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.productName}</Text>
                <Text style={styles.cardMeta}>Kod: {item.productCode}</Text>
                <Text style={styles.cardMeta}>Ciro: {Number(item.revenue).toFixed(2)} TL</Text>
                <Text style={styles.cardMeta}>Kar: {Number(item.profit).toFixed(2)} TL</Text>
              </View>
            );
          }

          if (reportType === 'topCustomers') {
            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.customerName}</Text>
                <Text style={styles.cardMeta}>Kod: {item.customerCode}</Text>
                <Text style={styles.cardMeta}>Ciro: {Number(item.revenue).toFixed(2)} TL</Text>
                <Text style={styles.cardMeta}>Kar: {Number(item.profit).toFixed(2)} TL</Text>
              </View>
            );
          }

          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.customerName}</Text>
              <Text style={styles.cardMeta}>Kod: {item.customerCode}</Text>
              <Text style={styles.cardMeta}>Ciro: {Number(item.totalRevenue).toFixed(2)} TL</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          costLoading ||
          marginLoading ||
          priceLoading ||
          priceNewLoading ||
          topProductsLoading ||
          topCustomersLoading ||
          productCustomersLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Liste bos.</Text>
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
    fontSize: fontSizes.md,
    color: colors.textMuted,
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  headerSection: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  sectionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
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
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
});
