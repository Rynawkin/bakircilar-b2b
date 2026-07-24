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
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { adminApi, type VadeImportResult } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { StaffMember, VadeAssignment, VadeBalance, VadeNote } from '../types';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';
import { parseVadeExcelWorksheet } from '../utils/vadeExcelImport';

type VadeView = 'balances' | 'notes' | 'calendar' | 'assignments' | 'import';

type PickedExcelFile = {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
};

type ExcelImportSummary = VadeImportResult & { total: number };

const pad2 = (value: number) => String(value).padStart(2, '0');

const formatCalendarDate = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const formatLocalCalendarDate = (date: Date) =>
  formatCalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());

const today = () => formatLocalCalendarDate(new Date()) || '';

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatLocalCalendarDate(date) || '';
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
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('tr-TR');
};

const customerTitle = (balance?: VadeBalance | null) =>
  balance?.user?.name || balance?.user?.mikroCariCode || '-';

const viewTitles: Record<VadeView, string> = {
  balances: 'Bakiyeler',
  notes: 'Notlar',
  calendar: 'Hatirlatma Takvimi',
  assignments: 'Atamalar',
  import: 'Manuel Import',
};

const cell = (value: unknown) => {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const readVadeExcelRows = async (file: PickedExcelFile) => {
  const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
  const workbook = XLSX.read(base64, { type: 'base64', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Excel dosyasinda sayfa bulunamadi.');
  }
  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];
  const formattedRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];
  const date1904 = workbook.Workbook?.WBProps?.date1904 === true;
  return parseVadeExcelWorksheet(rawRows, {
    formattedRows,
    date1904,
    maxHeaderRows: 50,
  });
};

const buildBalanceRows = (rows: VadeBalance[]) => [
  [
    'Cari Kodu',
    'Cari',
    'Sektor',
    'Grup',
    'Vadesi Gecen',
    'Geciken Vade',
    'Vadesi Gelmemis',
    'Gelecek Vade',
    'Toplam Bakiye',
    'Valor',
    'Vade Plani',
    'Referans Tarihi',
    'Kaynak',
    'Son Not',
    'Guncelleme',
  ],
  ...rows.map((row) => [
    cell(row.user?.mikroCariCode),
    cell(row.user?.name),
    cell(row.user?.sectorCode),
    cell(row.user?.groupCode),
    cell(row.pastDueBalance),
    cell(row.pastDueDate ? dateText(row.pastDueDate) : ''),
    cell(row.notDueBalance),
    cell(row.notDueDate ? dateText(row.notDueDate) : ''),
    cell(row.totalBalance),
    cell(row.valor),
    cell(row.paymentTermLabel),
    cell(row.referenceDate ? dateText(row.referenceDate) : ''),
    cell(row.source),
    cell(row.lastNoteAt ? dateText(row.lastNoteAt) : ''),
    cell(row.updatedAt ? dateText(row.updatedAt) : ''),
  ]),
];

const buildNoteRows = (rows: VadeNote[]) => [
  [
    'Cari ID',
    'Not',
    'Yazar',
    'Tarih',
    'Etiketler',
    'Soz Tarihi',
    'Hatirlatma Tarihi',
    'Hatirlatma Notu',
    'Hatirlatma Durumu',
    'Bakiye',
  ],
  ...rows.map((row) => [
    cell(row.customerId),
    cell(row.noteContent),
    cell(row.author?.name),
    cell(row.createdAt ? dateText(row.createdAt) : ''),
    cell(row.tags),
    cell(row.promiseDate ? dateText(row.promiseDate) : ''),
    cell(row.reminderDate ? dateText(row.reminderDate) : ''),
    cell(row.reminderNote),
    row.reminderDate ? (row.reminderCompleted ? 'Tamamlandi' : 'Bekliyor') : '',
    cell(row.balanceAtTime),
  ]),
];

const buildAssignmentRows = (rows: VadeAssignment[]) => [
  ['Personel', 'Personel Email', 'Cari', 'Cari Kodu', 'Atama Tarihi'],
  ...rows.map((row) => [
    cell(row.staff?.name || row.staffId),
    cell(row.staff?.email),
    cell(row.customer?.name || row.customerId),
    cell(row.customer?.mikroCariCode),
    cell(row.createdAt ? dateText(row.createdAt) : ''),
  ]),
];

function Chip({ label, active, onPress, danger }: { label: string; active?: boolean; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive, danger && styles.chipDanger]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive, danger && styles.chipTextDanger]}>{label}</Text>
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

