import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Buffer } from 'buffer';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { adminApi } from '../api/admin';
import { apiClient } from '../api/client';
import { getAuthToken } from '../storage/auth';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { EInvoiceDocument } from '../types';
import { getApiErrorMessage } from '../utils/errors';
import { includesSearch } from '../utils/search';

type CariOption = {
  code: string;
  name: string;
  sectorCode?: string;
  balance?: number;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type UploadResult = {
  uploaded: number;
  updated: number;
  failed: number;
  results: Array<{ invoiceNo: string; status: string; message?: string }>;
};

const money = (value?: number | null, currency = 'TRY') => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
};

const statusMeta = (status?: string) => {
  if (status === 'MATCHED') return { label: 'Eslesti', color: colors.success, bg: colors.successSoft };
  if (status === 'PARTIAL') return { label: 'Kismi', color: colors.warning, bg: colors.warningSoft };
  if (status === 'NOT_FOUND') return { label: 'Eslesmedi', color: colors.danger, bg: colors.dangerSoft };
  return { label: status || 'Bilinmiyor', color: colors.textSoft, bg: colors.surfaceAlt };
};

export function EInvoicesScreen() {
  const [documents, setDocuments] = useState<EInvoiceDocument[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCari, setSelectedCari] = useState<CariOption | null>(null);
  const [cariList, setCariList] = useState<CariOption[]>([]);
  const [cariSearch, setCariSearch] = useState('');
  const [cariModalOpen, setCariModalOpen] = useState(false);
  const [cariLoading, setCariLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingBulk, setDownloadingBulk] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const uploadingRef = useRef(false);
  const downloadingBulkRef = useRef(false);
  const downloadingIdRef = useRef<string | null>(null);

  const fetchDocuments = async (page = 1) => {
    setLoading(true);
    try {
      const response = await adminApi.getEInvoices({
        search: search.trim() || undefined,
        invoicePrefix: invoicePrefix.trim() || undefined,
        customerCode: selectedCari?.code || undefined,
        fromDate: fromDate.trim() || undefined,
        toDate: toDate.trim() || undefined,
        page,
        limit: pagination.limit,
      });
      setDocuments(response.documents || []);
      setPagination(response.pagination || { page, limit: pagination.limit, total: 0, totalPages: 1 });
      setSelectedIds(new Set());
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'E-fatura listesi yuklenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocuments(1);
  }, []);

  const openCariPicker = async () => {
    setCariModalOpen(true);
    if (cariList.length > 0 || cariLoading) return;
    setCariLoading(true);
    try {
      const response = await adminApi.getCariList();
      setCariList((response.cariList || []).map((item) => ({
        code: item.code,
        name: item.name,
        sectorCode: item.sectorCode,
        balance: item.balance,
      })));
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Cari listesi alinamadi.'));
    } finally {
      setCariLoading(false);
    }
  };

  const filteredCaris = useMemo(
    () => cariList.filter((item) => includesSearch(`${item.code} ${item.name} ${item.sectorCode || ''}`, cariSearch)).slice(0, 100),
    [cariList, cariSearch]
  );

  const upload = async () => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: 'application/pdf',
      });
      if (result.canceled || !result.assets?.length) return;

      const formData = new FormData();
      result.assets.forEach((asset) => {
        formData.append('files', {
          uri: asset.uri,
          name: asset.name || 'einvoice.pdf',
          type: asset.mimeType || 'application/pdf',
        } as any);
      });

      const response = await adminApi.uploadEInvoices(formData);
      setUploadResult(response);
      Alert.alert('Tamamlandi', `${response.uploaded} yuklendi, ${response.updated} guncellendi, ${response.failed} basarisiz.`);
      await fetchDocuments(1);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Yukleme basarisiz.'));
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const selectableIds = documents.filter((doc) => Boolean(doc.fileName)).map((doc) => doc.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      selectableIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const downloadSingle = async (doc: EInvoiceDocument) => {
    if (!doc.id || downloadingIdRef.current || downloadingBulkRef.current) return;
    downloadingIdRef.current = doc.id;
    setDownloadingId(doc.id);
    try {
      const token = await getAuthToken();
      const baseUrl = apiClient.defaults.baseURL || '';
      const fileName = `${doc.invoiceNo || doc.id}.pdf`;
      const directory = `${FileSystem.documentDirectory}einvoices/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const target = `${directory}${fileName}`;
      const response = await fetch(`${baseUrl}/admin/einvoices/${doc.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        let detail = '';
        try {
          const data = await response.json();
          detail = data?.error || data?.message || '';
        } catch {
          detail = '';
        }
        throw new Error(detail || 'PDF bulunamadi veya indirilemedi.');
      }
      const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, { mimeType: 'application/pdf', dialogTitle: fileName });
      } else {
        Alert.alert('Indirildi', `Dosya kaydedildi: ${target}`);
      }
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'PDF indirilemedi.'));
    } finally {
      downloadingIdRef.current = null;
      setDownloadingId(null);
    }
  };

  const downloadSelected = async () => {
    if (downloadingBulkRef.current || downloadingIdRef.current) return;
    if (selectedIds.size === 0) {
      Alert.alert('Secim Yok', 'Once fatura secin.');
      return;
    }
    downloadingBulkRef.current = true;
    setDownloadingBulk(true);
    try {
      const token = await getAuthToken();
      const baseUrl = apiClient.defaults.baseURL || '';
      const response = await fetch(`${baseUrl}/admin/einvoices/bulk-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!response.ok) throw new Error('Toplu indirme basarisiz.');
      const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const directory = `${FileSystem.documentDirectory}einvoices/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const target = `${directory}faturalar_${stamp}.zip`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(target);
      else Alert.alert('Indirildi', `Dosya kaydedildi: ${target}`);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Toplu indirme basarisiz.'));
    } finally {
      downloadingBulkRef.current = false;
      setDownloadingBulk(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setInvoicePrefix('');
    setFromDate('');
    setToDate('');
    setSelectedCari(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>DOKUMAN OPERASYONU</Text>
            <Text style={styles.title}>E-Faturalar</Text>
            <Text style={styles.subtitle}>{pagination.total} kayit | {selectedIds.size} secili</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => void fetchDocuments(pagination.page)} accessibilityLabel="Yenile">
            <Ionicons name="refresh" size={18} color={colors.primarySoft} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Fatura, cari, kod veya VKN ara"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => void fetchDocuments(1)}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity style={[styles.iconButton, filtersOpen && styles.iconButtonActive]} onPress={() => setFiltersOpen((value) => !value)} accessibilityLabel="Filtreler">
            <Ionicons name="options" size={18} color={filtersOpen ? colors.textStrong : colors.primarySoft} />
          </TouchableOpacity>
        </View>

        {filtersOpen && (
          <View style={styles.filterPanel}>
            <View style={styles.filterGrid}>
              <TextInput style={styles.input} value={invoicePrefix} onChangeText={setInvoicePrefix} placeholder="Fatura oneki" placeholderTextColor={colors.textMuted} />
              <TouchableOpacity style={styles.pickerButton} onPress={() => void openCariPicker()}>
                <Text style={selectedCari ? styles.pickerText : styles.pickerPlaceholder} numberOfLines={1}>{selectedCari ? `${selectedCari.code} - ${selectedCari.name}` : 'Cari sec'}</Text>
                <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
              </TouchableOpacity>
              <TextInput style={styles.input} value={fromDate} onChangeText={setFromDate} placeholder="Baslangic YYYY-MM-DD" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
              <TextInput style={styles.input} value={toDate} onChangeText={setToDate} placeholder="Bitis YYYY-MM-DD" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
            </View>
            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={clearFilters}><Text style={styles.secondaryButtonText}>Temizle</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={() => void fetchDocuments(1)}><Text style={styles.primaryButtonText}>Uygula</Text></TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionCard, styles.uploadCard, uploading && styles.disabled]} onPress={upload} disabled={uploading}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.textStrong} />
            <View style={styles.actionCopy}><Text style={styles.actionTitle}>{uploading ? 'Yukleniyor...' : 'PDF Yukle'}</Text><Text style={styles.actionHint}>Bir veya cok dosya</Text></View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionCard, styles.downloadCard, selectedIds.size === 0 && styles.disabled]} onPress={downloadSelected} disabled={selectedIds.size === 0 || downloadingBulk}>
            <Ionicons name="archive-outline" size={20} color={colors.textStrong} />
            <View style={styles.actionCopy}><Text style={styles.actionTitle}>{downloadingBulk ? 'Hazirlaniyor...' : 'Secilileri Indir'}</Text><Text style={styles.actionHint}>{selectedIds.size} PDF</Text></View>
          </TouchableOpacity>
        </View>

        {uploadResult && (
          <View style={styles.uploadResult}>
            <Ionicons name={uploadResult.failed > 0 ? 'warning-outline' : 'checkmark-circle-outline'} size={18} color={uploadResult.failed > 0 ? colors.warning : colors.success} />
            <Text style={styles.uploadResultText}>{uploadResult.uploaded} yuklendi, {uploadResult.updated} guncellendi, {uploadResult.failed} basarisiz.</Text>
            <TouchableOpacity onPress={() => setUploadResult(null)}><Ionicons name="close" size={18} color={colors.textMuted} /></TouchableOpacity>
          </View>
        )}

        <View style={styles.listToolbar}>
          <TouchableOpacity style={styles.selectAll} onPress={toggleAll} disabled={selectableIds.length === 0}>
            <View style={[styles.checkbox, allSelected && styles.checkboxActive]}>{allSelected && <Ionicons name="checkmark" size={14} color={colors.textStrong} />}</View>
            <Text style={styles.selectAllText}>Sayfadakileri sec</Text>
          </TouchableOpacity>
          <Text style={styles.pageMeta}>Sayfa {pagination.page}/{Math.max(1, pagination.totalPages)}</Text>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primarySoft} /></View>
        ) : documents.length === 0 ? (
          <View style={styles.empty}><Ionicons name="document-text-outline" size={28} color={colors.textMuted} /><Text style={styles.emptyTitle}>Kayit bulunamadi</Text><Text style={styles.emptyText}>Filtreleri degistirin veya PDF yukleyin.</Text></View>
        ) : documents.map((doc) => {
          const selected = selectedIds.has(doc.id);
          const canDownload = Boolean(doc.fileName);
          const status = statusMeta(doc.matchStatus);
          const customerName = doc.customerName || doc.customer?.displayName || doc.customer?.mikroName || doc.customer?.name || '-';
          const customerCode = doc.customerCode || doc.customer?.mikroCariCode || '-';
          const balance = doc.customerBalance ?? doc.customer?.balance;
          return (
            <View key={doc.id} style={[styles.card, selected && styles.cardSelected]}>
              <View style={styles.cardTop}>
                <TouchableOpacity style={[styles.checkbox, selected && styles.checkboxActive, !canDownload && styles.disabled]} onPress={() => canDownload && toggleSelection(doc.id)} disabled={!canDownload}>
                  {selected && <Ionicons name="checkmark" size={14} color={colors.textStrong} />}
                </TouchableOpacity>
                <View style={styles.invoiceIdentity}>
                  <Text style={styles.invoiceNo} numberOfLines={1}>{doc.invoiceNo || '-'}</Text>
                  <Text style={styles.vkn} numberOfLines={1}>VKN {doc.customerTaxNo || '-'}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: status.bg }]}><Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text></View>
              </View>

              <View style={styles.customerBlock}>
                <View style={styles.customerCopy}><Text style={styles.customerName} numberOfLines={2}>{customerName}</Text><Text style={styles.customerCode}>{customerCode}</Text></View>
                <View style={styles.balanceBlock}><Text style={styles.balanceLabel}>CARI BAKIYE</Text><Text style={[styles.balanceValue, Number(balance || 0) < 0 && styles.negative]} numberOfLines={1}>{money(balance, 'TRY')}</Text></View>
              </View>

              <View style={styles.metrics}>
                <View style={styles.metric}><Text style={styles.metricLabel}>TARIH</Text><Text style={styles.metricValue}>{doc.issueDate?.slice(0, 10) || '-'}</Text></View>
                <View style={styles.metric}><Text style={styles.metricLabel}>ARA TOPLAM</Text><Text style={styles.metricValue}>{money(doc.subtotalAmount, doc.currency || 'TRY')}</Text></View>
                <View style={styles.metric}><Text style={styles.metricLabel}>GENEL TOPLAM</Text><Text style={styles.metricValueStrong}>{money(doc.totalAmount, doc.currency || 'TRY')}</Text></View>
              </View>

              {doc.matchError ? <Text style={styles.matchError}>{doc.matchError}</Text> : null}
              <View style={styles.cardFooter}>
                <Text style={[styles.fileState, !canDownload && styles.negative]}>{canDownload ? 'PDF hazir' : 'PDF bulunamadi'}</Text>
                <TouchableOpacity style={[styles.pdfButton, (!canDownload || Boolean(downloadingId) || downloadingBulk) && styles.disabled]} onPress={() => canDownload && void downloadSingle(doc)} disabled={!canDownload || Boolean(downloadingId) || downloadingBulk}>
                  {downloadingId === doc.id ? <ActivityIndicator size="small" color={colors.primarySoft} /> : <><Ionicons name="download-outline" size={16} color={colors.primarySoft} /><Text style={styles.pdfButtonText}>PDF</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {!loading && pagination.totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity style={[styles.pageButton, pagination.page <= 1 && styles.disabled]} disabled={pagination.page <= 1} onPress={() => void fetchDocuments(pagination.page - 1)}><Ionicons name="chevron-back" size={17} color={colors.primarySoft} /><Text style={styles.pageButtonText}>Onceki</Text></TouchableOpacity>
            <Text style={styles.pageMeta}>{pagination.total} kayit</Text>
            <TouchableOpacity style={[styles.pageButton, pagination.page >= pagination.totalPages && styles.disabled]} disabled={pagination.page >= pagination.totalPages} onPress={() => void fetchDocuments(pagination.page + 1)}><Text style={styles.pageButtonText}>Sonraki</Text><Ionicons name="chevron-forward" size={17} color={colors.primarySoft} /></TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal visible={cariModalOpen} animationType="slide" transparent onRequestClose={() => setCariModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCariModalOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Cari Sec</Text><Text style={styles.modalSubtitle}>Kod, unvan veya sektor ile arayin.</Text></View><TouchableOpacity style={styles.iconButton} onPress={() => setCariModalOpen(false)}><Ionicons name="close" size={20} color={colors.textStrong} /></TouchableOpacity></View>
            <View style={styles.searchBox}><Ionicons name="search" size={17} color={colors.textMuted} /><TextInput style={styles.searchInput} value={cariSearch} onChangeText={setCariSearch} placeholder="Cari ara" placeholderTextColor={colors.textMuted} autoFocus /></View>
            <TouchableOpacity style={styles.cariOption} onPress={() => { setSelectedCari(null); setCariModalOpen(false); }}><View><Text style={styles.customerName}>Tum cariler</Text><Text style={styles.customerCode}>Filtreyi kaldir</Text></View></TouchableOpacity>
            <ScrollView style={styles.cariList} keyboardShouldPersistTaps="handled">
              {cariLoading ? <ActivityIndicator color={colors.primarySoft} style={styles.loading} /> : filteredCaris.map((item) => (
                <TouchableOpacity key={item.code} style={[styles.cariOption, selectedCari?.code === item.code && styles.cariOptionActive]} onPress={() => { setSelectedCari(item); setCariModalOpen(false); }}>
                  <View style={styles.customerCopy}><Text style={styles.customerName} numberOfLines={2}>{item.name}</Text><Text style={styles.customerCode}>{item.code}{item.sectorCode ? ` | ${item.sectorCode}` : ''}</Text></View>
                  <Text style={styles.cariBalance}>{money(item.balance)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, gap: 2 },
  kicker: { fontFamily: fonts.monoSemibold, fontSize: 9, color: colors.primarySoft },
  title: { fontFamily: fonts.extrabold, fontSize: fontSizes.xxl, color: colors.textStrong },
  subtitle: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  iconButton: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: { minHeight: 42, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.text },
  filterPanel: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.md },
  filterGrid: { gap: spacing.sm },
  input: { minHeight: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fonts.medium, fontSize: fontSizes.sm },
  pickerButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.md },
  pickerText: { flex: 1, fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.text },
  pickerPlaceholder: { flex: 1, fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  filterActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  primaryButton: { minHeight: 38, borderRadius: radius.md, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.textStrong },
  secondaryButton: { minHeight: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionCard: { minHeight: 62, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: 1 },
  uploadCard: { backgroundColor: colors.primary, borderColor: colors.primarySoft },
  downloadCard: { backgroundColor: '#126C58', borderColor: colors.success },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.textStrong },
  actionHint: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.72)' },
  uploadResult: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, padding: spacing.md },
  uploadResultText: { flex: 1, fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.text },
  listToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectAllText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textSoft },
  pageMeta: { fontFamily: fonts.monoMedium, fontSize: fontSizes.xs, color: colors.textMuted },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primarySoft },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted },
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardSelected: { borderColor: colors.primarySoft, backgroundColor: colors.primaryMuted },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  invoiceIdentity: { flex: 1, minWidth: 0 },
  invoiceNo: { fontFamily: fonts.monoSemibold, fontSize: fontSizes.md, color: colors.primarySoft },
  vkn: { marginTop: 2, fontFamily: fonts.mono, fontSize: fontSizes.xs, color: colors.textMuted },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: 999 },
  statusText: { fontFamily: fonts.bold, fontSize: 9 },
  customerBlock: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  customerCopy: { flex: 1, minWidth: 0 },
  customerName: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, lineHeight: 17, color: colors.text },
  customerCode: { marginTop: 2, fontFamily: fonts.mono, fontSize: fontSizes.xs, color: colors.textMuted },
  balanceBlock: { maxWidth: '44%', alignItems: 'flex-end' },
  balanceLabel: { fontFamily: fonts.monoSemibold, fontSize: 8, color: colors.textMuted },
  balanceValue: { marginTop: 2, fontFamily: fonts.monoSemibold, fontSize: fontSizes.sm, color: colors.success },
  negative: { color: colors.danger },
  metrics: { flexDirection: 'row', gap: spacing.xs },
  metric: { flex: 1, minWidth: 0, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  metricLabel: { fontFamily: fonts.monoSemibold, fontSize: 8, color: colors.textMuted },
  metricValue: { marginTop: 4, fontFamily: fonts.monoMedium, fontSize: 10, color: colors.textSoft },
  metricValueStrong: { marginTop: 4, fontFamily: fonts.monoSemibold, fontSize: 10, color: colors.textStrong },
  matchError: { fontFamily: fonts.medium, fontSize: fontSizes.xs, lineHeight: 15, color: colors.danger },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fileState: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.success },
  pdfButton: { minWidth: 70, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  pdfButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.primarySoft },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  pageButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md },
  pageButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  disabled: { opacity: 0.42 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: { maxHeight: '86%', minHeight: '62%', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.backgroundRaised },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  modalTitle: { fontFamily: fonts.extrabold, fontSize: fontSizes.xl, color: colors.textStrong },
  modalSubtitle: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted },
  cariList: { flex: 1 },
  cariOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  cariOptionActive: { backgroundColor: colors.primaryMuted, borderRadius: radius.sm },
  cariBalance: { maxWidth: '38%', fontFamily: fonts.monoSemibold, fontSize: fontSizes.xs, color: colors.primarySoft },
});
