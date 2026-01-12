import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { customerApi } from '../api/customer';
import { Quote } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { shareQuotePdf } from '../utils/quotePdf';

type QuoteDetailRoute = RouteProp<RootStackParamList, 'QuoteDetail'>;

export function QuoteDetailScreen() {
  const route = useRoute<QuoteDetailRoute>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchQuote = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getQuoteById(route.params.quoteId);
      setQuote(response.quote || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Teklif yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
  }, [route.params.quoteId]);

  const handleAccept = async () => {
    if (!quote) return;
    try {
      await customerApi.acceptQuote(quote.id);
      Alert.alert('Basarili', 'Teklif kabul edildi.');
      await fetchQuote();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Islem basarisiz.');
    }
  };

  const handleReject = async () => {
    if (!quote) return;
    Alert.alert('Teklifi Reddet', 'Teklifi reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          try {
            await customerApi.rejectQuote(quote.id);
            Alert.alert('Basarili', 'Teklif reddedildi.');
            await fetchQuote();
          } catch (err: any) {
            Alert.alert('Hata', err?.response?.data?.error || 'Islem basarisiz.');
          }
        },
      },
    ]);
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

  const canRespond = quote?.status === 'SENT_TO_MIKRO';

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={quote?.items || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Teklif Detayi</Text>
              <Text style={styles.subtitle}>No: {quote?.quoteNumber || '-'}</Text>
              <Text style={styles.subtitle}>Durum: {quote?.status || '-'}</Text>
              {quote && (
                <Text style={styles.subtitle}>
                  Toplam: {(quote.grandTotal ?? quote.totalAmount).toFixed(2)} TL
                </Text>
              )}
              {quote?.validityDate && (
                <Text style={styles.subtitle}>Gecerlilik: {quote.validityDate}</Text>
              )}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.productName}</Text>
              <Text style={styles.cardMeta}>Miktar: {item.quantity}</Text>
              <Text style={styles.cardMeta}>Birim: {item.unitPrice.toFixed(2)} TL</Text>
              <Text style={styles.cardMeta}>Toplam: {item.totalPrice.toFixed(2)} TL</Text>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.actions}>
              {canRespond && (
                <>
                  <TouchableOpacity style={styles.primaryButton} onPress={handleAccept}>
                    <Text style={styles.primaryButtonText}>Kabul Et</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={handleReject}>
                    <Text style={styles.secondaryButtonText}>Reddet</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={styles.secondaryButton} onPress={handlePdf} disabled={pdfLoading}>
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
  header: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
});
