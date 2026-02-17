import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { adminApi } from '../api/admin';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';

type CariResult = Record<string, any>;

const normalizeKey = (value: string) =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const extractTaxNo = (item: any) => {
  if (!item || typeof item !== 'object') return '';
  for (const [key, value] of Object.entries(item as Record<string, any>)) {
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

export function EkstreScreen() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<CariResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCari, setSelectedCari] = useState<CariResult | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [foyuLoading, setFoyuLoading] = useState(false);
  const [foyuData, setFoyuData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openingTotals, setOpeningTotals] = useState({ borc: 0, alacak: 0, bakiye: 0 });
  const [activeDateField, setActiveDateField] = useState<'start' | 'end' | null>(null);
  const [pickerDate, setPickerDate] = useState(new Date());

  const toDateString = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const parseDate = (value: string) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map((item) => Number(item));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const openDatePicker = (field: 'start' | 'end') => {
    const current = parseDate(field === 'start' ? startDate : endDate) || new Date();
    setPickerDate(current);
    setActiveDateField(field);
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setActiveDateField(null);
        return;
      }
      if (event.type === 'set' && selectedDate && activeDateField) {
        const nextDate = toDateString(selectedDate);
        if (activeDateField === 'start') setStartDate(nextDate);
        if (activeDateField === 'end') setEndDate(nextDate);
      }
      setActiveDateField(null);
      return;
    }

    if (selectedDate) {
      setPickerDate(selectedDate);
      if (activeDateField === 'start') setStartDate(toDateString(selectedDate));
      if (activeDateField === 'end') setEndDate(toDateString(selectedDate));
    }
  };

  const exportPdf = async () => {
    if (!selectedCari || foyuData.length === 0) {
      Alert.alert('Bilgi', 'Once cari secip ekstreyi getiriniz.');
      return;
    }

    try {
      const escapeHtml = (value: string | number | null | undefined) =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      const formatCurrencyTR = (value: number) =>
        `${Number(value || 0).toLocaleString('tr-TR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} TL`;

      const cariName =
        selectedCari['Cari Ad\u0131'] ||
        selectedCari['Cari Adi'] ||
        selectedCari['Cari Ad\u0131 2'] ||
        selectedCari['Cari Adi 2'] ||
        'Cari';

      const rows = foyuData
        .map((row) => {
          const tutar = Number(row?.Tutar ?? 0) || 0;
          return `
            <tr>
              <td>${escapeHtml(String(row?.Tarih || '-'))}</td>
              <td>${escapeHtml(String(row?.['Evrak Tipi'] || '-'))}</td>
              <td>${escapeHtml(String(row?.['Belge No'] || '-'))}</td>
              <td>${escapeHtml(String(row?.['Hareket Tipi'] || '-'))}</td>
              <td style="text-align:right;">${formatCurrencyTR(tutar)}</td>
            </tr>
          `;
        })
        .join('');

      const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.bakircilarkampanya.com/api';
      const webBase = apiBase.replace(/\/api\/?$/, '');
      const logoUrl = `${webBase}/quote-logo.png`;

      const html = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; padding: 14px; color: #0F172A; }
              .header { height: 28px; display: flex; justify-content: center; align-items: center; margin-bottom: 10px; }
              .header img { max-width: 70mm; max-height: 20mm; object-fit: contain; }
              .info { display: flex; gap: 10px; margin-bottom: 12px; }
              .box {
                flex: 1;
                border: 1px solid #E2E8F0;
                background: #F8FAFC;
                border-radius: 4px;
                padding: 8px;
                font-size: 11px;
                line-height: 1.35;
              }
              .box-title { color: #64748B; font-size: 10px; font-weight: 700; margin-bottom: 4px; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th, td { border: 1px solid #E2E8F0; padding: 5px; vertical-align: top; }
              th { background: #2563EB; color: #FFFFFF; text-align: left; }
              .bottom { display: flex; gap: 10px; margin-top: 12px; }
              .terms {
                flex: 1;
                border: 1px solid #E2E8F0;
                background: #F8FAFC;
                border-radius: 4px;
                padding: 8px;
                font-size: 10px;
                line-height: 1.4;
              }
              .summary {
                width: 62mm;
                border: 1px solid #E2E8F0;
                background: #F8FAFC;
                border-radius: 4px;
                padding: 8px;
                font-size: 10px;
              }
              .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
              .row.total { font-weight: 700; color: #0F172A; margin-top: 6px; }
              .footer {
                margin-top: 12px;
                border-top: 1px solid #CBD5E1;
                padding-top: 7px;
                text-align: center;
                font-size: 9px;
                line-height: 1.35;
                color: #334155;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <img src="${logoUrl}" alt="Bakircilar Logo" />
            </div>
            <div class="info">
              <div class="box">
                <div class="box-title">FIRMA BILGILERI</div>
                <div><b>Firma:</b> ${escapeHtml(String(cariName))}</div>
                <div><b>Cari Kodu:</b> ${escapeHtml(String(selectedCari['Cari Kodu'] || '-'))}</div>
                <div><b>Rapor:</b> Cari Ekstre</div>
              </div>
              <div class="box">
                <div class="box-title">EKSTRE BILGILERI</div>
                <div><b>Tarih:</b> ${escapeHtml(new Date().toLocaleDateString('tr-TR'))}</div>
                <div><b>Baslangic:</b> ${escapeHtml(startDate || '-')}</div>
                <div><b>Bitis:</b> ${escapeHtml(endDate || '-')}</div>
                <div><b>Kayit:</b> ${foyuData.length}</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Evrak Tipi</th>
                  <th>Belge No</th>
                  <th>Hareket Tipi</th>
                  <th>Tutar (TL)</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            <div class="bottom">
              <div class="terms">
                <div class="box-title">RAPOR NOTLARI</div>
                <div>- Bu rapor secilen tarih araligindaki cari hareketlerini icerir.</div>
                <div>- Tutarlar TL bazinda listelenmistir.</div>
                <div>- Devir, donem disi onceki hareketlerden hesaplanir.</div>
              </div>
              <div class="summary">
                <div class="box-title">OZET</div>
                <div class="row"><span>Devir Bakiye</span><span>${formatCurrencyTR(openingTotals.bakiye)}</span></div>
                <div class="row"><span>Donem Bakiye</span><span>${formatCurrencyTR(periodTotals.bakiye)}</span></div>
                <div class="row total"><span>Genel Bakiye</span><span>${formatCurrencyTR(grandTotals.bakiye)}</span></div>
              </div>
            </div>
            <div class="footer">
              <div>BAKIRCILAR AMBALAJ END.-TEM VE KIRTASIYE</div>
              <div>MERKEZ: RASIMPASA MAH. ATATURK BLV. NO:69/A HENDEK/SAKARYA</div>
              <div>SUBE 1: TOPCA TOPTANCILAR CARSISI A BLOK NO: 20 - ERENLER/SAKARYA</div>
              <div>TEL: 0264 614 67 77  FAX: 0264 614 66 60 - info@bakircilarambalaj.com</div>
              <div>www.bakircilargrup.com</div>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Ekstre PDF' });
      } else {
        Alert.alert('Bilgi', `PDF olusturuldu: ${uri}`);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'PDF olusturulamadi.');
    }
  };

  const exportExcel = async () => {
    if (!selectedCari || foyuData.length === 0) {
      Alert.alert('Bilgi', 'Once cari secip ekstreyi getiriniz.');
      return;
    }

    try {
      const cariName =
        selectedCari['Cari Ad\u0131'] ||
        selectedCari['Cari Adi'] ||
        selectedCari['Cari Ad\u0131 2'] ||
        selectedCari['Cari Adi 2'] ||
        'Cari';
      const headerRows: any[][] = [
        ['Rapor', 'Cari Ekstre'],
        ['Cari', String(cariName)],
        ['Cari Kodu', String(selectedCari['Cari Kodu'] || '-')],
        ['Baslangic', startDate || '-'],
        ['Bitis', endDate || '-'],
      ];

      const tableHeader = ['Tarih', 'Evrak Tipi', 'Belge No', 'Odeme Tipi', 'Hareket Tipi', 'Tip Kodu', 'Tutar TL'];
      const itemRows = foyuData.map((row) => ([
        String(row?.Tarih || ''),
        String(row?.['Evrak Tipi'] || ''),
        String(row?.['Belge No'] || ''),
        String(row?.['Odeme Tipi'] || ''),
        String(row?.['Hareket Tipi'] || ''),
        Number(row?.['Tip Kodu'] ?? 0),
        Number(row?.Tutar ?? 0) || 0,
      ]));

      const summaryRows = [
        [],
        ['Devir Bakiye', Number(openingTotals.bakiye.toFixed(2))],
        ['Donem Bakiye', Number(periodTotals.bakiye.toFixed(2))],
        ['Genel Bakiye', Number(grandTotals.bakiye.toFixed(2))],
      ];
      const rows = [...headerRows, [], tableHeader, ...itemRows, ...summaryRows];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Ekstre');
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}ekstre/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}ekstre_${selectedCari['Cari Kodu'] || 'cari'}_${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Ekstre Excel',
        });
      } else {
        Alert.alert('Bilgi', `Excel olusturuldu: ${target}`);
      }
    } catch (err: any) {
      Alert.alert('Hata', err?.message || 'Excel olusturulamadi.');
    }
  };

  const onSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const response = await adminApi.searchCariForEkstre({ searchTerm });
      setSearchResults(response.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Cari aramasi basarisiz.');
    } finally {
      setSearching(false);
    }
  };

  const fetchFoyu = async () => {
    if (!selectedCari?.['Cari Kodu']) return;
    setFoyuLoading(true);
    setError(null);
    try {
      const response = await adminApi.getCariHareketFoyu({
        cariKod: selectedCari['Cari Kodu'],
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setFoyuData(response.data || []);
      const opening = response.opening || {};
      const borc = Number(opening?.borc) || 0;
      const alacak = Number(opening?.alacak) || 0;
      const bakiye = Number.isFinite(opening?.bakiye) ? Number(opening?.bakiye) : borc - alacak;
      setOpeningTotals({ borc, alacak, bakiye });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Cari hareket foyi yuklenemedi.');
    } finally {
      setFoyuLoading(false);
    }
  };

  const resolveDirection = (row: any) => {
    const tipCode = Number(row?.['Tip Kodu'] ?? row?.TipKodu ?? row?.Tip ?? row?.tip);
    if (Number.isFinite(tipCode)) {
      if (tipCode === 0) return 'BORC';
      if (tipCode === 1) return 'ALACAK';
    }
    const tipText = String(row?.['Hareket Tipi'] || '').toLowerCase();
    if (tipText.includes('bor')) return 'BORC';
    if (tipText.includes('alac')) return 'ALACAK';
    return null;
  };

  const periodTotals = useMemo(() => {
    const totals = (foyuData || []).reduce(
      (acc, row) => {
        const amount = Number(row?.Tutar ?? row?.['Tutar'] ?? 0) || 0;
        const direction = resolveDirection(row);
        if (direction === 'BORC') acc.borc += amount;
        else if (direction === 'ALACAK') acc.alacak += amount;
        return acc;
      },
      { borc: 0, alacak: 0 }
    );
    return { ...totals, bakiye: totals.borc - totals.alacak };
  }, [foyuData]);

  const grandTotals = useMemo(() => {
    return {
      borc: openingTotals.borc + periodTotals.borc,
      alacak: openingTotals.alacak + periodTotals.alacak,
      bakiye: openingTotals.bakiye + periodTotals.bakiye,
    };
  }, [openingTotals, periodTotals]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={foyuData}
        keyExtractor={(item, index) => `${item?.Seri || ''}-${item?.Sira || ''}-${index}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Cari Ekstre</Text>
            <Text style={styles.subtitle}>Mikro hareket foyi listesi.</Text>

            <View style={styles.searchRow}>
              <TextInput
                style={styles.search}
                placeholder="Cari ara..."
                placeholderTextColor={colors.textMuted}
                value={searchTerm}
                onChangeText={setSearchTerm}
                onSubmitEditing={onSearch}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchButton} onPress={onSearch}>
                <Text style={styles.searchButtonText}>Ara</Text>
              </TouchableOpacity>
            </View>

            {searching && (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {searchResults.length > 0 && !selectedCari && (
              <View style={styles.resultsBox}>
                {searchResults.slice(0, 6).map((item) => {
                  const cariName =
                    item['Cari Ad\u0131'] ||
                    item['Cari Adi'] ||
                    item['Cari Ad\u0131 2'] ||
                    item['Cari Adi 2'] ||
                    'Cari';

                  return (
                  <TouchableOpacity
                    key={item['Cari Kodu']}
                    style={styles.resultItem}
                    onPress={async () => {
                      const code = String(item?.['Cari Kodu'] || '').trim();
                      let merged = item;
                      if (code && !extractTaxNo(item)) {
                        try {
                          const info = await adminApi.getCariInfo(code);
                          const taxNo = extractTaxNo(info?.data || info);
                          if (taxNo) merged = { ...item, 'Vergi No': taxNo };
                        } catch {}
                      }
                      setSelectedCari(merged);
                      setSearchResults([]);
                    }}
                  >
                    <Text style={styles.resultTitle}>{cariName}</Text>
                    <Text style={styles.resultMeta}>Kod: {item['Cari Kodu']}</Text>
                    <Text style={styles.resultMeta}>Vergi No: {extractTaxNo(item) || '-'}</Text>
                  </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {selectedCari && (
              <View style={styles.selectedCard}>
                <Text style={styles.selectedTitle}>
                  {selectedCari['Cari Ad\u0131'] ||
                    selectedCari['Cari Adi'] ||
                    selectedCari['Cari Ad\u0131 2'] ||
                    selectedCari['Cari Adi 2'] ||
                    'Cari'}
                </Text>
                <Text style={styles.selectedMeta}>Kod: {selectedCari['Cari Kodu']}</Text>
                <Text style={styles.selectedMeta}>Vergi No: {extractTaxNo(selectedCari) || '-'}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedCari(null);
                    setFoyuData([]);
                  }}
                >
                  <Text style={styles.clearLink}>Cariyi degistir</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.dateRow}>
              <View style={styles.dateInputWrap}>
                <TextInput
                  style={styles.dateInput}
                  placeholder="Baslangic (YYYY-MM-DD)"
                  placeholderTextColor={colors.textMuted}
                  value={startDate}
                  onChangeText={setStartDate}
                />
                <TouchableOpacity style={styles.dateIconButton} onPress={() => openDatePicker('start')}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.dateInputWrap}>
                <TextInput
                  style={styles.dateInput}
                  placeholder="Bitis (YYYY-MM-DD)"
                  placeholderTextColor={colors.textMuted}
                  value={endDate}
                  onChangeText={setEndDate}
                />
                <TouchableOpacity style={styles.dateIconButton} onPress={() => openDatePicker('end')}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            {activeDateField && (
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
                maximumDate={new Date(2100, 11, 31)}
                minimumDate={new Date(2000, 0, 1)}
              />
            )}
            {Platform.OS === 'ios' && activeDateField && (
              <TouchableOpacity style={styles.doneButton} onPress={() => setActiveDateField(null)}>
                <Text style={styles.doneButtonText}>Tarih Secimini Tamamla</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, !selectedCari && styles.buttonDisabled]}
              onPress={fetchFoyu}
              disabled={!selectedCari}
            >
              {foyuLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Ekstre Getir</Text>
              )}
            </TouchableOpacity>

            <View style={styles.exportRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, foyuData.length === 0 && styles.buttonDisabled]}
                onPress={exportPdf}
                disabled={foyuData.length === 0}
              >
                <Text style={styles.secondaryButtonText}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, foyuData.length === 0 && styles.buttonDisabled]}
                onPress={exportExcel}
                disabled={foyuData.length === 0}
              >
                <Text style={styles.secondaryButtonText}>Excel</Text>
              </TouchableOpacity>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            {foyuData.length > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Ozet</Text>
                <Text style={styles.summaryText}>Kayit: {foyuData.length}</Text>
                <Text style={styles.summaryText}>Devir: {openingTotals.bakiye.toFixed(2)} TL</Text>
                <Text style={styles.summaryText}>Donem: {periodTotals.bakiye.toFixed(2)} TL</Text>
                <Text style={styles.summaryText}>Genel: {grandTotals.bakiye.toFixed(2)} TL</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item?.['Evrak Tipi'] || 'Evrak'}</Text>
            <Text style={styles.cardMeta}>Tarih: {item?.Tarih || '-'}</Text>
            <Text style={styles.cardMeta}>Belge No: {item?.['Belge No'] || '-'}</Text>
            <Text style={styles.cardMeta}>Odeme Tipi: {item?.['Odeme Tipi'] || '-'}</Text>
            <Text style={styles.cardMeta}>Hareket Tipi: {item?.['Hareket Tipi'] || '-'}</Text>
            <Text style={styles.cardMeta}>Tip Kodu: {item?.['Tip Kodu'] ?? '-'}</Text>
            <Text style={styles.cardAmount}>Tutar: {Number(item?.Tutar ?? 0).toFixed(2)} TL</Text>
          </View>
        )}
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
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  search: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: fonts.regular,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  searchButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
  },
  inlineLoading: {
    alignItems: 'flex-start',
  },
  resultsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  resultItem: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  resultTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  resultMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  selectedCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  selectedTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  selectedMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  clearLink: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingRight: spacing.xs,
  },
  dateInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  dateIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  doneButton: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  doneButtonText: {
    fontFamily: fonts.semibold,
    color: colors.primary,
    fontSize: fontSizes.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontFamily: fonts.semibold,
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
  },
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.semibold,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryTitle: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: fontSizes.sm,
    color: colors.text,
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
    fontSize: fontSizes.md,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  cardAmount: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.text,
    marginTop: spacing.xs,
  },
});

