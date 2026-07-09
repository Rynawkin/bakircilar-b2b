import { useEffect, useMemo, useRef, useState } from 'react';
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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';

type ViewKey = 'barter' | 'sticky' | 'belowCost' | 'demand' | 'churn' | 'opportunity';
type Depot = 'MERKEZ' | 'TOPCA';

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const money = (value: unknown) =>
  `${n(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

const pct = (value: unknown) => `%${n(value).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'green' | 'amber' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'red' && styles.textDanger, tone === 'green' && styles.textSuccess, tone === 'amber' && styles.textWarning]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const rowsOf = (payload: any, keys: string[] = ['rows', 'items', 'customers', 'products']) => {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
};

const viewTitles: Record<ViewKey, string> = {
  barter: 'Takas Radari',
  sticky: 'Yapiskan Iskonto',
  belowCost: 'Maliyet Alti Indirim',
  demand: 'Talep Deseni',
  churn: 'Kategori Churn',
  opportunity: 'Kategori Firsat',
};

const cell = (value: any) => {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' && item ? JSON.stringify(item) : String(item ?? ''))).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const genericRows = (rows: any[]) => {
  const keys = Array.from(rows.reduce((set: Set<string>, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
    return set;
  }, new Set<string>())).slice(0, 40);
  return [keys, ...rows.map((row) => keys.map((key) => cell(row?.[key])))];
};

const buildDecisionRows = (view: ViewKey, rows: any[]) => {
  if (view === 'barter') {
    return [
      ['Cari/Tedarikci Kodu', 'Unvan', 'Vade/Borc', 'Potansiyel', 'Urun Sayisi', 'Sektor'],
      ...rows.map((row) => [
        cell(row.cariCode || row.customerCode || row.supplierCode),
        cell(row.cariName || row.customerName || row.supplierName),
        cell(row.pastDueBalance || row.payableBalance),
        cell(row.cappedPotential || row.barterPotential || row.potential),
        cell(row.productCount || row.products?.length),
        cell(row.sectorCode || row.sector),
      ]),
    ];
  }
  if (view === 'belowCost') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Indirimli Fiyat', 'Son Giris', 'Gap', 'Zarar %'],
      ...rows.map((row) => [
        cell(row.mikroCode || row.productCode),
        cell(row.name || row.productName),
        cell(row.discountedInvoiced),
        cell(row.lastEntryPrice),
        cell(row.gap),
        cell(row.lossPct),
      ]),
    ];
  }
  if (view === 'demand') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Sinif', 'CV2', 'ADI', 'Stok', 'Tek Musteri Payi %'],
      ...rows.map((row) => [
        cell(row.productCode || row.mikroCode || row.code),
        cell(row.productName || row.name),
        cell(row.classification || row.quadrant || row.pattern),
        cell(row.cv2),
        cell(row.adi),
        cell(row.stock || row.stockQty),
        cell(row.singleCustomerSharePct),
      ]),
    ];
  }
  if (view === 'opportunity') {
    return [
      ['Cari Kodu', 'Cari Adi', 'Sektor', 'Firsat Skoru', 'Oneri Sayisi', 'Ilk Oneri Urun Kodu', 'Ilk Oneri Urun'],
      ...rows.map((row) => {
        const rec = row.recommendations?.[0];
        return [
          cell(row.customerCode),
          cell(row.customerName),
          cell(row.customerSectorCode || row.sectorCode),
          cell(row.totalOpportunityScore),
          cell(row.recommendationCount || row.recommendations?.length),
          cell(rec?.recommendedProductCode),
          cell(rec?.recommendedProductName),
        ];
      }),
    ];
  }
  if (view === 'churn') {
    return [
      ['Cari Kodu', 'Cari Adi', 'Kategori Kodu', 'Kategori', 'Son Alim', 'Belge', 'Tutar'],
      ...rows.map((row) => [
        cell(row.customerCode),
        cell(row.customerName),
        cell(row.categoryCode),
        cell(row.categoryName),
        cell(row.lastPurchaseDate),
        cell(row.historicalDocumentCount || row.documentCount),
        cell(row.historicalAmount || row.totalAmount),
      ]),
    ];
  }
  return genericRows(rows);
};

