import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type ComplementState = {
  mode: 'AUTO' | 'MANUAL';
  limit: number;
  complementGroupCode?: string | null;
  auto: Array<{
    productId: string;
    productCode: string;
    productName: string;
    pairCount: number;
    rank: number;
  }>;
  manual: Array<{
    productId: string;
    productCode: string;
    productName: string;
    sortOrder: number;
  }>;
};

export function ComplementManagementScreen() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [complements, setComplements] = useState<ComplementState | null>(null);
  const [loadingComplements, setLoadingComplements] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [manualCandidates, setManualCandidates] = useState<Product[]>([]);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [groupCode, setGroupCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async (term: string) => {
    setProductsLoading(true);
    setError(null);
    try {
      const response = await adminApi.getProducts({
        search: term.trim() || undefined,
        page: 1,
        limit: 50,
      });
      setProducts(response.products || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Urun listesi alinamadi.');
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchProducts(search);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const loadComplements = async (product: Product) => {
    setSelectedProduct(product);
    setLoadingComplements(true);
    setError(null);
    try {
      const response = await adminApi.getProductComplements(product.id);
      setComplements(response);
      setMode(response.mode || 'AUTO');
      setGroupCode(response.complementGroupCode || '');
      setManualIds((response.manual || []).map((item) => item.productId));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Tamamlayicilar alinamadi.');
      setComplements(null);
    } finally {
      setLoadingComplements(false);
    }
  };

  const fetchManualCandidates = async (term: string) => {
    if (!term.trim()) {
      setManualCandidates([]);
      return;
    }
    try {
      const response = await adminApi.getProducts({ search: term.trim(), page: 1, limit: 25 });
      setManualCandidates((response.products || []).filter((row) => row.id !== selectedProduct?.id));
    } catch {
      setManualCandidates([]);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchManualCandidates(manualSearch);
    }, 250);
    return () => clearTimeout(handle);
  }, [manualSearch, selectedProduct?.id]);

  const manualProducts = useMemo(() => {
    if (!complements) return [];
    const manualMap = new Map(
      complements.manual.map((item) => [item.productId, item])
    );
    [...products, ...manualCandidates].forEach((product) => {
      if (!manualMap.has(product.id)) {
        manualMap.set(product.id, {
          productId: product.id,
          productCode: product.mikroCode,
          productName: product.name,
          sortOrder: 0,
        });
      }
    });
    return manualIds
      .map((id) => manualMap.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [complements, manualIds, manualCandidates, products]);

  const addManual = (product: Product) => {
    setManualIds((prev) => (prev.includes(product.id) ? prev : [...prev, product.id]));
  };

  const removeManual = (productId: string) => {
    setManualIds((prev) => prev.filter((id) => id !== productId));
  };

  const saveComplements = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateProductComplements(selectedProduct.id, {
        manualProductIds: manualIds,
        mode,
        complementGroupCode: groupCode.trim() || null,
      });
      await loadComplements(selectedProduct);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Tamamlayici kaydi basarisiz.');
    } finally {
      setSaving(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await adminApi.syncProductComplements({ months: 12, limit: 8 });
      if (selectedProduct) {
        await loadComplements(selectedProduct);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Tamamlayici senkronu basarisiz.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Tamamlayici Urun Yonetimi</Text>
            <Text style={styles.subtitle}>Otomatik/manuel tamamlayici kurallarini mobilde yonetin.</Text>

            <TextInput
              style={styles.input}
              placeholder="Urun ara..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, syncing && styles.buttonDisabled]}
                onPress={runSync}
                disabled={syncing}
              >
                <Text style={styles.secondaryButtonText}>{syncing ? 'Senkron...' : 'Oto Senkron Calistir'}</Text>
              </TouchableOpacity>
            </View>
            {productsLoading ? (
              <View style={styles.loadingInline}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.productCard, selectedProduct?.id === item.id && styles.productCardActive]}
            onPress={() => loadComplements(item)}
          >
            <Text style={styles.productTitle}>{item.name}</Text>
            <Text style={styles.productMeta}>Kod: {item.mikroCode}</Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          selectedProduct ? (
            <View style={styles.detailCard}>
              {loadingComplements ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : complements ? (
                <>
                  <Text style={styles.detailTitle}>{selectedProduct.name}</Text>
                  <Text style={styles.detailMeta}>Kod: {selectedProduct.mikroCode}</Text>

                  <View style={styles.modeRow}>
                    <TouchableOpacity
                      style={[styles.modeButton, mode === 'AUTO' && styles.modeButtonActive]}
                      onPress={() => setMode('AUTO')}
                    >
                      <Text style={mode === 'AUTO' ? styles.modeTextActive : styles.modeText}>AUTO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modeButton, mode === 'MANUAL' && styles.modeButtonActive]}
                      onPress={() => setMode('MANUAL')}
                    >
                      <Text style={mode === 'MANUAL' ? styles.modeTextActive : styles.modeText}>MANUAL</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={styles.input}
                    placeholder="Complement group code (opsiyonel)"
                    placeholderTextColor={colors.textMuted}
                    value={groupCode}
                    onChangeText={setGroupCode}
                  />

                  <Text style={styles.sectionTitle}>Otomatik Onerilenler</Text>
                  <View style={styles.block}>
                    {(complements.auto || []).slice(0, 12).map((row) => (
                      <View key={row.productId} style={styles.blockRow}>
                        <Text style={styles.blockLabel}>{row.productCode} - {row.productName}</Text>
                        <Text style={styles.blockValue}>Pair: {row.pairCount}</Text>
                      </View>
                    ))}
                    {complements.auto.length === 0 && <Text style={styles.emptyText}>Otomatik kayit yok.</Text>}
                  </View>

                  <Text style={styles.sectionTitle}>Manuel Liste</Text>
                  <View style={styles.block}>
                    {manualProducts.map((row) => (
                      <View key={row.productId} style={styles.blockRow}>
                        <Text style={styles.blockLabel}>{row.productCode} - {row.productName}</Text>
                        <TouchableOpacity onPress={() => removeManual(row.productId)}>
                          <Text style={styles.removeText}>Cikar</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    {manualProducts.length === 0 && <Text style={styles.emptyText}>Manuel urun secilmedi.</Text>}
                  </View>

                  <TextInput
                    style={styles.input}
                    placeholder="Manuel urun eklemek icin ara..."
                    placeholderTextColor={colors.textMuted}
                    value={manualSearch}
                    onChangeText={setManualSearch}
                  />
                  {manualSearch.trim().length > 0 ? (
                    <ScrollView style={styles.candidateList} nestedScrollEnabled>
                      {manualCandidates.map((candidate) => (
                        <TouchableOpacity
                          key={candidate.id}
                          style={styles.candidateItem}
                          onPress={() => addManual(candidate)}
                        >
                          <Text style={styles.blockLabel}>{candidate.mikroCode} - {candidate.name}</Text>
                        </TouchableOpacity>
                      ))}
                      {manualCandidates.length === 0 && (
                        <Text style={styles.emptyText}>Aday urun bulunamadi.</Text>
                      )}
                    </ScrollView>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.primaryButton, saving && styles.buttonDisabled]}
                    onPress={saveComplements}
                    disabled={saving}
                  >
                    <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Degisiklikleri Kaydet'}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          ) : null
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
    fontSize: fontSizes.sm,
    color: colors.textMuted,
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
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  loadingInline: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  productCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  productCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#E8EEF8',
  },
  productTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  productMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  detailCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  detailTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  detailMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  modeTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  sectionTitle: {
    marginTop: spacing.sm,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  block: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  blockLabel: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  blockValue: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  removeText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.danger,
  },
  candidateList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  candidateItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
});
