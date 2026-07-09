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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { adminApi } from '../api/admin';
import { StaffMember } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';

type ViewKey = 'current' | 'historical';

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const money = (value: unknown) =>
  `${n(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

const dateText = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('tr-TR');
};

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'green' | 'amber' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'red' && styles.textDanger, tone === 'green' && styles.textSuccess, tone === 'amber' && styles.textWarning]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function CustomerRecoveryReportScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [view, setView] = useState<ViewKey>('current');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [actionCode, setActionCode] = useState<string | null>(null);
  const actionCodeRef = useRef<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    sectorCode: '',
    riskTypes: '',
    recentMonths: '3',
    baselineMonths: '12',
    minDropPercent: '40',
    minLostPotential: '',
  });
  const [historicalFilters, setHistoricalFilters] = useState({
    startYear: '2022',
    inactiveMonths: '6',
    minConsecutiveMonths: '3',
    minMonthlyAmount: '',
    search: '',
    sectorCode: '',
    onlyLostFrequent: true,
  });

  const selectedStaff = staff.find((row) => row.id === selectedStaffId);

  useEffect(() => {
    fetchStaff();
    fetchCurrent();
  }, []);

  useEffect(() => {
    if (view === 'current') fetchCurrent();
    if (view === 'historical') fetchHistorical();
  }, [view]);

  const fetchStaff = async () => {
    try {
      const response = await adminApi.getStaffMembers();
      setStaff(response.staff || []);
      setSelectedStaffId((current) => current || response.staff?.[0]?.id || '');
    } catch {
      setStaff([]);
    }
  };

  const fetchCurrent = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await adminApi.getCustomerRecoveryReport({
        search: filters.search.trim() || undefined,
        sectorCode: filters.sectorCode.trim() || undefined,
        riskTypes: filters.riskTypes.trim() || undefined,
        recentMonths: n(filters.recentMonths, 3),
        baselineMonths: n(filters.baselineMonths, 12),
        minDropPercent: n(filters.minDropPercent, 40),
        minLostPotential: filters.minLostPotential ? n(filters.minLostPotential) : undefined,
        page: 1,
        limit: 60,
        sortBy: 'riskScore',
        sortDirection: 'desc',
      });
      setRows(response.data?.rows || []);
      setSummary(response.data?.summary || null);
      setSelectedCodes([]);
    } catch (err: any) {
      Alert.alert('Geri kazanim', getApiErrorMessage(err, 'Rapor alinamadi.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchHistorical = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await adminApi.getCustomerRecoveryHistoricalValueReport({
        startYear: n(historicalFilters.startYear, 2022),
        inactiveMonths: n(historicalFilters.inactiveMonths, 6),
        minConsecutiveMonths: n(historicalFilters.minConsecutiveMonths, 3),
        minMonthlyAmount: historicalFilters.minMonthlyAmount ? n(historicalFilters.minMonthlyAmount) : undefined,
        search: historicalFilters.search.trim() || undefined,
        sectorCode: historicalFilters.sectorCode.trim() || undefined,
        onlyLostFrequent: historicalFilters.onlyLostFrequent,
        page: 1,
        limit: 60,
        sortBy: 'lostPotentialAdjusted',
        sortDirection: 'desc',
      });
      setRows(response.data?.rows || []);
      setSummary(response.data?.summary || null);
      setSelectedCodes([]);
    } catch (err: any) {
      Alert.alert('Tarihsel deger', getApiErrorMessage(err, 'Rapor alinamadi.'));
    } finally {
      setLoading(false);
    }
  };

  const toggleCode = (code: string) => {
    if (!code) return;
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]));
  };

  const createQuickAction = (row: any) => {
    const code = row.customerCode || row.cariCode;
    if (!code) return;
    if (actionCodeRef.current) return;
    Alert.alert('Aksiyon ac', `${code} icin geri kazanim aksiyonu acilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Ac',
        onPress: async () => {
          if (actionCodeRef.current) return;
          actionCodeRef.current = code;
          setActionCode(code);
          setLoading(true);
          try {
            await adminApi.createCustomerRecoveryAction(code, {
              customerName: row.customerName || null,
              actionType: 'CALL',
              status: 'OPEN',
              priority: n(row.riskScore) >= 70 ? 'HIGH' : 'MEDIUM',
              note: row.recommendedAction || 'Musteri geri kazanim icin aranacak.',
              assignedToId: selectedStaffId || null,
              snapshot: row,
            });
            hapticSuccess();
            Alert.alert('Aksiyon acildi', `${code} icin aksiyon olusturuldu.`);
          } catch (err: any) {
            Alert.alert('Aksiyon', getApiErrorMessage(err, 'Aksiyon acilamadi.'));
          } finally {
            actionCodeRef.current = null;
            setActionCode(null);
            setLoading(false);
          }
        },
      },
    ]);
  };

  const bulkAssign = () => {
    if (!selectedStaffId || !selectedCodes.length) {
      Alert.alert('Toplu atama', 'Personel ve cari secimi gerekli.');
      return;
    }
    Alert.alert('Toplu atama', `${selectedCodes.length} cari ${selectedStaff?.name || 'personele'} atanacak. Onayliyor musunuz?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Ata',
        onPress: async () => {
          setLoading(true);
          try {
            const selectedRows = rows.filter((row) => selectedCodes.includes(row.customerCode));
            await adminApi.bulkAssignCustomerRecovery({
              customerCodes: selectedCodes,
              customerNames: Object.fromEntries(selectedRows.map((row) => [row.customerCode, row.customerName || null])),
              assignedToId: selectedStaffId,
              priority: 'HIGH',
              note: 'Mobil geri kazanim raporundan toplu atandi.',
              snapshotByCustomer: Object.fromEntries(selectedRows.map((row) => [row.customerCode, row])),
            });
            setSelectedCodes([]);
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Toplu atama', getApiErrorMessage(err, 'Atama yapilamadi.'));
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const fetchCurrentPage = async (targetPage: number, limit: number) =>
    adminApi.getCustomerRecoveryReport({
      search: filters.search.trim() || undefined,
      sectorCode: filters.sectorCode.trim() || undefined,
      riskTypes: filters.riskTypes.trim() || undefined,
      recentMonths: n(filters.recentMonths, 3),
      baselineMonths: n(filters.baselineMonths, 12),
      minDropPercent: n(filters.minDropPercent, 40),
      minLostPotential: filters.minLostPotential ? n(filters.minLostPotential) : undefined,
      page: targetPage,
      limit,
      sortBy: 'riskScore',
      sortDirection: 'desc',
    });

  const fetchHistoricalPage = async (targetPage: number, limit: number) =>
    adminApi.getCustomerRecoveryHistoricalValueReport({
      startYear: n(historicalFilters.startYear, 2022),
      inactiveMonths: n(historicalFilters.inactiveMonths, 6),
      minConsecutiveMonths: n(historicalFilters.minConsecutiveMonths, 3),
      minMonthlyAmount: historicalFilters.minMonthlyAmount ? n(historicalFilters.minMonthlyAmount) : undefined,
      search: historicalFilters.search.trim() || undefined,
      sectorCode: historicalFilters.sectorCode.trim() || undefined,
      onlyLostFrequent: historicalFilters.onlyLostFrequent,
      page: targetPage,
      limit,
      sortBy: 'lostPotentialAdjusted',
      sortDirection: 'desc',
    });

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const limit = 500;
      let exportPage = 1;
      let expectedTotal = 0;
      const allRows: any[] = [];

      while (exportPage <= 30) {
        const response = view === 'current'
          ? await fetchCurrentPage(exportPage, limit)
          : await fetchHistoricalPage(exportPage, limit);
        const batch = response.data?.rows || [];
        expectedTotal = response.data?.pagination?.totalRecords || response.data?.summary?.totalCustomers || expectedTotal;
        allRows.push(...batch);
        if (batch.length < limit || (expectedTotal > 0 && allRows.length >= expectedTotal)) break;
        exportPage += 1;
      }

      if (!allRows.length) {
        Alert.alert('Bilgi', 'Disa aktarilacak kayit bulunamadi.');
        return;
      }

      const header = view === 'current'
        ? ['Cari Kodu', 'Cari Adi', 'Sektor', 'Risk Skoru', 'Risk Tipi', 'Kayip Potansiyel', 'Dusus %', 'Son Satis', 'Onerilen Aksiyon']
        : ['Cari Kodu', 'Cari Adi', 'Sektor', 'Kayip Potansiyel', 'Duzeltilmis Kayip', 'Son Satis', 'Aktif Ay', 'Seri Ay', 'En Cok Kayip Kategori/Urun'];
      const dataRows = view === 'current'
        ? allRows.map((row) => [
            row.customerCode || row.cariCode || '',
            row.customerName || row.cariName || '',
            row.sectorCode || row.customerSectorCode || '',
            Number(row.riskScore || 0),
            row.riskType || '',
            Number(row.lostPotential || row.lostPotentialAdjusted || 0),
            Number(row.dropPercent || 0),
            row.lastSaleDate ? dateText(row.lastSaleDate) : '',
            row.recommendedAction || '',
          ])
        : allRows.map((row) => [
            row.customerCode || row.cariCode || '',
            row.customerName || row.cariName || '',
            row.sectorCode || row.customerSectorCode || '',
            Number(row.lostPotential || 0),
            Number(row.lostPotentialAdjusted || row.lostPotential || 0),
            row.lastSaleDate ? dateText(row.lastSaleDate) : '',
            Number(row.activeMonthCount || row.historicalActiveMonths || 0),
            Number(row.maxConsecutiveMonths || row.consecutiveMonths || 0),
            row.topLostCategory?.categoryName || row.topLostProduct?.productName || '',
          ]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
      ws['!cols'] = header.map((title) => ({ wch: Math.min(Math.max(String(title).length + 5, 12), 36) }));
      XLSX.utils.book_append_sheet(wb, ws, view === 'current' ? 'Geri Kazanim' : 'Tarihsel Deger');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}${view === 'current' ? 'geri-kazanim' : 'tarihsel-deger'}-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: view === 'current' ? 'Geri Kazanim Excel' : 'Tarihsel Deger Excel',
        });
      } else {
        Alert.alert('Excel olusturuldu', target);
      }
    } catch (err: any) {
      Alert.alert('Excel olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      setExporting(false);
    }
  };

  const renderCurrentFilters = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Risk raporu</Text>
      <TextInput style={styles.input} placeholder="Cari, unvan veya kod ara" placeholderTextColor={colors.textMuted} value={filters.search} onChangeText={(value) => setFilters((prev) => ({ ...prev, search: value }))} />
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="Sektor" placeholderTextColor={colors.textMuted} value={filters.sectorCode} onChangeText={(value) => setFilters((prev) => ({ ...prev, sectorCode: value }))} />
        <TextInput style={[styles.input, styles.flex]} placeholder="Risk tipleri" placeholderTextColor={colors.textMuted} value={filters.riskTypes} onChangeText={(value) => setFilters((prev) => ({ ...prev, riskTypes: value }))} />
      </View>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="Son ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={filters.recentMonths} onChangeText={(value) => setFilters((prev) => ({ ...prev, recentMonths: value }))} />
        <TextInput style={[styles.input, styles.flex]} placeholder="Baz ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={filters.baselineMonths} onChangeText={(value) => setFilters((prev) => ({ ...prev, baselineMonths: value }))} />
      </View>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="Min dusus %" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={filters.minDropPercent} onChangeText={(value) => setFilters((prev) => ({ ...prev, minDropPercent: value }))} />
        <TextInput style={[styles.input, styles.flex]} placeholder="Min kayip TL" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={filters.minLostPotential} onChangeText={(value) => setFilters((prev) => ({ ...prev, minLostPotential: value }))} />
      </View>
      <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={fetchCurrent} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor' : 'Raporu Yenile'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryButton, exporting && styles.disabled]} onPress={exportExcel} disabled={exporting}>
        <Text style={styles.secondaryButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Excel Paylas'}</Text>
      </TouchableOpacity>
      {summary ? (
        <View style={styles.metricRow}>
          <Metric label="Cari" value={summary.totalCustomers || rows.length} />
          <Metric label="Kayip" value={money(summary.totalLostPotential || 0)} tone="red" />
          <Metric label="Takip" value={summary.dueFollowUpCount || 0} tone="amber" />
          <Metric label="Aksiyon Yok" value={summary.noActionCount || 0} />
        </View>
      ) : null}
    </View>
  );

  const renderHistoricalFilters = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Tarihsel kayip deger</Text>
      <TextInput style={styles.input} placeholder="Cari ara" placeholderTextColor={colors.textMuted} value={historicalFilters.search} onChangeText={(value) => setHistoricalFilters((prev) => ({ ...prev, search: value }))} />
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="Baslangic yil" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={historicalFilters.startYear} onChangeText={(value) => setHistoricalFilters((prev) => ({ ...prev, startYear: value }))} />
        <TextInput style={[styles.input, styles.flex]} placeholder="Pasif ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={historicalFilters.inactiveMonths} onChangeText={(value) => setHistoricalFilters((prev) => ({ ...prev, inactiveMonths: value }))} />
      </View>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="Min seri ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={historicalFilters.minConsecutiveMonths} onChangeText={(value) => setHistoricalFilters((prev) => ({ ...prev, minConsecutiveMonths: value }))} />
        <TextInput style={[styles.input, styles.flex]} placeholder="Min aylik TL" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={historicalFilters.minMonthlyAmount} onChangeText={(value) => setHistoricalFilters((prev) => ({ ...prev, minMonthlyAmount: value }))} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Sadece kayip sik alan" active={historicalFilters.onlyLostFrequent} onPress={() => setHistoricalFilters((prev) => ({ ...prev, onlyLostFrequent: true }))} />
        <Chip label="Tumu" active={!historicalFilters.onlyLostFrequent} onPress={() => setHistoricalFilters((prev) => ({ ...prev, onlyLostFrequent: false }))} />
      </ScrollView>
      <TouchableOpacity style={[styles.primaryButton, loading && styles.disabled]} onPress={fetchHistorical} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor' : 'Raporu Yenile'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryButton, exporting && styles.disabled]} onPress={exportExcel} disabled={exporting}>
        <Text style={styles.secondaryButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Excel Paylas'}</Text>
      </TouchableOpacity>
      {summary ? (
        <View style={styles.metricRow}>
          <Metric label="Cari" value={summary.totalCustomers || rows.length} />
          <Metric label="Kayip" value={money(summary.totalLostPotentialAdjusted || summary.totalLostPotential || 0)} tone="red" />
        </View>
      ) : null}
    </View>
  );

  const renderStaffPicker = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Aksiyon atama</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {staff.map((person) => (
          <Chip key={person.id} label={person.name || person.email} active={selectedStaffId === person.id} onPress={() => setSelectedStaffId(person.id)} />
        ))}
      </ScrollView>
      <Text style={styles.helper}>Secili cari: {selectedCodes.length} · Personel: {selectedStaff?.name || '-'}</Text>
      <TouchableOpacity style={styles.secondaryButton} onPress={bulkAssign} disabled={!selectedCodes.length || !selectedStaffId}>
        <Text style={styles.secondaryButtonText}>Secilileri Toplu Ata</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRow = (row: any, index: number) => {
    const code = row.customerCode || row.cariCode || '';
    const selected = selectedCodes.includes(code);
    return (
      <View key={`${code || index}`} style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle} numberOfLines={2}>{row.customerName || row.cariName || code || 'Cari'}</Text>
            <Text style={styles.cardMeta}>{code} · {row.sectorCode || row.customerSectorCode || '-'}</Text>
          </View>
          <TouchableOpacity style={[styles.badge, selected && styles.badgeSelected]} onPress={() => toggleCode(code)}>
            <Text style={styles.badgeText}>{selected ? 'Secildi' : 'Sec'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.metricRow}>
          <Metric label="Risk" value={row.riskScore ?? row.riskType ?? '-'} tone={n(row.riskScore) >= 70 ? 'red' : 'amber'} />
          <Metric label="Kayip" value={money(row.lostPotential || row.lostPotentialAdjusted || 0)} tone="red" />
          <Metric label="Dusus" value={`%${n(row.dropPercent).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`} />
          <Metric label="Son Satis" value={dateText(row.lastSaleDate)} />
        </View>
        <Text style={styles.cardMeta}>{row.recommendedAction || row.topLostCategory?.categoryName || row.topLostProduct?.productName || '-'}</Text>
        <TouchableOpacity
          style={[styles.primaryButton, actionCode === code && styles.disabled]}
          onPress={() => createQuickAction(row)}
          disabled={actionCode === code}
        >
          <Text style={styles.primaryButtonText}>{actionCode === code ? 'Aciliyor' : 'Aksiyon Ac'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Cari Kurtarma</Text>
            <Text style={styles.title}>Geri Kazanim Raporu</Text>
            <Text style={styles.subtitle}>Kaybedilen cari, risk ve aksiyon atama.</Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Gorunum</Text>
              <Text style={styles.heroStatValue}>{view === 'current' ? 'Guncel' : 'Tarihsel'}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Satir</Text>
              <Text style={styles.heroStatValue}>{rows.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Secili</Text>
              <Text style={styles.heroStatValue}>{selectedCodes.length}</Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label="Guncel Risk" active={view === 'current'} onPress={() => setView('current')} />
          <Chip label="Tarihsel Deger" active={view === 'historical'} onPress={() => setView('historical')} />
        </ScrollView>
        {view === 'current' ? renderCurrentFilters() : renderHistoricalFilters()}
        {renderStaffPicker()}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {!loading && rows.length ? (
          <View style={[styles.reportGrid, isWide && styles.reportGridWide]}>
            {rows.map((row, index) => (
              <View key={`recovery-${view}-${index}`} style={isWide && styles.reportGridItem}>
                {renderRow(row, index)}
              </View>
            ))}
          </View>
        ) : null}
        {!loading && !rows.length ? <Empty text="Rapor kaydi yok." /> : null}
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
  tabRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  reportGrid: { gap: spacing.md },
  reportGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  reportGridItem: { width: '48.7%' },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  cardTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  helper: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  metric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text, marginTop: 2 },
  badge: { backgroundColor: colors.primaryMuted, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeSelected: { backgroundColor: colors.successSoft },
  badgeText: { fontFamily: fonts.bold, fontSize: fontSizes.xs, color: colors.text },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  secondaryButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  disabled: { opacity: 0.55 },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  textDanger: { color: colors.danger },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
});
