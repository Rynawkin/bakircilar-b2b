import { useEffect, useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type Supplier = { id: string; name: string };
type StatusKey = 'matched' | 'unmatched' | 'multiple' | 'suspicious';

const STATUS_TABS: Array<{ id: StatusKey; label: string }> = [
  { id: 'matched', label: 'Eslesenler' },
  { id: 'unmatched', label: 'Esmeyenler' },
  { id: 'multiple', label: 'Coklu' },
  { id: 'suspicious', label: 'Supheli' },
];

export function SupplierPriceListsScreen() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [activeUpload, setActiveUpload] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Array<{ uri: string; name?: string; mimeType?: string }>>([]);
  const [preview, setPreview] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [excelSheetName, setExcelSheetName] = useState('');
  const [excelHeaderRow, setExcelHeaderRow] = useState('');
  const [excelCodeHeader, setExcelCodeHeader] = useState('');
  const [excelNameHeader, setExcelNameHeader] = useState('');
  const [excelPriceHeader, setExcelPriceHeader] = useState('');
  const [pdfPriceIndex, setPdfPriceIndex] = useState('');
  const [pdfCodePattern, setPdfCodePattern] = useState('');

  const [activeStatus, setActiveStatus] = useState<StatusKey>('matched');

  const resetPreview = () => {
    setPreview(null);
    setExcelSheetName('');
    setExcelHeaderRow('');
    setExcelCodeHeader('');
    setExcelNameHeader('');
    setExcelPriceHeader('');
    setPdfPriceIndex('');
    setPdfCodePattern('');
  };

  const loadSuppliers = async () => {
    try {
      const response = await adminApi.getSupplierPriceListSuppliers();
      setSuppliers(response.suppliers || []);
    } catch {
      setSuppliers([]);
    }
  };

  const loadUploads = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getSupplierPriceListUploads({ page: 1, limit: 25 });
      const nextUploads = response.uploads || [];
      setUploads(nextUploads);
      if (!activeUploadId && nextUploads.length > 0) {
        setActiveUploadId(nextUploads[0].id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Gecmis yuklemeler alinamadi.');
    } finally {
      setLoading(false);
    }
  };

  const loadUploadDetail = async (uploadId: string) => {
    try {
      const response = await adminApi.getSupplierPriceListUpload(uploadId);
      setActiveUpload(response.upload || null);
    } catch {
      setActiveUpload(null);
    }
  };

  const loadItems = async (uploadId: string, status: StatusKey) => {
    setItemsLoading(true);
    try {
      const response = await adminApi.getSupplierPriceListItems({
        uploadId,
        status,
        page: 1,
        limit: 100,
      });
      setItems(response.items || []);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadUploads();
  }, []);

  useEffect(() => {
    if (!activeUploadId) return;
    loadUploadDetail(activeUploadId);
    loadItems(activeUploadId, activeStatus);
  }, [activeUploadId, activeStatus]);

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    });
    if (result.canceled || !result.assets?.length) return;
    const files = result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || undefined,
    }));
    setSelectedFiles(files);
    resetPreview();
  };

  const buildOverrides = () => {
    const numericHeader = Number(excelHeaderRow);
    const numericPdfIndex = Number(pdfPriceIndex);
    return {
      excelSheetName: excelSheetName.trim() || null,
      excelHeaderRow: Number.isFinite(numericHeader) && numericHeader > 0 ? numericHeader : null,
      excelCodeHeader: excelCodeHeader.trim() || null,
      excelNameHeader: excelNameHeader.trim() || null,
      excelPriceHeader: excelPriceHeader.trim() || null,
      pdfPriceIndex: Number.isFinite(numericPdfIndex) && numericPdfIndex >= 0 ? numericPdfIndex : null,
      pdfCodePattern: pdfCodePattern.trim() || null,
    };
  };

  const fetchPreview = async () => {
    if (!selectedSupplierId || selectedFiles.length === 0) return;
    setPreviewLoading(true);
    try {
      const response = await adminApi.previewSupplierPriceLists({
        supplierId: selectedSupplierId,
        files: selectedFiles,
        overrides: buildOverrides(),
      });
      setPreview(response || null);
      if (response?.excel) {
        setExcelSheetName(response.excel.sheetName || '');
        setExcelHeaderRow(response.excel.headerRow ? String(response.excel.headerRow) : '');
        setExcelCodeHeader(response.excel.detected?.code || '');
        setExcelNameHeader(response.excel.detected?.name || '');
        setExcelPriceHeader(response.excel.detected?.price || '');
      }
      if (response?.pdf) {
        setPdfPriceIndex(
          response.pdf.detected?.priceIndex !== null && response.pdf.detected?.priceIndex !== undefined
            ? String(response.pdf.detected.priceIndex)
            : ''
        );
        setPdfCodePattern(response.pdf.codePattern || '');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Onizleme alinamadi.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const uploadFiles = async () => {
    if (!selectedSupplierId || selectedFiles.length === 0) return;
    if (!preview) return;
    setUploading(true);
    try {
      const response = await adminApi.uploadSupplierPriceLists({
        supplierId: selectedSupplierId,
        files: selectedFiles,
        overrides: buildOverrides(),
      });
      setSelectedFiles([]);
      resetPreview();
      await loadUploads();
      if (response.uploadId) {
        setActiveUploadId(response.uploadId);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Yukleme basarisiz.');
    } finally {
      setUploading(false);
    }
  };

  const formatCurrency = (value?: number | null) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(_, index) => `${activeUploadId || 'upload'}-${activeStatus}-${index}`}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Tedarikci Fiyat Karsilastirma</Text>
              <Text style={styles.subtitle}>Excel/PDF listelerini yukleyip eslesmeleri inceleyin.</Text>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Yeni Liste Yukle</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supplierRow}>
                  {suppliers.map((supplier) => (
                    <TouchableOpacity
                      key={supplier.id}
                      style={[
                        styles.supplierChip,
                        selectedSupplierId === supplier.id && styles.supplierChipActive,
                      ]}
                      onPress={() => {
                        setSelectedSupplierId(supplier.id);
                        resetPreview();
                      }}
                    >
                      <Text
                        style={selectedSupplierId === supplier.id ? styles.supplierChipTextActive : styles.supplierChipText}
                      >
                        {supplier.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity style={styles.secondaryButton} onPress={pickFiles}>
                  <Text style={styles.secondaryButtonText}>
                    {selectedFiles.length > 0 ? `${selectedFiles.length} dosya secildi` : 'Dosya Sec'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.gridRow}>
                  <TextInput
                    style={[styles.input, styles.gridInput]}
                    placeholder="Sheet adi"
                    placeholderTextColor={colors.textMuted}
                    value={excelSheetName}
                    onChangeText={setExcelSheetName}
                  />
                  <TextInput
                    style={[styles.input, styles.gridInput]}
                    placeholder="Baslik satiri"
                    placeholderTextColor={colors.textMuted}
                    value={excelHeaderRow}
                    onChangeText={setExcelHeaderRow}
                  />
                </View>
                <View style={styles.gridRow}>
                  <TextInput
                    style={[styles.input, styles.gridInput]}
                    placeholder="Kod basligi"
                    placeholderTextColor={colors.textMuted}
                    value={excelCodeHeader}
                    onChangeText={setExcelCodeHeader}
                  />
                  <TextInput
                    style={[styles.input, styles.gridInput]}
                    placeholder="Urun adi basligi"
                    placeholderTextColor={colors.textMuted}
                    value={excelNameHeader}
                    onChangeText={setExcelNameHeader}
                  />
                </View>
                <View style={styles.gridRow}>
                  <TextInput
                    style={[styles.input, styles.gridInput]}
                    placeholder="Fiyat basligi"
                    placeholderTextColor={colors.textMuted}
                    value={excelPriceHeader}
                    onChangeText={setExcelPriceHeader}
                  />
                  <TextInput
                    style={[styles.input, styles.gridInput]}
                    placeholder="PDF fiyat kolon no"
                    placeholderTextColor={colors.textMuted}
                    value={pdfPriceIndex}
                    onChangeText={setPdfPriceIndex}
                  />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="PDF kod regex (opsiyonel)"
                  placeholderTextColor={colors.textMuted}
                  value={pdfCodePattern}
                  onChangeText={setPdfCodePattern}
                />

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, (!selectedSupplierId || selectedFiles.length === 0) && styles.buttonDisabled]}
                    onPress={fetchPreview}
                    disabled={!selectedSupplierId || selectedFiles.length === 0 || previewLoading || uploading}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {previewLoading ? 'Onizleme...' : 'Onizleme Al'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, (!preview || uploading || previewLoading) && styles.buttonDisabled]}
                    onPress={uploadFiles}
                    disabled={!preview || uploading || previewLoading}
                  >
                    <Text style={styles.primaryButtonText}>{uploading ? 'Yukleniyor...' : 'Yukle'}</Text>
                  </TouchableOpacity>
                </View>

                {preview && (
                  <View style={styles.previewWrap}>
                    <Text style={styles.previewTitle}>Onizleme Ozeti</Text>
                    {preview.excel && (
                      <Text style={styles.previewText}>
                        Excel: {preview.excel.sheetName || '-'} | Header: {preview.excel.headerRow || '-'}
                      </Text>
                    )}
                    {preview.pdf && (
                      <Text style={styles.previewText}>
                        PDF: Kod regex {preview.pdf.codePattern || '-'} | Fiyat kolonu {preview.pdf.detected?.priceIndex ?? '-'}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Gecmis Yuklemeler</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.uploadRow}>
                  {uploads.map((upload) => (
                    <TouchableOpacity
                      key={upload.id}
                      style={[styles.uploadCard, activeUploadId === upload.id && styles.uploadCardActive]}
                      onPress={() => setActiveUploadId(upload.id)}
                    >
                      <Text style={styles.uploadName}>{upload.supplier?.name || 'Tedarikci'}</Text>
                      <Text style={styles.uploadMeta}>
                        Toplam: {upload.totalItems} | Eslesen: {upload.matchedItems}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {activeUpload && (
                  <View style={styles.activeUploadInfo}>
                    <Text style={styles.previewText}>Durum: {activeUpload.status || '-'}</Text>
                    <Text style={styles.previewText}>Olusturma: {activeUpload.createdAt?.slice?.(0, 19) || '-'}</Text>
                    <Text style={styles.previewText}>Toplam Satir: {activeUpload.totalItems || 0}</Text>
                  </View>
                )}
                <View style={styles.statusTabs}>
                  {STATUS_TABS.map((tab) => (
                    <TouchableOpacity
                      key={tab.id}
                      style={[styles.statusTab, activeStatus === tab.id && styles.statusTabActive]}
                      onPress={() => setActiveStatus(tab.id)}
                    >
                      <Text style={activeStatus === tab.id ? styles.statusTabTextActive : styles.statusTabText}>
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {error && <Text style={styles.error}>{error}</Text>}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.supplierName || '-'}</Text>
              <Text style={styles.itemMeta}>Kod: {item.supplierCode || '-'}</Text>
              <Text style={styles.itemMeta}>Liste: {formatCurrency(item.sourcePrice)}</Text>
              <Text style={styles.itemMeta}>Net: {formatCurrency(item.netPrice)}</Text>
              {item.productCode && <Text style={styles.itemMeta}>B2B Kod: {item.productCode}</Text>}
              {item.productName && <Text style={styles.itemMeta}>B2B Urun: {item.productName}</Text>}
              {item.percentDifference !== undefined && (
                <Text style={styles.itemMeta}>Fark %: {Number(item.percentDifference).toFixed(2)}%</Text>
              )}
              {Array.isArray(item.matchedProductCodes) && item.matchedProductCodes.length > 0 && (
                <Text style={styles.itemMeta}>Eslesenler: {item.matchedProductCodes.join(', ')}</Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            itemsLoading ? (
              <View style={styles.empty}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Kayit yok.</Text>
              </View>
            )
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
    gap: spacing.md,
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  supplierRow: {
    gap: spacing.xs,
  },
  supplierChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceAlt,
  },
  supplierChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  supplierChipText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: colors.text,
  },
  supplierChipTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gridInput: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
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
  buttonDisabled: {
    opacity: 0.65,
  },
  previewWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  previewTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  previewText: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  uploadRow: {
    gap: spacing.xs,
  },
  uploadCard: {
    width: 190,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  uploadCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#E8EEF8',
  },
  uploadName: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  uploadMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  activeUploadInfo: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.sm,
  },
  statusTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusTab: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  statusTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusTabText: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  statusTabTextActive: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.xs,
    color: '#FFFFFF',
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  itemMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
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
