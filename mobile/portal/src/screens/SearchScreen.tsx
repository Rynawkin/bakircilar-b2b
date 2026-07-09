import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { usePortalAccess } from '../context/PortalAccessContext';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import { buildSearchVariants } from '../utils/search';

type SearchMode = 'stocks' | 'customers';
const SEARCH_PAGE_SIZE = 50;

const STOCK_TITLE_KEY = 'msg_S_0870';
const STOCK_CODE_KEY = 'msg_S_0078';
const CUSTOMER_TITLE_KEY = 'msg_S_1033';
const CUSTOMER_CODE_KEY = 'msg_S_1032';
const STOCK_GUID_KEY = 'msg_S_0088';
const CUSTOMER_GUID_KEY = 'msg_S_0088';

const DEFAULT_STOCK_COLUMNS = [
  STOCK_CODE_KEY,
  STOCK_TITLE_KEY,
  'KDV Orani',
  'Guncel Maliyet Kdv Dahil',
  'Merkez Depo',
  'Toplam Satilabilir',
  'Koli Ici',
];

const DEFAULT_CUSTOMER_COLUMNS = [
  CUSTOMER_CODE_KEY,
  CUSTOMER_TITLE_KEY,
  'IL',
  'ILCE',
  'Telefon',
  'Vergi No',
  'SEKTOR KODU',
  'msg_S_1530',
];

const COLUMN_NAMES: Record<string, string> = {
  [STOCK_GUID_KEY]: 'GUID',
  [STOCK_TITLE_KEY]: 'Urun Adi',
  [STOCK_CODE_KEY]: 'Stok Kodu',
  [CUSTOMER_TITLE_KEY]: 'Cari Unvani',
  msg_S_1034: 'Cari Unvani 2',
  [CUSTOMER_CODE_KEY]: 'Cari Kodu',
  msg_S_1530: 'Bakiye',
  msg_S_3171: 'Baglanti Tipi',
  msg_S_0888: 'Hareket Tipi',
};

const NORMALIZED_COLUMN_NAMES: Record<string, string> = {
  kdvorani: 'KDV Orani',
  guncelmaliyetkdvdahil: 'Guncel Maliyet Kdv Dahil',
  guncelmaliyetkdv: 'Guncel Maliyet + Kdv.',
  merkezdepo: 'Merkez Depo',
  toplamsatilabilir: 'Toplam Satilabilir',
  koliici: 'Koli Ici',
  sektorKodu: 'Sektor Kodu',
  sektorkodu: 'Sektor Kodu',
  vergino: 'Vergi No',
  telefon: 'Telefon',
};

const toText = (value: any) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  }
  if (value instanceof Date) return value.toLocaleDateString('tr-TR');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '-';
    }
  }
  return String(value);
};

const normalizeKey = (value: string) =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const displayColumnName = (column: string) => COLUMN_NAMES[column] || NORMALIZED_COLUMN_NAMES[normalizeKey(column)] || column;

const findValueByNormalizedKey = (item: any, matcher: (key: string) => boolean) => {
  if (!item || typeof item !== 'object') return undefined;
  const entry = Object.entries(item as Record<string, any>).find(([key]) => matcher(normalizeKey(key)));
  return entry?.[1];
};

const getUnitConversionLabel = (item: any) => {
  const unit1 = String(findValueByNormalizedKey(item, (key) => key === 'birim') || '').trim();
  const unit2 = String(
    findValueByNormalizedKey(item, (key) => key.includes('2birim') || key.includes('ikincibirim')) || ''
  ).trim();
  const rawFactor = findValueByNormalizedKey(item, (key) => key.includes('2birimkatsay') || key.includes('katsay'));
  const factor = Number(String(rawFactor ?? '').replace(',', '.'));
  if (!unit1 || !unit2 || !Number.isFinite(factor) || factor === 0) return '-';
  const absFactor = Math.abs(factor).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const targetUnit = normalizeKey(unit2).includes('koli') ? unit1 : unit2;
  return `Koli ici: ${absFactor} ${targetUnit}`;
};

const getColumnValue = (column: string, item: any) => {
  if (normalizeKey(column) === 'koliici') return getUnitConversionLabel(item);
  return toText(item?.[column]);
};

