import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Quote } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { shareQuotePdf } from '../utils/quotePdf';

export function QuotesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const fetchQuotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getQuotes();
      setQuotes(response.quotes || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Teklifler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return quotes;
    return quotes.filter((quote) => {
      const haystack = [
        quote.quoteNumber,
        quote.status,
        quote.customer?.name,
        quote.customer?.mikroCariCode,
        quote.totalAmount?.toString(),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [quotes, search]);

  const approve = async (quoteId: string) => {
    try {
      await adminApi.approveQuote(quoteId);
      await fetchQuotes();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Onay basarisiz.');
    }
  };

  const reject = async (quoteId: string) => {
    Alert.alert('Teklifi Reddet', 'Teklifi reddetmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Reddet',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminApi.rejectQuote(quoteId, 'Mobil reddedildi');
            await fetchQuotes();
          } catch (err: any) {
            Alert.alert('Hata', err?.response?.data?.error || 'Red basarisiz.');
          }
        },
      },
    ]);
  };

  const handlePdf = async (quoteId: string) => {
    setPdfLoadingId(quoteId);
    try {
      const response = await adminApi.getQuoteById(quoteId);
      await shareQuotePdf(response.quote);
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'PDF hazirlanamadi.');
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredQuotes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Teklifler</Text>
              <Text style={styles.subtitle}>Gonderilen ve onay bekleyen teklifler.</Text>
              <TextInput
                style={styles.search}
                placeholder="Teklif ara..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('QuoteCreate')}>
                  <Text style={styles.primaryButtonText}>Yeni Teklif</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={fetchQuotes}>
                  <Text style={styles.secondaryButtonText}>Yenile</Text>
                </TouchableOpacity>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.quoteNumber}</Text>
              <Text style={styles.cardMeta}>Durum: {item.status}</Text>
              <Text style={styles.cardMeta}>Toplam: {item.totalAmount.toFixed(2)} TL</Text>
              <Text style={styles.cardMeta}>Tarih: {item.createdAt?.slice?.(0, 10) || '-'}</Text>
              {item.customer?.name && (
                <Text style={styles.cardMeta}>Cari: {item.customer.name}</Text>
              )}
              {item.status === 'PENDING_APPROVAL' && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.primaryButton} onPress={() => approve(item.id)}>
                    <Text style={styles.primaryButtonText}>Onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => reject(item.id)}>
                    <Text style={styles.secondaryButtonText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate('QuoteDetail', { quoteId: item.id })}
                >
                  <Text style={styles.secondaryButtonText}>Detay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => handlePdf(item.id)}
                  disabled={pdfLoadingId === item.id}
                >
                  <Text style={styles.secondaryButtonText}>
                    {pdfLoadingId === item.id ? 'PDF...' : 'PDF'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  },
  headerActions: {
    flexDirection: 'row',
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
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
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
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
});