export function VadeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PortalStackParamList>>();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [view, setView] = useState<VadeView>('balances');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [balances, setBalances] = useState<VadeBalance[]>([]);
  const [summary, setSummary] = useState<{ overdue: number; upcoming: number; total: number; count?: number } | null>(null);
  const [notes, setNotes] = useState<VadeNote[]>([]);
  const [assignments, setAssignments] = useState<VadeAssignment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [noteForm, setNoteForm] = useState({
    customerId: '',
    noteContent: '',
    promiseDate: '',
    tags: '',
    reminderDate: '',
    reminderNote: '',
  });
  const [noteFilters, setNoteFilters] = useState({ tag: '', startDate: '', endDate: '' });
  const [calendarRange, setCalendarRange] = useState({ from: today(), to: addDays(30), completed: false });

  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  const [importRow, setImportRow] = useState({
    mikroCariCode: '',
    pastDueBalance: '',
    pastDueDate: '',
    notDueBalance: '',
    notDueDate: '',
    totalBalance: '',
    valor: '',
  });
  const [excelFile, setExcelFile] = useState<PickedExcelFile | null>(null);
  const [excelPreview, setExcelPreview] = useState<{ rowCount: number; sampleCodes: string[]; headerCount: number } | null>(null);
  const [excelImportSummary, setExcelImportSummary] = useState<ExcelImportSummary | null>(null);
  const actionLoadingRef = useRef(false);
  const exportingRef = useRef(false);
  const balancesSeqRef = useRef(0);
  const notesSeqRef = useRef(0);
  const calendarSeqRef = useRef(0);
  const assignmentsSeqRef = useRef(0);

  const beginAction = () => {
    if (actionLoadingRef.current) return false;
    actionLoadingRef.current = true;
    setActionLoading(true);
    return true;
  };

  const endAction = () => {
    actionLoadingRef.current = false;
    setActionLoading(false);
  };

  const beginExport = () => {
    if (exportingRef.current) return false;
    exportingRef.current = true;
    setExporting(true);
    return true;
  };

  const endExport = () => {
    exportingRef.current = false;
    setExporting(false);
  };

  const selectedBalance = balances.find((row) => row.user.id === noteForm.customerId);
  const selectedStaff = staff.find((row) => row.id === selectedStaffId);
  const selectedAssignmentCount = assignments.filter((row) => row.staffId === selectedStaffId).length;
  const currentExportCount = useMemo(() => {
    if (view === 'balances') return balances.length;
    if (view === 'notes' || view === 'calendar') return notes.length;
    if (view === 'assignments') return assignments.length;
    if (view === 'import') return excelPreview?.rowCount || 0;
    return 0;
  }, [assignments.length, balances.length, excelPreview?.rowCount, notes.length, view]);

  const excelFileSizeText = useMemo(() => {
    if (!excelFile?.size) return '';
    return `${(excelFile.size / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
  }, [excelFile?.size]);

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (view === 'balances') {
      loadBalances();
    } else if (view === 'notes') {
      loadNotes();
    } else if (view === 'calendar') {
      loadCalendar();
    } else if (view === 'assignments') {
      loadAssignments();
    }
  }, [view]);

  useEffect(() => {
    if (view === 'assignments' && selectedStaffId) {
      loadAssignments();
    }
  }, [selectedStaffId]);

  const loadInitial = async () => {
    setLoading(true);
    try {
      await Promise.all([loadBalances(false), loadStaff(), loadAssignments(false)]);
    } finally {
      setLoading(false);
    }
  };

  const loadBalances = async (withSpinner = true) => {
    const requestSeq = ++balancesSeqRef.current;
    if (withSpinner) setLoading(true);
    try {
      const response = await adminApi.getVadeBalances({ search: search.trim() || undefined, limit: 80 });
      if (requestSeq !== balancesSeqRef.current) return;
      setBalances(response.balances || []);
      setSummary(response.summary || null);
    } catch (err: any) {
      if (requestSeq !== balancesSeqRef.current) return;
      Alert.alert('Vade bakiyeleri', getApiErrorMessage(err, 'Bakiyeler alinamadi.'));
    } finally {
      if (withSpinner && requestSeq === balancesSeqRef.current) setLoading(false);
    }
  };

  const loadNotes = async (withSpinner = true) => {
    const requestSeq = ++notesSeqRef.current;
    if (withSpinner) setLoading(true);
    try {
      const response = await adminApi.getVadeNotes({
        tag: noteFilters.tag.trim() || undefined,
        startDate: noteFilters.startDate || undefined,
        endDate: noteFilters.endDate || undefined,
      });
      if (requestSeq !== notesSeqRef.current) return;
      setNotes(response.notes || []);
    } catch (err: any) {
      if (requestSeq !== notesSeqRef.current) return;
      Alert.alert('Vade notlari', getApiErrorMessage(err, 'Notlar alinamadi.'));
    } finally {
      if (withSpinner && requestSeq === notesSeqRef.current) setLoading(false);
    }
  };

  const loadCalendar = async (withSpinner = true) => {
    const requestSeq = ++calendarSeqRef.current;
    if (withSpinner) setLoading(true);
    try {
      const response = await adminApi.getVadeNotes({
        reminderOnly: true,
        reminderCompleted: calendarRange.completed,
        reminderFrom: calendarRange.from || undefined,
        reminderTo: calendarRange.to || undefined,
      });
      if (requestSeq !== calendarSeqRef.current) return;
      setNotes(response.notes || []);
    } catch (err: any) {
      if (requestSeq !== calendarSeqRef.current) return;
      Alert.alert('Hatirlatmalar', getApiErrorMessage(err, 'Hatirlatmalar alinamadi.'));
    } finally {
      if (withSpinner && requestSeq === calendarSeqRef.current) setLoading(false);
    }
  };

  const loadAssignments = async (withSpinner = true) => {
    const requestSeq = ++assignmentsSeqRef.current;
    if (withSpinner) setLoading(true);
    try {
      const response = await adminApi.getVadeAssignments(selectedStaffId ? { staffId: selectedStaffId } : undefined);
      if (requestSeq !== assignmentsSeqRef.current) return;
      setAssignments(response.assignments || []);
    } catch (err: any) {
      if (requestSeq !== assignmentsSeqRef.current) return;
      Alert.alert('Vade atamalari', getApiErrorMessage(err, 'Atamalar alinamadi.'));
    } finally {
      if (withSpinner && requestSeq === assignmentsSeqRef.current) setLoading(false);
    }
  };

  const loadStaff = async () => {
    try {
      const response = await adminApi.getStaffMembers();
      setStaff(response.staff || []);
      setSelectedStaffId((current) => current || response.staff?.[0]?.id || '');
    } catch {
      setStaff([]);
    }
  };

  const openNoteForCustomer = (balance: VadeBalance) => {
    setNoteForm((prev) => ({
      ...prev,
      customerId: balance.user.id,
      reminderDate: prev.reminderDate || addDays(1),
    }));
    setView('notes');
  };

  const createNote = async () => {
    if (actionLoadingRef.current) return;
    if (!noteForm.customerId || !noteForm.noteContent.trim()) {
      Alert.alert('Not ekle', 'Cari ve not icerigi zorunlu.');
      return;
    }
    if (!beginAction()) return;
    try {
      await adminApi.createVadeNote({
        customerId: noteForm.customerId,
        noteContent: noteForm.noteContent.trim(),
        promiseDate: noteForm.promiseDate || null,
        tags: noteForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        reminderDate: noteForm.reminderDate || null,
        reminderNote: noteForm.reminderNote.trim() || null,
        reminderCompleted: false,
        balanceAtTime: selectedBalance?.pastDueBalance ?? null,
      });
      setNoteForm((prev) => ({ ...prev, noteContent: '', promiseDate: '', tags: '', reminderDate: '', reminderNote: '' }));
      await loadNotes(false);
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Not ekle', getApiErrorMessage(err, 'Not kaydedilemedi.'));
    } finally {
      endAction();
    }
  };

  const completeReminder = (note: VadeNote) => {
    if (actionLoadingRef.current) return;
    Alert.alert('Hatirlatma', 'Hatirlatma tamamlandi olarak isaretlensin mi?', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Tamamla',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            await adminApi.updateVadeNote(note.id, { reminderCompleted: true });
            if (view === 'calendar') {
              await loadCalendar(false);
            } else {
              await loadNotes(false);
            }
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Hatirlatma', getApiErrorMessage(err, 'Hatirlatma guncellenemedi.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  };

  const assignSelected = async () => {
    if (actionLoadingRef.current) return;
    if (!selectedStaffId || !selectedCustomerIds.length) {
      Alert.alert('Atama', 'Personel ve cari secimi gerekli.');
      return;
    }
    if (!beginAction()) return;
    try {
      await adminApi.assignVadeCustomers({ staffId: selectedStaffId, customerIds: selectedCustomerIds });
      setSelectedCustomerIds([]);
      await loadAssignments(false);
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Atama', getApiErrorMessage(err, 'Atama yapilamadi.'));
    } finally {
      endAction();
    }
  };

  const removeAssignment = (assignment: VadeAssignment) => {
    if (actionLoadingRef.current) return;
    Alert.alert('Atamayi kaldir', `${assignment.customer?.name || assignment.customerId} atamasi kaldirilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Kaldir',
        style: 'destructive',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            await adminApi.removeVadeAssignment({ staffId: assignment.staffId, customerId: assignment.customerId });
            await loadAssignments(false);
          } catch (err: any) {
            Alert.alert('Atama', getApiErrorMessage(err, 'Atama kaldirilamadi.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const importBalance = () => {
    if (actionLoadingRef.current) return;
    if (!importRow.mikroCariCode.trim()) {
      Alert.alert('Import', 'Cari kod gerekli.');
      return;
    }
    Alert.alert('Manuel vade kaydi', 'Bu islem yalnizca tek cari icin acil duzeltme gonderir. Toplu rapor icin yukaridaki Excel importu kullanin.', [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Kaydet',
        onPress: async () => {
          if (!beginAction()) return;
          try {
            await adminApi.importVadeBalances(
              [
                {
                  mikroCariCode: importRow.mikroCariCode.trim(),
                  pastDueBalance: importRow.pastDueBalance ? n(importRow.pastDueBalance) : undefined,
                  pastDueDate: importRow.pastDueDate || undefined,
                  notDueBalance: importRow.notDueBalance ? n(importRow.notDueBalance) : undefined,
                  notDueDate: importRow.notDueDate || undefined,
                  totalBalance: importRow.totalBalance ? n(importRow.totalBalance) : undefined,
                  valor: importRow.valor ? n(importRow.valor) : undefined,
                },
              ],
              { mode: 'PATCH', createMissingCustomers: false },
            );
            setImportRow({ mikroCariCode: '', pastDueBalance: '', pastDueDate: '', notDueBalance: '', notDueDate: '', totalBalance: '', valor: '' });
            await loadBalances(false);
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Import', getApiErrorMessage(err, 'Kayit gonderilemedi.'));
          } finally {
            endAction();
          }
        },
      },
    ]);
  };

  const chooseVadeExcelFile = async () => {
    if (actionLoadingRef.current) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Excel', 'Dosya secilemedi.');
        return;
      }

      const picked: PickedExcelFile = {
        uri: asset.uri,
        name: asset.name || 'vade-raporu.xlsx',
        size: asset.size,
        mimeType: asset.mimeType,
      };

      if (!beginAction()) return;
      try {
        const parsed = await readVadeExcelRows(picked);
        setExcelFile(picked);
        setExcelPreview({
          rowCount: parsed.rows.length,
          sampleCodes: parsed.rows.slice(0, 4).map((row) => row.mikroCariCode),
          headerCount: parsed.headers.length,
        });
        setExcelImportSummary(null);
        hapticSuccess();
      } catch (err: any) {
        setExcelFile(null);
        setExcelPreview(null);
        setExcelImportSummary(null);
        Alert.alert('Excel okunamadi', err?.message || 'Dosya kolonlari okunamadi.');
      } finally {
        endAction();
      }
    } catch (err: any) {
      Alert.alert('Excel', getApiErrorMessage(err, 'Dosya secilemedi.'));
    }
  };

  const importExcelBalances = () => {
    if (actionLoadingRef.current) return;
    if (!excelFile) {
      Alert.alert('Excel import', 'Once Mikro vade raporu Excel dosyasini secin.');
      return;
    }

    const rowCountText = excelPreview?.rowCount ? `${excelPreview.rowCount} satir` : 'secilen satirlar';
    Alert.alert(
      'Excel vade import',
      `${excelFile.name} icindeki ${rowCountText} tek islemde aktarilsin mi? Dosyada olmayan mevcut bakiyeler silinmez; B2B'de bulunmayan cariler girise kapali vade carisi olarak olusturulabilir.`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Import Et',
          onPress: async () => {
            if (!beginAction()) return;
            try {
              const parsed = await readVadeExcelRows(excelFile);
              const result = await adminApi.importVadeBalances(
                parsed.rows,
                { mode: 'SNAPSHOT', createMissingCustomers: true },
              );
              setExcelPreview({
                rowCount: parsed.rows.length,
                sampleCodes: parsed.rows.slice(0, 4).map((row) => row.mikroCariCode),
                headerCount: parsed.headers.length,
              });
              setExcelImportSummary({
                total: parsed.rows.length,
                imported: Number(result.imported || 0),
                skipped: Number(result.skipped || 0),
                createdCustomers: Number(result.createdCustomers || 0),
                staleRemoved: Number(result.staleRemoved || 0),
                skipReasons: result.skipReasons || {
                  customerNotFound: 0,
                  excludedSector: 0,
                  duplicateCode: 0,
                },
                skippedRows: result.skippedRows || [],
              });
              await loadBalances(false);
              hapticSuccess();
            } catch (err: any) {
              Alert.alert('Excel import', getApiErrorMessage(err, err?.message || 'Import tamamlanamadi.'));
            } finally {
              endAction();
            }
          },
        },
      ],
    );
  };

  const getExportRows = async () => {
    if (view === 'balances') {
      const allRows: VadeBalance[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await adminApi.getVadeBalances({
          search: search.trim() || undefined,
          limit: 500,
          page,
        });
        allRows.push(...(response.balances || []));
        totalPages = Number(response.pagination?.totalPages || 1);
        page += 1;
      } while (page <= totalPages && page <= 50);
      return {
        title: viewTitles.balances,
        rows: buildBalanceRows(allRows.length ? allRows : balances),
      };
    }

    if (view === 'notes') {
      const response = await adminApi.getVadeNotes({
        tag: noteFilters.tag.trim() || undefined,
        startDate: noteFilters.startDate || undefined,
        endDate: noteFilters.endDate || undefined,
      });
      return {
        title: viewTitles.notes,
        rows: buildNoteRows(response.notes?.length ? response.notes : notes),
      };
    }

    if (view === 'calendar') {
      const response = await adminApi.getVadeNotes({
        reminderOnly: true,
        reminderCompleted: calendarRange.completed,
        reminderFrom: calendarRange.from || undefined,
        reminderTo: calendarRange.to || undefined,
      });
      return {
        title: viewTitles.calendar,
        rows: buildNoteRows(response.notes?.length ? response.notes : notes),
      };
    }

    if (view === 'assignments') {
      const response = await adminApi.getVadeAssignments(selectedStaffId ? { staffId: selectedStaffId } : undefined);
      return {
        title: viewTitles.assignments,
        rows: buildAssignmentRows(response.assignments?.length ? response.assignments : assignments),
      };
    }

    return {
      title: viewTitles.import,
      rows: [] as unknown[][],
    };
  };

  const exportExcel = async () => {
    if (exportingRef.current) return;
    if (view === 'import') {
      Alert.alert('Excel', 'Manuel import sekmesinde rapor verisi yok. Bakiyeler, Notlar, Takvim veya Atamalar sekmesinden Excel alabilirsiniz.');
      return;
    }

    if (!beginExport()) return;
    try {
      const { title, rows } = await getExportRows();
      if (rows.length <= 1) {
        Alert.alert('Excel', 'Disa aktarilacak vade kaydi yok.');
        return;
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = rows[0].map((header) => ({
        wch: Math.min(Math.max(String(header || '').length + 6, 12), 42),
      }));
      XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}vade-${view}-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `${title} Excel`,
        });
      } else {
        Alert.alert('Excel olusturuldu', target);
      }
    } catch (err: any) {
      Alert.alert('Excel olusturulamadi', getApiErrorMessage(err, 'Islem tamamlanamadi.'));
    } finally {
      endExport();
    }
  };

  const renderBalance = (item: VadeBalance) => (
    <View key={item.id} style={[styles.card, isWide && styles.gridItem]}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={2}>{customerTitle(item)}</Text>
          <Text style={styles.cardMeta}>{item.user.mikroCariCode || '-'} · {item.user.sectorCode || '-'}</Text>
        </View>
        <TouchableOpacity style={styles.ghostButton} onPress={() => navigation.navigate('VadeCustomer', { customerId: item.user.id })}>
          <Text style={styles.ghostButtonText}>Detay</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.metricRow}>
        <Metric label="Geciken" value={money(item.pastDueBalance)} tone={item.pastDueBalance > 0 ? 'red' : undefined} />
        <Metric label="Gelecek" value={money(item.notDueBalance)} />
        <Metric label="Toplam" value={money(item.totalBalance)} />
        <Metric label="Valor" value={`${item.valor || 0} gun`} />
      </View>
      <Text style={styles.cardMeta}>Son not: {dateText(item.lastNoteAt)} · Kaynak: {item.source}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => openNoteForCustomer(item)}>
          <Text style={styles.secondaryButtonText}>Not Ekle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => toggleCustomerSelection(item.user.id)}>
          <Text style={styles.secondaryButtonText}>{selectedCustomerIds.includes(item.user.id) ? 'Secildi' : 'Atama Sec'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderNote = (note: VadeNote) => (
    <View key={note.id} style={[styles.card, isWide && styles.gridItem]}>
      <Text style={styles.cardTitle} numberOfLines={3}>{note.noteContent}</Text>
      <Text style={styles.cardMeta}>Cari: {note.customerId}</Text>
      <Text style={styles.cardMeta}>Yazar: {note.author?.name || '-'} · {dateText(note.createdAt)}</Text>
      {note.tags?.length ? <Text style={styles.cardMeta}>Etiket: {note.tags.join(', ')}</Text> : null}
      {note.promiseDate ? <Text style={styles.cardMeta}>Soz: {dateText(note.promiseDate)}</Text> : null}
      {note.reminderDate ? (
        <View style={styles.reminderBox}>
          <Text style={styles.reminderText}>Hatirlatma: {dateText(note.reminderDate)} {note.reminderCompleted ? '(tamamlandi)' : ''}</Text>
          {note.reminderNote ? <Text style={styles.cardMeta} numberOfLines={2}>{note.reminderNote}</Text> : null}
          {!note.reminderCompleted ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => completeReminder(note)}>
              <Text style={styles.secondaryButtonText}>Tamamla</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderBalances = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Bakiye listesi</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="Cari kodu, unvan veya sektor"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => loadBalances()}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={() => loadBalances()}>
            <Text style={styles.primaryButtonText}>Ara</Text>
          </TouchableOpacity>
        </View>
        {summary ? (
          <View style={styles.metricRow}>
            <Metric label="Cari" value={summary.count || balances.length} />
            <Metric label="Geciken" value={money(summary.overdue)} tone="red" />
            <Metric label="Toplam" value={money(summary.total)} />
          </View>
        ) : null}
      </View>
      {balances.length ? (
        <View style={[styles.grid, isWide && styles.gridWide]}>
          {balances.map(renderBalance)}
        </View>
      ) : <Empty text="Cari bulunamadi." />}
    </>
  );

  const renderNotes = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Not ekle</Text>
        <TextInput
          style={styles.input}
          placeholder="Cari ID"
          placeholderTextColor={colors.textMuted}
          value={noteForm.customerId}
          onChangeText={(value) => setNoteForm((prev) => ({ ...prev, customerId: value }))}
        />
        {selectedBalance ? <Text style={styles.helper}>Secili cari: {customerTitle(selectedBalance)}</Text> : <Text style={styles.helper}>Bakiyelerden "Not Ekle" ile cari secmek daha hizli.</Text>}
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Gorusme notu"
          placeholderTextColor={colors.textMuted}
          value={noteForm.noteContent}
          onChangeText={(value) => setNoteForm((prev) => ({ ...prev, noteContent: value }))}
          multiline
        />
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Soz tarihi YYYY-MM-DD" placeholderTextColor={colors.textMuted} value={noteForm.promiseDate} onChangeText={(value) => setNoteForm((prev) => ({ ...prev, promiseDate: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Etiketler" placeholderTextColor={colors.textMuted} value={noteForm.tags} onChangeText={(value) => setNoteForm((prev) => ({ ...prev, tags: value }))} />
        </View>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Hatirlatma YYYY-MM-DD" placeholderTextColor={colors.textMuted} value={noteForm.reminderDate} onChangeText={(value) => setNoteForm((prev) => ({ ...prev, reminderDate: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Hatirlatma notu" placeholderTextColor={colors.textMuted} value={noteForm.reminderNote} onChangeText={(value) => setNoteForm((prev) => ({ ...prev, reminderNote: value }))} />
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={createNote} disabled={actionLoading}>
          <Text style={styles.primaryButtonText}>Not Kaydet</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Not raporu</Text>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Etiket" placeholderTextColor={colors.textMuted} value={noteFilters.tag} onChangeText={(value) => setNoteFilters((prev) => ({ ...prev, tag: value }))} />
          <TouchableOpacity style={styles.secondaryButton} onPress={() => loadNotes()}>
            <Text style={styles.secondaryButtonText}>Filtrele</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Baslangic" placeholderTextColor={colors.textMuted} value={noteFilters.startDate} onChangeText={(value) => setNoteFilters((prev) => ({ ...prev, startDate: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Bitis" placeholderTextColor={colors.textMuted} value={noteFilters.endDate} onChangeText={(value) => setNoteFilters((prev) => ({ ...prev, endDate: value }))} />
        </View>
      </View>
      {notes.length ? (
        <View style={[styles.grid, isWide && styles.gridWide]}>
          {notes.map(renderNote)}
        </View>
      ) : <Empty text="Not bulunamadi." />}
    </>
  );

  const renderCalendar = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Hatirlatma takvimi</Text>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Baslangic" placeholderTextColor={colors.textMuted} value={calendarRange.from} onChangeText={(value) => setCalendarRange((prev) => ({ ...prev, from: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Bitis" placeholderTextColor={colors.textMuted} value={calendarRange.to} onChangeText={(value) => setCalendarRange((prev) => ({ ...prev, to: value }))} />
        </View>
        <View style={styles.actionRow}>
          <Chip label="Bekleyen" active={!calendarRange.completed} onPress={() => setCalendarRange((prev) => ({ ...prev, completed: false }))} />
          <Chip label="Tamamlanan" active={calendarRange.completed} onPress={() => setCalendarRange((prev) => ({ ...prev, completed: true }))} />
          <TouchableOpacity style={styles.secondaryButton} onPress={() => loadCalendar()}>
            <Text style={styles.secondaryButtonText}>Yenile</Text>
          </TouchableOpacity>
        </View>
      </View>
      {notes.length ? (
        <View style={[styles.grid, isWide && styles.gridWide]}>
          {notes.map(renderNote)}
        </View>
      ) : <Empty text="Bu aralikta hatirlatma yok." />}
    </>
  );

  const renderAssignments = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vade atamalari</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {staff.map((row) => (
            <Chip key={row.id} label={row.name || row.email} active={selectedStaffId === row.id} onPress={() => setSelectedStaffId(row.id)} />
          ))}
        </ScrollView>
        <Text style={styles.helper}>Secili: {selectedStaff?.name || '-'} · Mevcut atama: {selectedAssignmentCount} · Secilecek cari: {selectedCustomerIds.length}</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => loadAssignments()}>
            <Text style={styles.secondaryButtonText}>Atamalari Getir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={assignSelected} disabled={actionLoading || !selectedCustomerIds.length}>
            <Text style={styles.primaryButtonText}>Secilenleri Ata</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cari secimi</Text>
        <Text style={styles.helper}>Bakiye listesinden "Atama Sec" ile isaretleyin veya burada arama yapin.</Text>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Cari ara" placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} onSubmitEditing={() => loadBalances()} />
          <TouchableOpacity style={styles.secondaryButton} onPress={() => loadBalances()}>
            <Text style={styles.secondaryButtonText}>Ara</Text>
          </TouchableOpacity>
        </View>
        {balances.slice(0, 12).map((row) => (
          <TouchableOpacity key={row.id} style={styles.selectionRow} onPress={() => toggleCustomerSelection(row.user.id)}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle} numberOfLines={2}>{customerTitle(row)}</Text>
              <Text style={styles.cardMeta}>{row.user.mikroCariCode || '-'} · {money(row.totalBalance)}</Text>
            </View>
            <Text style={styles.selectionText}>{selectedCustomerIds.includes(row.user.id) ? 'Secildi' : 'Sec'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {assignments.length ? (
        <View style={[styles.grid, isWide && styles.gridWide]}>
          {assignments.map((assignment) => (
            <View key={assignment.id} style={[styles.card, isWide && styles.gridItem]}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{assignment.customer?.name || assignment.customerId}</Text>
                  <Text style={styles.cardMeta}>Personel: {assignment.staff?.name || assignment.staffId}</Text>
                </View>
                <TouchableOpacity style={styles.dangerButton} onPress={() => removeAssignment(assignment)}>
                  <Text style={styles.dangerButtonText}>Kaldir</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : <Empty text="Atama bulunamadi." />}
    </>
  );

  const renderImport = () => (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Mikro Vade Excel import</Text>
        <Text style={styles.helper}>Mikro "Vade Farki Durum Raporu" Excel dosyasini secin. Mobil, web ekranindaki kolon esleme ve import mantigini kullanir.</Text>

        <View style={styles.fileBox}>
          <View style={styles.flex}>
            <Text style={styles.fileTitle} numberOfLines={1}>{excelFile?.name || 'Excel dosyasi secilmedi'}</Text>
            <Text style={styles.cardMeta}>
              {excelPreview
                ? `${excelPreview.rowCount} cari satiri bulundu${excelFileSizeText ? ` - ${excelFileSizeText}` : ''}`
                : 'Desteklenen formatlar: .xlsx ve .xls'}
            </Text>
            {excelPreview?.sampleCodes.length ? (
              <Text style={styles.helper}>Ornek kodlar: {excelPreview.sampleCodes.join(', ')}</Text>
            ) : null}
          </View>
          <TouchableOpacity style={styles.secondaryButton} onPress={chooseVadeExcelFile} disabled={actionLoading}>
            <Text style={styles.secondaryButtonText}>Dosya Sec</Text>
          </TouchableOpacity>
        </View>

        {excelImportSummary ? (
          <>
            <View style={styles.importSummary}>
              <Metric label="Okunan" value={excelImportSummary.total} />
              <Metric label="Aktarilan" value={excelImportSummary.imported} tone="green" />
              <Metric label="Yeni Cari" value={excelImportSummary.createdCustomers} tone={excelImportSummary.createdCustomers ? 'green' : undefined} />
              <Metric label="Atlanan" value={excelImportSummary.skipped} tone={excelImportSummary.skipped ? 'amber' : undefined} />
            </View>
            {excelImportSummary.skipped ? (
              <Text style={styles.helper}>
                Atlama nedenleri: bulunamayan {excelImportSummary.skipReasons.customerNotFound}, kapsam disi {excelImportSummary.skipReasons.excludedSector}, tekrar kod {excelImportSummary.skipReasons.duplicateCode}.
              </Text>
            ) : null}
            {excelImportSummary.skippedRows.length ? (
              <Text style={styles.helper} numberOfLines={3}>
                Ilk atlananlar: {excelImportSummary.skippedRows.slice(0, 4).map((row) => `${row.sourceRowNumber ? `${row.sourceRowNumber}. satir ` : ''}${row.mikroCariCode} (${row.reason})`).join(', ')}
              </Text>
            ) : null}
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryButton, (!excelFile || actionLoading) && styles.buttonDisabled]}
          onPress={importExcelBalances}
          disabled={!excelFile || actionLoading}
        >
          <Text style={styles.primaryButtonText}>{actionLoading ? 'Isleniyor' : 'Excel Import Et'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Manuel tek cari duzeltme</Text>
        <Text style={styles.helper}>Toplu rapor yerine sadece bir carinin bakiyesini acil duzeltmek icin kullanin.</Text>
        <TextInput style={styles.input} placeholder="Mikro cari kod" placeholderTextColor={colors.textMuted} value={importRow.mikroCariCode} onChangeText={(value) => setImportRow((prev) => ({ ...prev, mikroCariCode: value }))} />
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Geciken bakiye" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={importRow.pastDueBalance} onChangeText={(value) => setImportRow((prev) => ({ ...prev, pastDueBalance: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Geciken vade" placeholderTextColor={colors.textMuted} value={importRow.pastDueDate} onChangeText={(value) => setImportRow((prev) => ({ ...prev, pastDueDate: value }))} />
        </View>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Gelecek bakiye" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={importRow.notDueBalance} onChangeText={(value) => setImportRow((prev) => ({ ...prev, notDueBalance: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Gelecek vade" placeholderTextColor={colors.textMuted} value={importRow.notDueDate} onChangeText={(value) => setImportRow((prev) => ({ ...prev, notDueDate: value }))} />
        </View>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Toplam" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={importRow.totalBalance} onChangeText={(value) => setImportRow((prev) => ({ ...prev, totalBalance: value }))} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Valor" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={importRow.valor} onChangeText={(value) => setImportRow((prev) => ({ ...prev, valor: value }))} />
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={importBalance} disabled={actionLoading}>
          <Text style={styles.primaryButtonText}>Tek Cariyi Kaydet</Text>
        </TouchableOpacity>
      </View>
    </>
  );

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
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>Vade Operasyonu</Text>
            <Text style={styles.heroTitle}>Vade Takip</Text>
            <Text style={styles.heroSubtitle}>Excel kaynakli bakiye, not, hatirlatma, atama ve manuel import akisini mobilde yonetin.</Text>
            <View style={styles.heroMetricRow}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>{balances.length}</Text>
                <Text style={styles.heroMetricLabel}>Cari</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>{notes.length}</Text>
                <Text style={styles.heroMetricLabel}>Not</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>{assignments.length}</Text>
                <Text style={styles.heroMetricLabel}>Atama</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>{currentExportCount}</Text>
                <Text style={styles.heroMetricLabel}>Excel</Text>
              </View>
            </View>
          </View>
          <View style={styles.quickLinks}>
            <TouchableOpacity style={styles.quickLinkButton} onPress={() => navigation.navigate('VadeDashboard')}>
              <Text style={styles.quickLinkText}>Panel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickLinkButton} onPress={() => navigation.navigate('VadeAnalytics')}>
              <Text style={styles.quickLinkText}>Analiz</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickLinkButton} onPress={() => navigation.navigate('VadeManagement')}>
              <Text style={styles.quickLinkText}>Yonetim</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportButton} onPress={exportExcel} disabled={exporting || actionLoading}>
              <Text style={styles.exportButtonText}>{exporting ? 'Hazirlaniyor' : `Excel (${currentExportCount})`}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label="Bakiyeler" active={view === 'balances'} onPress={() => setView('balances')} />
          <Chip label="Notlar" active={view === 'notes'} onPress={() => setView('notes')} />
          <Chip label="Takvim" active={view === 'calendar'} onPress={() => setView('calendar')} />
          <Chip label="Atamalar" active={view === 'assignments'} onPress={() => setView('assignments')} />
          <Chip label="Import" active={view === 'import'} onPress={() => setView('import')} />
        </ScrollView>

        {actionLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {view === 'balances' ? renderBalances() : null}
        {view === 'notes' ? renderNotes() : null}
        {view === 'calendar' ? renderCalendar() : null}
        {view === 'assignments' ? renderAssignments() : null}
        {view === 'import' ? renderImport() : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.sm },
  hero: {
    paddingHorizontal: 1,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  heroKicker: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.xs,
    color: '#BFD7FF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, color: '#FFFFFF', marginTop: spacing.xs },
  heroSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    lineHeight: fontSizes.sm + 5,
    color: '#DDE8FF',
    marginTop: spacing.xs,
  },
  heroMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  heroMetric: {
    flexGrow: 1,
    flexBasis: 86,
    minWidth: 82,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(221,232,255,0.22)',
    padding: spacing.sm,
  },
  heroMetricValue: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: '#FFFFFF' },
  heroMetricLabel: { marginTop: 2, fontFamily: fonts.medium, fontSize: fontSizes.xs, color: '#BFD7FF' },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickLinkButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  quickLinkText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: '#FFFFFF' },
  exportButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  exportButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  tabRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDanger: { borderColor: colors.danger },
  chipText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  chipTextDanger: { color: colors.danger },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  grid: { gap: spacing.md },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '48%', minWidth: 360 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  cardTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 19 },
  helper: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flex: 1 },
  input: {
    minHeight: 46,
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
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  metric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text, marginTop: 2 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.55 },
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
  ghostButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ghostButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.textMuted },
  dangerButton: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dangerButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.danger },
  reminderBox: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FDBA74',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  reminderText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.warning },
  fileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  fileTitle: { fontFamily: fonts.bold, fontSize: fontSizes.md, color: colors.text },
  importSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectionText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.primarySoft },
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, color: colors.textMuted, textAlign: 'center' },
  textDanger: { color: colors.danger },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
});
