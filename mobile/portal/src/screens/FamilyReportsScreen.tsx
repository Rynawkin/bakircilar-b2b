import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { RouteProp, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { adminApi } from '../api/admin';
import { PortalStackParamList } from '../navigation/AppNavigator';
import { colors, fontSizes, fonts, radius, spacing } from '../theme';
import { getApiErrorMessage } from '../utils/errors';
import { hapticSuccess } from '../utils/haptics';
import { normalizeSearchText } from '../utils/search';

type ViewKey = 'suggestions' | 'clusters' | 'outliers' | 'unitMismatch' | 'stockFamilies' | 'priceFamilies' | 'priceCosts';

const n = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const scoreText = (value: unknown) => n(value).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

const viewTitles: Record<ViewKey, string> = {
  suggestions: 'Aile Onerileri',
  clusters: 'Aile Kumeleri',
  outliers: 'Aykiri Urunler',
  unitMismatch: 'Birim Uyumsuzlugu',
  stockFamilies: 'Stok Aileleri',
  priceFamilies: 'Fiyat Aileleri',
  priceCosts: 'Fiyat Maliyet',
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

const productCodeOf = (row: any) => String(row.productCode || row.sourceProductCode || row.code || row.product?.code || '').trim();
const productNameOf = (row: any) => String(row.productName || row.sourceProductName || row.name || row.product?.name || productCodeOf(row) || '-').trim();
const familyIdOf = (row: any) => String(row.familyId || row.suggestedFamilyId || row.family?.id || '').trim();
const familyNameOf = (row: any) => String(row.familyName || row.suggestedFamilyName || row.family?.name || '-').trim();

const buildFamilyRows = (view: ViewKey, rows: any[]) => {
  if (view === 'suggestions') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Onerilen Aile', 'Mevcut Aile', 'Skor', 'Benzerlik', 'Guven'],
      ...rows.map((row) => [
        cell(productCodeOf(row)),
        cell(productNameOf(row)),
        cell(familyNameOf(row)),
        cell(row.currentFamilyName || row.currentFamilyCode),
        cell(row.score),
        cell(row.similarity),
        cell(row.confidence),
      ]),
    ];
  }
  if (view === 'clusters') {
    return [
      ['Kume', 'Aciklama', 'Urun Sayisi', 'Skor', 'Urun Kodlari', 'Urun Adlari'],
      ...rows.map((row, index) => {
        const items = row.items || row.products || [];
        return [
          cell(row.name || row.clusterName || `Kume ${index + 1}`),
          cell(row.reason || row.description),
          cell(row.itemCount || items.length),
          cell(row.score),
          cell(items.map((item: any) => item.productCode || item.code).filter(Boolean).join(', ')),
          cell(items.map((item: any) => item.productName || item.name).filter(Boolean).join(' | ')),
        ];
      }),
    ];
  }
  if (view === 'outliers') {
    return [
      ['Urun Kodu', 'Urun Adi', 'Aile', 'Sebep', 'Skor/Uzaklik'],
      ...rows.map((row) => [
        cell(productCodeOf(row)),
        cell(productNameOf(row)),
        cell(familyNameOf(row)),
        cell(row.reason || row.issue),
        cell(row.score || row.distance),
      ]),
    ];
  }
  if (view === 'unitMismatch') {
    const flatRows = rows.flatMap((family) =>
      (family.items || family.mismatches || []).map((item: any) => [
        cell(family.name || family.familyName),
        cell(family.code || family.familyCode),
        cell(item.productCode || item.code),
        cell(item.productName || item.name),
        cell(item.unitFactorOverride ?? item.factor),
        cell(item.expectedFactor),
        cell(item.issue || item.reason),
      ])
    );
    return [['Aile', 'Aile Kodu', 'Urun Kodu', 'Urun Adi', 'Katsayi', 'Beklenen Katsayi', 'Sorun'], ...flatRows];
  }
  if (view === 'stockFamilies' || view === 'priceFamilies') {
    return [
      ['Aile', 'Kod', 'Durum', 'Not', 'Urun Sayisi', 'Urun Kodlari', 'Urun Adlari'],
      ...rows.map((family) => {
        const items = family.items || [];
        return [
          cell(family.name),
          cell(family.code),
          family.active === false ? 'Pasif' : 'Aktif',
          cell(family.note),
          cell(items.length),
          cell(items.map((item: any) => item.productCode).filter(Boolean).join(', ')),
          cell(items.map((item: any) => item.productName).filter(Boolean).join(' | ')),
        ];
      }),
    ];
  }

  const flatRows = rows.flatMap((family) =>
    (family.items || []).map((item: any) => [
      cell(family.name),
      cell(family.code),
      cell(family.status),
      cell(family.outdatedCount),
      cell(family.missingCostDateCount),
      cell(family.oldestCostDate),
      cell(item.productCode),
      cell(item.productName),
      cell(item.issueType),
      cell(item.currentCost),
      cell(item.lastEntryPrice),
      cell(item.daysBehind),
      cell(item.costDate),
      cell(item.lastEntryDate),
    ])
  );
  return [
    ['Aile', 'Kod', 'Durum', 'Eski Maliyet', 'Tarih Yok', 'En Eski Tarih', 'Urun Kodu', 'Urun Adi', 'Sorun', 'Maliyet P', 'Son Giris', 'Fark Gun', 'Maliyet Tarihi', 'Son Giris Tarihi'],
    ...flatRows,
  ];
};

