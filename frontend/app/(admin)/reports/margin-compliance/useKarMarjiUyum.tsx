'use client';

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { adminApi } from '@/lib/api/admin';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import toast from 'react-hot-toast';
// 13.3: xlsx statik degil; export aninda dinamik import edilir.

/**
 * Kar Marji Analizi (019703) raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki MarginAnalysisPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 *
 * NOT: Bu rapordaki sayisiz yardimci fonksiyon (KDV / yarim-KDV / maliyet bazi /
 * kar yuzdesi hesaplari, kolon tanimlari vb.) ve tipler de buraya tasinmis ve
 * re-export edilmistir; iki gorunum de ayni hesaplari paylasir.
 */

// 019703 Raporu veri yapÄ±sÄ±
export interface MarginAnalysisRow {
  [key: string]: any;
  msg_S_0089: string; // Evrak No
  msg_S_0001: string; // Stok Kodu
  Tip: string; // Bekleyen SipariÅŸ / Fatura
  GrupKodu: string; // Kategori/Grup
  SektorKodu: string; // SektÃ¶r
  'Cari Kodu': string;
  'Cari Ä°smi': string;
  'Evrak Tarihi': string;
  'Evrak No': string;
  'Belge No': string;
  'Stok Kodu': string;
  'Stok Ä°smi': string;
  Miktar: number;
  Birimi: string;
  'BirimSatÄ±ÅŸ': number;
  'BirimSatÄ±ÅŸKDV': number;
  Tutar: number;
  TutarKDV: number;
  'SÃ–-BirimMaliyet': number; // Son giriÅŸ maliyeti
  'SÃ¶-BirimMaliyetKdv': number;
  'SÃ–-BirimKar': number;
  'SÃ–-ToplamKar': number;
  'SÃ–-KarYuzde': number; // Son giriÅŸ maliyetine gÃ¶re kar %
  OrtalamaMaliyet: number;
  OrtalamaMaliyetKDVli: number;
  'BirimKarOrtMalGÃ¶re': number;
  'ToplamKarOrtMalGÃ¶re': number;
  OrtalamaKarYuzde: number; // Ortalama maliyete gÃ¶re kar %
  'SatÄ±cÄ± Kodu': string;
  'SatÄ±cÄ± Ä°smi': string;
}

export interface SummaryBucket {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  negativeLines: number;
  negativeDocuments: number;
}

export interface Summary {
  totalRecords: number;
  totalDocuments: number;
  totalRevenue: number;
  totalProfit: number;
  entryProfit: number;
  avgMargin: number;
  highMarginCount: number;
  lowMarginCount: number;
  negativeMarginCount: number;
  orderSummary: SummaryBucket;
  salesSummary: SummaryBucket;
  salespersonSummary: Array<{
    sectorCode: string;
    orderSummary: SummaryBucket;
    salesSummary: SummaryBucket;
  }>;
}


export interface Metadata {
  reportDate: string;
  startDate: string;
  endDate: string;
  includeCompleted: number;
}

// ==================== Rapor Dislamalari (marka / urun) ====================

export type MarginExclusionType = 'BRAND' | 'PRODUCT_CODE' | 'PRODUCT_NAME';

export interface MarginExclusionRecord {
  id: string;
  type: MarginExclusionType;
  value: string;
  label?: string | null;
  note?: string | null;
  active: boolean;
  createdAt: string;
}

export interface MarginExclusionOption {
  value: string;
  label: string;
  productCount?: number;
}

export const MARGIN_EXCLUSION_TYPE_LABELS: Record<MarginExclusionType, string> = {
  BRAND: 'Marka',
  PRODUCT_CODE: 'Ürün Kodu',
  PRODUCT_NAME: 'Ürün Adı',
};

// ==================== Genel Rapor Dislamalari (ReportExclusion) ====================
// Eski /exclusions (Ayarlar > Hariç Tutma) sayfasindan tasindi; ayni adminApi
// CRUD'u (getExclusions/createExclusion/deleteExclusion) kullanilir.

export type GeneralExclusionType =
  | 'PRODUCT_CODE'
  | 'CUSTOMER_CODE'
  | 'CUSTOMER_NAME'
  | 'PRODUCT_NAME'
  | 'SECTOR_CODE';

export interface GeneralExclusionRecord {
  id: string;
  type: GeneralExclusionType;
  value: string;
  description?: string;
  active: boolean;
  createdAt: string;
  // Backend cozumlu etiket: PRODUCT_CODE -> urun adi, CUSTOMER_CODE -> cari unvani; digerleri null.
  resolvedLabel?: string | null;
}

export const GENERAL_EXCLUSION_TYPE_LABELS: Record<GeneralExclusionType, string> = {
  PRODUCT_CODE: 'Ürün Kodu',
  CUSTOMER_CODE: 'Cari Kodu',
  CUSTOMER_NAME: 'Cari Adı',
  PRODUCT_NAME: 'Ürün Adı',
  SECTOR_CODE: 'Sektör Kodu',
};

export type ColumnId = string;

export interface ColumnConfig {
  id: ColumnId;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: MarginAnalysisRow) => ReactNode;
  exportValue: (row: MarginAnalysisRow) => string | number | null;
}

const DEFAULT_COLUMN_IDS: ColumnId[] = [
  'documentNo',
  'documentType',
  'documentDate',
  'customerName',
  'stockCode',
  'stockName',
  'quantity',
  'unitPrice',
  'totalAmount',
  'avgCost',
  'unitProfit',
  'totalProfit',
  'margin',
  'entryUnitCost',
  'entryProfit',
  'entryMargin',
];

