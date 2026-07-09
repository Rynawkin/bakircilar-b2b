import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { adminApi } from '../api/admin';
import { Agreement, Customer, Product } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

type AgreementImportRow = {
  mikroCode: string;
  priceInvoiced: number;
  priceWhite: number;
  minQuantity?: number;
  validFrom?: string | null;
  validTo?: string | null;
};

const parseNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  let str = String(value).trim();
  if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d+$/.test(str)) {
    str = str.replace(',', '.');
  } else if (/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(str)) {
    str = str.replace(/,/g, '');
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDateValue = (value: any) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length === 3) {
    const [day, month, year] = parts.map((part) => Number(part));
    if (day && month && year) {
      const date = new Date(Date.UTC(year, month - 1, day));
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    }
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const findColumnIndex = (headers: any[], candidates: string[]) => {
  const normalized = headers.map((header) => String(header || '').toLowerCase().trim());
  return normalized.findIndex((header) =>
    candidates.some((candidate) => header.includes(candidate))
  );
};

const buildDefaultDate = () => new Date().toISOString().slice(0, 10);
const CUSTOMER_SEARCH_PAGE_SIZE = 40;

export function CustomerAgreementsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 820;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPagination, setCustomerPagination] = useState<{ total: number; page: number; pageSize: number; totalPages: number } | null>(null);
  const [loadingMoreCustomers, setLoadingMoreCustomers] = useState(false);
  const [hasMoreCustomers, setHasMoreCustomers] = useState(false);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [agreementSearch, setAgreementSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [priceInvoiced, setPriceInvoiced] = useState('');
  const [priceWhite, setPriceWhite] = useState('');
  const [minQuantity, setMinQuantity] = useState('1');
  const [validFrom, setValidFrom] = useState(buildDefaultDate());
  const [validTo, setValidTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const savingRef = useRef(false);
  const importingRef = useRef(false);
  const customerRequestSeqRef = useRef(0);
  const [importFile, setImportFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    failed: number;
    results: Array<{ mikroCode: string; status: string; reason?: string }>;
  } | null>(null);

  const resetAgreementForm = () => {
    setSelectedProduct(null);
    setPriceInvoiced('');
    setPriceWhite('');
    setMinQuantity('1');
    setValidFrom(buildDefaultDate());
    setValidTo('');
  };

  const beginSaving = () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };

  const endSaving = () => {
    savingRef.current = false;
    setSaving(false);
  };

  const beginImporting = () => {
    if (importingRef.current) return false;
    importingRef.current = true;
    setImporting(true);
    return true;
  };

  const endImporting = () => {
    importingRef.current = false;
    setImporting(false);
  };

  const loadCustomers = async (append = false, searchOverride?: string) => {
    const requestSeq = ++customerRequestSeqRef.current;
    if (append) {
      setLoadingMoreCustomers(true);
    } else {
      setLoading(true);
    }
    try {
      const nextPage = append ? (customerPagination?.page || Math.max(1, Math.ceil(customers.length / CUSTOMER_SEARCH_PAGE_SIZE))) + 1 : 1;
      const response = await adminApi.getCustomers({
        search: (searchOverride ?? customerSearch).trim() || undefined,
        page: nextPage,
        pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
      });
      if (requestSeq !== customerRequestSeqRef.current) return;
      const nextCustomers = response.customers || [];
      const nextPagination = response.pagination || {
        total: nextCustomers.length,
        page: nextPage,
        pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
        totalPages: nextCustomers.length >= CUSTOMER_SEARCH_PAGE_SIZE ? nextPage + 1 : nextPage,
      };
      setCustomerPagination(nextPagination);
      setHasMoreCustomers(response.pagination ? nextPagination.page < nextPagination.totalPages : nextCustomers.length >= CUSTOMER_SEARCH_PAGE_SIZE);
      setCustomers((current) => {
        if (!append) return nextCustomers;
        const byId = new Map<string, Customer>();
        current.forEach((customer) => byId.set(customer.id, customer));
        nextCustomers.forEach((customer) => byId.set(customer.id, customer));
        return Array.from(byId.values());
      });
    } catch (err) {
      if (requestSeq !== customerRequestSeqRef.current) return;
      Alert.alert('Hata', 'Musteriler yuklenemedi.');
    } finally {
      if (requestSeq === customerRequestSeqRef.current) {
        setLoading(false);
        setLoadingMoreCustomers(false);
      }
    }
  };

  const fetchAgreements = async () => {
    if (!selectedCustomer) return;
    try {
      const response = await adminApi.getAgreements(selectedCustomer.id, agreementSearch.trim() || undefined);
      setAgreements(response.agreements || []);
    } catch (err) {
      setAgreements([]);
    }
  };

  const fetchProducts = async () => {
    const term = productSearch.trim();
    if (!term) {
      setProductResults([]);
      return;
    }
    try {
      const response = await adminApi.getProducts({ search: term, page: 1, limit: 15 });
      setProductResults(response.products || []);
    } catch (err) {
      setProductResults([]);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(false, customerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    if (!selectedCustomer) {
      setAgreements([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchAgreements();
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedCustomer, agreementSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  const handleSelectAgreement = (agreement: Agreement) => {
    setSelectedProduct({
      id: agreement.productId,
      name: agreement.product?.name || agreement.productName || agreement.mikroCode || 'Urun',
      mikroCode: agreement.product?.mikroCode || agreement.mikroCode || '',
    });
    setPriceInvoiced(String(agreement.priceInvoiced));
    setPriceWhite(String(agreement.priceWhite));
    setMinQuantity(String(agreement.minQuantity || 1));
    setValidFrom(agreement.validFrom?.slice?.(0, 10) || buildDefaultDate());
    setValidTo(agreement.validTo?.slice?.(0, 10) || '');
  };

  const saveAgreement = async () => {
    if (savingRef.current) return;
    if (!selectedCustomer || !selectedProduct) {
      Alert.alert('Eksik Bilgi', 'Musteri ve urun secin.');
      return;
    }
    if (!priceInvoiced || !priceWhite) {
      Alert.alert('Eksik Bilgi', 'Fiyatlari girin.');
      return;
    }
    if (!beginSaving()) return;
    try {
      await adminApi.upsertAgreement({
        customerId: selectedCustomer.id,
        productId: selectedProduct.id,
        priceInvoiced: Number(priceInvoiced),
        priceWhite: Number(priceWhite),
        minQuantity: Number(minQuantity) || 1,
        validFrom: validFrom || undefined,
        validTo: validTo || null,
      });
      Alert.alert('Basarili', 'Anlasma kaydedildi.');
      resetAgreementForm();
      await fetchAgreements();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Anlasma kaydedilemedi.'));
    } finally {
      endSaving();
    }
  };

  const deleteAgreement = async (agreementId: string) => {
    if (savingRef.current) return;
    Alert.alert('Sil', 'Anlasmayi silmek istiyor musunuz?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!beginSaving()) return;
          try {
            await adminApi.deleteAgreement(agreementId);
            await fetchAgreements();
          } catch (err: any) {
            Alert.alert('Hata', getApiErrorMessage(err, 'Silme basarisiz.'));
          } finally {
            endSaving();
          }
        },
      },
    ]);
  };

  const pickImportFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;
    setImportFile(result.assets[0]);
    setImportSummary(null);
  };

  const parseImportFile = async (asset: DocumentPicker.DocumentPickerAsset) => {
    if (!FileSystem.cacheDirectory) {
      throw new Error('Cihazda dosya dizini bulunamadi.');
    }
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const workbook = XLSX.read(base64, { type: 'base64', cellDates: true });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[];
    if (data.length < 2) {
      throw new Error('Excel bos gorunuyor.');
    }
    const headers = data[0] || [];
    const codeIndex = findColumnIndex(headers, ['mikro kod', 'stok kod', 'stok kodu', 'urun kod', 'urun kodu', 'urun']);
    const invoicedIndex = findColumnIndex(headers, ['faturali fiyat', 'faturali', 'invoiced']);
    const whiteIndex = findColumnIndex(headers, ['beyaz fiyat', 'beyaz', 'white']);
    const minQtyIndex = findColumnIndex(headers, ['min miktar', 'minimum miktar', 'min qty']);
    const validFromIndex = findColumnIndex(headers, ['baslangic', 'gecerlilik baslangic', 'valid from']);
    const validToIndex = findColumnIndex(headers, ['bitis', 'gecerlilik bitis', 'valid to']);

    if (codeIndex === -1 || invoicedIndex === -1 || whiteIndex === -1) {
      throw new Error('Mikro kod, faturali fiyat ve beyaz fiyat kolonlari zorunludur.');
    }

    const rows: AgreementImportRow[] = [];
    for (let i = 1; i < data.length; i += 1) {
      const row = data[i];
      const mikroCode = String(row[codeIndex] || '').trim();
      if (!mikroCode) continue;
      rows.push({
        mikroCode,
        priceInvoiced: parseNumber(row[invoicedIndex]),
        priceWhite: parseNumber(row[whiteIndex]),
        minQuantity: minQtyIndex !== -1 ? parseNumber(row[minQtyIndex]) : 1,
        validFrom: validFromIndex !== -1 ? parseDateValue(row[validFromIndex]) : null,
        validTo: validToIndex !== -1 ? parseDateValue(row[validToIndex]) : null,
      });
    }

    if (rows.length === 0) {
      throw new Error('Islenecek satir bulunamadi.');
    }
    return rows;
  };

  const runImport = async () => {
    if (importingRef.current) return;
    if (!selectedCustomer) {
      Alert.alert('Eksik Bilgi', 'Once musteri secin.');
      return;
    }
    if (!importFile) {
      Alert.alert('Eksik Bilgi', 'Dosya secin.');
      return;
    }
    if (!beginImporting()) return;
    setImportSummary(null);
    try {
      const rows = await parseImportFile(importFile);
      const result = await adminApi.importAgreements({ customerId: selectedCustomer.id, rows });
      setImportSummary(result);
      Alert.alert('Basarili', 'Excel aktarimi tamamlandi.');
      await fetchAgreements();
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Excel aktarimi basarisiz.'));
    } finally {
      endImporting();
    }
  };

  const shareTemplate = async () => {
    if (!FileSystem.cacheDirectory) {
      Alert.alert('Hata', 'Dosya klasoru bulunamadi.');
      return;
    }
    const rows = [
      ['Mikro Kod', 'Faturali Fiyat', 'Beyaz Fiyat', 'Min Miktar', 'Baslangic', 'Bitis'],
      ['B101996', '86,69', '76,61', '1', buildDefaultDate(), ''],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Anlasmalar');
    const fileName = `anlasma-sablon-${buildDefaultDate()}.xlsx`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Anlasma Sablonu',
      });
    } else {
      const fallbackDirectory = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(fallbackDirectory, { intermediates: true });
      const fallbackUri = `${fallbackDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: fileUri, to: fallbackUri });
      Alert.alert('Sablon Hazir', `Paylasim desteklenmiyor. Dosya uygulama belgelerine kaydedildi: ${fileName}`);
    }
  };

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
      <ScrollView contentContainerStyle={[styles.container, isTablet && styles.containerTablet]}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Cari Fiyat Kontrolu</Text>
          <Text style={styles.title}>Anlasmali Fiyatlar</Text>
          <Text style={styles.subtitle}>Musteri bazli sabit fiyatlar, Excel aktarimi ve urun arama ayni ekranda.</Text>
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Cari</Text>
              <Text style={styles.heroMetricValue}>{customerPagination?.total ?? customers.length}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Yuklu</Text>
              <Text style={styles.heroMetricValue}>{customers.length}</Text>
            </View>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>Anlasma</Text>
              <Text style={styles.heroMetricValue}>{agreements.length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Musteri Secimi</Text>
          <TextInput
            style={styles.input}
            placeholder="Musteri ara"
            placeholderTextColor={colors.textMuted}
            value={customerSearch}
            onChangeText={setCustomerSearch}
            onSubmitEditing={() => loadCustomers(false, customerSearch)}
            returnKeyType="search"
          />
          <View style={styles.listBlock}>
            {customers.map((customer) => (
              <TouchableOpacity
                key={customer.id}
                style={[
                  styles.listItem,
                  selectedCustomer?.id === customer.id && styles.listItemActive,
                ]}
                onPress={() => {
                  setSelectedCustomer(customer);
                  resetAgreementForm();
                  setAgreementSearch('');
                  setProductSearch('');
                  setImportSummary(null);
                }}
              >
                <Text style={styles.listItemTitle}>{customer.name}</Text>
                <Text style={styles.listItemMeta}>{customer.mikroCariCode || '-'}</Text>
              </TouchableOpacity>
            ))}
            {customers.length === 0 && <Text style={styles.helper}>Musteri bulunamadi.</Text>}
            {loadingMoreCustomers ? (
              <ActivityIndicator color={colors.primary} />
            ) : hasMoreCustomers ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={() => loadCustomers(true, customerSearch)}
                disabled={loadingMoreCustomers}
              >
                <Text style={styles.loadMoreText}>
                  Daha Fazla Yukle
                  {customerPagination ? ` (${customers.length}/${customerPagination.total})` : ''}
                </Text>
              </TouchableOpacity>
            ) : customers.length > 0 ? (
              <Text style={styles.helper}>Gosterilen: {customers.length}{customerPagination ? ` / ${customerPagination.total}` : ''}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Anlasma Listesi</Text>
          <TextInput
            style={styles.input}
            placeholder="Urun ara"
            placeholderTextColor={colors.textMuted}
            value={agreementSearch}
            onChangeText={setAgreementSearch}
          />
          {agreements.map((agreement) => {
            const productName = agreement.product?.name || agreement.productName || agreement.mikroCode || '-';
            const productCode = agreement.product?.mikroCode || agreement.mikroCode || '-';
            return (
              <TouchableOpacity
                key={agreement.id}
                style={styles.itemCard}
                onPress={() => handleSelectAgreement(agreement)}
              >
                <Text style={styles.itemTitle}>{productName}</Text>
                <Text style={styles.itemMeta}>Kod: {productCode}</Text>
                <Text style={styles.itemMeta}>Faturali: {agreement.priceInvoiced}</Text>
                <Text style={styles.itemMeta}>Beyaz: {agreement.priceWhite}</Text>
                <Text style={styles.itemMeta}>Min: {agreement.minQuantity || 1}</Text>
                {agreement.validFrom && (
                  <Text style={styles.itemMeta}>Baslangic: {agreement.validFrom.slice(0, 10)}</Text>
                )}
                {agreement.validTo && (
                  <Text style={styles.itemMeta}>Bitis: {agreement.validTo.slice(0, 10)}</Text>
                )}
                <TouchableOpacity onPress={() => deleteAgreement(agreement.id)}>
                  <Text style={styles.removeText}>Sil</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
          {agreements.length === 0 && (
            <Text style={styles.helper}>Anlasma bulunamadi.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Anlasma Ekle / Guncelle</Text>
          <TextInput
            style={styles.input}
            placeholder="Urun ara"
            placeholderTextColor={colors.textMuted}
            value={productSearch}
            onChangeText={setProductSearch}
          />
          <View style={styles.listBlock}>
            {productResults.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={[
                  styles.listItem,
                  selectedProduct?.id === product.id && styles.listItemActive,
                ]}
                onPress={() => setSelectedProduct(product)}
              >
                <Text style={styles.listItemTitle}>{product.name}</Text>
                <Text style={styles.listItemMeta}>{product.mikroCode}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Faturali fiyat"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={priceInvoiced}
            onChangeText={setPriceInvoiced}
          />
          <TextInput
            style={styles.input}
            placeholder="Beyaz fiyat"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={priceWhite}
            onChangeText={setPriceWhite}
          />
          <TextInput
            style={styles.input}
            placeholder="Min miktar"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            value={minQuantity}
            onChangeText={setMinQuantity}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.smallInput]}
              placeholder="Baslangic (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={validFrom}
              onChangeText={setValidFrom}
            />
            <TextInput
              style={[styles.input, styles.smallInput]}
              placeholder="Bitis (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              value={validTo}
              onChangeText={setValidTo}
            />
          </View>
          <View style={styles.row}>
          <TouchableOpacity style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={saveAgreement} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
          </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={resetAgreementForm}>
              <Text style={styles.secondaryButtonText}>Temizle</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Excel Aktarimi</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={shareTemplate}>
            <Text style={styles.secondaryButtonText}>Sablon Paylas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickImportFile}>
            <Text style={styles.secondaryButtonText}>
              {importFile ? `Secilen: ${importFile.name}` : 'Dosya Sec'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryButton, importing && styles.buttonDisabled]} onPress={runImport} disabled={importing}>
            <Text style={styles.primaryButtonText}>{importing ? 'Aktariliyor...' : 'Aktar'}</Text>
          </TouchableOpacity>
          {importSummary && (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>Aktarilan: {importSummary.imported}</Text>
              <Text style={styles.summaryText}>Hata: {importSummary.failed}</Text>
              {importSummary.results.slice(0, 4).map((item, index) => (
                <Text key={`${item.mikroCode}-${index}`} style={styles.summaryText}>
                  {item.mikroCode || '-'}: {item.reason || item.status}
                </Text>
              ))}
            </View>
          )}
        </View>
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
  containerTablet: {
    maxWidth: 1180,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.xl,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: '#DCEAFE',
    lineHeight: 22,
  },
  heroMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroMetric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  heroMetricLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFDBFE',
  },
  heroMetricValue: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.lg,
    color: '#FFFFFF',
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
    fontSize: fontSizes.md,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  smallInput: {
    flex: 1,
    minWidth: 150,
  },
  listBlock: {
    gap: spacing.sm,
  },
  listItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItemActive: {
    borderColor: colors.primary,
  },
  listItemTitle: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  listItemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  loadMoreButton: {
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loadMoreText: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
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
  removeText: {
    fontFamily: fonts.medium,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  helper: {
    fontFamily: fonts.regular,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    flex: 1,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  summaryBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
});
