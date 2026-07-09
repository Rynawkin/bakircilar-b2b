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
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Quote, QuoteItem } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticLight, hapticSuccess } from '../utils/haptics';

type QuoteConvertRoute = { params: { quoteId: string } };

type ItemUpdateState = {
  quantity: number;
  reserveQty: number;
  responsibilityCenter: string;
};

const resolveItemStatus = (item: QuoteItem) => item.status || 'OPEN';

export function QuoteConvertScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as QuoteConvertRoute;
  const { quoteId } = route.params;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [itemUpdates, setItemUpdates] = useState<Record<string, ItemUpdateState>>({});

  const [warehouseNo, setWarehouseNo] = useState('1');
  const [documentNo, setDocumentNo] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [invoicedSeries, setInvoicedSeries] = useState('');
  const [whiteSeries, setWhiteSeries] = useState('');

  const [converting, setConverting] = useState(false);
  const quoteRequestSeqRef = useRef(0);
  const convertingRef = useRef(false);

  const fetchQuote = async () => {
    const requestSeq = quoteRequestSeqRef.current + 1;
    quoteRequestSeqRef.current = requestSeq;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getQuoteById(quoteId);
      const data = response.quote;
      if (requestSeq !== quoteRequestSeqRef.current) return;
      setQuote(data);
      setDocumentNo(data.documentNo || '');

      const nextSelected: Record<string, boolean> = {};
      const nextUpdates: Record<string, ItemUpdateState> = {};
      (data.items || []).forEach((item) => {
        nextSelected[item.id] = resolveItemStatus(item) === 'OPEN';
        nextUpdates[item.id] = {
          quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1)),
          reserveQty: 0,
          responsibilityCenter: '',
        };
      });
      setSelectedIds(nextSelected);
      setItemUpdates(nextUpdates);
    } catch (err: any) {
      if (requestSeq === quoteRequestSeqRef.current) {
        setError(getApiErrorMessage(err, 'Teklif yuklenemedi.'));
      }
    } finally {
      if (requestSeq === quoteRequestSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchQuote();
  }, [quoteId]);

  const openItems = useMemo(
    () => (quote?.items || []).filter((item) => resolveItemStatus(item) === 'OPEN'),
    [quote]
  );

  const selectedOpenItems = useMemo(
    () => openItems.filter((item) => selectedIds[item.id]),
    [openItems, selectedIds]
  );

  const hasInvoiced = useMemo(
    () => selectedOpenItems.some((item) => (item.priceType || 'INVOICED') !== 'WHITE'),
    [selectedOpenItems]
  );

  const hasWhite = useMemo(
    () => selectedOpenItems.some((item) => item.priceType === 'WHITE'),
    [selectedOpenItems]
  );

  const selectedTotal = useMemo(
    () =>
      selectedOpenItems.reduce((sum, item) => {
        const update = itemUpdates[item.id];
        const quantity = Math.max(1, Math.trunc(Number(update?.quantity) || 1));
        return sum + quantity * Number(item.unitPrice || 0);
      }, 0),
    [selectedOpenItems, itemUpdates]
  );

  const toggleItem = (item: QuoteItem) => {
    if (resolveItemStatus(item) !== 'OPEN') return;
    setSelectedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
  };

  const updateItem = (id: string, data: Partial<ItemUpdateState>) => {
    setItemUpdates((prev) => ({
      ...prev,
      [id]: {
        quantity: prev[id]?.quantity || 1,
        reserveQty: prev[id]?.reserveQty || 0,
        responsibilityCenter: prev[id]?.responsibilityCenter || '',
        ...data,
      },
    }));
  };

  const submit = async () => {
    if (convertingRef.current) return;
    if (!quote) return;
    if (!quote.mikroNumber) {
      Alert.alert('Uyari', 'Bu teklif Mikro numarasi olmadigi icin siparise cevrilemez.');
      return;
    }
    if (selectedOpenItems.length === 0) {
      Alert.alert('Uyari', 'En az bir acik kalem secin.');
      return;
    }

    const warehouse = Number(warehouseNo);
    if (!Number.isFinite(warehouse) || warehouse <= 0) {
      Alert.alert('Uyari', 'Depo numarasi gecersiz.');
      return;
    }
    if (hasInvoiced && !invoicedSeries.trim()) {
      Alert.alert('Uyari', 'Faturali kalemler icin seri gerekli.');
      return;
    }
    if (hasWhite && !whiteSeries.trim()) {
      Alert.alert('Uyari', 'Beyaz kalemler icin seri gerekli.');
      return;
    }

    const invalid = selectedOpenItems.find((item) => {
      const update = itemUpdates[item.id];
      const quantity = Number(update?.quantity);
      return !Number.isFinite(quantity) || quantity <= 0;
    });
    if (invalid) {
      Alert.alert('Uyari', 'Secili satirlardaki miktarlari kontrol edin.');
      return;
    }

    convertingRef.current = true;
    setConverting(true);
    try {
      const result = await adminApi.convertQuoteToOrder(quote.id, {
        selectedItemIds: selectedOpenItems.map((item) => item.id),
        warehouseNo: warehouse,
        documentNo: documentNo.trim() || undefined,
        documentDescription: documentDescription.trim() || undefined,
        invoicedSeries: invoicedSeries.trim() || undefined,
        whiteSeries: whiteSeries.trim() || undefined,
        itemUpdates: selectedOpenItems.map((item) => ({
          id: item.id,
          quantity: Math.max(1, Math.trunc(Number(itemUpdates[item.id]?.quantity) || 1)),
          reserveQty: Math.max(0, Math.trunc(Number(itemUpdates[item.id]?.reserveQty) || 0)),
          responsibilityCenter: itemUpdates[item.id]?.responsibilityCenter?.trim() || undefined,
        })),
      });

      Alert.alert('Basarili', `Siparis olustu: ${result.orderNumber}`, [
        { text: 'Siparisi Ac', onPress: () => navigation.replace('OrderDetail', { orderId: result.orderId }) },
        { text: 'Tamam', onPress: () => navigation.goBack() },
      ]);
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Siparise cevirme basarisiz.'));
    } finally {
      convertingRef.current = false;
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!quote) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <Text style={styles.error}>{error || 'Teklif bulunamadi.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.heroBackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.heroBackText}>Geri</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>Tekliften Siparis</Text>
          <Text style={styles.title}>Teklifi Siparise Cevir</Text>
          <Text style={styles.subtitle}>{quote.quoteNumber} - {quote.customer?.name || 'Cari'}</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Secili</Text>
              <Text style={styles.heroMetricValue}>{selectedOpenItems.length}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Toplam</Text>
              <Text style={styles.heroMetricValue}>{selectedTotal.toFixed(0)} TL</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Depo</Text>
              <Text style={styles.heroMetricValue}>{warehouseNo || '-'}</Text>
            </View>
          </View>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kalemler</Text>
          {(quote.items || []).map((item) => {
            const status = resolveItemStatus(item);
            const selected = !!selectedIds[item.id];
            const editable = status === 'OPEN' && selected;
            const quantity = itemUpdates[item.id]?.quantity ?? item.quantity;
            const reserveQty = itemUpdates[item.id]?.reserveQty ?? 0;
            const responsibilityCenter = itemUpdates[item.id]?.responsibilityCenter || '';

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => {
                  hapticLight();
                  toggleItem(item);
                }}
              >
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle} numberOfLines={3}>
                    {item.productName}
                  </Text>
                  <Text style={styles.itemStatus} numberOfLines={1}>
                    {status}
                  </Text>
                </View>
                <Text style={styles.itemMeta} numberOfLines={1}>Kod: {item.productCode || '-'}</Text>
                <Text style={styles.itemMeta}>Fiyat Tipi: {item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}</Text>
                <Text style={styles.itemMeta}>Birim Fiyat: {Number(item.unitPrice || 0).toFixed(2)} TL</Text>
                {status === 'CLOSED' && item.closedReason && (
                  <Text style={styles.itemMeta} numberOfLines={2}>Kapama Nedeni: {item.closedReason}</Text>
                )}
                {status === 'OPEN' && (
                  <Text style={selected ? styles.selectedText : styles.unselectedText}>
                    {selected ? 'Secili' : 'Secili Degil'}
                  </Text>
                )}

                {editable && (
                  <>
                    <View style={styles.row}>
                      <TextInput
                        style={[styles.input, styles.half]}
                        placeholder="Miktar"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={String(quantity)}
                        onChangeText={(value) =>
                          updateItem(item.id, { quantity: Math.max(1, Math.trunc(Number(value) || 0)) })
                        }
                      />
                      <TextInput
                        style={[styles.input, styles.half]}
                        placeholder="Rezerve"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={String(reserveQty)}
                        onChangeText={(value) =>
                          updateItem(item.id, { reserveQty: Math.max(0, Math.trunc(Number(value) || 0)) })
                        }
                      />
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Sorumluluk merkezi"
                      placeholderTextColor={colors.textMuted}
                      value={responsibilityCenter}
                      onChangeText={(value) => updateItem(item.id, { responsibilityCenter: value })}
                    />
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Siparis Bilgileri</Text>
          <TextInput
            style={styles.input}
            placeholder="Depo No"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={warehouseNo}
            onChangeText={setWarehouseNo}
          />
          <TextInput
            style={styles.input}
            placeholder="Belge No"
            placeholderTextColor={colors.textMuted}
            value={documentNo}
            onChangeText={setDocumentNo}
          />
          <TextInput
            style={styles.input}
            placeholder="Belge Aciklamasi"
            placeholderTextColor={colors.textMuted}
            value={documentDescription}
            onChangeText={setDocumentDescription}
          />
          {hasInvoiced && (
            <TextInput
              style={styles.input}
              placeholder="Faturali Seri"
              placeholderTextColor={colors.textMuted}
              value={invoicedSeries}
              onChangeText={setInvoicedSeries}
            />
          )}
          {hasWhite && (
            <TextInput
              style={styles.input}
              placeholder="Beyaz Seri"
              placeholderTextColor={colors.textMuted}
              value={whiteSeries}
              onChangeText={setWhiteSeries}
            />
          )}

          <Text style={styles.totalText}>Secili Toplam: {selectedTotal.toFixed(2)} TL</Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, converting && styles.buttonDisabled]}
          onPress={submit}
          disabled={converting}
        >
          <Text style={styles.primaryButtonText}>{converting ? 'Ceviriliyor...' : 'Siparise Cevir'}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  container: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backText: {
    fontFamily: fonts.medium,
    color: colors.primarySoft,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroBackButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  heroBackText: {
    fontFamily: fonts.semibold,
    color: '#BFDBFE',
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DCEAFE',
    lineHeight: 22,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heroMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
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
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  itemStatus: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.primarySoft,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  selectedText: {
    fontFamily: fonts.semibold,
    color: colors.primarySoft,
    fontSize: fontSizes.xs,
  },
  unselectedText: {
    fontFamily: fonts.medium,
    color: colors.warning,
    fontSize: fontSizes.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  half: {
    flex: 1,
  },
  totalText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