// Yeni eklenen Son Giris baz kolonlari: kayitli kolon secimi olan kullanicilarda
// bir defaya mahsus otomatik gorunur yapilir (asagidaki migration bayragi ile).
// Kolon id'leri backend e-posta XLSX kolon anahtarlariyla (BASE_MARGIN_REPORT_COLUMNS) ayni olmali;
// 'Mail excel kolonlarini kaydet' bu id'leri Settings.marginReportEmailColumns'a aynen yazar.
const ENTRY_COLUMN_IDS: ColumnId[] = ['entryUnitCost', 'entryProfit', 'entryMargin'];

const BASE_DATA_KEYS = new Set([
  'Evrak No',
  'Tip',
  'Evrak Tarihi',
  'Cari Ä°smi',
  'Stok Kodu',
  'Stok Ä°smi',
  'Miktar',
  'Birimi',
  'BirimSatÄ±ÅŸKDV',
  'TutarKDV',
  'OrtalamaMaliyetKDVli',
  'BirimKarOrtMalGÃ¶re',
  'ToplamKarOrtMalGÃ¶re',
  'OrtalamaKarYuzde',
]);

const COLUMN_STORAGE_KEY = 'margin-analysis-columns';
// Son Giris kolonlari icin tek seferlik gorunurluk migration bayragi.
const COLUMN_ENTRY_MIGRATION_KEY = 'margin-analysis-columns-entry-v1';

const normalizeDataKey = (value: unknown) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/Ä±/g, 'i')
    .replace(/ÅŸ/g, 's')
    .replace(/ÄŸ/g, 'g')
    .replace(/Ã¼/g, 'u')
    .replace(/Ã¶/g, 'o')
    .replace(/Ã§/g, 'c')
    .replace(/Ã„Â±/g, 'i')
    .replace(/Ã…ÂŸ/g, 's')
    .replace(/Ã„ÂŸ/g, 'g')
    .replace(/ÃƒÂ¼/g, 'u')
    .replace(/ÃƒÂ¶/g, 'o')
    .replace(/ÃƒÂ§/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const getRowValue = (row: MarginAnalysisRow, keys: string[], fallbackToken?: string) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined) {
      return row[key];
    }
  }

  const normalizedKeys = keys.map(normalizeDataKey);
  const normalizedFallback = fallbackToken ? normalizeDataKey(fallbackToken) : '';
  const foundKey = Object.keys(row).find((key) => {
    const normalized = normalizeDataKey(key);
    return normalizedKeys.some((candidate) => normalized.includes(candidate)) ||
      (normalizedFallback ? normalized.includes(normalizedFallback) : false);
  });
  return foundKey ? row[foundKey] : undefined;
};

