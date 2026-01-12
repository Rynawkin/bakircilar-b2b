import { useMemo, useState } from 'react';
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
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type CariResult = Record<string, any>;

export function EkstreScreen() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<CariResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCari, setSelectedCari] = useState<CariResult | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [foyuLoading, setFoyuLoading] = useState(false);
  const [foyuData, setFoyuData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const response = await adminApi.searchCariForEkstre({ searchTerm });
      setSearchResults(response.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Cari aramasi basarisiz.');
    } finally {
      setSearching(false);
    }
  };

  const fetchFoyu = async () => {
    if (!selectedCari?.['Cari Kodu']) return;
    setFoyuLoading(true);
    setError(null);
    try {
      const response = await adminApi.getCariHareketFoyu({
        cariKod: selectedCari['Cari Kodu'],
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setFoyuData(response.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Cari hareket foyi yuklenemedi.');
    } finally {
      setFoyuLoading(false);
    }
  };

  const totalAmount = useMemo(() => {
    return (foyuData || []).reduce((sum, row) => {
      const value = Number(row?.Tutar ?? row?.['Tutar'] ?? 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }, [foyuData]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={foyuData}
        keyExtractor={(item, index) => `${item?.Seri || ''}-${item?.Sira || ''}-${index}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Cari Ekstre</Text>
            <Text style={styles.subtitle}>Mikro hareket foyi listesi.</Text>

            <View style={styles.searchRow}>
              <TextInput
                style={styles.search}
                placeholder="Cari ara..."
                placeholderTextColor={colors.textMuted}
                value={searchTerm}
                onChangeText={setSearchTerm}
                onSubmitEditing={onSearch}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchButton} onPress={onSearch}>
                <Text style={styles.searchButtonText}>Ara</Text>
              </TouchableOpacity>
            </View>

            {searching && (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {searchResults.length > 0 && !selectedCari && (
              <View style={styles.resultsBox}>
                {searchResults.slice(0, 6).map((item) => {
                  const cariName =
                    item['Cari Ad\u0131'] ||
                    item['Cari Adi'] ||
                    item['Cari Ad\u0131 2'] ||
                    item['Cari Adi 2'] ||
                    'Cari';

                  return (
                  <TouchableOpacity
                    key={item['Cari Kodu']}
                    style={styles.resultItem}
                    onPress={() => {
                      setSelectedCari(item);
                      setSearchResults([]);
                    }}
                  >
                    <Text style={styles.resultTitle}>{cariName}</Text>
                    <Text style={styles.resultMeta}>Kod: {item['Cari Kodu']}</Text>
                  </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {selectedCari && (
              <View style={styles.selectedCard}>
                <Text style={styles.selectedTitle}>
                  {selectedCari['Cari Ad\u0131'] ||
                    selectedCari['Cari Adi'] ||
                    selectedCari['Cari Ad\u0131 2'] ||
                    selectedCari['Cari Adi 2'] ||
                    'Cari'}
                </Text>
                <Text style={styles.selectedMeta}>Kod: {selectedCari['Cari Kodu']}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedCari(null);
                    setFoyuData([]);
                  }}
                >
                  <Text style={styles.clearLink}>Cariyi degistir</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.dateRow}>
              <TextInput
                style={styles.dateInput}
                placeholder="Baslangic (YYYY-MM-DD)"
                placeholderTextColor={colors.textMuted}
                value={startDate}
                onChangeText={setStartDate}
              />
              <TextInput
                style={styles.dateInput}
                placeholder="Bitis (YYYY-MM-DD)"
                placeholderTextColor={colors.textMuted}
                value={endDate}
                onChangeText={setEndDate}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, !selectedCari && styles.buttonDisabled]}
              onPress={fetchFoyu}
              disabled={!selectedCari}
            >
              {foyuLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Ekstre Getir</Text>
              )}
            </TouchableOpacity>

            {error && <Text style={styles.error}>{error}</Text>}

            {foyuData.length > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryText}>Kayit: {foyuData.length}</Text>
                <Text style={styles.summaryText}>Toplam: {totalAmount.toFixed(2)} TL</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item?.['Evrak Tipi'] || 'Evrak'}</Text>
            <Text style={styles.cardMeta}>Tarih: {item?.Tarih || '-'}</Text>
            <Text style={styles.cardMeta}>Belge No: {item?.['Belge No'] || '-'}</Text>
            <Text style={styles.cardMeta}>Odeme Tipi: {item?.['Odeme Tipi'] || '-'}</Text>
            <Text style={styles.cardMeta}>Hareket Tipi: {item?.['Hareket Tipi'] || '-'}</Text>
            <Text style={styles.cardMeta}>Tip Kodu: {item?.['Tip Kodu'] ?? '-'}</Text>
            <Text style={styles.cardAmount}>Tutar: {Number(item?.Tutar ?? 0).toFixed(2)} TL</Text>
          </View>
        )}
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
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  search: {
    flex: 1,
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
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  searchButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  inlineLoading: {
    alignItems: 'flex-start',
  },
  resultsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  resultItem: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  resultTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  resultMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  selectedCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  selectedTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  selectedMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  clearLink: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateInput: {
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
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
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
  cardAmount: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
    marginTop: spacing.xs,
  },
});