export function FamilyReportsScreen() {
  const route = useRoute<RouteProp<PortalStackParamList, 'FamilyReports'>>();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [view, setView] = useState<ViewKey>(route.params?.initialView || 'suggestions');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState('80');
  const [familySaving, setFamilySaving] = useState(false);
  const familySavingRef = useRef(false);
  const [unitSavingId, setUnitSavingId] = useState<string | null>(null);
  const unitSavingRef = useRef<string | null>(null);
  const [factorDrafts, setFactorDrafts] = useState<Record<string, string>>({});
  const [familyForm, setFamilyForm] = useState({
    id: '',
    name: '',
    code: '',
    note: '',
    productCodes: '',
    active: true,
  });
  const [familyProductSearch, setFamilyProductSearch] = useState('');
  const [familyProductResults, setFamilyProductResults] = useState<any[]>([]);
  const [familyProductSearching, setFamilyProductSearching] = useState(false);
  const [costStatus, setCostStatus] = useState<'problem' | 'ok' | 'all'>('problem');
  const [includeInactiveCosts, setIncludeInactiveCosts] = useState(false);
  const [costDrafts, setCostDrafts] = useState<Record<string, { costP: string; costT: string; updatePriceLists: boolean }>>({});

  const filteredRows = useMemo(() => {
    const term = normalizeSearchText(search);
    if (!term) return rows;
    return rows.filter((row) =>
      normalizeSearchText(`${productCodeOf(row)} ${productNameOf(row)} ${familyNameOf(row)} ${row.clusterName || ''}`).includes(term)
    );
  }, [rows, search]);

  const pendingCostUpdates = useMemo(() => {
    if (view !== 'priceCosts') return [];
    return filteredRows.flatMap((family) => {
      const issueItems = (family.items || []).filter((item: any) => costStatus === 'all' || item.issueType !== 'ok');
      return issueItems.flatMap((item: any) => {
        const key = `${family.id}:${item.productCode}`;
        const draft = costDrafts[key];
        const hasTypedCost = Boolean(String(draft?.costP ?? '').trim() || String(draft?.costT ?? '').trim());
        if (!draft || !hasTypedCost) return [];
        const costP = n(draft.costP || item.currentCost || 0);
        const costT = n(draft.costT || 0);
        if (!costP || costP <= 0) return [];
        return [{
          key,
          familyId: family.id,
          familyName: family.name,
          productCode: item.productCode,
          productName: item.productName,
          costP,
          costT: costT > 0 ? costT : undefined,
          updatePriceLists: draft.updatePriceLists !== false,
        }];
      });
    });
  }, [costDrafts, costStatus, filteredRows, view]);

  useEffect(() => {
    fetchCurrent();
  }, [view]);

  useEffect(() => {
    if (route.params?.initialView) {
      setView(route.params.initialView);
    }
  }, [route.params?.initialView]);

  const fetchCurrent = async () => {
    setLoading(true);
    try {
      if (view === 'suggestions') {
        const response = await adminApi.getFamilySuggestionsReport({ limit: n(limit, 80), offset: 0 });
        setRows(response.data.rows || []);
        setTotal(response.data.total || 0);
      } else if (view === 'clusters') {
        const response = await adminApi.getFamilyClustersReport({ limit: n(limit, 80) });
        setRows(response.data.clusters || []);
        setTotal(response.data.clusters?.length || 0);
      } else if (view === 'outliers') {
        const response = await adminApi.getFamilyOutliersReport();
        setRows(response.data.rows || []);
        setTotal(response.data.rows?.length || 0);
      } else if (view === 'unitMismatch') {
        const response = await adminApi.getFamilyUnitMismatch();
        setRows(response.data.families || []);
        setTotal(response.data.families?.length || 0);
      } else if (view === 'stockFamilies') {
        const response = await adminApi.getProductFamilies();
        setRows(response.data || []);
        setTotal(response.data?.length || 0);
      } else if (view === 'priceFamilies') {
        const response = await adminApi.getPriceFamilies();
        setRows(response.data || []);
        setTotal(response.data?.length || 0);
      } else {
        const response = await adminApi.getPriceFamilyCostReport({
          status: costStatus,
          search: search.trim() || undefined,
          includeInactive: includeInactiveCosts,
        });
        setRows(response.data?.families || []);
        setTotal(response.data?.summary?.totalFamilies || response.data?.families?.length || 0);
      }
    } catch (err: any) {
      Alert.alert('Aile raporlari', getApiErrorMessage(err, 'Rapor alinamadi.'));
    } finally {
      setLoading(false);
    }
  };

  const removeFromFamily = (row: any) => {
    const familyId = familyIdOf(row);
    const productCode = productCodeOf(row);
    if (!familyId || !productCode) {
      Alert.alert('Aile', 'Aile veya stok kodu bulunamadi.');
      return;
    }
    Alert.alert('Aileden cikar', `${productCode} urunu ${familyNameOf(row)} ailesinden cikarilsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Cikar',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            await adminApi.removeProductFromFamily(familyId, productCode);
            await fetchCurrent();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Aileden cikar', getApiErrorMessage(err, 'Islem yapilamadi.'));
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const saveUnitFactor = async (itemId: string) => {
    const raw = factorDrafts[itemId];
    if (!itemId) return;
    if (unitSavingRef.current) return;
    unitSavingRef.current = itemId;
    setUnitSavingId(itemId);
    setLoading(true);
    try {
      await adminApi.setFamilyItemUnitFactor(itemId, raw === '' || raw == null ? null : n(raw));
      await fetchCurrent();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Birim katsayisi', getApiErrorMessage(err, 'Katsayi kaydedilemedi.'));
    } finally {
      unitSavingRef.current = null;
      setUnitSavingId(null);
      setLoading(false);
    }
  };

  const resetFamilyForm = () => {
    setFamilyForm({ id: '', name: '', code: '', note: '', productCodes: '', active: true });
    setFamilyProductSearch('');
    setFamilyProductResults([]);
  };

  const productCodesFromForm = () =>
    familyForm.productCodes
      .split(/[,\n;\s]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);

  const editFamily = (family: any) => {
    setFamilyForm({
      id: String(family.id || ''),
      name: String(family.name || ''),
      code: String(family.code || ''),
      note: String(family.note || ''),
      active: family.active !== false,
      productCodes: (family.items || [])
        .map((item: any) => String(item.productCode || '').trim().toUpperCase())
        .filter(Boolean)
        .join(', '),
    });
    setFamilyProductSearch('');
    setFamilyProductResults([]);
  };

  const appendProductCodeToFamilyForm = (codeRaw: string) => {
    const code = String(codeRaw || '').trim().toUpperCase();
    if (!code) return;
    const codes = productCodesFromForm();
    if (!codes.includes(code)) codes.push(code);
    setFamilyForm((prev) => ({ ...prev, productCodes: codes.join(', ') }));
  };

  const removeProductCodeFromFamilyForm = (codeRaw: string) => {
    const code = String(codeRaw || '').trim().toUpperCase();
    if (!code) return;
    setFamilyForm((prev) => ({
      ...prev,
      productCodes: productCodesFromForm().filter((item) => item !== code).join(', '),
    }));
  };

  const searchFamilyProducts = async () => {
    const term = familyProductSearch.trim();
    if (term.length < 2) {
      Alert.alert('Urun secici', 'En az 2 karakter yazin.');
      return;
    }
    setFamilyProductSearching(true);
    try {
      const response = await adminApi.getProducts({ search: term, page: 1, limit: 20 });
      setFamilyProductResults(response.products || []);
    } catch (err: any) {
      setFamilyProductResults([]);
      Alert.alert('Urun secici', getApiErrorMessage(err, 'Urunler aranamadi.'));
    } finally {
      setFamilyProductSearching(false);
    }
  };

  const saveFamily = async () => {
    if (familySavingRef.current) return;
    const name = familyForm.name.trim();
    if (!name) {
      Alert.alert('Aile', 'Aile adi zorunlu.');
      return;
    }
    familySavingRef.current = true;
    setFamilySaving(true);
    setLoading(true);
    try {
      const payload = {
        id: familyForm.id || undefined,
        name,
        code: familyForm.code.trim() || null,
        note: familyForm.note.trim() || null,
        active: familyForm.active,
        productCodes: productCodesFromForm(),
      };
      if (view === 'priceFamilies') await adminApi.savePriceFamily(payload);
      else await adminApi.saveProductFamily(payload);
      resetFamilyForm();
      await fetchCurrent();
      hapticSuccess();
    } catch (err: any) {
      Alert.alert('Aile kaydi', getApiErrorMessage(err, 'Aile kaydedilemedi.'));
    } finally {
      familySavingRef.current = false;
      setFamilySaving(false);
      setLoading(false);
    }
  };

  const deleteFamily = (family: any) => {
    const id = String(family.id || '');
    if (!id) return;
    Alert.alert('Aile sil', `${family.name || 'Aile'} silinsin mi?`, [
      { text: 'Vazgec', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            if (view === 'priceFamilies') await adminApi.deletePriceFamily(id);
            else await adminApi.deleteProductFamily(id);
            if (familyForm.id === id) resetFamilyForm();
            await fetchCurrent();
            hapticSuccess();
          } catch (err: any) {
            Alert.alert('Aile sil', getApiErrorMessage(err, 'Aile silinemedi.'));
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const setCostDraft = (key: string, patch: Partial<{ costP: string; costT: string; updatePriceLists: boolean }>) => {
    setCostDrafts((prev) => ({
      ...prev,
      [key]: {
        costP: prev[key]?.costP ?? '',
        costT: prev[key]?.costT ?? '',
        updatePriceLists: prev[key]?.updatePriceLists ?? true,
        ...patch,
      },
    }));
  };

  const updateCost = (family: any, item: any) => {
    const key = `${family.id}:${item.productCode}`;
    const draft = costDrafts[key] || {};
    const costP = n(draft.costP || item.currentCost || 0);
    const costT = n(draft.costT || 0);
    if (!costP || costP <= 0) {
      Alert.alert('Maliyet', 'Gecerli bir Maliyet P girin.');
      return;
    }
    Alert.alert(
      'Maliyet guncelle',
      `${item.productCode} icin maliyet P ${costP.toLocaleString('tr-TR')} olarak guncellensin mi?`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Guncelle',
          onPress: async () => {
            setLoading(true);
            try {
              await adminApi.updatePriceFamilyProductCost({
                familyId: family.id,
                productCode: item.productCode,
                costP,
                ...(costT > 0 ? { costT } : {}),
                updatePriceLists: draft.updatePriceLists !== false,
              });
              await fetchCurrent();
              hapticSuccess();
            } catch (err: any) {
              Alert.alert('Maliyet', getApiErrorMessage(err, 'Maliyet guncellenemedi.'));
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const updatePendingCosts = () => {
    if (!pendingCostUpdates.length) {
      Alert.alert('Toplu maliyet', 'Uygulanacak maliyet taslagi yok.');
      return;
    }
    const updateLists = pendingCostUpdates.filter((row) => row.updatePriceLists).length;
    Alert.alert(
      'Toplu maliyet guncelle',
      `${pendingCostUpdates.length} urun maliyeti sirayla guncellenecek. ${updateLists} satirda fiyat listeleri de guncellenecek.`,
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Guncelle',
          onPress: async () => {
            setLoading(true);
            const failed: string[] = [];
            let ok = 0;
            try {
              for (const row of pendingCostUpdates) {
                try {
                  await adminApi.updatePriceFamilyProductCost({
                    familyId: row.familyId,
                    productCode: row.productCode,
                    costP: row.costP,
                    ...(row.costT ? { costT: row.costT } : {}),
                    updatePriceLists: row.updatePriceLists,
                  });
                  ok += 1;
                } catch (err: any) {
                  failed.push(`${row.productCode}: ${getApiErrorMessage(err, 'hata')}`);
                }
              }
              setCostDrafts((current) => {
                const next = { ...current };
                pendingCostUpdates.forEach((row) => delete next[row.key]);
                return next;
              });
              await fetchCurrent();
              hapticSuccess();
              Alert.alert(
                'Toplu maliyet tamamlandi',
                failed.length
                  ? `${ok} satir guncellendi, ${failed.length} satir hata verdi.\n${failed.slice(0, 4).join('\n')}`
                  : `${ok} satir basariyla guncellendi.`
              );
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
    if (!filteredRows.length) {
      Alert.alert('Bilgi', 'Disa aktarilacak aile raporu satiri yok.');
      return;
    }

    setExporting(true);
    try {
      const sheetRows = buildFamilyRows(view, filteredRows);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws['!cols'] = sheetRows[0].map((title: any) => ({
        wch: Math.min(Math.max(String(title || '').length + 5, 12), 44),
      }));
      XLSX.utils.book_append_sheet(wb, ws, viewTitles[view].slice(0, 31));

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const dir = `${FileSystem.documentDirectory}reports/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const target = `${dir}aile-raporlari-${view}-${stamp}.xlsx`;
      await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `${viewTitles[view]} Excel`,
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

  const renderHeader = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Aile kalite raporlari</Text>
      <TextInput style={styles.input} placeholder="Stok, aile veya kume ara" placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
      {view === 'priceCosts' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="Sorunlu" active={costStatus === 'problem'} onPress={() => setCostStatus('problem')} />
            <Chip label="Guncel" active={costStatus === 'ok'} onPress={() => setCostStatus('ok')} />
            <Chip label="Tum" active={costStatus === 'all'} onPress={() => setCostStatus('all')} />
          </ScrollView>
          <View style={styles.switchRow}>
            <Text style={styles.cardMeta}>Pasif aileleri dahil et</Text>
            <Switch value={includeInactiveCosts} onValueChange={setIncludeInactiveCosts} />
          </View>
        </>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="Limit" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={limit} onChangeText={setLimit} />
        <TouchableOpacity style={styles.primaryButton} onPress={fetchCurrent}>
          <Text style={styles.primaryButtonText}>Yenile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={exportExcel} disabled={exporting}>
          <Text style={styles.secondaryButtonText}>{exporting ? 'Hazirlaniyor' : 'Excel'}</Text>
        </TouchableOpacity>
      </View>
      {view === 'priceCosts' ? (
        <View style={styles.bulkBox}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>Toplu maliyet taslaklari</Text>
            <Text style={styles.cardMeta}>
              {pendingCostUpdates.length
                ? `${pendingCostUpdates.length} urun uygulanmaya hazir. Liste guncelleme acik: ${pendingCostUpdates.filter((row) => row.updatePriceLists).length}`
                : 'Maliyet P/T alanlarini degistirdiginizde taslaklar burada toplanir.'}
            </Text>
          </View>
          <TouchableOpacity style={[styles.primaryButton, !pendingCostUpdates.length && styles.buttonDisabled]} onPress={updatePendingCosts} disabled={!pendingCostUpdates.length || loading}>
            <Text style={styles.primaryButtonText}>Toplu Uygula</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.metricRow}>
        <Metric label="Toplam" value={total || rows.length} />
        <Metric label="Gorunen" value={filteredRows.length} />
      </View>
    </View>
  );

  const renderFamilyForm = () => {
    if (view !== 'stockFamilies' && view !== 'priceFamilies') return null;
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{familyForm.id ? 'Aile Duzenle' : 'Yeni Aile'}</Text>
        <TextInput style={styles.input} placeholder="Aile adi" placeholderTextColor={colors.textMuted} value={familyForm.name} onChangeText={(value) => setFamilyForm((prev) => ({ ...prev, name: value }))} />
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Kod" placeholderTextColor={colors.textMuted} value={familyForm.code} onChangeText={(value) => setFamilyForm((prev) => ({ ...prev, code: value }))} />
          <View style={styles.switchMini}>
            <Text style={styles.cardMeta}>Aktif</Text>
            <Switch value={familyForm.active} onValueChange={(value) => setFamilyForm((prev) => ({ ...prev, active: value }))} />
          </View>
        </View>
        <TextInput style={styles.input} placeholder="Not" placeholderTextColor={colors.textMuted} value={familyForm.note} onChangeText={(value) => setFamilyForm((prev) => ({ ...prev, note: value }))} />
        <View style={styles.selectorBox}>
          <Text style={styles.cardMeta}>Urun secici</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.flex]}
              placeholder="Stok kodu veya urun adi ara"
              placeholderTextColor={colors.textMuted}
              value={familyProductSearch}
              onChangeText={setFamilyProductSearch}
              onSubmitEditing={searchFamilyProducts}
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={searchFamilyProducts} disabled={familyProductSearching}>
              <Text style={styles.secondaryButtonText}>{familyProductSearching ? '...' : 'Ara'}</Text>
            </TouchableOpacity>
          </View>
          {familyProductResults.slice(0, 8).map((product: any) => {
            const code = String(product.mikroCode || product.productCode || product.code || '').trim().toUpperCase();
            const name = String(product.name || product.productName || product.mikroName || code || '-').trim();
            if (!code) return null;
            const selected = productCodesFromForm().includes(code);
            return (
              <TouchableOpacity
                key={code}
                style={[styles.productResult, selected && styles.productResultSelected]}
                onPress={() => appendProductCodeToFamilyForm(code)}
              >
                <View style={styles.flex}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{name}</Text>
                  <Text style={styles.cardMeta}>{code}</Text>
                </View>
                <Text style={[styles.productResultAction, selected && styles.productResultActionSelected]}>
                  {selected ? 'Eklendi' : 'Ekle'}
                </Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.selectedCodeRow}>
            {productCodesFromForm().slice(0, 16).map((code) => (
              <TouchableOpacity key={code} style={styles.selectedCodeChip} onPress={() => removeProductCodeFromFamilyForm(code)}>
                <Text style={styles.selectedCodeText}>{code} x</Text>
              </TouchableOpacity>
            ))}
            {productCodesFromForm().length > 16 ? <Text style={styles.cardMeta}>+{productCodesFromForm().length - 16} kod</Text> : null}
          </View>
        </View>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Stok kodlari: 120.01, 130.02..."
          placeholderTextColor={colors.textMuted}
          multiline
          value={familyForm.productCodes}
          onChangeText={(value) => setFamilyForm((prev) => ({ ...prev, productCodes: value }))}
        />
        <View style={styles.inputRow}>
          <TouchableOpacity style={[styles.primaryButton, styles.flex, familySaving && styles.buttonDisabled]} onPress={saveFamily} disabled={familySaving}>
            <Text style={styles.primaryButtonText}>{familySaving ? 'Kaydediliyor' : familyForm.id ? 'Guncelle' : 'Olustur'}</Text>
          </TouchableOpacity>
          {familyForm.id ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={resetFamilyForm}>
              <Text style={styles.secondaryButtonText}>Temizle</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderSuggestion = (row: any, index: number) => (
    <View key={`${productCodeOf(row)}-${index}`} style={styles.card}>
      <Text style={styles.cardTitle} numberOfLines={2}>{productNameOf(row)}</Text>
      <Text style={styles.cardMeta}>{productCodeOf(row)} · Onerilen aile: {familyNameOf(row)}</Text>
      <View style={styles.metricRow}>
        <Metric label="Skor" value={scoreText(row.score || row.similarity || row.confidence)} tone="green" />
        <Metric label="Mevcut" value={row.currentFamilyName || row.currentFamilyCode || '-'} />
      </View>
    </View>
  );

  const renderCluster = (row: any, index: number) => {
    const items = row.items || row.products || [];
    return (
      <View key={`${row.id || row.clusterId || index}`} style={styles.card}>
        <Text style={styles.cardTitle} numberOfLines={2}>{row.name || row.clusterName || `Kume ${index + 1}`}</Text>
        <Text style={styles.cardMeta} numberOfLines={2}>{row.reason || row.description || '-'}</Text>
        <View style={styles.metricRow}>
          <Metric label="Urun" value={row.itemCount || items.length || 0} />
          <Metric label="Skor" value={scoreText(row.score)} tone="green" />
        </View>
        {items.slice(0, 5).map((item: any, itemIndex: number) => (
          <Text key={`${item.productCode || itemIndex}`} style={styles.cardMeta}>
            {item.productCode || item.code || '-'} - {item.productName || item.name || '-'}
          </Text>
        ))}
      </View>
    );
  };

  const renderOutlier = (row: any, index: number) => (
    <View key={`${productCodeOf(row)}-${index}`} style={styles.card}>
      <Text style={styles.cardTitle} numberOfLines={2}>{productNameOf(row)}</Text>
      <Text style={styles.cardMeta}>{productCodeOf(row)} · Aile: {familyNameOf(row)}</Text>
      <View style={styles.metricRow}>
        <Metric label="Sebep" value={row.reason || row.issue || '-'} tone="amber" />
        <Metric label="Skor" value={scoreText(row.score || row.distance)} />
      </View>
      <TouchableOpacity style={styles.warningButton} onPress={() => removeFromFamily(row)}>
        <Text style={styles.warningButtonText}>Aileden Cikar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUnitMismatch = (family: any, index: number) => {
    const items = family.items || family.mismatches || [];
    return (
      <View key={`${family.id || family.familyId || index}`} style={styles.card}>
        <Text style={styles.cardTitle} numberOfLines={2}>{family.name || family.familyName || 'Aile'}</Text>
        <Text style={styles.cardMeta}>{family.code || family.familyCode || '-'} · Uyusmaz kalem: {items.length}</Text>
        {items.slice(0, 8).map((item: any, itemIndex: number) => {
          const itemId = String(item.itemId || item.id || '');
          return (
            <View key={`${itemId || itemIndex}`} style={styles.itemBox}>
              <Text style={styles.cardMeta} numberOfLines={2}>{item.productCode || item.code || '-'} - {item.productName || item.name || '-'}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="Katsayi"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={factorDrafts[itemId] ?? String(item.unitFactorOverride ?? item.factor ?? '')}
                  onChangeText={(value) => setFactorDrafts((prev) => ({ ...prev, [itemId]: value }))}
                />
                <TouchableOpacity
                  style={[styles.secondaryButton, (!itemId || unitSavingId === itemId) && styles.buttonDisabled]}
                  onPress={() => saveUnitFactor(itemId)}
                  disabled={!itemId || unitSavingId === itemId}
                >
                  <Text style={styles.secondaryButtonText}>{unitSavingId === itemId ? 'Kaydediliyor' : 'Kaydet'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderFamilyCard = (family: any, index: number) => {
    const items = family.items || [];
    return (
      <View key={`${family.id || index}`} style={styles.card}>
        <Text style={styles.cardTitle} numberOfLines={2}>{family.name || 'Aile'}</Text>
        <Text style={styles.cardMeta}>{family.code || '-'} - {family.active === false ? 'Pasif' : 'Aktif'} - {items.length} urun</Text>
        {family.note ? <Text style={styles.noteText}>{family.note}</Text> : null}
        {items.slice(0, 8).map((item: any, itemIndex: number) => (
          <Text key={`${item.id || item.productCode || itemIndex}`} style={styles.cardMeta} numberOfLines={1}>
            {item.productCode || '-'} - {item.productName || '-'}
          </Text>
        ))}
        {items.length > 8 ? <Text style={styles.cardMeta}>+{items.length - 8} urun daha</Text> : null}
        <View style={styles.inputRow}>
          <TouchableOpacity style={[styles.secondaryButton, styles.flex]} onPress={() => editFamily(family)}>
            <Text style={styles.secondaryButtonText}>Duzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.warningButton} onPress={() => deleteFamily(family)}>
            <Text style={styles.warningButtonText}>Sil</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPriceCostFamily = (family: any, index: number) => {
    const issueItems = (family.items || []).filter((item: any) => costStatus === 'all' || item.issueType !== 'ok');
    return (
      <View key={`${family.id || index}`} style={styles.card}>
        <Text style={styles.cardTitle} numberOfLines={2}>{family.name || 'Fiyat ailesi'}</Text>
        <Text style={styles.cardMeta}>{family.code || '-'} - {family.status === 'ok' ? 'Guncel' : 'Sorunlu'} - {family.itemCount || family.items?.length || 0} urun</Text>
        <View style={styles.metricRow}>
          <Metric label="Eski" value={family.outdatedCount || 0} tone={family.outdatedCount ? 'amber' : undefined} />
          <Metric label="Tarih Yok" value={family.missingCostDateCount || 0} tone={family.missingCostDateCount ? 'red' : undefined} />
          <Metric label="En Eski" value={family.oldestCostDate ? String(family.oldestCostDate).slice(0, 10) : '-'} />
        </View>
        {issueItems.slice(0, 10).map((item: any) => {
          const key = `${family.id}:${item.productCode}`;
          const draft = costDrafts[key] || {};
          return (
            <View key={key} style={styles.itemBox}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.productCode} - {item.productName || '-'}</Text>
              <Text style={styles.cardMeta}>
                Maliyet: {item.currentCost ?? '-'} - Son giris: {item.lastEntryPrice ?? '-'} - Fark gun: {item.daysBehind ?? '-'}
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="Maliyet P"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={draft.costP ?? String(item.currentCost ?? '')}
                  onChangeText={(value) => setCostDraft(key, { costP: value })}
                />
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="Maliyet T"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={draft.costT ?? ''}
                  onChangeText={(value) => setCostDraft(key, { costT: value })}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.cardMeta}>10 fiyat listesini de guncelle</Text>
                <Switch
                  value={draft.updatePriceLists !== false}
                  onValueChange={(value) => setCostDraft(key, { updatePriceLists: value })}
                />
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={() => updateCost(family, item)}>
                <Text style={styles.primaryButtonText}>Maliyeti Guncelle</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        {issueItems.length > 10 ? <Text style={styles.cardMeta}>+{issueItems.length - 10} satir daha. Arama ile daraltin.</Text> : null}
      </View>
    );
  };

  const renderRow = (row: any, index: number) => {
    if (view === 'clusters') return renderCluster(row, index);
    if (view === 'outliers') return renderOutlier(row, index);
    if (view === 'unitMismatch') return renderUnitMismatch(row, index);
    if (view === 'stockFamilies' || view === 'priceFamilies') return renderFamilyCard(row, index);
    if (view === 'priceCosts') return renderPriceCostFamily(row, index);
    return renderSuggestion(row, index);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Aile ve Katalog Kalitesi</Text>
            <Text style={styles.title}>Aile Raporlari</Text>
            <Text style={styles.subtitle}>Aile onerisi, kume, aykiri urun, birim uyumu ve fiyat aile maliyetleri.</Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Gorunum</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>{viewTitles[view]}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Gorunen</Text>
              <Text style={styles.heroStatValue}>{filteredRows.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Toplam</Text>
              <Text style={styles.heroStatValue}>{total || rows.length}</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Taslak</Text>
              <Text style={styles.heroStatValue}>{pendingCostUpdates.length}</Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label="Oneriler" active={view === 'suggestions'} onPress={() => setView('suggestions')} />
          <Chip label="Kumeler" active={view === 'clusters'} onPress={() => setView('clusters')} />
          <Chip label="Aykirilar" active={view === 'outliers'} onPress={() => setView('outliers')} />
          <Chip label="Birim" active={view === 'unitMismatch'} onPress={() => setView('unitMismatch')} />
          <Chip label="Stok Aileleri" active={view === 'stockFamilies'} onPress={() => setView('stockFamilies')} />
          <Chip label="Fiyat Aileleri" active={view === 'priceFamilies'} onPress={() => setView('priceFamilies')} />
          <Chip label="Fiyat Maliyet" active={view === 'priceCosts'} onPress={() => setView('priceCosts')} />
        </ScrollView>
        {renderHeader()}
        {renderFamilyForm()}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {!loading && filteredRows.length ? (
          <View style={[styles.reportGrid, isWide && styles.reportGridWide]}>
            {filteredRows.map((row, index) => (
              <View key={`family-report-${view}-${index}`} style={isWide && styles.reportGridItem}>
                {renderRow(row, index)}
              </View>
            ))}
          </View>
        ) : null}
        {!loading && !filteredRows.length ? <Empty text="Aile raporu kaydi yok." /> : null}
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
  heroStatValue: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: '#FFFFFF', marginTop: spacing.xs },
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
  itemBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  selectorBox: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  productResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  productResultSelected: {
    borderColor: '#93C5FD',
    backgroundColor: colors.primaryMuted,
  },
  productResultAction: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.sm,
    color: colors.primarySoft,
  },
  productResultActionSelected: { color: colors.success },
  selectedCodeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  selectedCodeChip: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  selectedCodeText: { fontFamily: fonts.semibold, fontSize: fontSizes.xs, color: '#075985' },
  sectionTitle: { fontFamily: fonts.bold, fontSize: fontSizes.lg, color: colors.text },
  cardTitle: { minWidth: 0, fontFamily: fonts.semibold, fontSize: fontSizes.md, color: colors.text, lineHeight: 22 },
  cardMeta: { minWidth: 0, fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  noteText: { fontFamily: fonts.regular, fontSize: fontSizes.sm, color: colors.text, lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bulkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  switchMini: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
  textArea: { minHeight: 82, paddingVertical: spacing.sm, textAlignVertical: 'top' },
  metric: {
    flexGrow: 1,
    minWidth: 92,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricLabel: { fontFamily: fonts.regular, fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: colors.text, marginTop: 2 },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm, color: colors.primarySoft },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { fontFamily: fonts.bold, fontSize: fontSizes.sm, color: '#FFFFFF' },
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
  empty: { padding: spacing.md, alignItems: 'center' },
  emptyText: { fontFamily: fonts.medium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  textDanger: { color: colors.danger },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
});
