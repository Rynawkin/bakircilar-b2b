import { useState } from 'react';
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

type SearchMode = 'stocks' | 'customers';

export function SearchScreen() {
  const [mode, setMode] = useState<SearchMode>('stocks');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    setLoading(true);
    try {
      if (mode === 'stocks') {
        const response = await adminApi.searchStocks({ searchTerm: term, limit: 50, offset: 0 });
        setResults(response.data || []);
      } else {
        const response = await adminApi.searchCustomers({ searchTerm: term, limit: 50, offset: 0 });
        setResults(response.data || []);
      }
    } catch (err) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={results}
        keyExtractor={(_, index) => `${mode}-${index}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Arama</Text>
            <Text style={styles.subtitle}>Stok ve cari arama.</Text>
            <View style={styles.segment}>
              {(['stocks', 'customers'] as const).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.segmentButton, mode === item && styles.segmentButtonActive]}
                  onPress={() => setMode(item)}
                >
                  <Text style={mode === item ? styles.segmentTextActive : styles.segmentText}>
                    {item === 'stocks' ? 'Stok' : 'Cari'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="Ara"
                placeholderTextColor={colors.textMuted}
                value={term}
                onChangeText={setTerm}
                returnKeyType="search"
                onSubmitEditing={runSearch}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={runSearch}>
                <Text style={styles.primaryButtonText}>Ara</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name || item.stok_adi || item.cari_unvan || '-'}</Text>
            <Text style={styles.cardMeta}>{item.code || item.stok_kod || item.cari_kod || '-'}</Text>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Sonuc yok.</Text>
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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  input: {
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
  flex: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
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
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
    color: colors.textMuted,
  },
});
