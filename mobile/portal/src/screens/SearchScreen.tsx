import { useEffect, useMemo, useState } from 'react';
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
import { hapticLight, hapticSuccess } from '../utils/haptics';

type SearchMode = 'stocks' | 'customers';

const STOCK_TITLE_KEY = 'msg_S_0870';
const STOCK_CODE_KEY = 'msg_S_0078';
const CUSTOMER_TITLE_KEY = 'msg_S_1033';
const CUSTOMER_CODE_KEY = 'msg_S_1032';

const toText = (value: any) => {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
};

export function SearchScreen() {
  const [mode, setMode] = useState<SearchMode>('stocks');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [stockColumns, setStockColumns] = useState<string[]>([]);
  const [customerColumns, setCustomerColumns] = useState<string[]>([]);
  const [selectedStockColumns, setSelectedStockColumns] = useState<string[]>([]);
  const [selectedCustomerColumns, setSelectedCustomerColumns] = useState<string[]>([]);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);

  useEffect(() => {
    const loadMeta = async () => {
      const [stockResp, customerResp, prefResp] = await Promise.all([
        adminApi.getStockColumns().catch(() => ({ columns: [] as string[] })),
        adminApi.getCustomerColumns().catch(() => ({ columns: [] as string[] })),
        adminApi.getSearchPreferences().catch(() => null),
      ]);

      const stocks = stockResp.columns || [];
      const customers = customerResp.columns || [];
      const prefStocks = prefResp?.preferences?.stockColumns || [];
      const prefCustomers = prefResp?.preferences?.customerColumns || [];

      setStockColumns(stocks);
      setCustomerColumns(customers);
      setSelectedStockColumns(
        prefStocks.filter((item: string) => stocks.includes(item)).length > 0
          ? prefStocks.filter((item: string) => stocks.includes(item))
          : stocks.slice(0, Math.min(5, stocks.length))
      );
      setSelectedCustomerColumns(
        prefCustomers.filter((item: string) => customers.includes(item)).length > 0
          ? prefCustomers.filter((item: string) => customers.includes(item))
          : customers.slice(0, Math.min(5, customers.length))
      );
    };

    loadMeta();
  }, []);

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
      hapticLight();
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

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
      return selectedColumns.filter((column) => ![STOCK_TITLE_KEY, STOCK_CODE_KEY].includes(column));
    }
    return selectedColumns.filter((column) => ![CUSTOMER_TITLE_KEY, CUSTOMER_CODE_KEY].includes(column));
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={results}
        keyExtractor={(_, index) => `${mode}-${index}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Arama</Text>
            <Text style={styles.subtitle}>Kullanici bazli alan secimi ile stok/cari arama.</Text>
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

            <TouchableOpacity style={styles.columnsToggle} onPress={() => setColumnPickerOpen((prev) => !prev)}>
              <Text style={styles.columnsToggleText}>
                {columnPickerOpen ? 'Alan secimini gizle' : 'Alan secimini ac'}
              </Text>
            </TouchableOpacity>

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
                      <Text style={selected ? styles.columnTextActive : styles.columnText}>{column}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

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
        renderItem={({ item }) => {
          const title = mode === 'stocks' ? item[STOCK_TITLE_KEY] : item[CUSTOMER_TITLE_KEY];
          const code = mode === 'stocks' ? item[STOCK_CODE_KEY] : item[CUSTOMER_CODE_KEY];
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{toText(title)}</Text>
              <Text style={styles.cardMeta}>{toText(code)}</Text>
              {visibleColumns.map((column) => (
                <View key={`${code}-${column}`} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{column}</Text>
                  <Text style={styles.fieldValue}>{toText(item[column])}</Text>
                </View>
              ))}
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
  columnsToggle: {
    alignSelf: 'flex-start',
  },
  columnsToggleText: {
    fontFamily: fonts.medium,
    color: colors.primary,
    fontSize: fontSizes.sm,
  },
  columnsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  columnChip: {
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
    color: colors.textMuted,
  },
  columnTextActive: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
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
    gap: spacing.xs,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  fieldValue: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.text,
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
});