const getRowNumber = (row: MarginAnalysisRow, keys: string[], fallbackToken?: string) => {
  const value = getRowValue(row, keys, fallbackToken);
  const parsed = typeof value === 'string' ? Number(value.replace(/\./g, '').replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const areSameMoney = (left: number, right: number) => left > 0 && right > 0 && Math.abs(left - right) < 0.01;

const isNoVatSaleRow = (row: MarginAnalysisRow) => {
  const status = normalizeDataKey(getRowValue(row, ['SatısDurumu', 'SatisDurumu', 'SatışDurumu'], 'satisdurumu'));
  if (status.includes('vergiyok')) return true;
  if (status.includes('vergivar')) return false;
  return getRowNumber(row, ['Vergi'], 'vergi') === 0;
};

const getHalfVatFactor = (row: MarginAnalysisRow) => {
  const ratioPairs = [
    [getRowNumber(row, ['P1'], 'p1'), getRowNumber(row, ['F1'], 'f1')],
    [getRowNumber(row, ['P3'], 'p3'), getRowNumber(row, ['F3'], 'f3')],
    [getRowNumber(row, ['P5'], 'p5'), getRowNumber(row, ['F5'], 'f5')],
    [getRowNumber(row, ['A.TeklifDahil', 'A.Teklif KDV Dahil'], 'ateklifdahil'), getRowNumber(row, ['A.Teklif+'], 'ateklif')],
  ];
  for (const [withHalfVat, withoutHalfVat] of ratioPairs) {
    if (withHalfVat > 0 && withoutHalfVat > 0) {
      const ratio = withHalfVat / withoutHalfVat;
      if (ratio > 1 && ratio < 1.3) return ratio;
    }
  }

  const revenue = getRowNumber(row, ['Tutar'], 'tutar');
  const vat = getRowNumber(row, ['Vergi'], 'vergi');
  if (revenue > 0 && vat > 0) return 1 + (vat / revenue) / 2;

  const entryCost = getRowNumber(row, ['SÖ-BirimMaliyet', 'SO-BirimMaliyet', 'SÃ–-BirimMaliyet'], 'sobirimmaliyet');
  const entryCostVat = getRowNumber(row, ['Sö-BirimMaliyetKdv', 'SO-BirimMaliyetKdv', 'SÃ¶-BirimMaliyetKdv'], 'sobirimmaliyetkdv');
  if (entryCost > 0 && entryCostVat > entryCost) return 1 + ((entryCostVat / entryCost) - 1) / 2;

  return 1.1;
};

// Anahtar adini tam (normalize edilmis) eslestirir; 'sobirimmaliyet' token'i
// 'sobirimmaliyetkdv' icinde de gectigi icin includes-bazli arama yaniltici olur.
const getRowNumberByExactToken = (row: MarginAnalysisRow, token: string) => {
  const normalizedToken = normalizeDataKey(token);
  const key = Object.keys(row).find((candidate) => normalizeDataKey(candidate) === normalizedToken);
  const value = key ? row[key] : undefined;
  const parsed = typeof value === 'string' ? Number(value.replace(/\./g, '').replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Anahtar adaylarini once birebir (hasOwnProperty) dener; canli JSONB satirlarindaki
// mojibake anahtarlar ('SÃ–-BirimMaliyet' vb.) NFKD normalizasyonunda bozuldugu icin
// token eslesmesi onlari bulamaz — birebir adaylar bu yuzden sart.
const getRowNumberFromExactKeys = (row: MarginAnalysisRow, keys: string[]) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined) {
      const value = row[key];
      const parsed = typeof value === 'string' ? Number(value.replace(/\./g, '').replace(',', '.')) : Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
};

// Son giris (SO) birim maliyetini satirin KDV durumuna gore kar hesap bazina cevirir.
const getEntryUnitCostBasis = (row: MarginAnalysisRow) => {
  const net =
    getRowNumberFromExactKeys(row, ['SÖ-BirimMaliyet', 'SO-BirimMaliyet', 'SÃ–-BirimMaliyet', 'SÃƒâ€“-BirimMaliyet']) ||
    getRowNumberByExactToken(row, 'SÖ-BirimMaliyet');
  const withVat =
    getRowNumberFromExactKeys(row, ['Sö-BirimMaliyetKdv', 'SO-BirimMaliyetKdv', 'SÃ¶-BirimMaliyetKdv', 'SÃƒÂ¶-BirimMaliyetKdv']) ||
    getRowNumberByExactToken(row, 'Sö-BirimMaliyetKdv');
  const halfVatFactor = getHalfVatFactor(row);
  const fullVatFactor = 1 + (halfVatFactor - 1) * 2;
  if (isNoVatSaleRow(row)) {
    if (net > 0) return net * halfVatFactor;
    if (withVat > 0 && fullVatFactor > 0) return (withVat / fullVatFactor) * halfVatFactor;
    return 0;
  }
  if (net > 0) return net;
  if (withVat > 0 && fullVatFactor > 0) return withVat / fullVatFactor;
  return 0;
};

const getCurrentCostBasis = (row: MarginAnalysisRow) => {
  const noVatSale = isNoVatSaleRow(row);
  const withoutVat = getRowNumber(row, ['A.Teklif+'], 'ateklif');
  const withVat = getRowNumber(row, ['A.TeklifDahil', 'A.Teklif KDV Dahil'], 'ateklifdahil');
  const halfVatFactor = getHalfVatFactor(row);
  const sameCost = areSameMoney(withoutVat, withVat);
  const currentCost = (() => {
    if (noVatSale) {
      if (sameCost) return withVat * halfVatFactor;
      return withVat > 0 ? withVat : withoutVat * halfVatFactor;
    }
    if (sameCost) return withoutVat / halfVatFactor;
    return withoutVat > 0 ? withoutVat : withVat / halfVatFactor;
  })();
  // Kar hesap tabani: SAF guncel maliyet (backend pickCurrentCostBasis ile birebir).
  // Son giris tabani ayri kolonlarda gosterilir (getEntryUnitCostBasis / SÖ kolonlari).
  return currentCost;
};

const getCurrentRevenueBasis = (row: MarginAnalysisRow) => {
  const noVatSale = isNoVatSaleRow(row);
  const withoutVat = getRowNumber(row, ['Tutar'], 'tutar');
  const withVat = getRowNumber(row, ['TutarKDV', 'Tutar KDV', 'VergiDahil'], 'tutarkdv');
  return noVatSale && withVat > 0 ? withVat : withoutVat || withVat;
};

const getCurrentUnitRevenueBasis = (row: MarginAnalysisRow) => {
  const noVatSale = isNoVatSaleRow(row);
  const withoutVat = getRowNumber(row, ['BirimSatÄ±ÅŸ', 'BirimSatış', 'BirimSatis', 'Birim Satış'], 'birimsatis');
  const withVat = getRowNumber(row, ['BirimSatÄ±ÅŸKDV', 'BirimSatışKDV', 'BirimSatisKDV', 'Birim Satış KDV'], 'birimsatiskdv');
  return noVatSale && withVat > 0 ? withVat : withoutVat || withVat;
};

const getCurrentUnitProfit = (row: MarginAnalysisRow) => getCurrentUnitRevenueBasis(row) - getCurrentCostBasis(row);

const getCurrentTotalProfit = (row: MarginAnalysisRow) =>
  getCurrentRevenueBasis(row) - getCurrentCostBasis(row) * getRowNumber(row, ['Miktar'], 'miktar');

const getCurrentMarginPercent = (row: MarginAnalysisRow) => {
  const totalCost = getCurrentCostBasis(row) * getRowNumber(row, ['Miktar'], 'miktar');
  const profit = getCurrentTotalProfit(row);
  const revenue = getCurrentRevenueBasis(row);
  return totalCost > 0 ? (profit / totalCost) * 100 : revenue > 0 ? (profit / revenue) * 100 : 0;
};

// Son giris (SÖ) toplam kar: Mikro'nun ham SÖ-ToplamKar kolonundan okunur
// (mojibake-toleransli dinamik cozumleyici ile; backend pickEntryProfit paraleli).
const getEntryTotalProfit = (row: MarginAnalysisRow) =>
  getRowNumber(row, ['SÖ-ToplamKar', 'SO-ToplamKar', 'SÃ–-ToplamKar', 'SÃƒâ€“-ToplamKar'], 'sotoplamkar');

// Son giris kar yuzdesi: SÖ-KarYuzde kolonu varsa onu kullanir; yoksa
// backend pickEntryMargin gibi entryProfit / ciro (Tutar) * 100 hesaplar.
const getEntryMarginPercent = (row: MarginAnalysisRow) => {
  const raw = getRowValue(row, ['SÖ-KarYuzde', 'SO-KarYuzde', 'SÖ-KarYüzde', 'SÃ–-KarYuzde', 'SÃƒâ€“-KarYuzde'], 'sokaryuzde');
  if (raw !== null && raw !== undefined && raw !== '') {
    const parsed = typeof raw === 'string' ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  const revenue = getRowNumber(row, ['Tutar'], 'tutar');
  return revenue > 0 ? (getEntryTotalProfit(row) / revenue) * 100 : 0;
};

const getDefaultDateValue = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString('en-CA');
};

// Yardimci hesaplama fonksiyonlarini disari ac (gerekirse iki gorunum de kullanabilsin).
export {
  getCurrentCostBasis,
  getCurrentRevenueBasis,
  getCurrentUnitRevenueBasis,
  getCurrentUnitProfit,
  getCurrentTotalProfit,
  getCurrentMarginPercent,
  getEntryUnitCostBasis,
  getEntryTotalProfit,
  getEntryMarginPercent,
};

export function useKarMarjiUyum() {
  const [data, setData] = useState<MarginAnalysisRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState(() => getDefaultDateValue());
  const [endDate, setEndDate] = useState(() => getDefaultDateValue());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_COLUMN_IDS);
  const hasInitializedColumns = useRef(false);
  const [emailColumnIds, setEmailColumnIds] = useState<ColumnId[]>([]);
  const [savingEmailColumns, setSavingEmailColumns] = useState(false);
  const [includedSectorCodes, setIncludedSectorCodes] = useState<string[]>([]);
  const [availableSectorCodes, setAvailableSectorCodes] = useState<string[]>([]);
  const [savingSectorCodes, setSavingSectorCodes] = useState(false);
  const [syncingReport, setSyncingReport] = useState(false);
  const [sendingReportEmail, setSendingReportEmail] = useState(false);

  // Rapor dislamalari (marka / stok kodu / stok adi)
  const [exclusions, setExclusions] = useState<MarginExclusionRecord[]>([]);
  const [excludedByUserRules, setExcludedByUserRules] = useState(0);
  const [exclusionType, setExclusionType] = useState<MarginExclusionType>('BRAND');
  const [exclusionSearch, setExclusionSearch] = useState('');
  const [exclusionOptions, setExclusionOptions] = useState<MarginExclusionOption[]>([]);
  const [exclusionOptionsLoading, setExclusionOptionsLoading] = useState(false);
  const [exclusionNameInput, setExclusionNameInput] = useState('');
  const [savingExclusion, setSavingExclusion] = useState(false);
  const [deletingExclusionId, setDeletingExclusionId] = useState<string | null>(null);

  // Dislama paneli: <details> yerine belirgin buton + acik state'li panel; iki sekme.
  const [exclusionsPanelOpen, setExclusionsPanelOpen] = useState(false);
  const [exclusionsTab, setExclusionsTab] = useState<'MARGIN' | 'GENERAL'>('MARGIN');

  // Genel rapor dislamalari (eski /exclusions sayfasindan tasindi)
  const [generalExclusions, setGeneralExclusions] = useState<GeneralExclusionRecord[]>([]);
  const [generalExclusionsLoading, setGeneralExclusionsLoading] = useState(false);
  // 403 = kullanicida admin:exclusions yetkisi yok; sessizce 'kural yok' gostermek yerine bayraklanir.
  const [generalExclusionsForbidden, setGeneralExclusionsForbidden] = useState(false);
  const [generalFormType, setGeneralFormType] = useState<GeneralExclusionType>('PRODUCT_CODE');
  const [generalFormValue, setGeneralFormValue] = useState('');
  const [generalFormDescription, setGeneralFormDescription] = useState('');
  const [savingGeneralExclusion, setSavingGeneralExclusion] = useState(false);
  const [deletingGeneralExclusionId, setDeletingGeneralExclusionId] = useState<string | null>(null);

  const isSingleDate = startDate === endDate;

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getMarginComplianceReport({
        startDate: startDate.replace(/-/g, ''),
        endDate: endDate.replace(/-/g, ''),
        includeCompleted: 1,
        page,
        limit: 100,
        sortBy: 'OrtalamaKarYuzde',
        sortOrder: sortOrder,
        status: statusFilter || undefined,
      });

      if (result.success) {
        setData(result.data.data);
        setSummary(result.data.summary);
        setMetadata(result.data.metadata);
        setTotalPages(result.data.pagination.totalPages);
        setExcludedByUserRules(
          typeof result.data.excludedByUserRules === 'number' ? result.data.excludedByUserRules : 0
        );
      } else {
        throw new Error('Bir hata oluÅŸtu');
      }
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Rapor yÃ¼klenemedi';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, statusFilter, sortOrder]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [settings, sectorResult] = await Promise.all([
          adminApi.getSettings(),
          adminApi.getSectorCodes(),
        ]);
        if (Array.isArray(settings.marginReportEmailColumns)) {
          setEmailColumnIds(settings.marginReportEmailColumns);
        }
        setIncludedSectorCodes(
          Array.isArray(settings.marginReportIncludedSectorCodes)
            ? settings.marginReportIncludedSectorCodes
            : []
        );
        setAvailableSectorCodes(Array.isArray(sectorResult.sectorCodes) ? sectorResult.sectorCodes : []);
      } catch (err) {
        console.error('Margin report email settings not loaded:', err);
      }
    };

    fetchSettings();
  }, []);

  // Dislama kurallarini yukle (aktif + pasif; panel aktifleri gosterir).
  const fetchExclusions = async () => {
    try {
      const result = await adminApi.getMarginExclusions();
      setExclusions(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      console.error('Margin exclusions not loaded:', err);
    }
  };

  useEffect(() => {
    fetchExclusions();
  }, []);

  // Genel rapor dislamalarini yukle (ReportExclusion; aktif + pasif liste).
  const fetchGeneralExclusions = async () => {
    setGeneralExclusionsLoading(true);
    try {
      const result = await adminApi.getExclusions();
      setGeneralExclusions(Array.isArray(result.data) ? result.data : []);
      setGeneralExclusionsForbidden(false);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setGeneralExclusionsForbidden(true);
      } else {
        console.error('General report exclusions not loaded:', err);
      }
    } finally {
      setGeneralExclusionsLoading(false);
    }
  };

  useEffect(() => {
    fetchGeneralExclusions();
  }, []);

  // Marka / urun secim listesi: 300ms debounce ile exclusion-options endpointi.
  useEffect(() => {
    if (exclusionType === 'PRODUCT_NAME') {
      setExclusionOptions([]);
      return;
    }
    const optionType = exclusionType === 'BRAND' ? 'BRAND' : 'PRODUCT';
    let cancelled = false;
    const timer = setTimeout(async () => {
      setExclusionOptionsLoading(true);
      try {
        const result = await adminApi.getMarginExclusionOptions({
          type: optionType,
          search: exclusionSearch.trim() || undefined,
        });
        if (!cancelled) {
          setExclusionOptions(Array.isArray(result.data) ? result.data : []);
        }
      } catch (err) {
        if (!cancelled) setExclusionOptions([]);
        console.error('Margin exclusion options not loaded:', err);
      } finally {
        if (!cancelled) setExclusionOptionsLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [exclusionType, exclusionSearch]);

  useEffect(() => {
    // Init effect'i localStorage'daki kayitli secimi okuyup migrate etmeden yazma;
    // aksi halde mount'taki DEFAULT_COLUMN_IDS kullanicinin kayitli secimini ezer.
    if (!hasInitializedColumns.current) return;
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };
  const toggleColumn = (columnId: ColumnId) => {
    setVisibleColumns((prev) => {
      if (prev.includes(columnId)) {
        return prev.length === 1 ? prev : prev.filter((id) => id !== columnId);
      }
      return [...prev, columnId];
    });
  };

  const toggleIncludedSectorCode = (sectorCode: string) => {
    setIncludedSectorCodes((prev) => (
      prev.includes(sectorCode)
        ? prev.filter((code) => code !== sectorCode)
        : [...prev, sectorCode].sort((a, b) => a.localeCompare(b, 'tr'))
    ));
  };


  const getSelectedReportDate = () => {
    if (!isSingleDate) {
      toast.error('Tek bir gun secin');
      return null;
    }
    return startDate.replace(/-/g, '');
  };

  const handleResyncReport = async () => {
    const reportDate = getSelectedReportDate();
    if (!reportDate) return;
    setSyncingReport(true);
    try {
      const result = await adminApi.syncMarginComplianceReport({ reportDate });
      if (result.success) {
        toast.success('Rapor yeniden cekildi');
        fetchData();
      } else {
        throw new Error(result.error || 'Rapor yenilenemedi');
      }
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Rapor yenilenemedi';
      toast.error(message);
    } finally {
      setSyncingReport(false);
    }
  };

  const handleSendReportEmail = async () => {
    const reportDate = getSelectedReportDate();
    if (!reportDate) return;
    setSendingReportEmail(true);
    try {
      const result = await adminApi.sendMarginComplianceReportEmail({ reportDate });
      if (result.success) {
        toast.success('Mail gonderildi');
      } else {
        throw new Error(result.error || 'Mail gonderilemedi');
      }
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Mail gonderilemedi';
      toast.error(message);
    } finally {
      setSendingReportEmail(false);
    }
  };

  const handleSaveEmailColumns = async () => {
    const selected = visibleColumns.filter((id) => columnDefs.some((column) => column.id === id));
    if (selected.length === 0) {
      toast.error('Mail icin en az bir kolon secin');
      return;
    }
    setSavingEmailColumns(true);
    try {
      await adminApi.updateSettings({ marginReportEmailColumns: selected });
      setEmailColumnIds(selected);
      toast.success('Mail excel kolonlari kaydedildi');
    } catch (err) {
      console.error('Margin report email columns update error:', err);
      toast.error('Mail kolonlari kaydedilemedi');
    } finally {
      setSavingEmailColumns(false);
    }
  };

  const handleSaveIncludedSectorCodes = async () => {
    setSavingSectorCodes(true);
    try {
      await adminApi.updateSettings({
        marginReportIncludedSectorCodes: includedSectorCodes,
      });
      toast.success(
        includedSectorCodes.length > 0
          ? 'Sektor kodlari kaydedildi'
          : 'Varsayilan sektor kodlarina donuldu'
      );
      setPage(1);
      fetchData();
    } catch (err) {
      console.error('Margin report sector code settings update error:', err);
      toast.error('Sektor kodlari kaydedilemedi');
    } finally {
      setSavingSectorCodes(false);
    }
  };

  // ==================== Dislama kurali ekle / sil ====================

  const createExclusion = async (payload: { type: MarginExclusionType; value: string; label?: string }) => {
    setSavingExclusion(true);
    try {
      await adminApi.createMarginExclusion(payload);
      toast.success('Dışlama kuralı eklendi');
      setExclusionSearch('');
      setExclusionNameInput('');
      await fetchExclusions();
      // Dislama degisince raporu otomatik yeniden cek; satir sayisi dusecegi icin
      // sayfa 1'e don (kullanici bos bir sayfada kalmasin).
      setPage(1);
      fetchData();
    } catch (err: any) {
      if (err.response?.status === 409) {
        toast.error('Bu dışlama zaten var');
      } else {
        const message = err.response?.data?.error || err.message || 'Dışlama eklenemedi';
        toast.error(message);
      }
    } finally {
      setSavingExclusion(false);
    }
  };

  // BRAND/PRODUCT_CODE: dropdown'dan secilen secenegi kural olarak ekler.
  const handleAddExclusionOption = (option: MarginExclusionOption) => {
    if (savingExclusion) return;
    createExclusion({
      type: exclusionType === 'BRAND' ? 'BRAND' : 'PRODUCT_CODE',
      value: option.value,
      label: option.label && option.label !== option.value ? option.label : undefined,
    });
  };

  // PRODUCT_NAME: serbest metin (urun adinda gecen ifadeyle kismi eslesme).
  const handleAddNameExclusion = () => {
    const value = exclusionNameInput.trim();
    if (!value) {
      toast.error('Ürün adında geçen bir ifade girin');
      return;
    }
    createExclusion({ type: 'PRODUCT_NAME', value });
  };

  const handleDeleteExclusion = async (exclusion: MarginExclusionRecord) => {
    const display = exclusion.label && exclusion.label !== exclusion.value
      ? `${exclusion.value} (${exclusion.label})`
      : exclusion.value;
    if (!window.confirm(`"${display}" dışlaması silinsin mi? Satırlar raporda tekrar görünür.`)) return;
    setDeletingExclusionId(exclusion.id);
    try {
      await adminApi.deleteMarginExclusion(exclusion.id);
      toast.success('Dışlama kuralı silindi');
      await fetchExclusions();
      fetchData();
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Dışlama silinemedi';
      toast.error(message);
    } finally {
      setDeletingExclusionId(null);
    }
  };

  const activeExclusions = exclusions.filter((exclusion) => exclusion.active);

  // ==================== Genel dislama kurali ekle / sil ====================

  // Ortak genel-dislama ekleme cekirdegi: hem serbest form (handleAddGeneralExclusion)
  // hem de combobox seciminden (createGeneralExclusion) cagirilir.
  const createGeneralExclusion = async (
    type: GeneralExclusionType,
    rawValue: string,
    description?: string
  ) => {
    const value = type === 'PRODUCT_CODE' ? rawValue.trim().toUpperCase() : rawValue.trim();
    if (!value) {
      toast.error('Değer boş olamaz');
      return;
    }
    setSavingGeneralExclusion(true);
    try {
      await adminApi.createExclusion({
        type,
        value,
        description: description?.trim() || undefined,
      });
      toast.success('Genel dışlama kuralı eklendi');
      setGeneralFormValue('');
      setGeneralFormDescription('');
      fetchGeneralExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Kural eklenemedi');
    } finally {
      setSavingGeneralExclusion(false);
    }
  };

  const handleAddGeneralExclusion = async () => {
    await createGeneralExclusion(generalFormType, generalFormValue, generalFormDescription);
  };

  const handleDeleteGeneralExclusion = async (exclusion: GeneralExclusionRecord) => {
    if (
      !window.confirm(
        `"${exclusion.value}" genel dışlaması silinsin mi? İlgili raporlarda satırlar tekrar görünür.`
      )
    ) {
      return;
    }
    setDeletingGeneralExclusionId(exclusion.id);
    try {
      await adminApi.deleteExclusion(exclusion.id);
      toast.success('Genel dışlama kuralı silindi');
      fetchGeneralExclusions();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Kural silinemedi');
    } finally {
      setDeletingGeneralExclusionId(null);
    }
  };

  const activeGeneralExclusions = generalExclusions.filter((exclusion) => exclusion.active);

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'â‚º0.00';
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '0%';
    return `${value.toFixed(2)}%`;
  };

  const formatCount = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '0';
    return new Intl.NumberFormat('tr-TR').format(value);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('tr-TR');
    } catch {
      return dateStr;
    }
  };

  const formatCellValue = (value: unknown) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') return value.toLocaleString('tr-TR');
    if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
    return String(value);
  };

  const formatExportValue = (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return value as string | number;
  };

  const renderSummaryBucket = (title: string, bucket: SummaryBucket) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>KDV haric degerler</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Toplam Evrak</span>
            <span className="font-semibold">{formatCount(bucket.totalDocuments)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Toplam Satir</span>
            <span className="font-semibold">{formatCount(bucket.totalRecords)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Ciro (KDV Haric)</span>
            <span className="font-semibold">{formatCurrency(bucket.totalRevenue)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kar (Guncel, KDV Haric)</span>
            <span className="font-semibold">{formatCurrency(bucket.totalProfit)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kar (Son Giris)</span>
            <span className="font-semibold">{formatCurrency(bucket.entryProfit)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kar % (Kar/Ciro)</span>
            <span className="font-semibold">{formatPercent(bucket.avgMargin)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Zararli Evrak</span>
            <span className="font-semibold">{formatCount(bucket.negativeDocuments)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Zararli Satir</span>
            <span className="font-semibold">{formatCount(bucket.negativeLines)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const getMarginBadge = (margin: number) => {
    if (margin < 0) {
      return <Badge variant="destructive">Zarar: {formatPercent(margin)}</Badge>;
    } else if (margin < 10) {
      return <Badge variant="destructive">DÃ¼ÅŸÃ¼k: {formatPercent(margin)}</Badge>;
    } else if (margin <= 30) {
      return <Badge variant="default">Normal: {formatPercent(margin)}</Badge>;
    } else {
      return <Badge variant="success">YÃ¼ksek: {formatPercent(margin)}</Badge>;
    }
  };

  const baseColumnDefs: ColumnConfig[] = [
    {
      id: 'documentNo',
      label: 'Evrak No',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'font-mono text-sm whitespace-nowrap',
      render: (row: MarginAnalysisRow) => row['Evrak No'],
      exportValue: (row: MarginAnalysisRow) => row['Evrak No'],
    },
    {
      id: 'documentType',
      label: 'Tip',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'whitespace-nowrap',
      render: (row: MarginAnalysisRow) => <Badge variant="outline">{row.Tip}</Badge>,
      exportValue: (row: MarginAnalysisRow) => row.Tip,
    },
    {
      id: 'documentDate',
      label: 'Evrak Tarihi',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatDate(row['Evrak Tarihi']),
      exportValue: (row: MarginAnalysisRow) => row['Evrak Tarihi'],
    },
    {
      id: 'customerName',
      label: 'Cari',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'max-w-[200px] truncate',
      render: (row: MarginAnalysisRow) => row['Cari Ä°smi'],
      exportValue: (row: MarginAnalysisRow) => row['Cari Ä°smi'],
    },
    {
      id: 'stockCode',
      label: 'Stok Kodu',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'font-mono text-sm whitespace-nowrap',
      render: (row: MarginAnalysisRow) => row['Stok Kodu'],
      exportValue: (row: MarginAnalysisRow) => row['Stok Kodu'],
    },
    {
      id: 'stockName',
      label: 'ÃœrÃ¼n AdÄ±',
      headerClassName: 'whitespace-nowrap',
      cellClassName: 'max-w-[250px] truncate',
      render: (row: MarginAnalysisRow) => row['Stok Ä°smi'],
      exportValue: (row: MarginAnalysisRow) => row['Stok Ä°smi'],
    },
    {
      id: 'quantity',
      label: 'Miktar',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => `${row.Miktar} ${row.Birimi}`,
      exportValue: (row: MarginAnalysisRow) => `${row.Miktar} ${row.Birimi}`,
    },
    {
      id: 'unitPrice',
      label: 'Birim SatÄ±ÅŸ',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(row['BirimSatÄ±ÅŸKDV']),
      exportValue: (row: MarginAnalysisRow) => row['BirimSatÄ±ÅŸKDV'],
    },
    {
      id: 'totalAmount',
      label: 'Tutar (KDV)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right font-semibold whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(row.TutarKDV),
      exportValue: (row: MarginAnalysisRow) => row.TutarKDV,
    },
    {
      id: 'avgCost',
      label: 'Maliyet (Güncel)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(getCurrentCostBasis(row)),
      exportValue: (row: MarginAnalysisRow) => getCurrentCostBasis(row),
    },
    {
      id: 'unitProfit',
      label: 'Birim Kar (Güncel)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(getCurrentUnitProfit(row)),
      exportValue: (row: MarginAnalysisRow) => getCurrentUnitProfit(row),
    },
    {
      id: 'totalProfit',
      label: 'Toplam Kar (Güncel)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right font-semibold whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(getCurrentTotalProfit(row)),
      exportValue: (row: MarginAnalysisRow) => getCurrentTotalProfit(row),
    },
    {
      id: 'margin',
      label: 'Kar % (Güncel)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => getMarginBadge(getCurrentMarginPercent(row)),
      exportValue: (row: MarginAnalysisRow) => getCurrentMarginPercent(row),
    },
    {
      id: 'entryUnitCost',
      label: 'Birim Maliyet (Son Giriş)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(getEntryUnitCostBasis(row)),
      exportValue: (row: MarginAnalysisRow) => getEntryUnitCostBasis(row),
    },
    {
      id: 'entryProfit',
      label: 'Toplam Kar (Son Giriş)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right font-semibold whitespace-nowrap',
      render: (row: MarginAnalysisRow) => formatCurrency(getEntryTotalProfit(row)),
      exportValue: (row: MarginAnalysisRow) => getEntryTotalProfit(row),
    },
    {
      id: 'entryMargin',
      label: 'Kar % (Son Giriş)',
      headerClassName: 'text-right whitespace-nowrap',
      cellClassName: 'text-right whitespace-nowrap',
      render: (row: MarginAnalysisRow) => getMarginBadge(getEntryMarginPercent(row)),
      exportValue: (row: MarginAnalysisRow) => getEntryMarginPercent(row),
    },
  ];

  const extraColumnDefs: ColumnConfig[] = [];
  if (data.length > 0) {
    const rowKeys = Object.keys(data[0]);
    const remainingKeys = rowKeys.filter((key) => !BASE_DATA_KEYS.has(key));
    remainingKeys.sort((a, b) => a.localeCompare(b, 'tr'));
    extraColumnDefs.push(
      ...remainingKeys.map((key) => {
        const normalizedKey = normalizeDataKey(key);
        if (normalizedKey === 'teklifadetkar') {
          return {
            id: key,
            label: `${key} (Hesaplanan)`,
            headerClassName: 'text-right whitespace-nowrap',
            cellClassName: 'text-right whitespace-nowrap',
            render: (row: MarginAnalysisRow) => formatCurrency(getCurrentUnitProfit(row)),
            exportValue: (row: MarginAnalysisRow) => getCurrentUnitProfit(row),
          };
        }
        if (normalizedKey === 'tekliftoplamkar') {
          return {
            id: key,
            label: `${key} (Hesaplanan)`,
            headerClassName: 'text-right whitespace-nowrap',
            cellClassName: 'text-right whitespace-nowrap',
            render: (row: MarginAnalysisRow) => formatCurrency(getCurrentTotalProfit(row)),
            exportValue: (row: MarginAnalysisRow) => getCurrentTotalProfit(row),
          };
        }
        if (normalizedKey === 'teklifkaryuzde') {
          return {
            id: key,
            label: `${key} (Hesaplanan)`,
            headerClassName: 'text-right whitespace-nowrap',
            cellClassName: 'text-right whitespace-nowrap',
            render: (row: MarginAnalysisRow) => getMarginBadge(getCurrentMarginPercent(row)),
            exportValue: (row: MarginAnalysisRow) => getCurrentMarginPercent(row),
          };
        }
        return {
          id: key,
          label: key,
          headerClassName: 'whitespace-nowrap',
          cellClassName: 'whitespace-nowrap',
          render: (row: MarginAnalysisRow) => formatCellValue(row[key]),
          exportValue: (row: MarginAnalysisRow) => formatExportValue(row[key]),
        };
      })
    );
  }

  const columnDefs = [...baseColumnDefs, ...extraColumnDefs];
  const columnIdSignature = columnDefs.map((column) => column.id).join('|');

  useEffect(() => {
    if (hasInitializedColumns.current) return;
    if (data.length === 0) return;
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id) => columnDefs.some((column) => column.id === id));
          if (valid.length > 0) {
            // Tek seferlik migration: eski kayitli secimlere Son Giris kolonlarini
            // varsayilan gorunur olarak ekle. Kullanici sonradan gizlerse secimi korunur.
            const entryMigrated = localStorage.getItem(COLUMN_ENTRY_MIGRATION_KEY);
            const selection = entryMigrated
              ? valid
              : [...valid, ...ENTRY_COLUMN_IDS.filter((id) => !valid.includes(id))];
            if (!entryMigrated) {
              localStorage.setItem(COLUMN_ENTRY_MIGRATION_KEY, '1');
            }
            const isDefaultSelection =
              selection.length === DEFAULT_COLUMN_IDS.length &&
              DEFAULT_COLUMN_IDS.every((id) => selection.includes(id));
            if (isDefaultSelection && columnDefs.length > DEFAULT_COLUMN_IDS.length) {
              setVisibleColumns(columnDefs.map((column) => column.id));
            } else {
              setVisibleColumns(selection);
            }
            hasInitializedColumns.current = true;
            return;
          }
        }
      } catch {
        // Ignore invalid storage content.
      }
    }
    localStorage.setItem(COLUMN_ENTRY_MIGRATION_KEY, '1');
    setVisibleColumns(columnDefs.map((column) => column.id));
    hasInitializedColumns.current = true;
  }, [columnIdSignature, data.length]);


  const visibleColumnDefs = columnDefs.filter((column) => visibleColumns.includes(column.id));

  const exportToExcel = async () => {
    if (filteredData.length === 0) {
      toast.error('DÄ±ÅŸa aktarÄ±lacak veri yok');
      return;
    }

    const exportRows = filteredData.map((row) => {
      const record: Record<string, string | number | null> = {};
      visibleColumnDefs.forEach((column) => {
        record[column.label] = column.exportValue(row);
      });
      return record;
    });

    // 13.3: xlsx sadece burada (export aninda) dinamik yuklenir.
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kar MarjÄ± Analizi');
    XLSX.writeFile(workbook, `kar-marji-analizi-${startDate}-${endDate}.xlsx`);
    toast.success('Excel dosyasÄ± indirildi');
  };

  // Search filtering
  const filteredData = Array.isArray(data) ? data.filter((row) => {
    const tokens = buildSearchTokens(searchQuery);
    if (tokens.length === 0) return true;
    const haystack = normalizeSearchText([
      row['Stok Kodu'],
      row['Stok Ä°smi'],
      row['Evrak No'],
      row['Cari Ä°smi'],
    ].filter(Boolean).join(' '));
    return matchesSearchTokens(haystack, tokens);
  }) : [];

  return {
    // raw state
    data,
    summary,
    metadata,
    loading,
    error,
    // filters
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortOrder,
    setSortOrder,
    page,
    setPage,
    totalPages,
    // column state
    visibleColumns,
    setVisibleColumns,
    emailColumnIds,
    savingEmailColumns,
    // sector state
    includedSectorCodes,
    setIncludedSectorCodes,
    availableSectorCodes,
    savingSectorCodes,
    // exclusion state (rapor dislamalari)
    exclusions,
    activeExclusions,
    excludedByUserRules,
    exclusionType,
    setExclusionType,
    exclusionSearch,
    setExclusionSearch,
    exclusionOptions,
    exclusionOptionsLoading,
    exclusionNameInput,
    setExclusionNameInput,
    savingExclusion,
    deletingExclusionId,
    // dislama paneli (buton + sekmeler)
    exclusionsPanelOpen,
    setExclusionsPanelOpen,
    exclusionsTab,
    setExclusionsTab,
    // genel rapor dislamalari (ReportExclusion)
    generalExclusions,
    activeGeneralExclusions,
    generalExclusionsLoading,
    generalExclusionsForbidden,
    generalFormType,
    setGeneralFormType,
    generalFormValue,
    setGeneralFormValue,
    generalFormDescription,
    setGeneralFormDescription,
    savingGeneralExclusion,
    deletingGeneralExclusionId,
    // report sync state
    syncingReport,
    sendingReportEmail,
    // derived
    isSingleDate,
    columnDefs,
    visibleColumnDefs,
    filteredData,
    // handlers
    fetchData,
    handleSearch,
    toggleColumn,
    toggleIncludedSectorCode,
    fetchExclusions,
    createExclusion,
    handleAddExclusionOption,
    handleAddNameExclusion,
    handleDeleteExclusion,
    fetchGeneralExclusions,
    createGeneralExclusion,
    handleAddGeneralExclusion,
    handleDeleteGeneralExclusion,
    handleResyncReport,
    handleSendReportEmail,
    handleSaveEmailColumns,
    handleSaveIncludedSectorCodes,
    exportToExcel,
    // formatters / renderers
    formatCurrency,
    formatPercent,
    formatCount,
    formatDate,
    formatCellValue,
    formatExportValue,
    renderSummaryBucket,
    getMarginBadge,
  };
}

export default useKarMarjiUyum;
