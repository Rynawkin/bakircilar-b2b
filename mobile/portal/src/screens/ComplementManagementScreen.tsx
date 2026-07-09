import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

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
  const route = useRoute<RouteProp<PortalStackParamList, 'ComplementManagement'>>();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const productColumns = isWide ? 2 : 1;
  const [search, setSearch] = useState(route.params?.initialSearch || '');
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
  const savingRef = useRef(false);
  const syncingRef = useRef(false);
  const productSearchSeqRef = useRef(0);
  const manualSearchSeqRef = useRef(0);
  const complementsSeqRef = useRef(0);
  const autoSelectKeyRef = useRef<string | null>(null);

  const summary = useMemo(() => {
    const autoCount = complements?.auto?.length || 0;
    const manualCount = manualIds.length;
    return {
      result: products.length,
      autoCount,
      manualCount,
      mode,
    };
  }, [complements?.auto?.length, manualIds.length, mode, products.length]);

  const fetchProducts = async (term: string) => {
    const requestSeq = ++productSearchSeqRef.current;
    setProductsLoading(true);
    setError(null);
    try {
      const response = await adminApi.getProducts({
        search: term.trim() || undefined,
        page: 1,
        limit: 50,
      });
      if (requestSeq === productSearchSeqRef.current) {
        setProducts(response.products || []);
      }
    } catch (err: any) {
      if (requestSeq === productSearchSeqRef.current) {
        setError(getApiErrorMessage(err, 'Urun listesi alinamadi.'));
      }
    } finally {
      if (requestSeq === productSearchSeqRef.current) {
        setProductsLoading(false);
      }
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchProducts(search);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    const nextSearch = route.params?.initialSearch || '';
    setSearch(nextSearch);
  }, [route.params?.initialSearch]);

  const loadComplements = async (product: Product) => {
    const requestSeq = ++complementsSeqRef.current;
    setSelectedProduct(product);
    setLoadingComplements(true);
    setError(null);
    try {
      const response = await adminApi.getProductComplements(product.id);
      if (requestSeq !== complementsSeqRef.current) return;
      setComplements(response);
      setMode(response.mode || 'AUTO');
      setGroupCode(response.complementGroupCode || '');
      setManualIds((response.manual || []).map((item) => item.productId));
    } catch (err: any) {
      if (requestSeq === complementsSeqRef.current) {
        setError(getApiErrorMessage(err, 'Tamamlayicilar alinamadi.'));
        setComplements(null);
      }
    } finally {
      if (requestSeq === complementsSeqRef.current) {
        setLoadingComplements(false);
      }
    }
  };

  useEffect(() => {
    if (!route.params?.autoSelect || productsLoading || loadingComplements || products.length === 0) return;
    const target = products[0];
    const autoSelectKey = `${route.params.initialSearch || ''}|${target.id}`;
    if (autoSelectKeyRef.current === autoSelectKey || selectedProduct?.id === target.id) return;
    autoSelectKeyRef.current = autoSelectKey;
    void loadComplements(target);
  }, [
    loadingComplements,
    products,
    productsLoading,
    route.params?.autoSelect,
    route.params?.initialSearch,
    selectedProduct?.id,
  ]);

  const fetchManualCandidates = async (term: string) => {
    if (!term.trim()) {
      manualSearchSeqRef.current += 1;
      setManualCandidates([]);
      return;
    }
    const requestSeq = ++manualSearchSeqRef.current;
    try {
      const response = await adminApi.getProducts({ search: term.trim(), page: 1, limit: 25 });
      if (requestSeq === manualSearchSeqRef.current) {
        setManualCandidates((response.products || []).filter((row) => row.id !== selectedProduct?.id));
      }
    } catch {
      if (requestSeq === manualSearchSeqRef.current) {
        setManualCandidates([]);
      }
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
    if (savingRef.current) return;
    if (!selectedProduct) return;
    savingRef.current = true;
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
      setError(getApiErrorMessage(err, 'Tamamlayici kaydi basarisiz.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const runSync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    try {
      await adminApi.syncProductComplements({ months: 12, limit: 8 });
      if (selectedProduct) {
        await loadComplements(selectedProduct);
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Tamamlayici senkronu basarisiz.'));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={products}
        key={`complement-products-${productColumns}`}
        keyExtractor={(item) => item.id}
        numColumns={productColumns}
        columnWrapperStyle={productColumns > 1 ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>Katalog Motoru</Text>
              <Text style={styles.heroTitle}>Tamamlayici Urun Yonetimi</Text>
              <Text style={styles.heroSubtitle}>
                Otomatik eslesmeleri kontrol edin, kritik urunlere manuel tamamlayici tanimlayin.
              </Text>
              <View style={styles.heroMetricRow}>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{summary.result}</Text>
                  <Text style={styles.heroMetricLabel}>Aday</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{summary.autoCount}</Text>
                  <Text style={styles.heroMetricLabel}>Oto</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{summary.manualCount}</Text>
                  <Text style={styles.heroMetricLabel}>Manuel</Text>
                </View>
                <View style={styles.heroMetric}>
                  <Text style={styles.heroMetricValue}>{summary.mode}</Text>
                  <Text style={styles.heroMetricLabel}>Mod</Text>
                </View>
              </View>
            </View>

            <View style={styles.controlCard}>
              <TextInput
                style={styles.input}
                placeholder="Urun adi veya stok kodu ara..."
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
                  <Text style={styles.secondaryButtonText}>{syncing ? 'Senkron calisiyor...' : 'Oto Senkron Calistir'}</Text>
                </TouchableOpacity>
              </View>
              {productsLoading ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.loadingText}>Urunler yukleniyor...</Text>
                </View>
              ) : null}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.productCard,
              productColumns > 1 && styles.productCardGrid,
              selectedProduct?.id === item.id && styles.productCardActive,
              loadingComplements && styles.buttonDisabled,
            ]}
            onPress={() => loadComplements(item)}
            disabled={loadingComplements}
          >
            <Text style={styles.productTitle} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
            <Text style={styles.productMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {item.mikroCode}</Text>
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
                  <Text style={styles.detailTitle} numberOfLines={3} ellipsizeMode="tail">{selectedProduct.name}</Text>
                  <Text style={styles.detailMeta} numberOfLines={1} ellipsizeMode="middle">Kod: {selectedProduct.mikroCode}</Text>

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
                          <Text style={styles.blockLabel} numberOfLines={2} ellipsizeMode="tail">{candidate.mikroCode} - {candidate.name}</Text>
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
  columnWrapper: {
    gap: spacing.md,
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroKicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#9EC5FF',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xxl,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DDE8FF',
    lineHeight: 22,
  },
  heroMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: spacing.sm,
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: '#FFFFFF',
  },
  heroMetricLabel: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
  },
  controlCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
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
    gap: spacing.xs,
  },
  loadingText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
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
  productCardGrid: {
    flex: 1,
  },
  productCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
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
