import { useEffect, useMemo, useState } from 'react';
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

  const fetchQuote = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getQuoteById(quoteId);
      const data = response.quote;
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
      setError(err?.response?.data?.error || 'Teklif yuklenemedi.');
    } finally {
      setLoading(false);
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
      Alert.alert('Hata', err?.response?.data?.error || 'Siparise cevirme basarisiz.');
    } finally {
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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Teklifi Siparise Cevir</Text>
        <Text style={styles.subtitle}>{quote.quoteNumber}</Text>
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
                  <Text style={styles.itemTitle}>{item.productName}</Text>
                  <Text style={styles.itemStatus}>{status}</Text>
                </View>
                <Text style={styles.itemMeta}>Kod: {item.productCode || '-'}</Text>
                <Text style={styles.itemMeta}>Fiyat Tipi: {item.priceType === 'WHITE' ? 'Beyaz' : 'Faturali'}</Text>
                <Text style={styles.itemMeta}>Birim Fiyat: {Number(item.unitPrice || 0).toFixed(2)} TL</Text>
                {status === 'CLOSED' && item.closedReason && (
                  <Text style={styles.itemMeta}>Kapama Nedeni: {item.closedReason}</Text>
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

        <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={converting}>
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
    color: colors.primary,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
    color: colors.primary,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  selectedText: {
    fontFamily: fonts.semibold,
    color: colors.primary,
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
});
