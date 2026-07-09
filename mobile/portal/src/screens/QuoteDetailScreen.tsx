import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Quote } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { shareQuotePdf } from '../utils/quotePdf';
import { hapticLight, hapticSuccess } from '../utils/haptics';

export function QuoteDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as { params: { quoteId: string } };
  const { quoteId } = route.params;
  const { width } = useWindowDimensions();
  const isTablet = width >= 820;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [recommendedPdfLoading, setRecommendedPdfLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<'approve' | 'reject' | null>(null);
  const quoteRequestSeqRef = useRef(0);
  const actionBusyRef = useRef<'approve' | 'reject' | null>(null);
  const syncingRef = useRef(false);
  const pdfLoadingRef = useRef(false);
  const recommendedPdfLoadingRef = useRef(false);

  const beginAction = (action: 'approve' | 'reject') => {
    if (actionBusyRef.current) return false;
    actionBusyRef.current = action;
    setActionBusy(action);
    return true;
  };

  const endAction = () => {
    actionBusyRef.current = null;
    setActionBusy(null);
  };

  const fetchQuote = async () => {
    const requestSeq = quoteRequestSeqRef.current + 1;
    quoteRequestSeqRef.current = requestSeq;
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getQuoteById(quoteId);
      if (requestSeq === quoteRequestSeqRef.current) {
        setQuote(response.quote);
      }
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

  const approve = async () => {
    if (actionBusyRef.current) return;
    if (!quote) return;
    if (!beginAction('approve')) return;
    try {
      await adminApi.approveQuote(quote.id);
      hapticSuccess();
      await fetchQuote();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Onay basarisiz.'));
    } finally {
      endAction();
    }
  };

  const reject = async () => {
    if (actionBusyRef.current) return;
    if (!quote) return;
    Alert.alert('Teklifi Reddet', 'Teklifi reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          if (!beginAction('reject')) return;
          try {
            await adminApi.rejectQuote(quote.id, 'Mobil reddedildi');
            hapticSuccess();
            await fetchQuote();
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Red basarisiz.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const syncQuote = async () => {
    if (!quote || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await adminApi.syncQuote(quote.id);
      await fetchQuote();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Guncelleme basarisiz.'));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  };

  const handlePdf = async () => {
    if (!quote || pdfLoadingRef.current) return;
    pdfLoadingRef.current = true;
    setPdfLoading(true);
    try {
      await shareQuotePdf(quote);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'PDF hazirlanamadi.'));
    } finally {
      pdfLoadingRef.current = false;
      setPdfLoading(false);
    }
  };

  const handleRecommendedPdf = async () => {
    if (!quote || recommendedPdfLoadingRef.current) return;
    recommendedPdfLoadingRef.current = true;
    setRecommendedPdfLoading(true);
    try {
      const productCodes = Array.from(
        new Set(
          (quote.items || [])
            .map((item) => item.productCode?.trim())
            .filter((code): code is string => Boolean(code))
        )
      );

      if (productCodes.length === 0) {
        Alert.alert('Bilgi', 'Teklifte urun kodu olmadigi icin onerili PDF olusturulamadi.');
        return;
      }

      const recommendationResult = await adminApi.getComplementRecommendations({
        productCodes,
        excludeCodes: productCodes,
        limit: 20,
      });

      await shareQuotePdf(quote, {
        recommendedProducts: recommendationResult.products || [],
      });
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Onerili PDF hazirlanamadi.'));
    } finally {
      recommendedPdfLoadingRef.current = false;
      setRecommendedPdfLoading(false);
    }
  };

  const canEdit = quote && ['PENDING_APPROVAL', 'SENT_TO_MIKRO'].includes(quote.status);
  const canConvert = quote && Boolean(quote.mikroNumber) && quote.status !== 'REJECTED';

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.container, isTablet && styles.containerTablet]}>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.heroBackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.heroBackText}>Geri</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>Teklif Operasyonu</Text>
          <Text style={styles.title}>Teklif Detayi</Text>
          <Text style={styles.subtitle} numberOfLines={2}>{quote?.quoteNumber || 'Teklif kaydi'} - {quote?.customer?.name || 'Cari'}</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Durum</Text>
              <Text style={styles.heroMetricValue}>{quote?.status || '-'}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Kalem</Text>
              <Text style={styles.heroMetricValue}>{quote?.items?.length ?? 0}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Toplam</Text>
              <Text style={styles.heroMetricValue}>{quote ? `${quote.totalAmount.toFixed(0)} TL` : '-'}</Text>
            </View>
          </View>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}

        {quote ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="middle">{quote.quoteNumber}</Text>
            <Text style={styles.cardMeta}>Durum: {quote.status}</Text>
            <Text style={styles.cardMeta} numberOfLines={2}>Cari: {quote.customer?.name || '-'}</Text>
            <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {quote.customer?.mikroCariCode || '-'}</Text>
            <Text style={styles.cardMeta}>Tarih: {quote.createdAt?.slice?.(0, 10) || '-'}</Text>
            {quote.validityDate && (
              <Text style={styles.cardMeta}>Gecerlilik: {quote.validityDate.slice(0, 10)}</Text>
            )}
            {quote.adminNote && (
              <Text style={styles.cardMeta} numberOfLines={3}>Admin Notu: {quote.adminNote}</Text>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Ara Toplam</Text>
              <Text style={styles.totalValue}>{quote.totalAmount.toFixed(2)} TL</Text>
            </View>
            {quote.totalVat !== undefined && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>KDV</Text>
                <Text style={styles.totalValue}>{quote.totalVat.toFixed(2)} TL</Text>
              </View>
            )}
            {quote.grandTotal !== undefined && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Genel Toplam</Text>
                <Text style={styles.totalValue}>{quote.grandTotal.toFixed(2)} TL</Text>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Kalemler</Text>
              {(quote.items || []).map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle} numberOfLines={3}>{item.productName}</Text>
                  <Text style={styles.itemMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {item.productCode || '-'}</Text>
                  <Text style={styles.itemMeta}>Miktar: {item.quantity}</Text>
                  <Text style={styles.itemMeta}>Birim: {item.unit || '-'}</Text>
                  <Text style={styles.itemMeta}>Birim Fiyat: {item.unitPrice.toFixed(2)} TL</Text>
                  <Text style={styles.itemMeta}>Toplam: {item.totalPrice.toFixed(2)} TL</Text>
                </View>
              ))}
              {(quote.items || []).length === 0 && (
                <Text style={styles.emptyText}>Kalem bulunamadi.</Text>
              )}
            </View>

            {quote.status === 'PENDING_APPROVAL' && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.primaryButton, Boolean(actionBusy) && styles.buttonDisabled]}
                  onPress={approve}
                  disabled={Boolean(actionBusy)}
                >
                  <Text style={styles.primaryButtonText}>{actionBusy === 'approve' ? 'Onaylaniyor...' : 'Onayla'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, Boolean(actionBusy) && styles.buttonDisabled]}
                  onPress={reject}
                  disabled={Boolean(actionBusy)}
                >
                  <Text style={styles.secondaryButtonText}>{actionBusy === 'reject' ? 'Reddediliyor...' : 'Reddet'}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.actionGrid}>
              {quote.mikroNumber && (
                <TouchableOpacity
                  style={[styles.secondaryWideButton, syncing && styles.buttonDisabled]}
                  onPress={syncQuote}
                  disabled={syncing}
                >
                  <Text style={styles.secondaryButtonText}>
                    {syncing ? 'Guncelleniyor...' : 'Mikrodan Guncelle'}
                  </Text>
                </TouchableOpacity>
              )}
              {canEdit && (
                <TouchableOpacity
                  style={styles.secondaryWideButton}
                  onPress={() => navigation.navigate('QuoteCreate', { quoteId: quote.id })}
                >
                  <Text style={styles.secondaryButtonText}>Duzenle</Text>
                </TouchableOpacity>
              )}
              {canConvert && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    hapticLight();
                    navigation.navigate('QuoteConvert', { quoteId: quote.id });
                  }}
                >
                  <Text style={styles.primaryButtonText}>Siparise Cevir</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.secondaryWideButton, pdfLoading && styles.buttonDisabled]}
                onPress={handlePdf}
                disabled={pdfLoading}
              >
                <Text style={styles.secondaryButtonText}>
                  {pdfLoading ? 'PDF Hazirlaniyor...' : 'PDF Indir'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryWideButton, recommendedPdfLoading && styles.buttonDisabled]}
                onPress={handleRecommendedPdf}
                disabled={recommendedPdfLoading}
              >
                <Text style={styles.secondaryButtonText}>
                  {recommendedPdfLoading ? 'Onerili PDF Hazirlaniyor...' : 'Onerili PDF Indir'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyText}>Teklif bulunamadi.</Text>
        )}
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
  containerTablet: {
    maxWidth: 1120,
    alignSelf: 'center',
    width: '100%',
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
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  totalLabel: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  totalValue: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  section: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  itemCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
    lineHeight: fontSizes.sm + 6,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  emptyText: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryWideButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 150,
    flexGrow: 1,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