export function DecisionSupportScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute<RouteProp<PortalStackParamList, 'DecisionSupport'>>();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [view, setView] = useState<ViewKey>(route.params?.initialView || 'barter');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [exporting, setExporting] = useState(false);
  const [orderActionCode, setOrderActionCode] = useState<string | null>(null);
  const orderActionRef = useRef<string | null>(null);

  const [barterFilter, setBarterFilter] = useState({ minPastDue: '10000', minPayable: '10000' });
  const [stickyFilter, setStickyFilter] = useState({ lookbackDays: '180', minPremiumNowPercent: '15' });
  const [demandFilter, setDemandFilter] = useState<{ depot: Depot; lookbackWeeks: string }>({ depot: 'MERKEZ', lookbackWeeks: '26' });
  const [churnFilter, setChurnFilter] = useState({
    mode: 'category' as 'category' | 'customer',
    categoryCode: '',
    customerCode: '',
    inactiveMonths: '3',
    activeCustomerMonths: '',
  });
  const [opportunityFilter, setOpportunityFilter] = useState({ categoryCode: '', customerCode: '', lookbackMonths: '12', minPairCount: '3' });

  const displayedRows = useMemo(() => {
    if (!data) return [];
    if (view === 'barter') return [...rowsOf(data, ['customers']), ...rowsOf(data, ['suppliers'])];
    if (view === 'belowCost') return rowsOf(data, ['items']);
    return rowsOf(data);
  }, [data, view]);

  useEffect(() => {
    fetchCurrent();
  }, [view]);

  useEffect(() => {
    if (route.params?.initialView) {
      setView(route.params.initialView);
    }
  }, [route.params?.initialView]);

  const fetchCurrent = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (view === 'barter') {
        const response = await adminApi.getBarterRadar({
          minPastDue: n(barterFilter.minPastDue),
          minPayable: n(barterFilter.minPayable),
        });
        setData(response.data);
      } else if (view === 'sticky') {
        const response = await adminApi.getStickyDiscounts({
          lookbackDays: n(stickyFilter.lookbackDays, 180),
          minPremiumNowPercent: n(stickyFilter.minPremiumNowPercent, 15),
        });
        setData(response.data);
      } else if (view === 'belowCost') {
        const response = await adminApi.getDiscountBelowEntryCost();
        setData(response.data);
      } else if (view === 'demand') {
        const response = await adminApi.getDemandPattern({
          depot: demandFilter.depot,
          lookbackWeeks: n(demandFilter.lookbackWeeks, 26),
        });
        setData(response.data);
      } else if (view === 'churn') {
        const response = await adminApi.getCategoryChurnReport({
          mode: churnFilter.mode,
          categoryCode: churnFilter.categoryCode.trim() || undefined,
          customerCode: churnFilter.customerCode.trim() || undefined,
          inactiveMonths: n(churnFilter.inactiveMonths, 3),
          activeCustomerMonths: churnFilter.activeCustomerMonths ? n(churnFilter.activeCustomerMonths) : undefined,
          page: 1,
          limit: 50,
        });
        setData(response.data);
      } else {
        if (!opportunityFilter.categoryCode.trim()) {
          setData(null);
          return;
        }
        const response = await adminApi.getCategoryOpportunityReport({
          categoryCode: opportunityFilter.categoryCode.trim(),
          customerCode: opportunityFilter.customerCode.trim() || undefined,
          lookbackMonths: n(opportunityFilter.lookbackMonths, 12),
          minPairCount: n(opportunityFilter.minPairCount, 3),
          limit: 50,
        });
        setData(response.data);
      }
    } catch (err: any) {
      Alert.alert('Karar destek', getApiErrorMessage(err, 'Rapor alinamadi.'));
    } finally {
      setLoading(false);
    }
  };

  const applyDemandOrderToOrder = (productCode: string) => {
    if (!productCode) return;
    if (orderActionRef.current) return;
    Alert.alert('Siparise getir', `${productCode} min-max disi birakilip siparise getirilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Uygula',
        onPress: async () => {
          if (orderActionRef.current) return;
          orderActionRef.current = productCode;
          setOrderActionCode(productCode);
          setLoading(true);
          try {
            const response = await adminApi.applyDemandPatternOrderToOrder({
              depot: demandFilter.depot,
              productCodes: [productCode],
            });
            Alert.alert('Tamam', `${response.data.applied.length} urun uygulandi.`);
            hapticSuccess();
            await fetchCurrent();
          } catch (err: any) {
            Alert.alert('Siparise getir', getApiErrorMessage(err, 'Islem yapilamadi.'));
          } finally {
            orderActionRef.current = null;
            setOrderActionCode(null);
            setLoading(false);
          }
        },
      },
    ]);
  };

  const exportExcel = async () => {
    if (exporting) return;
    if (!displayedRows.length) {
      Alert.alert('Bilgi', 'Disa aktarilacak rapor satiri yok.');
      return;
    }

    setExporting(true);
    try {
      const sheetRows = buildDecisionRows(view, displayedRows);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws['!cols'] = sheetRows[0].map((title: any) => ({
        wch: Math.min(Math.max(String(title || '').length + 5, 12), 42),
      }));
      XLSX.utils.book_append_sheet(wb, ws, viewTitles[view].slice(0, 31));

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}karar-destek-${view}-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `${viewTitles[view]} Excel`,
        });
      } else {
        Alert.alert('Excel olusturuldu', target);
      }
    } catch (err: any) {
      Alert.alert('Excel olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      setExporting(false);
    }
  };

  const openCustomer = (customerCode?: string | null) => {
    const key = String(customerCode || '').trim();
    if (!key) return;
    navigation.navigate('Customer360', { customerIdOrCode: key });
  };

  const openProduct = (
    productCode?: string | null,
    qualityFilter?: 'ALL' | 'BAD' | 'WARN' | 'NO_IMAGE' | 'GALLERY_MISSING'
  ) => {
    const code = String(productCode || '').trim();
    if (!code) return;
    navigation.navigate('Products', { search: code, qualityFilter });
  };

  const renderFilters = () => {
    if (view === 'barter') {
      return (
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Min vade" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={barterFilter.minPastDue} onChangeText={(value) => setBarterFilter((prev) => ({ ...prev, minPastDue: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Min borc" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={barterFilter.minPayable} onChangeText={(value) => setBarterFilter((prev) => ({ ...prev, minPayable: value }))} />
        </View>
      );
    }
    if (view === 'sticky') {
      return (
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Gun" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={stickyFilter.lookbackDays} onChangeText={(value) => setStickyFilter((prev) => ({ ...prev, lookbackDays: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Min prim %" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={stickyFilter.minPremiumNowPercent} onChangeText={(value) => setStickyFilter((prev) => ({ ...prev, minPremiumNowPercent: value }))} />
        </View>
      );
    }
    if (view === 'demand') {
      return (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="Merkez" active={demandFilter.depot === 'MERKEZ'} onPress={() => setDemandFilter((prev) => ({ ...prev, depot: 'MERKEZ' }))} />
            <Chip label="Topca" active={demandFilter.depot === 'TOPCA'} onPress={() => setDemandFilter((prev) => ({ ...prev, depot: 'TOPCA' }))} />
          </ScrollView>
          <TextInput style={styles.input} placeholder="Lookback hafta" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={demandFilter.lookbackWeeks} onChangeText={(value) => setDemandFilter((prev) => ({ ...prev, lookbackWeeks: value }))} />
        </>
      );
    }
    if (view === 'churn') {
      return (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="Kategori modu" active={churnFilter.mode === 'category'} onPress={() => setChurnFilter((prev) => ({ ...prev, mode: 'category' }))} />
            <Chip label="Cari modu" active={churnFilter.mode === 'customer'} onPress={() => setChurnFilter((prev) => ({ ...prev, mode: 'customer' }))} />
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput style={[styles.input, styles.flex]} placeholder="Kategori kodu" placeholderTextColor={colors.textMuted} value={churnFilter.categoryCode} onChangeText={(value) => setChurnFilter((prev) => ({ ...prev, categoryCode: value }))} />
            <TextInput style={[styles.input, styles.flex]} placeholder="Cari kodu" placeholderTextColor={colors.textMuted} value={churnFilter.customerCode} onChangeText={(value) => setChurnFilter((prev) => ({ ...prev, customerCode: value }))} />
          </View>
          <View style={styles.inputRow}>
            <TextInput style={[styles.input, styles.flex]} placeholder="Pasif ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={churnFilter.inactiveMonths} onChangeText={(value) => setChurnFilter((prev) => ({ ...prev, inactiveMonths: value }))} />
            <TextInput style={[styles.input, styles.flex]} placeholder="Aktif cari ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={churnFilter.activeCustomerMonths} onChangeText={(value) => setChurnFilter((prev) => ({ ...prev, activeCustomerMonths: value }))} />
          </View>
        </>
      );
    }
    if (view === 'opportunity') {
      return (
        <>
          <View style={styles.inputRow}>
            <TextInput style={[styles.input, styles.flex]} placeholder="Kategori kodu zorunlu" placeholderTextColor={colors.textMuted} value={opportunityFilter.categoryCode} onChangeText={(value) => setOpportunityFilter((prev) => ({ ...prev, categoryCode: value }))} />
            <TextInput style={[styles.input, styles.flex]} placeholder="Cari kodu" placeholderTextColor={colors.textMuted} value={opportunityFilter.customerCode} onChangeText={(value) => setOpportunityFilter((prev) => ({ ...prev, customerCode: value }))} />
          </View>
          <View style={styles.inputRow}>
            <TextInput style={[styles.input, styles.flex]} placeholder="Ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={opportunityFilter.lookbackMonths} onChangeText={(value) => setOpportunityFilter((prev) => ({ ...prev, lookbackMonths: value }))} />
            <TextInput style={[styles.input, styles.flex]} placeholder="Min eslesme" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={opportunityFilter.minPairCount} onChangeText={(value) => setOpportunityFilter((prev) => ({ ...prev, minPairCount: value }))} />
          </View>
        </>
      );
    }
    return null;
  };

  const renderSummary = () => {
    if (!data) return null;
    const summary = data.summary || {};
    if (view === 'barter') {
      return (
        <View style={styles.metricRow}>
          <Metric label="Musteri" value={data.customers?.length || 0} />
          <Metric label="Tedarikci" value={data.suppliers?.length || 0} />
          <Metric label="Potansiyel" value={money(summary.totalCappedPotential || summary.totalPotential || 0)} />
        </View>
      );
    }
    if (view === 'belowCost') {
      return (
        <View style={styles.metricRow}>
          <Metric label="Urun" value={data.totalCount || data.items?.length || 0} />
          <Metric label="Risk" value={money(data.totalRiskTL || 0)} tone="red" />
        </View>
      );
    }
    if (view === 'demand') {
      return (
        <View style={styles.metricRow}>
          <Metric label="Satir" value={data.rows?.length || 0} />
          <Metric label="Smooth" value={summary.SMOOTH || summary.smooth || 0} />
          <Metric label="Lumpy" value={summary.LUMPY || summary.lumpy || 0} tone="amber" />
        </View>
      );
    }
    return (
      <View style={styles.metricRow}>
        <Metric label="Satir" value={displayedRows.length} />
        <Metric label="Toplam" value={summary.totalRows || summary.totalCustomers || summary.totalRecommendations || '-'} />
      </View>
    );
  };

  const renderRow = (row: any, index: number) => {
    const cardStyle = [styles.card, isWide && styles.rowGridItem];
    if (view === 'barter') {
      return (
        <View key={`${row.cariCode || row.customerCode || index}`} style={cardStyle}>
          <Text style={styles.cardTitle} numberOfLines={2}>{row.cariName || row.customerName || row.supplierName || row.cariCode || 'Cari'}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{row.cariCode || row.customerCode || row.supplierCode || '-'}</Text>
          <View style={styles.metricRow}>
            <Metric label="Vade" value={money(row.pastDueBalance || row.payableBalance)} />
            <Metric label="Potansiyel" value={money(row.cappedPotential || row.barterPotential || row.potential)} tone="green" />
            <Metric label="Urun" value={row.productCount || row.products?.length || 0} />
          </View>
          {row.customerCode || row.cariCode ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => openCustomer(row.customerCode || row.cariCode)}>
              <Text style={styles.secondaryButtonText}>Cari 360</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    if (view === 'belowCost') {
      return (
        <View key={`${row.mikroCode || index}`} style={cardStyle}>
          <Text style={styles.cardTitle} numberOfLines={2}>{row.name || row.mikroCode}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{row.mikroCode || '-'}</Text>
          <View style={styles.metricRow}>
            <Metric label="Indirim" value={money(row.discountedInvoiced)} />
            <Metric label="Son Giris" value={money(row.lastEntryPrice)} />
            <Metric label="Gap" value={money(row.gap)} tone="red" />
            <Metric label="Zarar %" value={pct(row.lossPct)} tone="red" />
          </View>
          {row.mikroCode || row.productCode ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => openProduct(row.mikroCode || row.productCode, 'BAD')}>
              <Text style={styles.secondaryButtonText}>Urun karti</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    if (view === 'demand') {
      const code = row.productCode || row.mikroCode || row.code || '';
      return (
        <View key={`${code || index}`} style={cardStyle}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle} numberOfLines={2}>{row.productName || row.name || code}</Text>
              <Text style={styles.cardMeta}>{code} · {row.classification || row.quadrant || row.pattern || '-'}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{row.singleCustomerSharePct ? pct(row.singleCustomerSharePct) : '-'}</Text>
            </View>
          </View>
          <View style={styles.metricRow}>
            <Metric label="CV2" value={n(row.cv2).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} />
            <Metric label="ADI" value={n(row.adi).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} />
            <Metric label="Stok" value={n(row.stock || row.stockQty).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} />
          </View>
          {code ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.warningButton, orderActionCode === code && styles.disabledButton]}
                onPress={() => applyDemandOrderToOrder(code)}
                disabled={orderActionCode === code}
              >
                <Text style={styles.warningButtonText}>{orderActionCode === code ? 'Uygulaniyor' : 'Siparise Getir'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => openProduct(code)}>
                <Text style={styles.secondaryButtonText}>Urun karti</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }
    if (view === 'opportunity') {
      const rec = row.recommendations?.[0];
      return (
        <View key={`${row.customerCode || index}`} style={cardStyle}>
          <Text style={styles.cardTitle} numberOfLines={2}>{row.customerName || row.customerCode}</Text>
          <Text style={styles.cardMeta}>{row.customerCode} · {row.customerSectorCode || '-'}</Text>
          <View style={styles.metricRow}>
            <Metric label="Skor" value={n(row.totalOpportunityScore).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} tone="green" />
            <Metric label="Oneri" value={row.recommendationCount || row.recommendations?.length || 0} />
          </View>
          {rec ? <Text style={styles.cardMeta} numberOfLines={2}>Ilk urun: {rec.recommendedProductCode} - {rec.recommendedProductName}</Text> : null}
          <View style={styles.actionRow}>
            {row.customerCode ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => openCustomer(row.customerCode)}>
                <Text style={styles.secondaryButtonText}>Cari 360</Text>
              </TouchableOpacity>
            ) : null}
            {rec?.recommendedProductCode ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => openProduct(rec.recommendedProductCode)}>
                <Text style={styles.secondaryButtonText}>Urun karti</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    }
    return (
      <View key={`${row.customerCode || row.productCode || index}`} style={cardStyle}>
        <Text style={styles.cardTitle} numberOfLines={2}>{row.customerName || row.categoryName || row.productName || row.customerCode || 'Kayit'}</Text>
        <Text style={styles.cardMeta}>{row.customerCode || '-'} · {row.categoryCode || row.productCode || '-'}</Text>
        <View style={styles.metricRow}>
          <Metric label="Son Alim" value={row.lastPurchaseDate ? String(row.lastPurchaseDate).slice(0, 10) : '-'} />
          <Metric label="Belge" value={row.historicalDocumentCount || row.documentCount || 0} />
          <Metric label="Tutar" value={money(row.historicalAmount || row.totalAmount || 0)} />
        </View>
        <View style={styles.actionRow}>
          {row.customerCode || row.cariCode ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => openCustomer(row.customerCode || row.cariCode)}>
              <Text style={styles.secondaryButtonText}>Cari 360</Text>
            </TouchableOpacity>
          ) : null}
          {row.productCode || row.mikroCode || row.recommendedProductCode ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => openProduct(row.productCode || row.mikroCode || row.recommendedProductCode)}>
              <Text style={styles.secondaryButtonText}>Urun karti</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Aksiyon Analitigi</Text>
            <Text style={styles.title}>Karar Destek</Text>
            <Text style={styles.subtitle}>Takas, iskonto, talep deseni ve kategori firsat raporlari.</Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Gorunum</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>{viewTitles[view]}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Satir</Text>
              <Text style={styles.heroStatValue}>{displayedRows.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Excel</Text>
              <Text style={styles.heroStatValue}>{displayedRows.length ? 'Hazir' : '-'}</Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label="Takas" active={view === 'barter'} onPress={() => setView('barter')} />
          <Chip label="Yapiskan" active={view === 'sticky'} onPress={() => setView('sticky')} />
          <Chip label="Maliyet Alti" active={view === 'belowCost'} onPress={() => setView('belowCost')} />
          <Chip label="Talep" active={view === 'demand'} onPress={() => setView('demand')} />
          <Chip label="Churn" active={view === 'churn'} onPress={() => setView('churn')} />
          <Chip label="Firsat" active={view === 'opportunity'} onPress={() => setView('opportunity')} />
        </ScrollView>
        <View style={styles.card}>
          {renderFilters()}
          <TouchableOpacity style={[styles.primaryButton, loading && styles.disabledButton]} onPress={fetchCurrent} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor' : 'Raporu Yenile'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportButton, exporting && styles.disabledButton]} onPress={exportExcel} disabled={exporting || !displayedRows.length}>
            <Text style={styles.exportButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Excel Paylas'}</Text>
          </TouchableOpacity>
          {renderSummary()}
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {!loading && view === 'sticky' && !displayedRows.length ? <Empty text="Yapiskan iskonto kaydi yok veya veri yapisi bos dondu." /> : null}
        {!loading && displayedRows.length ? (
          <View style={[styles.rowGrid, isWide && styles.rowGridWide]}>
            {displayedRows.map(renderRow)}
          </View>
        ) : null}
        {!loading && view !== 'sticky' && !displayedRows.length ? <Empty text="Rapor satiri yok." /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  heroText: { gap: spacing.xs },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DDE8FF', lineHeight: 20 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 118, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: '#FFFFFF', marginTop: spacing.xs },
  tabRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  rowGrid: { gap: spacing.md },
  rowGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  rowGridItem: { width: '48%', minWidth: 360 },
  cardTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  metric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text, marginTop: 2 },
  badge: { backgroundColor: colors.primaryMuted, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.text },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  exportButton: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  warningButton: {
    backgroundColor: colors.warningSoft,
    borderColor: '#FDBA74',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.warning },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secondaryButton: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  disabledButton: { opacity: 0.55 },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  textDanger: { color: colors.danger },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
});
