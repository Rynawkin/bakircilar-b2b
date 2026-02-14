import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Quote } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { shareQuotePdf } from '../utils/quotePdf';
import { hapticLight, hapticSuccess } from '../utils/haptics';

export function QuoteDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const route = useRoute() as { params: { quoteId: string } };
  const { quoteId } = route.params;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [recommendedPdfLoading, setRecommendedPdfLoading] = useState(false);

  const fetchQuote = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getQuoteById(quoteId);
      setQuote(response.quote);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Teklif yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
  }, [quoteId]);

  const approve = async () => {
    if (!quote) return;
    try {
      await adminApi.approveQuote(quote.id);
      hapticSuccess();
      await fetchQuote();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Onay basarisiz.');
    }
  };

  const reject = async () => {
    if (!quote) return;
    Alert.alert('Teklifi Reddet', 'Teklifi reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminApi.rejectQuote(quote.id, 'Mobil reddedildi');
            hapticSuccess();
            await fetchQuote();
          } catch (err: any) {
            Alert.alert('Hata', err?.response?.data?.error || 'Red basarisiz.');
          }
        },
      },
    ]);
  };

  const syncQuote = async () => {
    if (!quote) return;
    setSyncing(true);
    try {
      await adminApi.syncQuote(quote.id);
      await fetchQuote();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Guncelleme basarisiz.');
    } finally {
      setSyncing(false);
    }
  };

  const handlePdf = async () => {
    if (!quote) return;
    setPdfLoading(true);
    try {
      await shareQuotePdf(quote);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'PDF hazirlanamadi.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleRecommendedPdf = async () => {
    if (!quote) return;
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
      Alert.alert('Hata', err?.response?.data?.error || 'Onerili PDF hazirlanamadi.');
    } finally {
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
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Teklif Detayi</Text>
        {error && <Text style={styles.error}>{error}</Text>}

        {quote ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{quote.quoteNumber}</Text>
            <Text style={styles.cardMeta}>Durum: {quote.status}</Text>
            <Text style={styles.cardMeta}>Cari: {quote.customer?.name || '-'}</Text>
            <Text style={styles.cardMeta}>Kod: {quote.customer?.mikroCariCode || '-'}</Text>
            <Text style={styles.cardMeta}>Tarih: {quote.createdAt?.slice?.(0, 10) || '-'}</Text>
            {quote.validityDate && (
              <Text style={styles.cardMeta}>Gecerlilik: {quote.validityDate.slice(0, 10)}</Text>
            )}
            {quote.adminNote && (
              <Text style={styles.cardMeta}>Admin Notu: {quote.adminNote}</Text>
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
                  <Text style={styles.itemTitle}>{item.productName}</Text>
                  <Text style={styles.itemMeta}>Kod: {item.productCode || '-'}</Text>
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
                <TouchableOpacity style={styles.primaryButton} onPress={approve}>
                  <Text style={styles.primaryButtonText}>Onayla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={reject}>
                  <Text style={styles.secondaryButtonText}>Reddet</Text>
                </TouchableOpacity>
              </View>
            )}

            {quote.mikroNumber && (
              <TouchableOpacity style={styles.secondaryWideButton} onPress={syncQuote} disabled={syncing}>
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
            <TouchableOpacity style={styles.secondaryWideButton} onPress={handlePdf} disabled={pdfLoading}>
              <Text style={styles.secondaryButtonText}>
                {pdfLoading ? 'PDF Hazirlaniyor...' : 'PDF Indir'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryWideButton}
              onPress={handleRecommendedPdf}
              disabled={recommendedPdfLoading}
            >
              <Text style={styles.secondaryButtonText}>
                {recommendedPdfLoading ? 'Onerili PDF Hazirlaniyor...' : 'Onerili PDF Indir'}
              </Text>
            </TouchableOpacity>
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
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    flex: 1,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryWideButton: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
});
