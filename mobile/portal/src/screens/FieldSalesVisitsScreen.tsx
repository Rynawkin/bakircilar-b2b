import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';

const todayInput = () => new Date().toISOString().slice(0, 10);
const PUBLIC_BASE_URL = String(
  process.env.EXPO_PUBLIC_WEB_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    'https://www.bakircilarkampanya.com'
).replace(/\/api\/?$/, '').replace(/\/$/, '');

const daysAgoInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const dateTimeText = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const resolvePublicUrl = (value?: string | null) => {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^(https?:|data:)/i.test(url)) return url;
  return `${PUBLIC_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'green' | 'amber' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'green' && styles.textGreen, tone === 'amber' && styles.textAmber]}>{value}</Text>
    </View>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.smallButton} onPress={onPress}>
      <Text style={styles.smallButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function FieldSalesVisitsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(daysAgoInput(30));
  const [endDate, setEndDate] = useState(todayInput());
  const [onlyVisitCustomers, setOnlyVisitCustomers] = useState(false);
  const [page, setPage] = useState(1);
  const [visits, setVisits] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [pagination, setPagination] = useState<any>({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const customerGroups = useMemo(() => {
    const map = new Map<string, { code: string; title: string; count: number; lastAt: string; isVisitCustomer: boolean; lastNote: string }>();
    visits.forEach((visit) => {
      const code = visit.customerCode || '-';
      const existing = map.get(code);
      if (!existing) {
        map.set(code, {
          code,
          title: visit.customerTitle || visit.customerName || code,
          count: 1,
          lastAt: visit.createdAt,
          isVisitCustomer: Boolean(visit.isVisitCustomer),
          lastNote: visit.note || '',
        });
        return;
      }
      existing.count += 1;
      existing.isVisitCustomer = existing.isVisitCustomer || Boolean(visit.isVisitCustomer);
      if (new Date(visit.createdAt).getTime() > new Date(existing.lastAt).getTime()) {
        existing.lastAt = visit.createdAt;
        existing.lastNote = visit.note || '';
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  }, [visits]);

  const loadVisits = async (targetPage = 1) => {
    setLoading(true);
    try {
      const response = await adminApi.getFieldSalesVisits({
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        onlyVisitCustomers,
        page: targetPage,
        limit: 80,
      });
      setVisits(response.data.visits || []);
      setSummary(response.data.summary || {});
      setPagination(response.data.pagination || { page: targetPage, totalPages: 1, total: 0 });
      setPage(targetPage);
    } catch (error: any) {
      Alert.alert('Rapor alinamadi', getApiErrorMessage(error, 'Saha ziyaret raporu alinamadi.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVisits(1);
  }, []);

  const openPhone = (phone?: string | null) => {
    if (!phone) {
      Alert.alert('Telefon yok', 'Bu ziyaret kaydinda telefon bilgisi yok.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Telefon acilamadi'));
  };

  const openMap = (visit: any) => {
    if (!visit.latitude || !visit.longitude) {
      Alert.alert('Konum yok', 'Bu ziyaret kaydinda konum bilgisi yok.');
      return;
    }
    const url = `https://www.google.com/maps?q=${encodeURIComponent(`${visit.latitude},${visit.longitude}`)}`;
    Linking.openURL(url).catch(() => Alert.alert('Harita acilamadi'));
  };

  const openPhoto = (url?: string | null) => {
    const resolvedUrl = resolvePublicUrl(url);
    if (!resolvedUrl) {
      Alert.alert('Fotograf yok', 'Bu ziyaret kaydinda fotograf yok.');
      return;
    }
    Linking.openURL(resolvedUrl).catch(() => Alert.alert('Fotograf acilamadi'));
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const limit = 500;
      let exportPage = 1;
      let expectedTotal = pagination.total || 0;
      const allVisits: any[] = [];

      while (exportPage <= 30) {
        const response = await adminApi.getFieldSalesVisits({
          search: search.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          onlyVisitCustomers,
          page: exportPage,
          limit,
        });
        const batch = response.data?.visits || [];
        expectedTotal = response.data?.pagination?.total || expectedTotal;
        allVisits.push(...batch);
        if (batch.length < limit || allVisits.length >= expectedTotal) break;
        exportPage += 1;
      }

      if (!allVisits.length) {
        Alert.alert('Bilgi', 'Disa aktarilacak ziyaret bulunamadi.');
        return;
      }

      const rows = [
        ['Tarih', 'Cari Kodu', 'Cari Unvan', 'Ziyaret Carisi', 'Personel', 'Telefon', 'Il', 'Ilce', 'Not', 'Talep', 'Rakip Bilgisi', 'Enlem', 'Boylam', 'Fotograf'],
        ...allVisits.map((visit) => [
          dateTimeText(visit.createdAt),
          visit.customerCode || '',
          visit.customerTitle || visit.customerName || '',
          visit.isVisitCustomer ? 'Evet' : 'Hayir',
          visit.createdByName || '',
          visit.phone || '',
          visit.city || '',
          visit.district || '',
          visit.note || '',
          visit.demand || '',
          visit.competitorInfo || '',
          visit.latitude ?? '',
          visit.longitude ?? '',
          resolvePublicUrl(visit.photoUrl) || '',
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = rows[0].map((header) => ({ wch: Math.min(Math.max(String(header).length + 4, 12), 42) }));
      XLSX.utils.book_append_sheet(wb, ws, 'Saha Ziyaretleri');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}saha-ziyaretleri-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Saha Ziyaretleri Excel',
        });
      } else {
        Alert.alert('Excel olusturuldu', target);
      }
    } catch (error: any) {
      Alert.alert('Excel olusturulamadi', getApiErrorMessage(error, 'Islem tamamlanamadi.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Saha CRM</Text>
            <Text style={styles.title}>Saha Ziyaretleri</Text>
            <Text style={styles.subtitle}>Ziyaret notlari, talepler, rakip bilgisi ve yeni ziyaret carileri.</Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Toplam Not</Text><Text style={styles.heroStatValue}>{summary.total || 0}</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Cari</Text><Text style={styles.heroStatValue}>{summary.uniqueCustomers || 0}</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Ziyaret Carisi</Text><Text style={styles.heroStatValue}>{summary.visitCustomerNotes || 0}</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatLabel}>Fotograf</Text><Text style={styles.heroStatValue}>{summary.photoCount || 0}</Text></View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Filtreler</Text>
          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Cari, not, talep, rakip veya personel ara"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.inputRow}>
            <TextInput style={[styles.input, styles.flex]} value={startDate} onChangeText={setStartDate} placeholder="Baslangic" />
            <TextInput style={[styles.input, styles.flex]} value={endDate} onChangeText={setEndDate} placeholder="Bitis" />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.switchTitle}>Sadece ziyaret carileri</Text>
              <Text style={styles.helper}>Yeni acilan ziyaret carisi notlarini ayirir.</Text>
            </View>
            <Switch value={onlyVisitCustomers} onValueChange={setOnlyVisitCustomers} />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => loadVisits(1)} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor...' : 'Raporu Getir'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, exporting && styles.disabled]} onPress={exportExcel} disabled={exporting}>
            <Text style={styles.secondaryButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Excel Paylas'}</Text>
          </TouchableOpacity>
        </View>

        {customerGroups.length ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Cari Bazli Ozet</Text>
            {customerGroups.slice(0, 12).map((group) => (
              <TouchableOpacity
                key={group.code}
                style={styles.groupRow}
                onPress={() => navigation.navigate('FieldSales', { customerIdOrCode: group.code })}
              >
                <View style={styles.flex}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{group.title}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>{group.code} - {dateTimeText(group.lastAt)}</Text>
                  <Text style={styles.noteText} numberOfLines={2}>{group.lastNote || '-'}</Text>
                </View>
                <View style={[styles.badge, group.isVisitCustomer && styles.badgeGreen]}>
                  <Text style={styles.badgeText}>{group.count}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {customerGroups.length > 12 ? <Text style={styles.helper}>Ilk 12 cari gosteriliyor. Tum ziyaretler asagida.</Text> : null}
          </View>
        ) : null}

        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Ziyaret Notlari</Text>
          <Text style={styles.helper}>Sayfa {page}/{pagination.totalPages || 1}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {!loading && !visits.length ? (
          <View style={styles.empty}><Text style={styles.emptyText}>Bu filtrelerle ziyaret notu bulunamadi.</Text></View>
        ) : null}
        <View style={[styles.visitGrid, isWide && styles.visitGridWide]}>
        {visits.map((visit) => {
          const photoUri = resolvePublicUrl(visit.photoUrl);
          return (
            <View key={visit.id} style={[styles.card, isWide && styles.visitCardWide]}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{visit.customerTitle || visit.customerName || visit.customerCode || 'Cari'}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>{visit.customerCode || '-'} - {visit.createdByName || '-'} - {dateTimeText(visit.createdAt)}</Text>
                </View>
                {visit.isVisitCustomer ? <View style={styles.badgeGreen}><Text style={styles.badgeText}>Ziyaret</Text></View> : null}
              </View>
              <Text style={styles.noteText} numberOfLines={4}>{visit.note || '-'}</Text>
              {visit.demand ? <Text style={styles.infoText} numberOfLines={2}>Talep: {visit.demand}</Text> : null}
              {visit.competitorInfo ? <Text style={styles.infoText} numberOfLines={2}>Rakip: {visit.competitorInfo}</Text> : null}
              <Text style={styles.cardMeta} numberOfLines={1}>{[visit.city, visit.district].filter(Boolean).join(' / ') || '-'}</Text>
              {photoUri ? (
                <TouchableOpacity style={styles.photoPreview} onPress={() => openPhoto(visit.photoUrl)}>
                  <Image source={{ uri: photoUri }} style={styles.photoImage} resizeMode="cover" />
                </TouchableOpacity>
              ) : null}
              <View style={styles.actionRow}>
                <SmallButton label="Saha Ac" onPress={() => navigation.navigate('FieldSales', { customerIdOrCode: visit.customerCode || visit.customerId })} />
                <SmallButton label="Ara" onPress={() => openPhone(visit.phone)} />
                <SmallButton label="Konum" onPress={() => openMap(visit)} />
                <SmallButton label="Fotograf" onPress={() => openPhoto(visit.photoUrl)} />
              </View>
            </View>
          );
        })}
        </View>

        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.secondaryButton, page <= 1 && styles.disabled]}
            onPress={() => page > 1 && loadVisits(page - 1)}
            disabled={page <= 1 || loading}
          >
            <Text style={styles.secondaryButtonText}>Onceki</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, page >= (pagination.totalPages || 1) && styles.disabled]}
            onPress={() => page < (pagination.totalPages || 1) && loadVisits(page + 1)}
            disabled={page >= (pagination.totalPages || 1) || loading}
          >
            <Text style={styles.secondaryButtonText}>Sonraki</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  heroText: { gap: spacing.xs },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DDE8FF', lineHeight: 20 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroStat: { flex: 1, minWidth: 118, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroStatLabel: { fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BCD2F7' },
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: '#FFFFFF', marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  visitGrid: { gap: spacing.md },
  visitGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  visitCardWide: { width: '48.7%' },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  cardTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  helper: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  noteText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text, lineHeight: 20 },
  infoText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.text },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    flexGrow: 1,
    minWidth: 132,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  metricLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.xl, color: colors.text, marginTop: 4 },
  textGreen: { color: colors.success },
  textAmber: { color: colors.warning },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.text },
  primaryButton: {
    minHeight: 46,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  groupRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.primaryMuted },
  badgeGreen: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.successSoft },
  badgeText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.text },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  smallButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  photoPreview: {
    height: 150,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoImage: { width: '100%', height: '100%' },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  pagination: { flexDirection: 'row', gap: spacing.sm },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  disabled: { opacity: 0.45 },
});
