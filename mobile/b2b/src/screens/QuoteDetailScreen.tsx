import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { customerApi } from '../api/customer';
import { Quote } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { shareQuotePdf } from '../utils/quotePdf';

type QuoteDetailRoute = RouteProp<RootStackParamList, 'QuoteDetail'>;

export function QuoteDetailScreen() {
  const route = useRoute<QuoteDetailRoute>();
  const { width } = useWindowDimensions();
  const listColumns = width >= 820 ? 2 : 1;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const actionLoadingRef = useRef(false);
  const pdfLoadingRef = useRef(false);
  const quoteRequestSeqRef = useRef(0);

  const beginAction = () => {
    if (actionLoadingRef.current) return false;
    actionLoadingRef.current = true;
    setActionLoading(true);
    return true;
  };

  const endAction = () => {
    actionLoadingRef.current = false;
    setActionLoading(false);
  };

  const beginPdf = () => {
    if (pdfLoadingRef.current) return false;
    pdfLoadingRef.current = true;
    setPdfLoading(true);
    return true;
  };

  const endPdf = () => {
    pdfLoadingRef.current = false;
    setPdfLoading(false);
  };

  const fetchQuote = async () => {
    const requestSeq = ++quoteRequestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getQuoteById(route.params.quoteId);
      if (requestSeq !== quoteRequestSeqRef.current) return;
      setQuote(response.quote || null);
    } catch (err: any) {
      if (requestSeq !== quoteRequestSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Teklif yuklenemedi.'));
    } finally {
      if (requestSeq === quoteRequestSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
  }, [route.params.quoteId]);

  const handleAccept = async () => {
    if (!quote || actionLoadingRef.current) return;
    if (!beginAction()) return;
    try {
      await customerApi.acceptQuote(quote.id);
      Alert.alert('Basarili', 'Teklif kabul edildi.');
      await fetchQuote();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Islem basarisiz.'));
    } finally {
      endAction();
    }
  };

  const handleReject = async () => {
    if (!quote || actionLoadingRef.current || rejectConfirmOpen) return;
    setRejectConfirmOpen(true);
    Alert.alert('Teklifi Reddet', 'Teklifi reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel', onPress: () => setRejectConfirmOpen(false) },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          setRejectConfirmOpen(false);
          if (!beginAction()) return;
          try {
            await customerApi.rejectQuote(quote.id);
            Alert.alert('Basarili', 'Teklif reddedildi.');
            await fetchQuote();
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Islem basarisiz.'));
          } finally {
            endAction();
          }
        },
      },
    ], { cancelable: true, onDismiss: () => setRejectConfirmOpen(false) });
  };

  const handlePdf = async () => {
    if (!quote || pdfLoadingRef.current) return;
    if (!beginPdf()) return;
    try {
      await shareQuotePdf(quote);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'PDF hazirlanamadi.'));
    } finally {
      endPdf();
    }
  };

  const canRespond = quote?.status === 'SENT_TO_MIKRO';

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={`quote-detail-${listColumns}`}
          data={quote?.items || []}
          keyExtractor={(item) => item.id}
          numColumns={listColumns}
          columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Teklif Ozeti</Text>
                <Text style={styles.heroTitle} numberOfLines={1}>Teklif Detayi</Text>
                <Text style={styles.heroSubtitle} numberOfLines={1} ellipsizeMode="middle">No: {quote?.quoteNumber || '-'}</Text>
                <View style={styles.heroMetricRow}>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{quote?.status || '-'}</Text>
                    <Text style={styles.heroMetricLabel}>Durum</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{quote?.items?.length || 0}</Text>
                    <Text style={styles.heroMetricLabel}>Kalem</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue}>{quote ? `${(quote.grandTotal ?? quote.totalAmount).toFixed(2)} TL` : '-'}</Text>
                    <Text style={styles.heroMetricLabel}>Toplam</Text>
                  </View>
                  <View style={styles.heroMetric}>
                    <Text style={styles.heroMetricValue} numberOfLines={1}>{quote?.validityDate ? quote.validityDate.slice(0, 10) : '-'}</Text>
                    <Text style={styles.heroMetricLabel}>Gecerlilik</Text>
                  </View>
                </View>
              </View>
              {error && <Text style={styles.error} numberOfLines={3}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={3} ellipsizeMode="tail">{item.productName}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Miktar: {item.quantity}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Fiyat Tipi: {item.priceType}</Text>
              {item.vatRate !== undefined ? <Text style={styles.cardMeta} numberOfLines={1}>KDV: %{item.vatRate}</Text> : null}
              <Text style={styles.cardMeta} numberOfLines={1}>Birim: {item.unitPrice.toFixed(2)} TL</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>Toplam: {item.totalPrice.toFixed(2)} TL</Text>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.actions}>
              {canRespond && (
                <>
                  <TouchableOpacity style={[styles.primaryButton, actionLoading && styles.buttonDisabled]} onPress={handleAccept} disabled={actionLoading}>
                    <Text style={styles.primaryButtonText}>{actionLoading ? 'Isleniyor...' : 'Kabul Et'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryButton, (actionLoading || rejectConfirmOpen) && styles.buttonDisabled]} onPress={handleReject} disabled={actionLoading || rejectConfirmOpen}>
                    <Text style={styles.secondaryButtonText}>Reddet</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={[styles.secondaryButton, pdfLoading && styles.buttonDisabled]} onPress={handlePdf} disabled={pdfLoading}>
                <Text style={styles.secondaryButtonText}>
                  {pdfLoading ? 'PDF...' : 'PDF Indir'}
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
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
  listContent: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  columnWrapper: {
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  heroKicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    lineHeight: fontSizes.xxl + 6,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: '#DBEAFE',
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    lineHeight: fontSizes.xl + 6,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 5,
    color: colors.textMuted,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    lineHeight: fontSizes.lg + 6,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
