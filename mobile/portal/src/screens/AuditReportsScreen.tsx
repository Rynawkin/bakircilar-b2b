import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';
import { normalizeSearchText } from '../utils/search';

type ViewKey = 'staff' | 'toplu' | 'candidates';

const today = () => new Date().toISOString().slice(0, 10);
const beforeDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const money = (value: unknown) =>
  `${n(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;

const dateText = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleString('tr-TR');
};

const cell = (value: any) => {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' && item ? JSON.stringify(item) : String(item ?? ''))).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'red' && styles.textDanger, tone === 'green' && styles.textSuccess, tone === 'amber' && styles.textWarning]}>{value}</Text>
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

export function AuditReportsScreen() {
  const [view, setView] = useState<ViewKey>('staff');
  const [loading, setLoading] = useState(false);
  const [staffRows, setStaffRows] = useState<any[]>([]);
  const [staffSummary, setStaffSummary] = useState<any | null>(null);
  const [exporting, setExporting] = useState(false);
  const [staffFilter, setStaffFilter] = useState({
    startDate: beforeDays(30),
    endDate: today(),
    role: '',
    route: '',
  });

  const [topluRows, setTopluRows] = useState<any[]>([]);
  const [topluSummary, setTopluSummary] = useState<any | null>(null);
  const [topluMeta, setTopluMeta] = useState({ months: '12', minRepeatMonths: '3', windowFrom: '', windowTo: '' });
  const [topluSearch, setTopluSearch] = useState('');
  const [onlyRhythmic, setOnlyRhythmic] = useState(true);
  const [candidateRows, setCandidateRows] = useState<any[]>([]);
  const [candidateSummary, setCandidateSummary] = useState<any | null>(null);
  const [candidateMeta, setCandidateMeta] = useState({ months: '12', spikeFactor: '3', minQty: '0', windowFrom: '', windowTo: '' });
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateMarked, setCandidateMarked] = useState<Record<string, { marked: number; failed: number }>>({});

  const filteredTopluRows = useMemo(() => {
    const term = normalizeSearchText(topluSearch);
    let rows = topluRows;
    if (onlyRhythmic) rows = rows.filter((row) => row.isRhythmic);
    if (!term) return rows;
    return rows.filter((row) =>
      normalizeSearchText(`${row.cariCode || ''} ${row.cariName || ''} ${row.productCode || ''} ${row.productName || ''}`).includes(term)
    );
  }, [topluRows, topluSearch, onlyRhythmic]);

  const filteredCandidateRows = useMemo(() => {
    const term = normalizeSearchText(candidateSearch);
    if (!term) return candidateRows;
    return candidateRows.filter((row) =>
      normalizeSearchText(`${row.cariCode || ''} ${row.cariName || ''} ${row.productCode || ''} ${row.productName || ''}`).includes(term)
    );
  }, [candidateRows, candidateSearch]);

  useEffect(() => {
    fetchStaffActivity();
  }, []);

  const fetchStaffActivity = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await adminApi.getStaffActivityReport({
        startDate: staffFilter.startDate || undefined,
        endDate: staffFilter.endDate || undefined,
        role: staffFilter.role || undefined,
        route: staffFilter.route || undefined,
        page: 1,
        limit: 80,
      });
      const payload = response.data || {};
      setStaffRows(payload.rows || payload.items || payload.data || []);
      setStaffSummary(payload.summary || null);
    } catch (err: any) {
      Alert.alert('Personel aktivite', getApiErrorMessage(err, 'Rapor alinamadi.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchTopluAudit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await adminApi.getTopluAudit({
        months: n(topluMeta.months, 12),
        minRepeatMonths: n(topluMeta.minRepeatMonths, 3),
      });
      const payload = response.data || {};
      setTopluRows(payload.rows || []);
      setTopluSummary(payload.summary || null);
      setTopluMeta((prev) => ({
        ...prev,
        windowFrom: payload.windowFrom || prev.windowFrom,
        windowTo: payload.windowTo || prev.windowTo,
      }));
    } catch (err: any) {
      Alert.alert('TOPLU denetim', getApiErrorMessage(err, 'Rapor alinamadi.'));
    } finally {
      setLoading(false);
    }
  };

  const unmarkToplu = (row: any) => {
    if (!row.cariCode || !row.productCode) return;
    const fromDate = topluMeta.windowFrom || beforeDays(n(topluMeta.months, 12) * 31);
    const toDate = topluMeta.windowTo || today();
    Alert.alert(
      'TOPLU kaldir',
      `${row.cariCode} / ${row.productCode} icin ${fromDate} - ${toDate} araligindaki TOPLU isaretleri kaldirilsin mi?`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Kaldir',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const response = await adminApi.unmarkTopluGroup({
                cariCode: row.cariCode,
                productCode: row.productCode,
                fromDate,
                toDate,
              });
              Alert.alert('TOPLU kaldirildi', `${response.data.affected} satir guncellendi.`);
              hapticSuccess();
              await fetchTopluAudit();
            } catch (err: any) {
              Alert.alert('TOPLU kaldirma', getApiErrorMessage(err, 'Islem yapilamadi.'));
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const fetchTopluCandidates = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await adminApi.getTopluCandidates({
        months: n(candidateMeta.months, 12),
        spikeFactor: n(candidateMeta.spikeFactor, 3),
        minQty: n(candidateMeta.minQty, 0),
      });
      const payload = response.data || {};
      setCandidateRows(payload.rows || []);
      setCandidateSummary(payload.summary || null);
      setCandidateMarked({});
      setCandidateMeta((prev) => ({
        ...prev,
        windowFrom: payload.windowFrom || prev.windowFrom,
        windowTo: payload.windowTo || prev.windowTo,
      }));
    } catch (err: any) {
      Alert.alert('TOPLU adaylari', getApiErrorMessage(err, 'Aday raporu alinamadi.'));
    } finally {
      setLoading(false);
    }
  };

  const candidateKey = (row: any) => `${row.cariCode || ''}|${row.productCode || ''}`;

  const markCandidate = (row: any) => {
    const spikeDocs = Array.isArray(row.spikeDocs) ? row.spikeDocs : [];
    if (!spikeDocs.length) {
      Alert.alert('TOPLU adaylari', 'Bu aday icin isaretlenecek evrak satiri yok.');
      return;
    }

    Alert.alert(
      'TOPLUya al',
      `${row.cariCode} / ${row.productCode} icin ${spikeDocs.length} satis satiri TOPLU olarak isaretlensin mi?`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Topluya Al',
          onPress: async () => {
            setLoading(true);
            try {
              const lines = spikeDocs.map((doc: any) => ({
                productCode: row.productCode,
                lineGuid: doc.lineGuid,
                documentSeries: doc.documentSeries,
                documentSequence: Number(doc.documentSequence || 0),
                documentLineNo: Number(doc.documentLineNo || 0),
              }));
              const response = await adminApi.markTopluCandidateLines(lines);
              const marked = Number(response.data?.marked || 0);
              const failed = Array.isArray(response.data?.failed) ? response.data.failed.length : 0;
              setCandidateMarked((prev) => ({ ...prev, [candidateKey(row)]: { marked, failed } }));
              Alert.alert('TOPLUya alindi', `${marked} satir isaretlendi.${failed ? ` ${failed} satir basarisiz.` : ''}`);
              hapticSuccess();
            } catch (err: any) {
              Alert.alert('TOPLUya al', getApiErrorMessage(err, 'Islem yapilamadi.'));
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const exportExcel = async () => {
    if (exporting) return;
    const rows = view === 'staff' ? staffRows : view === 'toplu' ? filteredTopluRows : filteredCandidateRows;
    if (!rows.length) {
      Alert.alert('Bilgi', 'Disa aktarilacak rapor satiri yok.');
      return;
    }

    setExporting(true);
    try {
      const sheetRows = view === 'staff'
        ? [
            ['Personel', 'E-posta/ID', 'Rol', 'Route', 'Olay', 'Tekil Cari', 'Son Aktivite'],
            ...rows.map((row) => [
              cell(row.userName || row.name),
              cell(row.email || row.userId || row.id),
              cell(row.role),
              cell(row.route || row.lastRoute),
              cell(row.eventCount || row.count || row.totalEvents),
              cell(row.uniqueCustomers || row.customerCount),
              cell(row.lastActivityAt || row.lastActivity || row.createdAt),
            ]),
          ]
        : view === 'toplu'
          ? [
            ['Cari Kodu', 'Cari Adi', 'Urun Kodu', 'Urun Adi', 'Ritmik', 'Ay Sayisi', 'Miktar', 'Tutar', 'Son Satis'],
            ...rows.map((row) => [
              cell(row.cariCode),
              cell(row.cariName),
              cell(row.productCode),
              cell(row.productName),
              cell(row.isRhythmic),
              cell(row.monthsCount),
              cell(row.totalQuantity),
              cell(row.totalAmount),
              cell(row.lastSaleDate),
            ]),
          ]
          : [
            ['Cari Kodu', 'Cari Adi', 'Urun Kodu', 'Urun Adi', 'Evrak Sayisi', 'Tipik Miktar', 'Sicrama Miktari', 'Sicrama Tutari', 'Evraklar'],
            ...rows.map((row) => [
              cell(row.cariCode),
              cell(row.cariName),
              cell(row.productCode),
              cell(row.productName),
              cell(row.docCount || row.spikeDocs?.length),
              cell(row.typicalDocQty),
              cell(row.totalSpikeQty),
              cell(row.totalSpikeAmount),
              cell((row.spikeDocs || []).map((doc: any) => `${doc.documentNo || `${doc.documentSeries}-${doc.documentSequence}`}:${doc.quantity}`).join(' | ')),
            ]),
          ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws['!cols'] = sheetRows[0].map((title: any) => ({
        wch: Math.min(Math.max(String(title || '').length + 5, 12), 42),
      }));
      XLSX.utils.book_append_sheet(wb, ws, view === 'staff' ? 'Personel Aktivite' : view === 'toplu' ? 'TOPLU Denetim' : 'TOPLU Adaylari');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}${view === 'staff' ? 'personel-aktivite' : view === 'toplu' ? 'toplu-denetim' : 'toplu-adaylari'}-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: view === 'staff' ? 'Personel Aktivite Excel' : view === 'toplu' ? 'TOPLU Denetim Excel' : 'TOPLU Adaylari Excel',
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

  const renderStaffHeader = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Personel aktivite</Text>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="Baslangic" placeholderTextColor={colors.textMuted} value={staffFilter.startDate} onChangeText={(value) => setStaffFilter((prev) => ({ ...prev, startDate: value }))} />
        <TextInput style={[styles.input, styles.flex]} placeholder="Bitis" placeholderTextColor={colors.textMuted} value={staffFilter.endDate} onChangeText={(value) => setStaffFilter((prev) => ({ ...prev, endDate: value }))} />
      </View>
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="Rol" placeholderTextColor={colors.textMuted} value={staffFilter.role} onChangeText={(value) => setStaffFilter((prev) => ({ ...prev, role: value }))} />
        <TextInput style={[styles.input, styles.flex]} placeholder="Route" placeholderTextColor={colors.textMuted} value={staffFilter.route} onChangeText={(value) => setStaffFilter((prev) => ({ ...prev, route: value }))} />
      </View>
      <TouchableOpacity style={[styles.primaryButton, loading && styles.disabledButton]} onPress={fetchStaffActivity} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor' : 'Raporu Yenile'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.exportButton, exporting && styles.disabledButton]} onPress={exportExcel} disabled={exporting || !staffRows.length}>
        <Text style={styles.exportButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Excel Paylas'}</Text>
      </TouchableOpacity>
      {staffSummary ? (
        <View style={styles.metricRow}>
          <Metric label="Olay" value={staffSummary.totalEvents || staffSummary.total || 0} />
          <Metric label="Kullanici" value={staffSummary.uniqueUsers || staffSummary.userCount || 0} />
          <Metric label="Route" value={staffSummary.uniqueRoutes || staffSummary.routeCount || 0} />
        </View>
      ) : null}
    </View>
  );

  const renderStaffRows = () => (
    <>
      {renderStaffHeader()}
      {staffRows.length ? staffRows.map((row, index) => (
        <View key={`${row.userId || row.id || index}`} style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={1}>{row.userName || row.name || row.email || row.userId || 'Personel'}</Text>
          <Text style={styles.cardMeta}>Rol: {row.role || '-'} · Route: {row.route || row.lastRoute || '-'}</Text>
          <View style={styles.metricRow}>
            <Metric label="Olay" value={row.eventCount || row.count || row.totalEvents || 0} />
            <Metric label="Tekil Cari" value={row.uniqueCustomers || row.customerCount || 0} />
            <Metric label="Son Aktivite" value={dateText(row.lastActivityAt || row.lastActivity || row.createdAt)} />
          </View>
        </View>
      )) : <Empty text="Personel aktivite kaydi yok." />}
    </>
  );

  const renderTopluRows = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>TOPLU denetim</Text>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={topluMeta.months} onChangeText={(value) => setTopluMeta((prev) => ({ ...prev, months: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Tekrar ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={topluMeta.minRepeatMonths} onChangeText={(value) => setTopluMeta((prev) => ({ ...prev, minRepeatMonths: value }))} />
        </View>
        <TextInput style={styles.input} placeholder="Cari veya urun ara" placeholderTextColor={colors.textMuted} value={topluSearch} onChangeText={setTopluSearch} />
        <View style={styles.actionRow}>
          <Chip label="Ritmikler" active={onlyRhythmic} onPress={() => setOnlyRhythmic(true)} />
          <Chip label="Tumu" active={!onlyRhythmic} onPress={() => setOnlyRhythmic(false)} />
          <TouchableOpacity style={[styles.primaryButton, loading && styles.disabledButton]} onPress={fetchTopluAudit} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor' : 'Raporu Yenile'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.exportButton, exporting && styles.disabledButton]} onPress={exportExcel} disabled={exporting || !filteredTopluRows.length}>
          <Text style={styles.exportButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Excel Paylas'}</Text>
        </TouchableOpacity>
        {topluSummary ? (
          <View style={styles.metricRow}>
            <Metric label="Grup" value={topluSummary.totalGroups || topluRows.length} />
            <Metric label="Ritmik" value={topluSummary.rhythmicGroups || 0} tone="amber" />
            <Metric label="Tutar" value={money(topluSummary.rhythmicTotalAmount || 0)} />
          </View>
        ) : null}
      </View>
      {filteredTopluRows.length ? filteredTopluRows.map((row, index) => (
        <View key={`${row.cariCode}-${row.productCode}-${index}`} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle} numberOfLines={2}>{row.cariName || row.cariCode}</Text>
              <Text style={styles.cardMeta}>{row.cariCode} · {row.productCode}</Text>
            </View>
            <View style={[styles.badge, row.isRhythmic && styles.badgeWarning]}>
              <Text style={styles.badgeText}>{row.isRhythmic ? 'Ritmik' : 'Tekil'}</Text>
            </View>
          </View>
          <Text style={styles.cardMeta} numberOfLines={2}>{row.productName || '-'}</Text>
          <View style={styles.metricRow}>
            <Metric label="Ay" value={row.monthsCount || 0} />
            <Metric label="Miktar" value={n(row.totalQuantity).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} />
            <Metric label="Tutar" value={money(row.totalAmount)} />
            <Metric label="Son Satis" value={dateText(row.lastSaleDate)} />
          </View>
          {row.isRhythmic ? (
            <TouchableOpacity style={styles.warningButton} onPress={() => unmarkToplu(row)}>
              <Text style={styles.warningButtonText}>TOPLU Isaretini Kaldir</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )) : <Empty text="TOPLU denetim kaydi yok." />}
    </>
  );

  const renderCandidateRows = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>TOPLU adaylari</Text>
        <Text style={styles.cardMeta}>Tipik satis miktarinin cok uzerindeki, TOPLU olarak isaretlenmemis satis satirlarini bulur.</Text>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Ay" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={candidateMeta.months} onChangeText={(value) => setCandidateMeta((prev) => ({ ...prev, months: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Sicrama x" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={candidateMeta.spikeFactor} onChangeText={(value) => setCandidateMeta((prev) => ({ ...prev, spikeFactor: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Min miktar" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={candidateMeta.minQty} onChangeText={(value) => setCandidateMeta((prev) => ({ ...prev, minQty: value }))} />
        </View>
        <TextInput style={styles.input} placeholder="Cari veya urun ara" placeholderTextColor={colors.textMuted} value={candidateSearch} onChangeText={setCandidateSearch} />
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.primaryButton, loading && styles.disabledButton]} onPress={fetchTopluCandidates} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Yukleniyor' : 'Adaylari Getir'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportButton, exporting && styles.disabledButton]} onPress={exportExcel} disabled={exporting || !filteredCandidateRows.length}>
            <Text style={styles.exportButtonText}>{exporting ? 'Excel hazirlaniyor' : 'Excel Paylas'}</Text>
          </TouchableOpacity>
        </View>
        {candidateSummary ? (
          <View style={styles.metricRow}>
            <Metric label="Aday Grup" value={candidateSummary.groupCount || candidateRows.length} tone="amber" />
            <Metric label="Sicrama Tutari" value={money(candidateSummary.totalSpikeAmount || 0)} />
            <Metric label="Pencere" value={candidateMeta.windowFrom ? `${candidateMeta.windowFrom.slice(0, 10)} - ${candidateMeta.windowTo.slice(0, 10)}` : '-'} />
          </View>
        ) : null}
      </View>

      {filteredCandidateRows.length ? filteredCandidateRows.map((row, index) => {
        const key = candidateKey(row);
        const marked = candidateMarked[key];
        const spikeDocs = Array.isArray(row.spikeDocs) ? row.spikeDocs : [];
        return (
          <View key={`${key}-${index}`} style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle} numberOfLines={2}>{row.cariName || row.cariCode}</Text>
                <Text style={styles.cardMeta}>{row.cariCode} Â· {row.productCode}</Text>
              </View>
              <View style={[styles.badge, styles.badgeWarning]}>
                <Text style={styles.badgeText}>{spikeDocs.length || row.docCount || 0} evrak</Text>
              </View>
            </View>
            <Text style={styles.cardMeta} numberOfLines={2}>{row.productName || '-'}</Text>
            <View style={styles.metricRow}>
              <Metric label="Tipik" value={n(row.typicalDocQty).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} />
              <Metric label="Sicrama" value={n(row.totalSpikeQty).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} tone="amber" />
              <Metric label="Tutar" value={money(row.totalSpikeAmount)} />
            </View>
            {spikeDocs.slice(0, 4).map((doc: any, docIndex: number) => (
              <Text key={`${doc.lineGuid || docIndex}`} style={styles.cardMeta}>
                {dateText(doc.documentDate)} Â· {doc.documentNo || `${doc.documentSeries || ''}-${doc.documentSequence || ''}`} Â· {n(doc.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} adet Â· {money(doc.amount)}
              </Text>
            ))}
            {spikeDocs.length > 4 ? <Text style={styles.cardMeta}>+{spikeDocs.length - 4} evrak satiri daha</Text> : null}
            {marked ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{marked.marked} satir TOPLU yapildi{marked.failed ? `, ${marked.failed} hata` : ''}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.warningButton} onPress={() => markCandidate(row)}>
                <Text style={styles.warningButtonText}>Bu Adayi TOPLUya Al</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }) : <Empty text="TOPLU adayi yok. Filtreleri degistirip tekrar deneyin." />}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Operasyon Denetimi</Text>
          <Text style={styles.title}>Denetim Raporlari</Text>
          <Text style={styles.subtitle}>Personel aktivite ve TOPLU isaret kontrolu.</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label="Personel" active={view === 'staff'} onPress={() => setView('staff')} />
          <Chip label="TOPLU" active={view === 'toplu'} onPress={() => setView('toplu')} />
          <Chip label="Adaylar" active={view === 'candidates'} onPress={() => setView('candidates')} />
        </ScrollView>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {view === 'staff' ? renderStaffRows() : view === 'toplu' ? renderTopluRows() : renderCandidateRows()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.xs, gap: spacing.md },
  kicker: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#93C5FD', textTransform: 'uppercase' },
  title: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF' },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: '#DDE8FF', lineHeight: 20 },
  tabRow: { gap: spacing.sm, paddingVertical: spacing.xs },
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
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  cardTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
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
  badgeWarning: { backgroundColor: colors.warningSoft },
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
  exportButton: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  warningButton: {
    backgroundColor: colors.warningSoft,
    borderColor: '#FDBA74',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.warning },
  disabledButton: { opacity: 0.55 },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  textDanger: { color: colors.danger },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
});
