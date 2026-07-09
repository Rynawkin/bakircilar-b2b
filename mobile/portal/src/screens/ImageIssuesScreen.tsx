import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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

import { ImageIssueReport, ImageIssueStatus, adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const statusOptions: Array<{ value: 'ALL' | ImageIssueStatus; label: string }> = [
  { value: 'OPEN', label: 'Acik' },
  { value: 'REVIEWED', label: 'Incelendi' },
  { value: 'FIXED', label: 'Duzeltildi' },
  { value: 'ALL', label: 'Tumu' },
];

const statusLabel: Record<ImageIssueStatus, string> = {
  OPEN: 'Acik',
  REVIEWED: 'Incelendi',
  FIXED: 'Duzeltildi',
};

export function ImageIssuesScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 840;
  const [reports, setReports] = useState<ImageIssueReport[]>([]);
  const [summary, setSummary] = useState({ total: 0, open: 0, reviewed: 0, fixed: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
  const [status, setStatus] = useState<'ALL' | ImageIssueStatus>('OPEN');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyIdRef = useRef<string | null>(null);
  const fetchSeqRef = useRef(0);

  const beginBusy = (id: string) => {
    if (busyIdRef.current) return false;
    busyIdRef.current = id;
    setBusyId(id);
    return true;
  };

  const endBusy = () => {
    busyIdRef.current = null;
    setBusyId(null);
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const fetchReports = async (showLoader = false) => {
    const requestSeq = ++fetchSeqRef.current;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getWarehouseImageIssues({
        status,
        search: debouncedSearch || undefined,
        page,
        limit: 20,
      });
      if (requestSeq !== fetchSeqRef.current) return;
      setReports(response.reports || []);
      setSummary(response.summary || { total: 0, open: 0, reviewed: 0, fixed: 0 });
      setPagination(response.pagination || { page, limit: 20, totalPages: 1, totalRecords: 0 });
    } catch (err: any) {
      if (requestSeq !== fetchSeqRef.current) return;
      setError(getApiErrorMessage(err, 'Resim hata talepleri yuklenemedi.'));
    } finally {
      if (requestSeq === fetchSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debouncedSearch, page]);

  const updateStatus = async (report: ImageIssueReport, nextStatus: ImageIssueStatus) => {
    if (!beginBusy(report.id)) return;
    try {
      await adminApi.updateWarehouseImageIssue(report.id, { status: nextStatus });
      await fetchReports(false);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Talep guncellenemedi.'));
    } finally {
      endBusy();
    }
  };

  const uploadAndFix = async (report: ImageIssueReport) => {
    if (busyIdRef.current) return;
    if (!report.productId) {
      Alert.alert('Urun Bulunamadi', 'Bu talep bir B2B urun kartina bagli degil.');
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: 'image/*',
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert('Dosya Tipi', 'Lutfen bir gorsel dosyasi secin.');
      return;
    }
    if (asset.size && asset.size > 5 * 1024 * 1024) {
      Alert.alert('Dosya Boyutu', 'Gorsel 5MB altinda olmali.');
      return;
    }

    const formData = new FormData();
    formData.append('image', {
      uri: asset.uri,
      name: asset.name || `${report.productCode}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    } as any);

    if (!beginBusy(report.id)) return;
    try {
      await adminApi.uploadProductImage(report.productId, formData);
      await adminApi.updateWarehouseImageIssue(report.id, {
        status: 'FIXED',
        note: 'Mobil resim hata talepleri ekranindan guncellendi',
      });
      await fetchReports(false);
    } catch (err: any) {
      Alert.alert('Hata', getApiErrorMessage(err, 'Gorsel yuklenemedi.'));
    } finally {
      endBusy();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text style={styles.kicker}>Gorsel Kalite</Text>
              <Text style={styles.title}>Resim Hata Talepleri</Text>
              <Text style={styles.subtitle}>Depo ve musteri tarafindan bildirilen urun gorseli sorunlarini mobilde kapatin.</Text>
            </View>
            <TouchableOpacity style={[styles.refreshButton, loading && styles.buttonDisabled]} onPress={() => fetchReports(true)} disabled={loading}>
              <Text style={styles.refreshText}>{loading ? 'Yukleniyor' : 'Yenile'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Toplam</Text><Text style={styles.heroStatValue}>{summary.total}</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Acik</Text><Text style={[styles.heroStatValue, summary.open > 0 && styles.heroStatDanger]}>{summary.open}</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Incelendi</Text><Text style={styles.heroStatValue}>{summary.reviewed}</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Duzeltildi</Text><Text style={styles.heroStatValue}>{summary.fixed}</Text></View>
          </View>
        </View>

        <View style={styles.filterCard}>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Urun kodu, urun adi, cari veya siparis ara"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.segment}>
            {statusOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.segmentButton, status === option.value && styles.segmentButtonActive, loading && styles.buttonDisabled]}
                onPress={() => { setStatus(option.value); setPage(1); }}
                disabled={loading}
              >
                <Text style={status === option.value ? styles.segmentTextActive : styles.segmentText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : reports.length === 0 ? (
          <Text style={styles.emptyText}>Talep bulunamadi.</Text>
        ) : (
          <View style={[styles.reportGrid, isWide && styles.reportGridWide]}>
            {reports.map((report) => {
            const busy = busyId === report.id;
            return (
              <View key={report.id} style={[styles.card, isWide && styles.cardWide]}>
                <View style={styles.cardTop}>
                  <View style={styles.flexText}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{report.productName}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>{report.productCode} - Siparis {report.mikroOrderNumber}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>{report.customerName || report.customerCode || '-'}</Text>
                  </View>
                  <Text style={[styles.statusPill, report.status === 'OPEN' && styles.statusOpen, report.status === 'REVIEWED' && styles.statusReviewed, report.status === 'FIXED' && styles.statusFixed]}>
                    {statusLabel[report.status]}
                  </Text>
                </View>

                <View style={styles.imageRow}>
                  <View style={styles.imageBox}>
                    {report.currentProductImageUrl ? <Image source={{ uri: report.currentProductImageUrl }} style={styles.image} resizeMode="cover" /> : <Text style={styles.imageText}>Mevcut yok</Text>}
                  </View>
                  <View style={styles.imageBox}>
                    {report.imageUrl ? <Image source={{ uri: report.imageUrl }} style={styles.image} resizeMode="cover" /> : <Text style={styles.imageText}>Bildirilen yok</Text>}
                  </View>
                </View>

                {!!report.note && <Text style={styles.note} numberOfLines={3}>{report.note}</Text>}
                <Text style={styles.cardMeta} numberOfLines={1}>Bildiren: {report.reporterName || '-'} - {new Date(report.createdAt).toLocaleDateString('tr-TR')}</Text>

                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.smallButton, (busy || Boolean(busyId)) && styles.buttonDisabled]} onPress={() => updateStatus(report, 'REVIEWED')} disabled={busy || Boolean(busyId) || report.status === 'REVIEWED'}>
                    <Text style={styles.smallButtonText}>Incelendi</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primarySmallButton, (busy || Boolean(busyId)) && styles.buttonDisabled]} onPress={() => uploadAndFix(report)} disabled={busy || Boolean(busyId)}>
                    <Text style={styles.primarySmallText}>{busy ? 'Isleniyor' : 'Gorsel Yukle + Duzelt'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallButton, (busy || Boolean(busyId)) && styles.buttonDisabled]} onPress={() => updateStatus(report, 'FIXED')} disabled={busy || Boolean(busyId) || report.status === 'FIXED'}>
                    <Text style={styles.smallButtonText}>Duzeltildi</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
            })}
          </View>
        )}

        {pagination.totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity style={[styles.pageButton, (loading || page <= 1) && styles.buttonDisabled]} onPress={() => setPage((prev) => Math.max(1, prev - 1))} disabled={loading || page <= 1}>
              <Text style={styles.pageButtonText}>Onceki</Text>
            </TouchableOpacity>
            <Text style={styles.pageText}>{page}/{pagination.totalPages}</Text>
            <TouchableOpacity style={[styles.pageButton, (loading || page >= pagination.totalPages) && styles.buttonDisabled]} onPress={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))} disabled={loading || page >= pagination.totalPages}>
              <Text style={styles.pageButtonText}>Sonraki</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.lg, alignItems: 'flex-start' },
  heroText: { flex: 1, minWidth: 240, gap: spacing.xs },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.md, color: '#DDE8FF', lineHeight: 22 },
  refreshButton: { alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  refreshText: { fontFamily: fonts.bold, color: '#FFFFFF' },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 118, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF', marginTop: spacing.xs },
  heroStatDanger: { color: '#FCA5A5' },
  filterCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  segmentButton: { flexGrow: 1, alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  segmentButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.textMuted },
  segmentTextActive: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  loading: { alignItems: 'center', padding: spacing.xl },
  error: { fontFamily: fonts.medium, color: colors.danger },
  emptyText: { fontFamily: fonts.regular, color: colors.textMuted },
  reportGrid: { gap: spacing.md },
  reportGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardWide: { width: '48.7%' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flexText: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  cardMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  statusPill: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontFamily: fonts.bold, fontSize: fontSizes.xs },
  statusOpen: { backgroundColor: colors.dangerSoft, color: colors.danger },
  statusReviewed: { backgroundColor: colors.warningSoft, color: colors.warning },
  statusFixed: { backgroundColor: colors.successSoft, color: colors.success },
  imageRow: { flexDirection: 'row', gap: spacing.sm },
  imageBox: { flex: 1, height: 112, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  imageText: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: colors.textMuted },
  note: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  smallButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: colors.text },
  primarySmallButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  primarySmallText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: '#FFFFFF' },
  buttonDisabled: { opacity: 0.55 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  pageButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  pageButtonText: { fontFamily: fonts.semibold, color: colors.text },
  pageText: { fontFamily: fonts.semibold, color: colors.textMuted },
});