const pickColumns = (preferred: string[], available: string[], fallback: string[]) => {
  const availableSet = new Set(available);
  const availableByNormalized = new Map(available.map((column) => [normalizeKey(column), column]));
  const resolve = (column: string) => {
    if (availableSet.has(column)) return column;
    return availableByNormalized.get(normalizeKey(column));
  };
  const preferredValid = preferred.map(resolve).filter((column): column is string => Boolean(column));
  if (preferredValid.length > 0) return preferredValid;
  const fallbackValid = fallback.map(resolve).filter((column): column is string => Boolean(column));
  if (fallbackValid.length > 0) return fallbackValid;
  return available.slice(0, Math.min(5, available.length));
};

const getCustomerCode = (item: any) =>
  String(item?.[CUSTOMER_CODE_KEY] || item?.['Cari Kodu'] || item?.['cari_kod'] || '').trim();

const extractTaxNo = (item: any) => {
  if (!item || typeof item !== 'object') return '';
  const entries = Object.entries(item as Record<string, any>);
  for (const [key, value] of entries) {
    const k = normalizeKey(key);
    if (
      k.includes('vergino') ||
      k.includes('vergidaireno') ||
      k.includes('taxnumber') ||
      k.includes('vdaireno') ||
      k === 'vkn' ||
      k.includes('tckn')
    ) {
      const text = String(value || '').trim();
      if (text) return text;
    }
  }
  return '';
};

