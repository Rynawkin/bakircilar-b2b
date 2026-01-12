import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { adminApi } from '../api/admin';
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

export function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<{ total?: number; withImage?: number; withoutImage?: number } | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getProducts(search ? { search } : undefined);
      setProducts(response.products || []);
      setStats(response.stats || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Urunler yuklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const displayTotals = useMemo(() => {
    if (!stats) return null;
    return {
      total: stats.total ?? 0,
      withImage: stats.withImage ?? 0,
      withoutImage: stats.withoutImage ?? 0,
    };
  }, [stats]);

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const uploadImage = async (product: Product) => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: asset.name || `${product.mikroCode}.png`,
      type: asset.mimeType || 'application/octet-stream',
    } as any);

    setUploadingId(product.id);
    try {
      await adminApi.uploadProductImage(product.id, formData);
      await fetchProducts();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Gorsel yuklenemedi.');
    } finally {
      setUploadingId(null);
    }
  };

  const deleteImage = async (product: Product) => {
    if (!product.imageUrl) return;
    Alert.alert('Gorsel Sil', 'Gorseli silmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(product.id);
          try {
            await adminApi.deleteProductImage(product.id);
            await fetchProducts();
          } catch (err: any) {
            Alert.alert('Hata', err?.response?.data?.error || 'Gorsel silinemedi.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const syncImage = async (product: Product) => {
    setSyncingId(product.id);
    try {
      await adminApi.triggerSelectedImageSync([product.id]);
      await fetchProducts();
    } catch (err: any) {
      Alert.alert('Hata', err?.response?.data?.error || 'Gorsel senkronu basarisiz.');
    } finally {
      setSyncingId(null);
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
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Urunler</Text>
              <Text style={styles.subtitle}>Stok ve fiyat ozetleri.</Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.search}
                  placeholder="Urun ara..."
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={fetchProducts}
                  returnKeyType="search"
                />
                <TouchableOpacity style={styles.searchButton} onPress={fetchProducts}>
                  <Text style={styles.searchButtonText}>Ara</Text>
                </TouchableOpacity>
              </View>
              {displayTotals && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryText}>Toplam: {displayTotals.total}</Text>
                  <Text style={styles.summaryText}>Gorselli: {displayTotals.withImage}</Text>
                  <Text style={styles.summaryText}>Gorselsiz: {displayTotals.withoutImage}</Text>
                </View>
              )}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
          renderItem={({ item }) => {
            const list1 = item.mikroPriceLists?.['1'];
            const list6 = item.mikroPriceLists?.['6'];

            return (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>Kod: {item.mikroCode}</Text>
                <Text style={styles.cardMeta}>Toplam Stok: {formatNumber(item.totalStock)}</Text>
                <Text style={styles.cardMeta}>Guncel Maliyet: {formatNumber(item.currentCost)} TL</Text>
                <Text style={styles.cardMeta}>Son Giris: {formatNumber(item.lastEntryPrice)} TL</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Liste 1:</Text>
                <Text style={styles.priceValue}>{formatNumber(list1)} TL</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Liste 6:</Text>
                <Text style={styles.priceValue}>{formatNumber(list6)} TL</Text>
              </View>
              <View style={styles.imageRow}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.image} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imagePlaceholderText}>Gorsel yok</Text>
                  </View>
                )}
                <View style={styles.imageActions}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => uploadImage(item)}
                    disabled={uploadingId === item.id}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {uploadingId === item.id ? 'Yukleniyor' : 'Yukle'}
                    </Text>
                  </TouchableOpacity>
                  {item.imageUrl && (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => deleteImage(item)}
                      disabled={deletingId === item.id}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {deletingId === item.id ? 'Siliniyor' : 'Sil'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => syncImage(item)}
                    disabled={syncingId === item.id}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {syncingId === item.id ? 'Sync' : 'Senkron'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {item.imageSyncStatus && (
                <Text style={styles.cardMeta}>Gorsel Durum: {item.imageSyncStatus}</Text>
              )}
              {item.imageSyncErrorType && (
                <Text style={styles.cardMeta}>Hata: {item.imageSyncErrorType}</Text>
              )}
            </View>
          );
        }}
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
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
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
    gap: spacing.xs,
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
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  priceLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  priceValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  imageRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  imageActions: {
    flex: 1,
    gap: spacing.xs,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
});