export function SearchScreen() {
  const route = useRoute<RouteProp<PortalStackParamList, 'Search'>>();
  const { width } = useWindowDimensions();
  const { permissions, loading: accessLoading } = usePortalAccess();
  const autoRunDoneRef = useRef(false);
  const [mode, setMode] = useState<SearchMode>(route.params?.mode || 'stocks');
  const [term, setTerm] = useState(route.params?.term || '');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stockColumns, setStockColumns] = useState<string[]>([]);
  const [customerColumns, setCustomerColumns] = useState<string[]>([]);
  const [selectedStockColumns, setSelectedStockColumns] = useState<string[]>([]);
  const [selectedCustomerColumns, setSelectedCustomerColumns] = useState<string[]>([]);
  const [columnPickerOpen, setColumnPickerOpen] = useState(Boolean(route.params?.openColumns));
  const [savingColumns, setSavingColumns] = useState(false);
  const [selectedStockItem, setSelectedStockItem] = useState<any | null>(null);
  const activeSearchRef = useRef<{ mode: SearchMode; term: string; variant: string } | null>(null);

  const isWide = width >= 820;
  const listColumns = isWide ? 2 : 1;
  const canSearchStocks = permissions?.['dashboard:stok-ara'] !== false;
  const canSearchCustomers = permissions?.['dashboard:cari-ara'] !== false;

  const modeOptions = useMemo(
    () =>
      ([
        { key: 'stocks' as const, label: 'Stok', allowed: canSearchStocks },
        { key: 'customers' as const, label: 'Cari', allowed: canSearchCustomers },
      ]).filter((item) => item.allowed),
    [canSearchCustomers, canSearchStocks]
  );

  useEffect(() => {
    const loadMeta = async () => {
      const [stockResp, customerResp, prefResp] = await Promise.all([
        adminApi.getStockColumns().catch(() => ({ columns: [] as string[] })),
        adminApi.getCustomerColumns().catch(() => ({ columns: [] as string[] })),
        adminApi.getSearchPreferences().catch(() => null),
      ]);

      const stockSource = stockResp.columns || [];
      const stocks = stockSource.includes('Koli Ici') ? stockSource : [...stockSource, 'Koli Ici'];
      const customers = customerResp.columns || [];
      const prefStocks = prefResp?.preferences?.stockColumns || [];
      const prefCustomers = prefResp?.preferences?.customerColumns || [];

      setStockColumns(stocks);
      setCustomerColumns(customers);
      setSelectedStockColumns(pickColumns(prefStocks, stocks, DEFAULT_STOCK_COLUMNS));
      setSelectedCustomerColumns(pickColumns(prefCustomers, customers, DEFAULT_CUSTOMER_COLUMNS));
    };

    loadMeta();
  }, []);

  useEffect(() => {
    if (accessLoading) return;
    if (mode === 'stocks' && !canSearchStocks && canSearchCustomers) setMode('customers');
    if (mode === 'customers' && !canSearchCustomers && canSearchStocks) setMode('stocks');
  }, [accessLoading, canSearchCustomers, canSearchStocks, mode]);

  const fetchRows = useCallback(async (
    searchMode: SearchMode,
    searchTerm: string,
    limit: number,
    offset = 0,
    forcedVariant?: string
  ) => {
    const variants = forcedVariant ? [forcedVariant] : buildSearchVariants(searchTerm, 4);
    for (const variant of variants) {
      const response =
        searchMode === 'stocks'
          ? await adminApi.searchStocks({ searchTerm: variant, limit, offset })
          : await adminApi.searchCustomers({ searchTerm: variant, limit, offset });
      const rows = response.data || [];
      if (rows.length > 0 || variant === variants[variants.length - 1]) return { rows, variant };
    }
    return { rows: [], variant: searchTerm };
  }, []);

  const enrichCustomerRows = useCallback(async (raw: any[]) => {
    const codesToFetch = raw
      .map((item: any) => getCustomerCode(item))
      .filter(Boolean)
      .slice(0, 20);
    const infoList = await Promise.all(
      codesToFetch.map((code: string) =>
        adminApi
          .getCariInfo(code)
          .then((payload) => ({ code, taxNo: extractTaxNo(payload?.data || payload) }))
          .catch(() => ({ code, taxNo: '' }))
      )
    );
    const taxMap = new Map(infoList.map((item: any) => [item.code, item.taxNo]));
    return raw.map((item: any) => {
      const direct = extractTaxNo(item);
      if (direct) return item;
      const code = getCustomerCode(item);
      const mapped = code ? taxMap.get(code) : '';
      return mapped ? { ...item, 'Vergi No': mapped } : item;
    });
  }, []);

  const doSearch = useCallback(async (searchMode: SearchMode, searchTerm: string, limit = SEARCH_PAGE_SIZE, append = false) => {
    if (searchMode === 'stocks' && !canSearchStocks) {
      setError('Stok arama yetkiniz yok.');
      setResults([]);
      setHasMore(false);
      return;
    }
    if (searchMode === 'customers' && !canSearchCustomers) {
      setError('Cari arama yetkiniz yok.');
      setResults([]);
      setHasMore(false);
      return;
    }
    if (searchMode === 'customers' && !searchTerm.trim()) {
      setError('Cari aramak icin kod veya unvan girin.');
      setResults([]);
      setHasMore(false);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setHasMore(false);
    }
    setError(null);
    try {
      const activeSearch = activeSearchRef.current;
      const offset = append ? results.length : 0;
      const forcedVariant = append && activeSearch?.mode === searchMode && activeSearch.term === searchTerm
        ? activeSearch.variant
        : undefined;
      const { rows: raw, variant } = await fetchRows(searchMode, searchTerm, limit, offset, forcedVariant);
      activeSearchRef.current = { mode: searchMode, term: searchTerm, variant };
      setHasMore(raw.length >= limit);
      if (searchMode === 'stocks') {
        setResults((current) => (append ? [...current, ...raw] : raw));
      } else {
        const enriched = await enrichCustomerRows(raw);
        setResults((current) => (append ? [...current, ...enriched] : enriched));
      }
      hapticLight();
    } catch (err: any) {
      if (!append) setResults([]);
      setHasMore(false);
      setError(getApiErrorMessage(err, 'Arama yapilirken servis hatasi olustu.'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [canSearchCustomers, canSearchStocks, enrichCustomerRows, fetchRows, results.length]);

  const runSearch = useCallback(async () => {
    await doSearch(mode, term.trim());
  }, [doSearch, mode, term]);

  const runAllStocks = useCallback(async () => {
    setMode('stocks');
    setTerm('');
    await doSearch('stocks', '', SEARCH_PAGE_SIZE);
  }, [doSearch]);

  const loadMoreResults = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const activeSearch = activeSearchRef.current;
    if (!activeSearch) return;
    await doSearch(activeSearch.mode, activeSearch.term, SEARCH_PAGE_SIZE, true);
  }, [doSearch, hasMore, loading, loadingMore]);

  useEffect(() => {
    if (!route.params) return;
    if (route.params.mode) setMode(route.params.mode);
    if (typeof route.params.term === 'string') setTerm(route.params.term);
    if (typeof route.params.openColumns === 'boolean') setColumnPickerOpen(route.params.openColumns);

    if (route.params.autoRun && !autoRunDoneRef.current) {
      autoRunDoneRef.current = true;
      const nextMode = route.params.mode || mode;
      const nextTerm = (route.params.term || term).trim();
      doSearch(nextMode, nextTerm);
    }
  }, [doSearch, mode, route.params, term]);

  const selectedColumns = useMemo(
    () => (mode === 'stocks' ? selectedStockColumns : selectedCustomerColumns),
    [mode, selectedStockColumns, selectedCustomerColumns]
  );

  const availableColumns = useMemo(
    () => (mode === 'stocks' ? stockColumns : customerColumns),
    [mode, stockColumns, customerColumns]
  );

  const visibleColumns = useMemo(() => {
    if (mode === 'stocks') {
      return selectedColumns.filter((column) => ![STOCK_GUID_KEY, STOCK_TITLE_KEY, STOCK_CODE_KEY].includes(column));
    }
    return selectedColumns.filter(
      (column) => ![CUSTOMER_GUID_KEY, CUSTOMER_TITLE_KEY, CUSTOMER_CODE_KEY, 'Vergi No'].includes(column)
    );
  }, [mode, selectedColumns]);

  const toggleColumn = async (column: string) => {
    const source = mode === 'stocks' ? selectedStockColumns : selectedCustomerColumns;
    const exists = source.includes(column);
    const next = exists ? source.filter((item) => item !== column) : [...source, column];
    if (next.length === 0) return;

    if (mode === 'stocks') {
      setSelectedStockColumns(next);
    } else {
      setSelectedCustomerColumns(next);
    }

    setSavingColumns(true);
    try {
      await adminApi.updateSearchPreferences(
        mode === 'stocks' ? { stockColumns: next } : { customerColumns: next }
      );
      hapticSuccess();
    } finally {
      setSavingColumns(false);
    }
  };

  if (!accessLoading && modeOptions.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
          <View style={styles.deniedCard}>
          <Text style={styles.title} numberOfLines={1}>Arama</Text>
          <Text style={styles.subtitle} numberOfLines={2}>Stok veya cari arama yetkiniz yok.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        key={`${mode}-${listColumns}`}
        data={results}
        numColumns={listColumns}
        columnWrapperStyle={listColumns > 1 ? styles.columnWrapper : undefined}
        keyExtractor={(item, index) => `${mode}-${mode === 'stocks' ? item?.[STOCK_CODE_KEY] : item?.[CUSTOMER_CODE_KEY]}-${index}`}
        contentContainerStyle={[styles.listContent, isWide && styles.listContentWide]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>Arama</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              Kullanici bazli alan secimi ile Mikro F10 stok/cari arama.
            </Text>
            <View style={styles.segment}>
              {modeOptions.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.segmentButton, mode === item.key && styles.segmentButtonActive]}
                  onPress={() => setMode(item.key)}
                >
                  <Text
                    style={mode === item.key ? styles.segmentTextActive : styles.segmentText}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.toolbarRow}>
              <TouchableOpacity style={styles.columnsToggle} onPress={() => setColumnPickerOpen((prev) => !prev)}>
                <Text style={styles.columnsToggleText} numberOfLines={1}>
                  {columnPickerOpen ? 'Alan secimini gizle' : 'Alan secimini ac'}
                </Text>
              </TouchableOpacity>
              {mode === 'stocks' && (
                <TouchableOpacity style={styles.ghostButton} onPress={runAllStocks} disabled={loading}>
                  <Text style={styles.ghostButtonText} numberOfLines={1}>Tum stoklar</Text>
                </TouchableOpacity>
              )}
            </View>

            {columnPickerOpen && (
              <View style={styles.columnsWrap}>
                {availableColumns.map((column) => {
                  const selected = selectedColumns.includes(column);
                  return (
                    <TouchableOpacity
                      key={column}
                      style={[styles.columnChip, selected && styles.columnChipActive]}
                      onPress={() => toggleColumn(column)}
                      disabled={savingColumns}
                    >
                      <Text
                        style={selected ? styles.columnTextActive : styles.columnText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {displayColumnName(column)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={[styles.row, !isWide && styles.searchRowNarrow]}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder={mode === 'stocks' ? 'Stok kodu veya adi ara' : 'Cari kodu veya unvan ara'}
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
            <View style={styles.resultMetaRow}>
              <Text style={styles.resultMeta} numberOfLines={1}>
                {loading ? 'Araniyor...' : `${results.length} sonuc yuklendi`}
              </Text>
              {!loading && hasMore && <Text style={styles.resultMeta} numberOfLines={1}>Devami var</Text>}
              {savingColumns && <Text style={styles.resultMeta} numberOfLines={1}>Alan tercihi kaydediliyor</Text>}
            </View>
            {error && <Text style={styles.errorText} numberOfLines={3}>{error}</Text>}
          </View>
        }
        renderItem={({ item }) => {
          const title = mode === 'stocks' ? item[STOCK_TITLE_KEY] : item[CUSTOMER_TITLE_KEY];
          const code = mode === 'stocks' ? item[STOCK_CODE_KEY] : item[CUSTOMER_CODE_KEY];
          const taxNo = extractTaxNo(item);
          const card = (
            <>
              <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{toText(title)}</Text>
              <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">{toText(code)}</Text>
              {mode === 'customers' && (
                <View style={[styles.fieldRow, isWide && styles.fieldRowWide]}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>Vergi No</Text>
                  <Text
                    style={[styles.fieldValue, isWide && styles.fieldValueWide]}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {toText(taxNo || '-')}
                  </Text>
                </View>
              )}
              {visibleColumns.map((column) => (
                <View key={`${code}-${column}`} style={[styles.fieldRow, isWide && styles.fieldRowWide]}>
                  <Text style={styles.fieldLabel} numberOfLines={1} ellipsizeMode="tail">{displayColumnName(column)}</Text>
                  <Text
                    style={[styles.fieldValue, isWide && styles.fieldValueWide]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {getColumnValue(column, item)}
                  </Text>
                </View>
              ))}
            </>
          );

          if (mode === 'stocks') {
            return (
              <TouchableOpacity style={[styles.card, isWide && styles.gridItem]} onPress={() => setSelectedStockItem(item)}>
                {card}
              </TouchableOpacity>
            );
          }
          return (
            <View style={[styles.card, isWide && styles.gridItem]}>
              {card}
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
        ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {term.trim() || mode === 'stocks' ? 'Sonuc yok.' : 'Arama yapmak icin bir terim girin.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          results.length ? (
            <View style={styles.footer}>
              {loadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : hasMore ? (
                <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreResults} disabled={loadingMore}>
                  <Text style={styles.loadMoreText}>Daha Fazla Yukle</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.endText}>Listenin sonu</Text>
              )}
            </View>
          ) : null
        }
      />
      <Modal visible={Boolean(selectedStockItem)} transparent animationType="slide" onRequestClose={() => setSelectedStockItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.row}>
              <Text style={styles.title} numberOfLines={1}>Stok Detayi</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setSelectedStockItem(null)}>
                <Text style={styles.primaryButtonText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              {selectedStockItem &&
                Object.keys(selectedStockItem)
                  .filter((key) => key !== STOCK_GUID_KEY)
                  .map((key) => (
                  <View key={key} style={styles.detailFieldRow}>
                    <Text style={styles.fieldLabel} numberOfLines={1} ellipsizeMode="tail">{displayColumnName(key)}</Text>
                    <Text style={styles.detailFieldValue} numberOfLines={4} ellipsizeMode="tail">{getColumnValue(key, selectedStockItem)}</Text>
                  </View>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  listContentWide: {
    paddingHorizontal: spacing.xl * 2,
  },
  columnWrapper: {
    gap: spacing.md,
  },
  header: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    lineHeight: fontSizes.xl + 6,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 5,
    color: '#DDE8FF',
  },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentButton: {
    flex: 1,
    minWidth: 96,
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
    lineHeight: fontSizes.sm + 5,
    color: colors.textMuted,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: '#FFFFFF',
  },
  columnsToggle: {
    alignSelf: 'flex-start',
  },
  columnsToggleText: {
    fontFamily: fonts.medium,
    color: colors.primarySoft,
    fontSize: fontSizes.sm,
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  ghostButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  columnsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  columnChip: {
    maxWidth: '48%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  columnChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  columnText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    lineHeight: fontSizes.xs + 5,
    color: colors.textMuted,
  },
  columnTextActive: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    lineHeight: fontSizes.xs + 5,
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  searchRowNarrow: {
    alignItems: 'stretch',
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
    minWidth: 0,
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
  resultMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  resultMeta: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
  deniedCard: {
    margin: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  gridItem: {
    flex: 1,
    minWidth: 340,
  },
  cardTitle: {
    minWidth: 0,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    lineHeight: fontSizes.md + 5,
    color: colors.text,
  },
  cardMeta: {
    minWidth: 0,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  fieldRow: {
    flexDirection: 'column',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  fieldRowWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  fieldLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    lineHeight: fontSizes.xs + 5,
    color: colors.textMuted,
  },
  fieldValue: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    lineHeight: fontSizes.xs + 5,
    color: colors.text,
    textAlign: 'left',
  },
  fieldValueWide: {
    textAlign: 'right',
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
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadMoreButton: {
    minWidth: 180,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadMoreText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  endText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '78%',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
  detailFieldRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  detailFieldValue: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: colors.text,
  },
});

