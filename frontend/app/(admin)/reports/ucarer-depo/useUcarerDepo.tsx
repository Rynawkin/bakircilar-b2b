'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, WandSparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { adminApi } from '@/lib/api/admin';
import { apiClient } from '@/lib/api/client';
import toast from 'react-hot-toast';

/**
 * Ucarer Depo ve MinMax ekraninin TUM mantigi (state/effect/handler/turetilmis deger
 * + render yardimci fonksiyonlari). Klasik ve yeni gorunum bu hook'u kullanir; gorsel
 * disindaki hicbir mantik degismez. Asagidaki kod eski page.tsx'in `return (` oncesindeki
 * mantigin BIRE BIR tasinmis halidir (render yardimcilari dahil, cunku klasik JSX onlari kullaniyor).
 *
 * KRITIK: Stok aileleri + fiyat aileleri ayri; net = depo + verilen siparis - alinan siparis;
 * aile minimumu karsilaniyorsa oneri 0; TOPLU sorumluluk merkezi min-max'a dahil DEGIL;
 * Mikro maliyet/ana saglayici/MinMax-dislama yazma + tedarikci/depolar-arasi siparis olusturma
 * handler'lari AYNEN korunur.
 */

export type DepotType = 'MERKEZ' | 'TOPCA';
export type SuggestionMode = 'INCLUDE_MINMAX' | 'EXCLUDE_MINMAX';
export type AllocationMode = 'SINGLE' | 'TWO_SPLIT' | 'MANUAL';
export type SortDirection = 'none' | 'desc' | 'asc';
export type SuggestionSortKey =
  | 'color'
  | 'code'
  | 'name'
  | 'supplierCode'
  | 'supplierName'
  | 'depotQty'
  | 'incomingOrders'
  | 'outgoingOrders'
  | 'realQty'
  | 'minQty'
  | 'maxQty'
  | 'topcaDepotQty'
  | 'packQty'
  | 'costExVat'
  | 'costIncVat'
  | 'stockDays'
  | 'suggested'
  | 'allocation'
  | 'diff';
export type OpsExtraColumnKey =
  | 'depotQty'
  | 'incomingOrders'
  | 'outgoingOrders'
  | 'realQty'
  | 'minQty'
  | 'maxQty'
  | 'topcaDepotQty'
  | 'currentCost'
  | 'packQty'
  | 'costExVat'
  | 'costIncVat'
  | 'stockDays'
  | 'familyCandidate';

// 'Musteri bekliyor' triyaji: A = alinan/bekleyen musteri siparisi var,
// B = acik siparis yok ama stok gunu kritik esigin altinda (yakinda bekletmeye baslar),
// C = min-max tamamlama (ertelenebilir).
export type SuggestionTriageClass = 'A' | 'B' | 'C';
export type SuggestionTriageFilter = 'ALL' | SuggestionTriageClass;
export const TRIAGE_SOON_DAYS = 14;
export const TRIAGE_LABELS: Record<SuggestionTriageClass, string> = {
  A: 'Musteri bekliyor',
  B: 'Yakinda bekleyecek',
  C: 'Min-max tamamlama',
};

export interface ProductFamily {
  id: string;
  name: string;
  code?: string | null;
  note?: string | null;
  active: boolean;
  items: Array<{
    id: string;
    productCode: string;
    productName?: string | null;
    supplierName?: string | null;
    priority: number;
    active: boolean;
  }>;
}

export interface IncomingOrderDetailRow {
  customerCode: string;
  customerName: string;
  orderSeries: string;
  orderSequence: number;
  orderLineNo: number;
  orderDate: string | null;
  quantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  unitPrice: number;
}

export interface ProductSalesHistoryRow {
  lineGuid?: string;
  customerCode: string;
  customerName: string;
  documentSeries: string;
  documentSequence: number;
  documentLineNo: number;
  stockResponsibilityCenter?: string;
  customerResponsibilityCenter?: string;
  saleDate: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

export interface FamilyStockOption {
  productCode: string;
  productName: string;
}

export interface SupplierOrderConfig {
  series: string;
  applyVAT: boolean;
  deliveryType: string;
  deliveryDate: string;
}

export interface SupplierOrderAllocation {
  familyId?: string | null;
  productCode: string;
  quantity: number;
  unitPriceOverride?: number | null;
  supplierCodeOverride?: string | null;
  persistSupplierOverride?: boolean;
}

export interface FamilyRedirectSuggestion {
  type: 'ORDER' | 'DEPOT';
  text: string;
  sourceCode: string;
  sourceName: string;
  targetCode: string;
  targetName: string;
}

export interface CreatedSupplierOrderSummary {
  supplierCode: string;
  supplierName: string | null;
  orderNumber: string;
  itemCount: number;
  totalQuantity: number;
  warning?: string | null;
}

export interface FailedSupplierOrderSummary {
  supplierCode: string;
  supplierName: string | null;
  error: string;
}

export interface CreatedSupplierOrderLine {
  supplierCode: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface CreatedSupplierOrderBatch {
  id: string;
  createdAt: string;
  depot: DepotType;
  orders: CreatedSupplierOrderSummary[];
  lines: CreatedSupplierOrderLine[];
}

export interface MissingPriceProduct {
  productCode: string;
  productName: string;
  quantity: number;
}

// Aile Kapsama Radari — aile-disi urun icin aday aile onerisi (POST /admin/stock-family/candidates)
export interface FamilyCandidate {
  familyId: string;
  familyName: string;
  score: number;
  matchedProductName?: string | null;
}

// Transfer Kapisi — tedarikci siparis onay modalinda DSV transfer setine alinan satir
export interface PendingTransferRow {
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// GET /admin/reports/ucarer-depot-minmax cevabindaki depo bazli min/max kaydi
export interface UcarerDepotMinMaxEntry {
  '1': { min: number; max: number };
  '6': { min: number; max: number };
}

export interface UcarerOperationLogRow {
  id: string;
  operationType: string;
  title: string;
  productCode?: string | null;
  productName?: string | null;
  familyId?: string | null;
  familyName?: string | null;
  depot?: string | null;
  supplierCode?: string | null;
  supplierName?: string | null;
  documentNo?: string | null;
  orderNumbers?: string[];
  previousValues?: any;
  newValues?: any;
  metadata?: any;
  userId?: string | null;
  userName?: string | null;
  createdAt: string;
}

export interface SuggestionSortState {
  key: SuggestionSortKey;
  direction: SortDirection;
}

export type SalesHistorySortKey =
  | 'customerCode'
  | 'customerName'
  | 'documentNo'
  | 'saleDate'
  | 'quantity'
  | 'unitPrice'
  | 'totalAmount';
export type SalesHistoryViewMode = 'minmax' | 'recentCustomers';

export interface SalesHistorySortState {
  key: SalesHistorySortKey;
  direction: SortDirection;
}

export type NonFamilyColorFilter = 'ALL' | 'GREEN' | 'YELLOW' | 'RED' | 'UNCOLORED';
export type NonFamilyColorSort = 'NONE' | 'RISK_DESC' | 'RISK_ASC';

const CREATED_SUPPLIER_ORDER_HISTORY_KEY = 'ucarer.created-supplier-orders.v1';
// IS 1 — Sipariş akışı taslağı (depo bazlı). Devam eden çalışma tarayıcı kapansa bile korunur.
const ORDER_DRAFT_KEY_PREFIX = 'ucarerOrderDraft:v1:';
const orderDraftKey = (depot: string) => `${ORDER_DRAFT_KEY_PREFIX}${String(depot || '').trim().toUpperCase()}`;

// Taslakta saklanan sipariş-akışı state şekli.
interface UcarerOrderDraft {
  savedAt: string;
  manualAllocations: Record<string, Record<string, number>>;
  nonFamilyAllocations: Record<string, number | ''>;
  pendingAllocations: SupplierOrderAllocation[];
  supplierOrderConfigs: Record<string, SupplierOrderConfig>;
  pendingTransfersByCode: Record<string, { quantity: number; unitPrice: number; restored: SupplierOrderAllocation[] }>;
  selectedTransferByCode: Record<string, boolean>;
}

// Taslak boş mu? (tümü boşsa localStorage'a yazma / banner gösterme)
const isOrderDraftEmpty = (draft: Omit<UcarerOrderDraft, 'savedAt'>): boolean => {
  const anyManual = Object.values(draft.manualAllocations || {}).some((byCode) =>
    Object.values(byCode || {}).some((qty) => Math.max(0, Math.trunc(Number(qty || 0))) > 0)
  );
  const anyNonFamily = Object.values(draft.nonFamilyAllocations || {}).some(
    (qty) => Math.max(0, Math.trunc(Number(qty === '' ? 0 : qty || 0))) > 0
  );
  const anyPending = (draft.pendingAllocations || []).some((row) => Math.max(0, Math.trunc(Number(row.quantity || 0))) > 0);
  const anyTransfer = Object.values(draft.pendingTransfersByCode || {}).some(
    (entry) => Math.max(0, Math.trunc(Number(entry?.quantity || 0))) > 0
  );
  return !anyManual && !anyNonFamily && !anyPending && !anyTransfer;
};

export const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('tr-TR') : '-';
  if (value instanceof Date) return value.toLocaleDateString('tr-TR');
  const text = String(value).trim();
  return text ? text : '-';
};

const normalizeKey = (value: string): string =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();

const buildFamilyEditSearchVariants = (query: string): string[] => {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const normalized = normalizeKey(raw);
  const trI = raw.replace(/i/g, 'ı').replace(/I/g, 'İ');
  const latinI = raw.replace(/ı/g, 'i').replace(/İ/g, 'I');
  return Array.from(new Set([raw, normalized, trI, latinI].filter((item) => String(item || '').trim().length >= 2)));
};

const toNumberFlexible = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
};

const parseMaybeNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const getApiErrorMessage = (error: any, fallback: string): string => {
  const normalize = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      const message = typeof value.message === 'string' ? value.message.trim() : '';
      const code = typeof value.code === 'string' ? value.code.trim() : '';
      if (message && code) return `${message} (${code})`;
      if (message) return message;
      if (code) return code;
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return '';
  };

  return (
    normalize(error?.response?.data?.error) ||
    normalize(error?.response?.data?.message) ||
    normalize(error?.message) ||
    fallback
  );
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanPdfText = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/₺/g, 'TL');
const formatPdfMoney = (value: unknown) => {
  const num = Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return `${safe.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
};
const formatOperationDate = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('tr-TR');
};

// Oneri modu aciklamalari. NOT: MinMax Haric (3. Sorun) modunun davranisi bilinçli olarak
// AYNEN korunmustur ('hep boyle kullanildi'); bu metin sadece modun ne yaptigini aciklar.
export const SUGGESTION_MODE_HELP: Record<SuggestionMode, string> = {
  INCLUDE_MINMAX:
    'MinMax Dahil (4. Sorun): Oneri, min-max hedefine gore hesaplanir (Max - Reel). Gelecek DSV dusulur; aile minimumu karsilaniyorsa oneri 0 olur.',
  EXCLUDE_MINMAX:
    'MinMax Haric (3. Sorun): Oneri kaynagi 3.SORUN kolonudur (REEL MIKTAR = depo + verilen siparis - alinan siparis) ve gelecek DSV dusulur. Min-max tanimli ve karsilanan urunlerde oneri 0 olur. Bu modda pozitif deger klasik "eksigi tamamla" onerisi degil, satinalma sonrasi eldeki reel miktara dayali degerdir; davranis bilerek boyle kullanilagelmistir.',
};

export const OPERATION_TYPE_LABELS: Record<string, string> = {
  MINMAX_RUN: 'MinMax',
  MINMAX_V2_APPLY: 'MinMax v2 Yazma',
  MARK_TOPLU: 'TOPLU',
  MINMAX_EXCLUSION: 'MinMax Haric',
  PRODUCT_FAMILY_CREATE: 'Aile Olusturma',
  PRODUCT_FAMILY_UPDATE: 'Aile Duzenleme',
  PRODUCT_FAMILY_DELETE: 'Aile Silme',
  SUPPLIER_ORDER_CREATE: 'Tedarikci Siparisi',
  DEPOT_TRANSFER_CREATE: 'Depolar Arasi',
  COST_UPDATE: 'Maliyet',
  MAIN_SUPPLIER_UPDATE: 'Ana Saglayici',
};

// JSX render yardimcilari icin disari aktarilan formatlayicilar (Yeni gorunum de kullanir)
export {
  normalizeKey,
  toNumberFlexible,
  parseMaybeNumber,
  getApiErrorMessage,
  cleanPdfText,
  formatPdfMoney,
  formatOperationDate,
};

export function useUcarerDepo() {
  const [depot, setDepot] = useState<DepotType>('MERKEZ');
  const [depotLimit, setDepotLimit] = useState<string>('ALL');
  const [depotLoading, setDepotLoading] = useState(false);
  const [minMaxLoading, setMinMaxLoading] = useState(false);
  const [minMaxJobStatusText, setMinMaxJobStatusText] = useState('');
  const [depotRows, setDepotRows] = useState<Array<Record<string, any>>>([]);
  const [depotColumns, setDepotColumns] = useState<string[]>([]);
  const [depotTotal, setDepotTotal] = useState(0);
  const [depotLimited, setDepotLimited] = useState(false);
  const [minMaxRows, setMinMaxRows] = useState<Array<Record<string, any>>>([]);
  const [minMaxColumns, setMinMaxColumns] = useState<string[]>([]);
  const [minMaxTotal, setMinMaxTotal] = useState(0);
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [allocationModeByFamily, setAllocationModeByFamily] = useState<Record<string, AllocationMode>>({});
  const [singleCodeByFamily, setSingleCodeByFamily] = useState<Record<string, string>>({});
  const [splitAByFamily, setSplitAByFamily] = useState<Record<string, string>>({});
  const [splitBByFamily, setSplitBByFamily] = useState<Record<string, string>>({});
  const [splitRatioByFamily, setSplitRatioByFamily] = useState<Record<string, number>>({});
  const [manualAllocations, setManualAllocations] = useState<Record<string, Record<string, number>>>({});
  const [nonFamilyAllocations, setNonFamilyAllocations] = useState<Record<string, number | ''>>({});
  const [panelColumns, setPanelColumns] = useState<Record<OpsExtraColumnKey, boolean>>({
    depotQty: true,
    topcaDepotQty: true,
    incomingOrders: true,
    outgoingOrders: true,
    realQty: false,
    minQty: false,
    maxQty: false,
    currentCost: true,
    packQty: true,
    costExVat: true,
    costIncVat: true,
    stockDays: true,
    familyCandidate: true,
  });
  const [packQtyByCode, setPackQtyByCode] = useState<Record<string, number>>({});
  // IS 3 (yon duzeltmesi) — HAM ISARETLI 2. birim katsayisi.
  // NEGATIF katsayi = 2. birim BUYUK paket (ana birim kucuk) -> koliye yuvarla gecerli (getPackRounding abs).
  // POZITIF katsayi = ANA birim zaten buyuk (ana birim KOLI, 2. birim PAKET) -> girilen miktar YUVARLANMAZ,
  //   sadece bilgilendirici 'Ana birim koli — ici X {2.birim}' rozeti + koli-ici duzenleme ikonu gosterilir.
  const [packFactorRawByCode, setPackFactorRawByCode] = useState<Record<string, number>>({});
  // 2. birim adi (koli-ici bilgi rozetinde gosterilir)
  const [unit2NameByCode, setUnit2NameByCode] = useState<Record<string, string>>({});
  const [currentCostByCode, setCurrentCostByCode] = useState<Record<string, number>>({});
  const [costPInputByCode, setCostPInputByCode] = useState<Record<string, string>>({});
  const [costTInputByCode, setCostTInputByCode] = useState<Record<string, string>>({});
  const [manualCostPOverrideByCode, setManualCostPOverrideByCode] = useState<Record<string, boolean>>({});
  const [vatRateByCode, setVatRateByCode] = useState<Record<string, number>>({});
  const [updatePriceListsByCode, setUpdatePriceListsByCode] = useState<Record<string, boolean>>({});
  const [updatingCostByCode, setUpdatingCostByCode] = useState<Record<string, boolean>>({});
  const [updatingSupplierByCode, setUpdatingSupplierByCode] = useState<Record<string, boolean>>({});
  const [mainSupplierByCode, setMainSupplierByCode] = useState<Record<string, { code: string; name: string }>>({});
  const [supplierOverrideByCode, setSupplierOverrideByCode] = useState<Record<string, string>>({});
  const [persistSupplierOverrideByCode, setPersistSupplierOverrideByCode] = useState<Record<string, boolean>>({});
  const [cariOptions, setCariOptions] = useState<Array<{ code: string; name: string }>>([]);
  const [seriesModalOpen, setSeriesModalOpen] = useState(false);
  const [familySort, setFamilySort] = useState<SuggestionSortState>({ key: 'code', direction: 'none' });
  const [nonFamilySort, setNonFamilySort] = useState<SuggestionSortState>({ key: 'code', direction: 'none' });
  const [nonFamilyColorFilter, setNonFamilyColorFilter] = useState<NonFamilyColorFilter>('ALL');
  const [nonFamilyColorSort, setNonFamilyColorSort] = useState<NonFamilyColorSort>('NONE');
  const [nonFamilyTriageFilter, setNonFamilyTriageFilter] = useState<SuggestionTriageFilter>('ALL');
  const [familyListSearch, setFamilyListSearch] = useState('');
  const [familyDetailSearch, setFamilyDetailSearch] = useState('');
  const [nonFamilySearch, setNonFamilySearch] = useState('');
  const [showUnsuggestedFamilies, setShowUnsuggestedFamilies] = useState(false);
  const [expandedSupplierRows, setExpandedSupplierRows] = useState<Record<string, boolean>>({});
  const [supplierOrderConfigs, setSupplierOrderConfigs] = useState<Record<string, SupplierOrderConfig>>({});
  const [supplierRecentSeriesByCode, setSupplierRecentSeriesByCode] = useState<Record<string, Array<{ series: string; lastOrderNumber: string; lastOrderDate: string | null }>>>({});
  const [pendingAllocations, setPendingAllocations] = useState<SupplierOrderAllocation[]>([]);
  const [sendingRedirectKey, setSendingRedirectKey] = useState<string>('');
  const [activeFamilyId, setActiveFamilyId] = useState<string>('');
  const [orderPanelTab, setOrderPanelTab] = useState<'work' | 'history' | 'operationHistory'>('work');
  const [panelHighlight, setPanelHighlight] = useState(false);
  const [creatingOrders, setCreatingOrders] = useState(false);
  const [creatingTransferOrder, setCreatingTransferOrder] = useState(false);
  const [selectedTransferByCode, setSelectedTransferByCode] = useState<Record<string, boolean>>({});
  const [exportingDepot, setExportingDepot] = useState(false);
  const [exportingMinMax, setExportingMinMax] = useState(false);
  const [minMaxExcludedRows, setMinMaxExcludedRows] = useState<Array<{ productCode: string }>>([]);
  const [resetMinMaxToZeroByCode, setResetMinMaxToZeroByCode] = useState<Record<string, boolean>>({});
  const [updatingMinMaxExclusionByCode, setUpdatingMinMaxExclusionByCode] = useState<Record<string, boolean>>({});
  const [missingPriceProducts, setMissingPriceProducts] = useState<MissingPriceProduct[]>([]);
  const [createdOrderHistory, setCreatedOrderHistory] = useState<CreatedSupplierOrderBatch[]>([]);
  const [operationLogs, setOperationLogs] = useState<UcarerOperationLogRow[]>([]);
  const [operationLogLoading, setOperationLogLoading] = useState(false);
  const [operationLogSearch, setOperationLogSearch] = useState('');
  const [operationLogType, setOperationLogType] = useState('');
  const [operationLogPage, setOperationLogPage] = useState(1);
  const [operationLogPagination, setOperationLogPagination] = useState({
    page: 1,
    limit: 25,
    totalPages: 1,
    totalRecords: 0,
  });
  const [lastCreatedOrders, setLastCreatedOrders] = useState<CreatedSupplierOrderSummary[]>([]);
  const [lastCreatedAllocations, setLastCreatedAllocations] = useState<SupplierOrderAllocation[]>([]);
  const [downloadingOrderPdfs, setDownloadingOrderPdfs] = useState(false);
  const [downloadingOrderSummaryPdf, setDownloadingOrderSummaryPdf] = useState(false);
  const [createdOrdersModalOpen, setCreatedOrdersModalOpen] = useState(false);
  const [incomingOrdersModalOpen, setIncomingOrdersModalOpen] = useState(false);
  const [incomingOrdersLoading, setIncomingOrdersLoading] = useState(false);
  const [incomingOrdersProductCode, setIncomingOrdersProductCode] = useState('');
  const [incomingOrdersDetailRows, setIncomingOrdersDetailRows] = useState<IncomingOrderDetailRow[]>([]);
  const [salesHistoryModalOpen, setSalesHistoryModalOpen] = useState(false);
  const [salesHistoryLoading, setSalesHistoryLoading] = useState(false);
  const [salesHistoryProductCode, setSalesHistoryProductCode] = useState('');
  const [salesHistoryViewMode, setSalesHistoryViewMode] = useState<SalesHistoryViewMode>('minmax');
  const [salesHistoryLookbackMonths, setSalesHistoryLookbackMonths] = useState(4);
  const [salesHistoryRows, setSalesHistoryRows] = useState<ProductSalesHistoryRow[]>([]);
  const [markingTopluLineKey, setMarkingTopluLineKey] = useState('');
  const [salesHistorySort, setSalesHistorySort] = useState<SalesHistorySortState>({
    key: 'saleDate',
    direction: 'desc',
  });
  const [salesHistorySummary, setSalesHistorySummary] = useState<{
    totalQuantity: number;
    totalAmount: number;
    averageUnitPrice: number;
  }>({
    totalQuantity: 0,
    totalAmount: 0,
    averageUnitPrice: 0,
  });
  const [editingFamilyId, setEditingFamilyId] = useState<string>('');
  const [familyEditModalOpen, setFamilyEditModalOpen] = useState(false);
  const [familyEditName, setFamilyEditName] = useState('');
  const [familyEditCode, setFamilyEditCode] = useState('');
  const [familyEditNote, setFamilyEditNote] = useState('');
  const [familyEditActive, setFamilyEditActive] = useState(true);
  const [familyEditProductCodes, setFamilyEditProductCodes] = useState<string[]>([]);
  const [familyEditProductNamesByCode, setFamilyEditProductNamesByCode] = useState<Record<string, string>>({});
  const [familyEditSearch, setFamilyEditSearch] = useState('');
  const [familyEditResults, setFamilyEditResults] = useState<FamilyStockOption[]>([]);
  const [familyEditSearching, setFamilyEditSearching] = useState(false);
  const [familyEditSaving, setFamilyEditSaving] = useState(false);
  const familyEditNameFetchAttemptedRef = useRef<Set<string>>(new Set());
  const [pendingSupplierInputByProduct, setPendingSupplierInputByProduct] = useState<Record<string, string>>({});
  // IS 2 — Transfer Kapisi: siparis onay modalinda depo bazli min/max + DSV'ye cevrilen satirlar (modal state)
  const [ucarerMinMaxByCode, setUcarerMinMaxByCode] = useState<Record<string, UcarerDepotMinMaxEntry>>({});
  const [ucarerMinMaxLoading, setUcarerMinMaxLoading] = useState(false);
  const [pendingTransfersByCode, setPendingTransfersByCode] = useState<
    Record<string, { quantity: number; unitPrice: number; restored: SupplierOrderAllocation[] }>
  >({});
  // IS 1 — "Siparisleri Olustur"da hala cevrilmemis UYGUN DSV onerisi olan satirlar icin modal-ici uyari.
  // null = uyari yok; [] gostergesi acik degil; dolu dizi = uyari acik.
  const [dsvWarningLines, setDsvWarningLines] = useState<
    Array<{ productCode: string; productName: string; transferQty: number; counterDepotLabel: string }> | null
  >(null);
  // IS 1 — Taslak: sayfa yuklendiginde tespit edilen kayitli taslak (banner icin). null = taslak yok.
  const [orderDraftInfo, setOrderDraftInfo] = useState<{ savedAt: string } | null>(null);
  // Taslak yukleme/geri yukleme sirasinda otomatik kaydetmeyi askiya al (yeniden yazma dongusu olmasin).
  const orderDraftHydratedRef = useRef(false);
  // In-memory sipariş state'inin AIT OLDUGU depo. Depo degisince tespit effect'i guncelleyene kadar
  // auto-save eski state'i yeni depo anahtarina yazmaz (yaris kosulunu onler).
  const orderDraftDepotRef = useRef<DepotType | null>(null);
  const orderDraftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // IS 3 — Koliye tamamla: acik yuvarlama popover'i + koli ici tanimlama modal state'i
  const [packPopover, setPackPopover] = useState<{
    scope: 'FAMILY' | 'NONFAMILY' | 'PENDING';
    code: string;
    familyId?: string;
  } | null>(null);
  const [packDefineState, setPackDefineState] = useState<{
    code: string;
    name: string;
    factor: string;
    weightKg: string;
    widthMm: string;
    lengthMm: string;
    heightMm: string;
    loading: boolean;
    saving: boolean;
  } | null>(null);
  // IS 4 — Aday Aile: kod -> aday (null = soruldu, aday yok; kayit yok = henuz sorulmadi)
  const [familyCandidatesByCode, setFamilyCandidatesByCode] = useState<Record<string, FamilyCandidate | null>>({});
  const [familyCandidateLoading, setFamilyCandidateLoading] = useState(false);
  const [addingToFamilyByCode, setAddingToFamilyByCode] = useState<Record<string, boolean>>({});
  const [addedToFamilyByCode, setAddedToFamilyByCode] = useState<Record<string, string>>({});
  const familyCandidateQueriedRef = useRef<Set<string>>(new Set());
  const [defaultColumnWidth] = useState(180);
  const [headerHeight, setHeaderHeight] = useState(44);
  const [suggestionMode, setSuggestionMode] = useState<SuggestionMode>('INCLUDE_MINMAX');
  const [depotColumnWidths, setDepotColumnWidths] = useState<Record<string, number>>({});
  const [minMaxColumnWidths, setMinMaxColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{
    type: 'depot' | 'minmax';
    column: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const visibleDepotColumns = useMemo(() => depotColumns, [depotColumns]);
  const visibleMinMaxColumns = useMemo(() => minMaxColumns, [minMaxColumns]);
  const thirdIssueColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => {
      const n = normalizeKey(column);
      return n.includes('3.sorun') || n.includes('satinalma siparisi sonrasi');
    });
  }, [visibleDepotColumns]);
  const fourthIssueColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => {
      const n = normalizeKey(column);
      return n.includes('4. sorun') || n.includes('4.sorun') || n.includes('eksiltilecek');
    });
  }, [visibleDepotColumns]);
  const stockCodeColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('stok kodu'));
  }, [visibleDepotColumns]);
  const productNameColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('stok adi'));
  }, [visibleDepotColumns]);
  const depotQtyColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('depo miktar'));
  }, [visibleDepotColumns]);
  const incomingOrderColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('alinan sipariste bekleyen'));
  }, [visibleDepotColumns]);
  const outgoingOrderColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('verilen sipariste bekleyen'));
  }, [visibleDepotColumns]);
  const incomingDsvColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => {
      const n = normalizeKey(column);
      return n.includes('diger depolardan gelecek dsv') || n.includes('gelecek dsv toplam');
    });
  }, [visibleDepotColumns]);
  const realQtyColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => {
      const n = normalizeKey(column);
      return n.includes('reel miktar') || n.includes('satinalma siparisi sonrasi');
    });
  }, [visibleDepotColumns]);
  const minQtyColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('minimum miktar'));
  }, [visibleDepotColumns]);
  const merkezDepoStockColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column) === 'merkez depo');
  }, [visibleDepotColumns]);
  const topcaDepoStockColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column) === 'topca depo');
  }, [visibleDepotColumns]);
  const maxQtyColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('maximum miktar'));
  }, [visibleDepotColumns]);
  const stockDaysColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('kalan stok gunu'));
  }, [visibleDepotColumns]);
  const dailySalesColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('gunluk ortalama satis'));
  }, [visibleDepotColumns]);
  const rowByProductCode = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    if (!stockCodeColumn) return map;
    depotRows.forEach((row) => {
      const code = String(row?.[stockCodeColumn] || '').trim().toUpperCase();
      if (code) map.set(code, row);
    });
    return map;
  }, [depotRows, stockCodeColumn]);
  const minMaxExcludedCodeSet = useMemo(
    () => new Set(minMaxExcludedRows.map((row) => String(row.productCode || '').trim().toUpperCase()).filter(Boolean)),
    [minMaxExcludedRows]
  );
  const getDepotRowProductCode = (row: Record<string, any> | undefined): string => {
    if (!row) return '';
    if (stockCodeColumn) {
      return String(row?.[stockCodeColumn] || '').trim().toUpperCase();
    }
    const fallbackColumn = Object.keys(row).find((column) => normalizeKey(column).includes('stok kodu'));
    return fallbackColumn ? String(row?.[fallbackColumn] || '').trim().toUpperCase() : '';
  };
  const isRowOperationallyEmpty = (row?: Record<string, any>) => {
    if (!row) return true;
    let hasNumeric = false;
    for (const [key, value] of Object.entries(row)) {
      // Bilgi amacli satis/stok-gunu kolonlari operasyonel bosluk kontrolune dahil edilmez.
      const keyNorm = normalizeKey(key);
      if (keyNorm.includes('gunluk ortalama satis') || keyNorm.includes('kalan stok gunu')) continue;
      const parsed = parseMaybeNumber(value);
      if (parsed === null) continue;
      hasNumeric = true;
      if (Math.abs(parsed) > 0.00001) return false;
    }
    return hasNumeric;
  };
  const getVisibleFamilyItems = (family: ProductFamily) =>
    family.items.filter((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      return Boolean(row && !isRowOperationallyEmpty(row));
    });
  const familyCodeSet = useMemo(() => {
    const set = new Set<string>();
    families.forEach((family) => {
      family.items.forEach((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        if (code) set.add(code);
      });
    });
    return set;
  }, [families]);
  const familySuggestions = useMemo(() => {
    return families.map((family) => {
      const visibleItems = getVisibleFamilyItems(family);
      const familyCoverage = getFamilyCoverage(family);
      const familyCovered = isFamilyCoveredByMinimum(familyCoverage);
      // Aile onerisi TOPLAM tavani ile sinirlanir (kardes urun fazlasi dusulur).
      const cappedNeeds = computeFamilyCappedNeeds(family);
      const rawNeed = cappedNeeds.totalNeed;
      const itemSignals: Array<{
        code: string;
        raw: number;
        naturalRaw: number;
        shortage: number;
        excess: number;
        incomingOrders: number;
      }> = [];
      visibleItems.forEach((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        const row = rowByProductCode.get(code);
        if (!row) return;
        const naturalRaw = getRawSuggestedQty(row);
        const raw = cappedNeeds.perItem.get(code) || 0;
        const incomingOrders = incomingOrderColumn ? Math.max(0, toNumberFlexible(row?.[incomingOrderColumn])) : 0;
        itemSignals.push({
          code,
          raw,
          naturalRaw,
          shortage: getFamilyItemShortage(row),
          excess: getFamilyItemExcess(row),
          incomingOrders,
        });
      });
      const redirectSuggestions: FamilyRedirectSuggestion[] = [];
      const sources = itemSignals
        .filter((item) => item.naturalRaw > 0 || item.shortage > 0)
        .sort((a, b) => (b.incomingOrders - a.incomingOrders) || (b.naturalRaw - a.naturalRaw) || (b.shortage - a.shortage))
        .slice(0, 3);
      const targets = itemSignals
        .filter((item) => item.excess > 0)
        .sort((a, b) => b.excess - a.excess);
      sources.forEach((source) => {
        const target = targets.find((item) => item.code !== source.code);
        if (!target) return;
        const sourceName = String(rowByProductCode.get(source.code)?.[productNameColumn || ''] || '').trim() || source.code;
        const targetName = String(rowByProductCode.get(target.code)?.[productNameColumn || ''] || '').trim() || target.code;
        if (source.incomingOrders > 0) {
          redirectSuggestions.push({
            type: 'ORDER',
            text: `Siparis yonlendirme onerisi: ${source.code} - ${sourceName} ihtiyaci, aile ici minimum altina dusmeyen ${target.code} - ${targetName} urunune yonlendirilebilir.`,
            sourceCode: source.code,
            sourceName,
            targetCode: target.code,
            targetName,
          });
        } else if (!familyCovered) {
          redirectSuggestions.push({
            type: 'DEPOT',
            text: `Depo yonlendirme onerisi: ${source.code} - ${sourceName} ihtiyaci, aile ici minimum altina dusmeyen ${target.code} - ${targetName} urunune yonlendirilebilir.`,
            sourceCode: source.code,
            sourceName,
            targetCode: target.code,
            targetName,
          });
        }
      });
      redirectSuggestions.sort((a, b) => {
        const rank = (item: { type: 'ORDER' | 'DEPOT' }) => (item.type === 'ORDER' ? 0 : 1);
        return rank(a) - rank(b);
      });
      return {
        id: family.id,
        name: family.name,
        code: family.code,
        itemCount: visibleItems.length,
        suggestedRaw: Math.trunc(rawNeed),
        suggested: Math.max(0, Math.trunc(rawNeed)),
        coveredByFamilyMinimum: familyCovered,
        familyMinimum: familyCoverage.minimum,
        familyEffectiveQuantity: familyCoverage.effective,
        redirectSuggestions,
      };
    });
  }, [families, rowByProductCode, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, depotQtyColumn, minQtyColumn, maxQtyColumn, incomingOrderColumn, outgoingOrderColumn, productNameColumn]);
  const getDepotColumnWidth = (column: string) => depotColumnWidths[column] || defaultColumnWidth;
  const getMinMaxColumnWidth = (column: string) => minMaxColumnWidths[column] || defaultColumnWidth;
  // Onerilen siparis: MIN'de TETIKLE, MAX'a DOLDUR (patron karari 2026-07-04).
  // efektif = REEL (stok + gelen alis - alinan musteri siparisi) + depoya GELECEK DSV.
  // Tetik: efektif kendi minimumunu karsiliyorsa oneri 0. Aksi halde MAX'a tamamla:
  // ihtiyac = max(0, MAX - efektif). Boylece bekleyen alis + gelecek DSV dogru dusulur.
  // (Onceki hata: INCLUDE_MINMAX modunda ham 4.SORUN kolonu kullaniliyordu; artik
  //  ayni deger acikca MAX kolonu + efektif'ten hesaplaniyor -> aile ve aile-disi ayni.)
  function getRawSuggestedQty(row: Record<string, any>): number {
    const incomingDsv = incomingDsvColumn ? Math.max(0, toNumberFlexible(row[incomingDsvColumn])) : 0;
    const minQty = getFamilyItemMinimum(row);
    const netQty = getFamilyItemNetQuantity(row);
    const effective = netQty + incomingDsv;
    // MIN tetikleyici: efektif kendi minimumunu karsiliyorsa siparis onerme.
    if (minQty > 0 && effective >= minQty) return 0;
    if (suggestionMode !== 'INCLUDE_MINMAX') {
      // EXCLUDE_MINMAX: min-max'siz ham ihtiyac (3.SORUN = REEL) — eski davranis korunur.
      if (!thirdIssueColumn) return 0;
      return toNumberFlexible(row[thirdIssueColumn]) - incomingDsv;
    }
    // INCLUDE_MINMAX: MAX'a doldur.
    const maxQty = getFamilyItemMaximum(row);
    if (maxQty <= 0) return 0;
    return Math.max(0, maxQty - effective);
  }
  function getSuggestedQty(row: Record<string, any>): number {
    return Math.max(0, getRawSuggestedQty(row));
  }
  // 'Kalan Stok Gunu' kolonu (backend son 120 gun satisindan hesaplar; satis yoksa null).
  function getDaysOfStock(row?: Record<string, any>): number | null {
    if (!row || !stockDaysColumn) return null;
    const parsed = parseMaybeNumber(row[stockDaysColumn]);
    return parsed === null ? null : Math.max(0, parsed);
  }
  function getDailyAverageSales(row?: Record<string, any>): number | null {
    if (!row || !dailySalesColumn) return null;
    const parsed = parseMaybeNumber(row[dailySalesColumn]);
    return parsed === null ? null : Math.max(0, parsed);
  }
  function getSuggestionTriage(row?: Record<string, any>): SuggestionTriageClass {
    if (!row) return 'C';
    const incoming = incomingOrderColumn ? toNumberFlexible(row[incomingOrderColumn]) : 0;
    if (incoming > 0) return 'A';
    const days = getDaysOfStock(row);
    if (days !== null && days < TRIAGE_SOON_DAYS) return 'B';
    return 'C';
  }
  function getTriageRank(triage: SuggestionTriageClass): number {
    return triage === 'A' ? 0 : triage === 'B' ? 1 : 2;
  }
  function isPriceListUpdateChecked(code: string): boolean {
    return updatePriceListsByCode[String(code || '').trim().toUpperCase()] !== false;
  }
  function getFamilyItemMinimum(row: Record<string, any>): number {
    return minQtyColumn ? Math.max(0, toNumberFlexible(row[minQtyColumn])) : 0;
  }
  function getFamilyItemMaximum(row: Record<string, any>): number {
    return maxQtyColumn ? Math.max(0, toNumberFlexible(row[maxQtyColumn])) : 0;
  }
  function getFamilyItemNetQuantity(row: Record<string, any>): number {
    const directColumn = realQtyColumn || thirdIssueColumn;
    if (directColumn) {
      const directValue = toNumberFlexible(row[directColumn]);
      if (Number.isFinite(directValue)) return directValue;
    }

    const depotQty = depotQtyColumn ? toNumberFlexible(row[depotQtyColumn]) : 0;
    const incomingCustomerOrders = incomingOrderColumn ? Math.max(0, toNumberFlexible(row[incomingOrderColumn])) : 0;
    const outgoingSupplierOrders = outgoingOrderColumn ? Math.max(0, toNumberFlexible(row[outgoingOrderColumn])) : 0;
    return depotQty + outgoingSupplierOrders - incomingCustomerOrders;
  }
  function getFamilyItemEffectiveQuantity(row: Record<string, any>): number {
    const incomingDsv = incomingDsvColumn ? Math.max(0, toNumberFlexible(row[incomingDsvColumn])) : 0;
    return getFamilyItemNetQuantity(row) + incomingDsv;
  }
  function getFamilyItemShortage(row: Record<string, any>): number {
    return Math.max(0, getFamilyItemMinimum(row) - getFamilyItemEffectiveQuantity(row));
  }
  function getFamilyItemExcess(row: Record<string, any>): number {
    return Math.max(0, getFamilyItemEffectiveQuantity(row) - getFamilyItemMinimum(row));
  }
  function getFamilyCoverage(family: ProductFamily): { minimum: number; maximum: number; effective: number } {
    let minimum = 0;
    let maximum = 0;
    let effective = 0;
    getVisibleFamilyItems(family).forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      if (!row) return;
      minimum += getFamilyItemMinimum(row);
      maximum += getFamilyItemMaximum(row);
      effective += getFamilyItemEffectiveQuantity(row);
    });
    return { minimum, maximum, effective };
  }
  function isFamilyCoveredByMinimum(coverage: { minimum: number; effective: number }): boolean {
    return coverage.minimum > 0 && coverage.effective >= coverage.minimum;
  }
  // Patron kurali (2026-07-04 guncel): aile toplam stok + bekleyen satinalma + gelecek DSV
  // - alinan musteri siparisi = efektif. TETIK: efektif < aile toplam MINIMUM ise aile
  // onerilir. DOLDURMA HEDEFI: aile toplam MAXIMUM (min degil!). Tavan:
  // max(0, aile toplam MAX - aile toplam efektif). Urun bazli ihtiyac = max(0, urun MAX -
  // urun efektif) (her uye kendi MAX'ina tamamlanir); kardes urun fazlasi tavani dusurur,
  // toplam bu tavani ASAMAZ (orantili dagitim). ONCEKI HATA: tavan MIN'e kisiliyordu ->
  // uyeler MAX yerine MIN'e tamamlaniyordu (19/27 gibi dusuk oneriler).
  function computeFamilyCappedNeeds(family: ProductFamily): {
    covered: boolean;
    cap: number;
    totalNeed: number;
    perItem: Map<string, number>;
  } {
    const coverage = getFamilyCoverage(family);
    const covered = isFamilyCoveredByMinimum(coverage);
    const perItem = new Map<string, number>();
    const visibleItems = getVisibleFamilyItems(family);
    visibleItems.forEach((item) => {
      perItem.set(String(item.productCode || '').trim().toUpperCase(), 0);
    });
    if (covered) {
      return { covered, cap: 0, totalNeed: 0, perItem };
    }
    // DOLDURMA TAVANI = aile toplam MAX - aile toplam efektif (MIN degil).
    const cap =
      coverage.maximum > 0 ? Math.max(0, Math.ceil(coverage.maximum - coverage.effective)) : Number.POSITIVE_INFINITY;
    const needs: Array<{ code: string; need: number }> = [];
    visibleItems.forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      // Aile tetiklendiginde her uye KENDI MAX'ina tamamlanir (bireysel min kapisi
      // aile seviyesinde uygulanir, uye seviyesinde degil): ihtiyac = max(0, MAX - efektif).
      const need = row
        ? Math.max(0, Math.trunc(getFamilyItemMaximum(row) - getFamilyItemEffectiveQuantity(row)))
        : 0;
      needs.push({ code, need });
    });
    const naturalTotal = needs.reduce((sum, entry) => sum + entry.need, 0);
    if (naturalTotal <= 0) {
      return { covered, cap: Number.isFinite(cap) ? cap : 0, totalNeed: 0, perItem };
    }
    if (naturalTotal <= cap) {
      needs.forEach((entry) => perItem.set(entry.code, entry.need));
      return { covered, cap: Number.isFinite(cap) ? cap : naturalTotal, totalNeed: naturalTotal, perItem };
    }
    // Toplam ihtiyac tavani asiyor: orantili dagit, kalan farki en buyuk kusurata ver.
    const targetTotal = Math.max(0, Math.trunc(cap));
    const scale = targetTotal / naturalTotal;
    let allocatedSum = 0;
    const fractions: Array<{ code: string; frac: number; need: number }> = [];
    needs.forEach((entry) => {
      const exact = entry.need * scale;
      const base = Math.floor(exact);
      perItem.set(entry.code, base);
      allocatedSum += base;
      fractions.push({ code: entry.code, frac: exact - base, need: entry.need });
    });
    let remainder = Math.max(0, targetTotal - allocatedSum);
    fractions.sort((a, b) => (b.frac - a.frac) || (b.need - a.need));
    for (const entry of fractions) {
      if (remainder <= 0) break;
      if (entry.need <= 0) continue;
      perItem.set(entry.code, (perItem.get(entry.code) || 0) + 1);
      remainder -= 1;
    }
    return { covered, cap: targetTotal, totalNeed: targetTotal, perItem };
  }
  const totalSuggestedQty = useMemo(
    () => depotRows.reduce((sum, row) => sum + getSuggestedQty(row), 0),
    [depotRows, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, depotQtyColumn, minQtyColumn, maxQtyColumn, incomingOrderColumn, outgoingOrderColumn]
  );
  const nonFamilyRows = useMemo(() => {
    if (!stockCodeColumn) return [];
    return depotRows
      .map((row) => {
        const code = String(row?.[stockCodeColumn] || '').trim().toUpperCase();
        return { code, row };
      })
      .filter((item) => item.code && !familyCodeSet.has(item.code))
      .filter((item) => !isRowOperationallyEmpty(item.row))
      .filter((item) => getSuggestedQty(item.row) > 0);
  }, [depotRows, stockCodeColumn, familyCodeSet, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, depotQtyColumn, minQtyColumn, maxQtyColumn, incomingOrderColumn, outgoingOrderColumn]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('ucarer_ops_panel_cols_v1');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Partial<Record<OpsExtraColumnKey, boolean>>;
      setPanelColumns((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore malformed local storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('ucarer_ops_panel_cols_v1', JSON.stringify(panelColumns));
  }, [panelColumns]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(CREATED_SUPPLIER_ORDER_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setCreatedOrderHistory(parsed.slice(0, 50));
      }
    } catch {
      setCreatedOrderHistory([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      CREATED_SUPPLIER_ORDER_HISTORY_KEY,
      JSON.stringify(createdOrderHistory.slice(0, 50))
    );
  }, [createdOrderHistory]);

  useEffect(() => {
    setNonFamilyAllocations((prev) => {
      const next: Record<string, number | ''> = {};
      nonFamilyRows.forEach((item) => {
        next[item.code] = prev[item.code] !== undefined ? prev[item.code] : '';
      });
      return next;
    });
  }, [nonFamilyRows, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, minQtyColumn, maxQtyColumn]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await adminApi.getCariList();
        const list = (response.cariList || []).map((cari) => ({
          code: String(cari.code || '').trim().toUpperCase(),
          name: String(cari.name || '').trim(),
        }));
        if (active) setCariOptions(list.filter((item) => item.code));
      } catch {
        if (active) setCariOptions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const codes = new Set<string>();
    families.forEach((family) => {
      getVisibleFamilyItems(family).forEach((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        if (code) codes.add(code);
      });
    });
    nonFamilyRows.forEach((item) => codes.add(item.code));
    const codeList = Array.from(codes);
    if (codeList.length === 0) {
      setCurrentCostByCode({});
      return;
    }

    let active = true;
    (async () => {
      try {
        const costMap: Record<string, number> = {};
        const vatMap: Record<string, number> = {};
        const packMap: Record<string, number> = {};
        const packRawMap: Record<string, number> = {};
        const unit2NameMap: Record<string, string> = {};
        const supplierMap: Record<string, { code: string; name: string }> = {};
        for (let i = 0; i < codeList.length; i += 200) {
          const chunk = codeList.slice(i, i + 200);
          const response = await adminApi.getProductsByCodes(chunk);
          (response.products || []).forEach((product: any) => {
            const code = String(product?.mikroCode || '').trim().toUpperCase();
            const costValue = Number(product?.currentCost ?? 0);
            const vatRateValue = Number(product?.vatRate ?? 0);
            const mainSupplierCode = String(product?.mainSupplierCode || '').trim().toUpperCase();
            const mainSupplierName = String(product?.mainSupplierName || '').trim();
            const unit2Factor = Number(product?.unit2Factor ?? 0);
            const unit2Name = String(product?.unit2Name || '').trim();
            if (code && Number.isFinite(costValue)) {
              costMap[code] = costValue;
            }
            if (code && Number.isFinite(vatRateValue)) {
              vatMap[code] = vatRateValue;
            }
            if (code && Number.isFinite(unit2Factor)) {
              // packQtyByCode: koliye-yuvarla mutlak deger kullanir (getPackRounding abs).
              packMap[code] = unit2Factor;
              // packFactorRawByCode: HAM ISARETLI katsayi (yon karari icin korunur).
              packRawMap[code] = unit2Factor;
            }
            if (code && unit2Name) {
              unit2NameMap[code] = unit2Name;
            }
            if (code && mainSupplierCode) {
              supplierMap[code] = { code: mainSupplierCode, name: mainSupplierName || mainSupplierCode };
            }
          });
        }
        if (active) {
          setCurrentCostByCode(costMap);
          setVatRateByCode((prev) => ({ ...prev, ...vatMap }));
          setPackQtyByCode((prev) => ({ ...prev, ...packMap }));
          setPackFactorRawByCode((prev) => ({ ...prev, ...packRawMap }));
          setUnit2NameByCode((prev) => ({ ...prev, ...unit2NameMap }));
          setMainSupplierByCode(supplierMap);
          setSupplierOverrideByCode((prev) => {
            const next: Record<string, string> = { ...prev };
            Object.entries(supplierMap).forEach(([productCode, supplier]) => {
              if (!next[productCode]) next[productCode] = supplier.code;
            });
            return next;
          });
        }
      } catch {
        if (active) {
          setCurrentCostByCode({});
          setVatRateByCode({});
          setPackQtyByCode({});
          setPackFactorRawByCode({});
          setUnit2NameByCode({});
          setMainSupplierByCode({});
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [families, nonFamilyRows, depotRows, suggestionMode]);

  const isIncomingOrderRow = (row: Record<string, any> | undefined): boolean => {
    if (!row || !incomingOrderColumn) return false;
    return toNumberFlexible(row?.[incomingOrderColumn]) > 0;
  };

  const getRowHighlightClass = (row: Record<string, any> | undefined): string => {
    if (!row) return '';
    const need = Math.max(0, Math.trunc(getSuggestedQty(row)));
    if (need <= 0) return '';

    const otherDepotQty =
      depot === 'MERKEZ'
        ? toNumberFlexible(row?.[topcaDepoStockColumn || ''])
        : toNumberFlexible(row?.[merkezDepoStockColumn || '']);
    if (otherDepotQty > 0 && otherDepotQty < need) return 'bg-red-200';
    if (otherDepotQty <= 0) return '';

    const minQty = Math.max(0, toNumberFlexible(row?.[minQtyColumn || '']));
    const remainingAfterTransfer = otherDepotQty - need;
    if (remainingAfterTransfer >= minQty) return 'bg-emerald-200';
    return 'bg-amber-200';
  };
  const getRowColorRank = (row: Record<string, any> | undefined): number => {
    const rowClass = getRowHighlightClass(row);
    if (rowClass.includes('bg-red-200')) return 3;
    if (rowClass.includes('bg-amber-200')) return 2;
    if (rowClass.includes('bg-emerald-200')) return 1;
    return 0;
  };

  const nextSortDirection = (current: SortDirection): SortDirection => {
    if (current === 'none') return 'desc';
    if (current === 'desc') return 'asc';
    return 'none';
  };
  const updateSort = (
    prev: SuggestionSortState,
    key: SuggestionSortKey
  ): SuggestionSortState => (prev.key === key ? { key, direction: nextSortDirection(prev.direction) } : { key, direction: 'desc' });
  const updateSalesHistorySort = (
    prev: SalesHistorySortState,
    key: SalesHistorySortKey
  ): SalesHistorySortState => (prev.key === key ? { key, direction: nextSortDirection(prev.direction) } : { key, direction: 'desc' });
  const sortIndicator = (sortState: SuggestionSortState, key: SuggestionSortKey): string =>
    sortState.key !== key || sortState.direction === 'none'
      ? ''
      : sortState.direction === 'asc'
      ? ' ▲'
      : ' ▼';
  const salesSortIndicator = (key: SalesHistorySortKey): string =>
    salesHistorySort.key !== key || salesHistorySort.direction === 'none'
      ? ''
      : salesHistorySort.direction === 'asc'
      ? ' ▲'
      : ' ▼';
  const compareMixed = (a: unknown, b: unknown, direction: SortDirection): number => {
    if (direction === 'none') return 0;
    const numA = parseMaybeNumber(a);
    const numB = parseMaybeNumber(b);
    let base = 0;
    if (numA !== null || numB !== null) {
      base = (numA || 0) - (numB || 0);
    } else {
      base = String(a || '').localeCompare(String(b || ''), 'tr', { sensitivity: 'base' });
    }
    return direction === 'asc' ? base : -base;
  };

  const stickySelectionWidth = 48;
  const stickyCodeWidth = 140;
  const stickyNameWidth = 280;
  const stickyCodeLeft = stickySelectionWidth;
  const stickyNameLeft = stickySelectionWidth + stickyCodeWidth;

  const getStickyCellBgClass = (row: Record<string, any> | undefined): string => {
    const rowClass = getRowHighlightClass(row);
    if (rowClass.includes('bg-emerald-200')) return 'bg-emerald-200';
    if (rowClass.includes('bg-amber-200')) return 'bg-amber-200';
    if (rowClass.includes('bg-red-200')) return 'bg-red-200';
    return 'bg-white';
  };

  const beginResize = (type: 'depot' | 'minmax', column: string, startX: number) => {
    const startWidth = type === 'depot' ? getDepotColumnWidth(column) : getMinMaxColumnWidth(column);
    resizingRef.current = { type, column, startX, startWidth };

    const onMouseMove = (event: MouseEvent) => {
      const current = resizingRef.current;
      if (!current) return;
      const nextWidth = Math.max(90, Math.min(700, current.startWidth + (event.clientX - current.startX)));
      if (current.type === 'depot') {
        setDepotColumnWidths((prev) => ({ ...prev, [current.column]: nextWidth }));
      } else {
        setMinMaxColumnWidths((prev) => ({ ...prev, [current.column]: nextWidth }));
      }
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const downloadExcel = async (params: {
    rows: Array<Record<string, any>>;
    columns: string[];
    fileName: string;
  }) => {
    const { rows, columns, fileName } = params;
    if (!rows.length || !columns.length) {
      toast.error('Excel icin veri yok');
      return;
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const columnWidths = columns.map((column) => {
      let maxLen = String(column).length;
      rows.forEach((row) => {
        const cell = normalizeValue(row?.[column]);
        maxLen = Math.max(maxLen, String(cell).length);
      });
      return Math.max(120, Math.min(420, maxLen * 8 + 28));
    });

    const colGroup = columns
      .map((_, index) => `<col style="width:${columnWidths[index]}px;" />`)
      .join('');

    const headCells = columns
      .map(
        (column) =>
          `<th style="background:#d1d5db;font-weight:700;border:1px solid #cbd5e1;padding:6px 8px;text-align:left;white-space:nowrap;">${escapeHtml(column)}</th>`
      )
      .join('');

    const bodyRows = rows
      .map((row, rowIndex) => {
        const background = rowIndex % 2 === 0 ? '#f3f4f6' : '#ffffff';
        const cells = columns
          .map((column) => {
            const value = normalizeValue(row?.[column]);
            return `<td style="background:${background};border:1px solid #e2e8f0;padding:6px 8px;white-space:nowrap;">${escapeHtml(value)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
        </head>
        <body>
          <table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">
            <colgroup>${colGroup}</colgroup>
            <thead><tr>${headCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([html], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const loadFamilies = async () => {
    setFamilyLoading(true);
    try {
      const response = await adminApi.getProductFamilies();
      setFamilies(response.data || []);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Aile listesi alinamadi'));
    } finally {
      setFamilyLoading(false);
    }
  };

  const openFamilyEditModal = (familyId: string) => {
    const family = families.find((item) => item.id === familyId);
    if (!family) return;
    setEditingFamilyId(family.id);
    setFamilyEditName(family.name || '');
    setFamilyEditCode(String(family.code || ''));
    setFamilyEditNote(String(family.note || ''));
    setFamilyEditActive(Boolean(family.active));
    familyEditNameFetchAttemptedRef.current.clear();
    const productNamesByCode: Record<string, string> = {};
    const productCodes = Array.from(
      new Set(
        (family.items || [])
          .map((item) => {
            const code = String(item.productCode || '').trim().toUpperCase();
            if (code) {
              const rowName = productNameColumn
                ? String(rowByProductCode.get(code)?.[productNameColumn] || '').trim()
                : '';
              productNamesByCode[code] = String(item.productName || '').trim() || rowName;
            }
            return code;
          })
          .filter(Boolean)
      )
    );
    setFamilyEditProductCodes(productCodes);
    setFamilyEditProductNamesByCode(productNamesByCode);
    setFamilyEditSearch('');
    setFamilyEditResults([]);
    setFamilyEditModalOpen(true);
  };

  const closeFamilyEditModal = () => {
    setFamilyEditModalOpen(false);
    setEditingFamilyId('');
    setFamilyEditSearch('');
    setFamilyEditResults([]);
    setFamilyEditProductNamesByCode({});
    familyEditNameFetchAttemptedRef.current.clear();
    setFamilyEditSaving(false);
  };

  const addProductCodeToFamilyEdit = (codeRaw: string, nameRaw?: string) => {
    const code = String(codeRaw || '').trim().toUpperCase();
    if (!code) return;
    const name = String(nameRaw || '').trim();
    if (name) {
      setFamilyEditProductNamesByCode((prev) => ({ ...prev, [code]: name }));
    }
    setFamilyEditProductCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setFamilyEditSearch('');
    setFamilyEditResults([]);
  };

  const removeProductCodeFromFamilyEdit = (codeRaw: string) => {
    const code = String(codeRaw || '').trim().toUpperCase();
    if (!code) return;
    setFamilyEditProductCodes((prev) => prev.filter((item) => item !== code));
  };

  const getFamilyEditProductLabel = (codeRaw: string) => {
    const code = String(codeRaw || '').trim().toUpperCase();
    const name = String(familyEditProductNamesByCode[code] || '').trim();
    return name ? `${code} - ${name}` : code;
  };

  const saveFamilyEdit = async () => {
    const id = String(editingFamilyId || '').trim();
    if (!id) return;
    if (!String(familyEditName || '').trim()) {
      toast.error('Aile adi zorunlu.');
      return;
    }
    if (familyEditProductCodes.length === 0) {
      toast.error('En az bir urun secmelisiniz.');
      return;
    }
    setFamilyEditSaving(true);
    try {
      await adminApi.updateProductFamily(id, {
        name: String(familyEditName || '').trim(),
        code: String(familyEditCode || '').trim() || null,
        note: String(familyEditNote || '').trim() || null,
        active: familyEditActive,
        productCodes: familyEditProductCodes,
      });
      toast.success('Aile guncellendi.');
      await loadFamilies();
      refreshOperationLogsIfOpen();
      closeFamilyEditModal();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Aile guncellenemedi'));
    } finally {
      setFamilyEditSaving(false);
    }
  };

  const loadMinMaxExcludedCodes = async () => {
    try {
      const response = await adminApi.getUcarerMinMaxExcludedProductsReport();
      setMinMaxExcludedRows((response.data?.rows || []).map((row) => ({ productCode: String(row.productCode || '').trim().toUpperCase() })));
    } catch {
      setMinMaxExcludedRows([]);
    }
  };

  const loadUcarerOperationLogs = async (page = operationLogPage) => {
    setOperationLogLoading(true);
    try {
      const response = await adminApi.getUcarerOperationLogs({
        page,
        limit: operationLogPagination.limit,
        operationType: operationLogType || undefined,
        search: operationLogSearch || undefined,
      });
      setOperationLogs((response.data?.rows || []) as UcarerOperationLogRow[]);
      setOperationLogPagination(response.data?.pagination || {
        page,
        limit: operationLogPagination.limit,
        totalPages: 1,
        totalRecords: 0,
      });
      setOperationLogPage(page);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Islem gecmisi getirilemedi'));
      setOperationLogs([]);
    } finally {
      setOperationLogLoading(false);
    }
  };

  const refreshOperationLogsIfOpen = () => {
    if (orderPanelTab === 'operationHistory') {
      void loadUcarerOperationLogs(1);
    }
  };

  useEffect(() => {
    loadFamilies();
    loadMinMaxExcludedCodes();
  }, []);

  useEffect(() => {
    if (orderPanelTab !== 'operationHistory') return;
    void loadUcarerOperationLogs(operationLogPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderPanelTab, operationLogPage]);

  useEffect(() => {
    if (!familyEditModalOpen) return;
    const query = String(familyEditSearch || '').trim();
    if (query.length < 2) {
      setFamilyEditResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setFamilyEditSearching(true);
      try {
        const variants = buildFamilyEditSearchVariants(query);
        const responses = await Promise.all(
          variants.map((searchTerm) => adminApi.searchStocks({ searchTerm, limit: 40, offset: 0 }))
        );
        if (!active) return;
        const foldedTokens = normalizeKey(query).split(' ').filter(Boolean);
        const deduped = new Map<string, FamilyStockOption>();
        responses
          .flatMap((response) => response.data || [])
          .map((row: any) => ({
            productCode: String(row['Stok Kodu'] || row['msg_S_0078'] || row.productCode || row.mikroCode || '').trim().toUpperCase(),
            productName: String(row['Stok Adi'] || row['Stok Adı'] || row['msg_S_0870'] || row.productName || row.name || '').trim(),
          }))
          .filter((item: FamilyStockOption) => item.productCode)
          .forEach((item: FamilyStockOption) => {
            if (!deduped.has(item.productCode)) deduped.set(item.productCode, item);
          });
        const next = Array.from(deduped.values()).filter((item) => {
          if (foldedTokens.length === 0) return true;
          const haystack = `${normalizeKey(item.productCode)} ${normalizeKey(item.productName || '')}`;
          return foldedTokens.every((token) => haystack.includes(token));
        });
        setFamilyEditProductNamesByCode((prev) => {
          let changed = false;
          const merged = { ...prev };
          next.forEach((item) => {
            const code = String(item.productCode || '').trim().toUpperCase();
            const name = String(item.productName || '').trim();
            if (code && name && merged[code] !== name) {
              merged[code] = name;
              changed = true;
            }
          });
          return changed ? merged : prev;
        });
        setFamilyEditResults(next.slice(0, 80));
      } catch {
        if (active) setFamilyEditResults([]);
      } finally {
        if (active) setFamilyEditSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [familyEditSearch, familyEditModalOpen]);

  useEffect(() => {
    if (!familyEditModalOpen || familyEditProductCodes.length === 0) return;
    const missingCodes = familyEditProductCodes.filter((codeRaw) => {
      const code = String(codeRaw || '').trim().toUpperCase();
      return code && !String(familyEditProductNamesByCode[code] || '').trim() && !familyEditNameFetchAttemptedRef.current.has(code);
    });
    if (missingCodes.length === 0) return;
    missingCodes.forEach((code) => familyEditNameFetchAttemptedRef.current.add(code));

    let active = true;
    (async () => {
      try {
        const response = await adminApi.getProductsByCodes(missingCodes);
        if (!active) return;
        const namesByCode: Record<string, string> = {};
        (response.products || []).forEach((product: any) => {
          const code = String(product?.mikroCode || product?.productCode || product?.code || '').trim().toUpperCase();
          const name = String(product?.name || product?.productName || product?.stokAdi || '').trim();
          if (code && name) namesByCode[code] = name;
        });
        if (Object.keys(namesByCode).length > 0) {
          setFamilyEditProductNamesByCode((prev) => ({ ...prev, ...namesByCode }));
        }
      } catch {
        // Kod gosterimi calismaya devam eder; isim yalnizca ekranda yardimci bilgidir.
      }
    })();

    return () => {
      active = false;
    };
  }, [familyEditModalOpen, familyEditProductCodes, familyEditProductNamesByCode]);

  useEffect(() => {
    if (!incomingOrdersModalOpen && !salesHistoryModalOpen && !familyEditModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (incomingOrdersModalOpen) setIncomingOrdersModalOpen(false);
      if (salesHistoryModalOpen) setSalesHistoryModalOpen(false);
      if (familyEditModalOpen) closeFamilyEditModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [incomingOrdersModalOpen, salesHistoryModalOpen, familyEditModalOpen]);

  useEffect(() => {
    if (families.length === 0) {
      setActiveFamilyId('');
      return;
    }
    if (activeFamilyId && !families.some((family) => family.id === activeFamilyId)) {
      setActiveFamilyId('');
    }
  }, [families, activeFamilyId]);

  const loadDepotReport = async () => {
    setDepotLoading(true);
    try {
      const limitNumeric = Number(depotLimit);
      const requestAll = depotLimit === 'ALL';
      const response = await adminApi.getUcarerDepotReport({
        depot,
        all: requestAll,
        limit: requestAll ? undefined : (Number.isFinite(limitNumeric) ? limitNumeric : 1000),
      });
      const data = response.data;
      setDepotRows(data.rows || []);
      setDepotColumns(data.columns || []);
      setDepotTotal(Number(data.total || 0));
      setDepotLimited(Boolean(data.limited));
      await loadFamilies();
      await loadMinMaxExcludedCodes();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Ucarer depo raporu alinamadi'));
    } finally {
      setDepotLoading(false);
    }
  };

  const runMinMax = async () => {
    setMinMaxLoading(true);
    setMinMaxJobStatusText('MinMax hesaplama baslatiliyor...');
    try {
      const response = await adminApi.runUcarerMinMaxReport();
      const job = response.data;
      if (!job?.id) {
        throw new Error('MinMax job bilgisi alinamadi');
      }

      setMinMaxJobStatusText(job.status === 'RUNNING' ? 'MinMax hesaplama devam ediyor...' : '');
      let data = job.data;

      if (job.status === 'FAILED') {
        throw new Error(job.error || 'MinMax hesaplama tamamlanamadi');
      }

      if (job.status !== 'COMPLETED') {
        for (let attempt = 0; attempt < 240; attempt += 1) {
          await wait(2500);
          const statusResponse = await adminApi.getUcarerMinMaxJobStatus(job.id);
          const statusJob = statusResponse.data;
          if (statusJob.status === 'COMPLETED') {
            data = statusJob.data;
            break;
          }
          if (statusJob.status === 'FAILED') {
            throw new Error(statusJob.error || 'MinMax hesaplama tamamlanamadi');
          }
          setMinMaxJobStatusText(`MinMax hesaplama devam ediyor... (${attempt + 1})`);
        }
      }

      if (!data) {
        throw new Error('MinMax hesaplama sonucu alinamadi');
      }

      setMinMaxRows(data.rows || []);
      setMinMaxColumns(data.columns || []);
      setMinMaxTotal(Number(data.total || 0));
      toast.success('MinMax hesaplama tamamlandi');
      setMinMaxJobStatusText('');
      refreshOperationLogsIfOpen();
    } catch (error: any) {
      const message = getApiErrorMessage(error, 'MinMax hesaplama calistirilamadi');
      setMinMaxJobStatusText(message);
      toast.error(message);
    } finally {
      setMinMaxLoading(false);
    }
  };

  const exportDepot = async () => {
    try {
      setExportingDepot(true);
      const response = await adminApi.getUcarerDepotReport({ depot, all: true });
      const data = response.data;
      await downloadExcel({
        rows: data.rows || [],
        columns: data.columns || [],
        fileName: `ucarer-depo-${depot.toLowerCase()}`,
      });
    } finally {
      setExportingDepot(false);
    }
  };

  const exportMinMax = async () => {
    try {
      setExportingMinMax(true);
      await downloadExcel({
        rows: minMaxRows,
        columns: visibleMinMaxColumns,
        fileName: 'ucarer-minmax',
      });
    } finally {
      setExportingMinMax(false);
    }
  };

  const getFamilyNeed = (family: ProductFamily): number => {
    // Aile toplam tavani uygulanmis ihtiyac (kardes urun fazlasi dusulmus).
    return Math.max(0, Math.trunc(computeFamilyCappedNeeds(family).totalNeed));
  };

  const applySingleAllocation = (family: ProductFamily) => {
    const visibleItems = getVisibleFamilyItems(family);
    const selectedCode =
      singleCodeByFamily[family.id] || String(visibleItems[0]?.productCode || '').toUpperCase();
    const need = getFamilyNeed(family);
    const next: Record<string, number> = {};
    visibleItems.forEach((item) => {
      const code = String(item.productCode || '').toUpperCase();
      next[code] = code === selectedCode ? need : 0;
    });
    setManualAllocations((prev) => ({ ...prev, [family.id]: next }));
  };

  const applySplitAllocation = (family: ProductFamily) => {
    const visibleItems = getVisibleFamilyItems(family);
    const items = visibleItems.map((item) => String(item.productCode || '').toUpperCase());
    const a = splitAByFamily[family.id] || items[0] || '';
    const b = splitBByFamily[family.id] || items[1] || items[0] || '';
    if (!a || !b) return;
    const ratio = splitRatioByFamily[family.id] ?? 50;
    const need = getFamilyNeed(family);
    const qtyA = Math.round((need * ratio) / 100);
    const qtyB = Math.max(0, need - qtyA);
    const next: Record<string, number> = {};
    visibleItems.forEach((item) => {
      const code = String(item.productCode || '').toUpperCase();
      if (code === a) next[code] = qtyA;
      else if (code === b) next[code] = qtyB;
      else next[code] = 0;
    });
    setManualAllocations((prev) => ({ ...prev, [family.id]: next }));
  };

  const setManualAllocation = (familyId: string, code: string, value: number) => {
    setManualAllocations((prev) => ({
      ...prev,
      [familyId]: {
        ...(prev[familyId] || {}),
        [code]: Math.max(0, Math.trunc(value || 0)),
      },
    }));
  };

  const getExtraColumnValue = (row: Record<string, any>, code: string, key: OpsExtraColumnKey): string => {
    const valueFrom = (column?: string) => (column ? normalizeValue(row?.[column]) : '-');
    if (key === 'depotQty') return valueFrom(depotQtyColumn);
    if (key === 'topcaDepotQty') return valueFrom(topcaDepoStockColumn);
    if (key === 'incomingOrders') return valueFrom(incomingOrderColumn);
    if (key === 'outgoingOrders') return valueFrom(outgoingOrderColumn);
    if (key === 'realQty') return valueFrom(realQtyColumn);
    if (key === 'minQty') return valueFrom(minQtyColumn);
    if (key === 'maxQty') return valueFrom(maxQtyColumn);
    if (key === 'currentCost') {
      const currentCost = currentCostByCode[code];
      return Number.isFinite(currentCost) ? currentCost.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
    }
    if (key === 'packQty') {
      const packQty = Number(packQtyByCode[code] ?? 0);
      return Number.isFinite(packQty) && packQty > 0 ? packQty.toLocaleString('tr-TR') : '-';
    }
    if (key === 'costExVat') {
      const currentCost = Number(currentCostByCode[code] ?? 0);
      return Number.isFinite(currentCost) && currentCost > 0
        ? currentCost.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '-';
    }
    if (key === 'costIncVat') {
      const currentCost = Number(currentCostByCode[code] ?? 0);
      const vatRate = Number(vatRateByCode[code] ?? 0);
      const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
      const withVat = currentCost * (1 + vatPercent / 100);
      return Number.isFinite(withVat) && withVat > 0
        ? withVat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '-';
    }
    if (key === 'stockDays') {
      const days = getDaysOfStock(row);
      return days === null ? '-' : `${days.toLocaleString('tr-TR')} gun`;
    }
    return '-';
  };
  const cariNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    cariOptions.forEach((item) => {
      const code = String(item.code || '').trim().toUpperCase();
      if (!code) return;
      map.set(code, String(item.name || '').trim() || code);
    });
    return map;
  }, [cariOptions]);
  const getEffectiveSupplierCode = (productCode: string): string => {
    const code = String(productCode || '').trim().toUpperCase();
    return String(supplierOverrideByCode[code] || mainSupplierByCode[code]?.code || '').trim().toUpperCase();
  };
  const getEffectiveSupplierName = (productCode: string): string => {
    const code = String(productCode || '').trim().toUpperCase();
    const supplierCode = getEffectiveSupplierCode(code);
    if (!supplierCode) return '-';
    return cariNameByCode.get(supplierCode) || mainSupplierByCode[code]?.name || supplierCode;
  };
  const updateProductCost = async (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    const parsedCostP = Number(String(costPInputByCode[code] || '').replace(',', '.'));
    const parsedCostT = Number(String(costTInputByCode[code] || '').replace(',', '.'));
    if (!Number.isFinite(parsedCostP) || parsedCostP <= 0) {
      toast.error('Gecerli bir Maliyet P girin.');
      return;
    }
    if (!Number.isFinite(parsedCostT) || parsedCostT <= 0) {
      toast.error('Gecerli bir Maliyet T girin.');
      return;
    }

    setUpdatingCostByCode((prev) => ({ ...prev, [code]: true }));
    try {
      const result = await adminApi.updateUcarerProductCost({
        productCode: code,
        costP: parsedCostP,
        costT: parsedCostT,
        updatePriceLists: isPriceListUpdateChecked(code),
      });
      const newCostP = Number(result.data?.costP || parsedCostP);
      const newCostT = Number(result.data?.costT || parsedCostT);
      const newCost = Number(result.data?.currentCost || newCostP);
      setCurrentCostByCode((prev) => ({ ...prev, [code]: newCost }));
      setCostPInputByCode((prev) => ({ ...prev, [code]: String(newCostP) }));
      setCostTInputByCode((prev) => ({ ...prev, [code]: String(newCostT) }));
      const missing = result.data?.missingLists || [];
      if (isPriceListUpdateChecked(code)) {
        if (missing.length > 0) {
          toast.success(`Maliyet guncellendi. Eksik liste satiri: ${missing.join(', ')}`);
        } else {
          toast.success('Maliyet ve 10 fiyat listesi guncellendi.');
        }
      } else {
        toast.success('Guncel maliyet guncellendi.');
      }
      refreshOperationLogsIfOpen();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Maliyet guncellenemedi'));
    } finally {
      setUpdatingCostByCode((prev) => ({ ...prev, [code]: false }));
    }
  };
  const updateMainSupplier = async (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    const supplierCode = String(getEffectiveSupplierCode(code) || '').trim().toUpperCase();
    if (!supplierCode) {
      toast.error('Gecerli bir saglayici kodu girin.');
      return;
    }
    setUpdatingSupplierByCode((prev) => ({ ...prev, [code]: true }));
    try {
      const result = await adminApi.updateUcarerMainSupplier({
        productCode: code,
        supplierCode,
      });
      const resolvedCode = String(result.data?.supplierCode || supplierCode).trim().toUpperCase();
      const resolvedName = String(result.data?.supplierName || cariNameByCode.get(resolvedCode) || resolvedCode).trim();
      setMainSupplierByCode((prev) => ({ ...prev, [code]: { code: resolvedCode, name: resolvedName } }));
      setSupplierOverrideByCode((prev) => ({ ...prev, [code]: resolvedCode }));
      toast.success('Ana saglayici guncellendi.');
      refreshOperationLogsIfOpen();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Ana saglayici guncellenemedi'));
    } finally {
      setUpdatingSupplierByCode((prev) => ({ ...prev, [code]: false }));
    }
  };
  const setMinMaxExclusion = async (productCode: string, exclude: boolean) => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return;
    setUpdatingMinMaxExclusionByCode((prev) => ({ ...prev, [code]: true }));
    try {
      await adminApi.setUcarerMinMaxExclusion({
        productCode: code,
        exclude,
        resetMinMaxValues: exclude ? Boolean(resetMinMaxToZeroByCode[code]) : false,
        depot,
      });
      toast.success(exclude ? 'MinMax hesaplamasi disina alindi.' : 'MinMax hesaplamasina tekrar dahil edildi.');
      setMinMaxExcludedRows((prev) => {
        const hasCode = prev.some((row) => String(row.productCode || '').trim().toUpperCase() === code);
        if (exclude && !hasCode) return [{ productCode: code }, ...prev];
        if (!exclude) return prev.filter((row) => String(row.productCode || '').trim().toUpperCase() !== code);
        return prev;
      });
      refreshOperationLogsIfOpen();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'MinMax dislama islemi basarisiz'));
    } finally {
      setUpdatingMinMaxExclusionByCode((prev) => ({ ...prev, [code]: false }));
    }
  };
  const openIncomingOrdersModal = async (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return;
    setIncomingOrdersProductCode(code);
    setIncomingOrdersModalOpen(true);
    setIncomingOrdersLoading(true);
    try {
      const response = await adminApi.getUcarerIncomingOrderDetails(code, depot);
      setIncomingOrdersDetailRows(Array.isArray(response.data?.rows) ? response.data.rows : []);
    } catch (error: any) {
      setIncomingOrdersDetailRows([]);
      toast.error(getApiErrorMessage(error, 'Alinan siparis detaylari getirilemedi'));
    } finally {
      setIncomingOrdersLoading(false);
    }
  };
  const openSalesHistoryModal = async (productCode: string, mode: SalesHistoryViewMode = 'minmax') => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return;
    setSalesHistoryProductCode(code);
    setSalesHistoryViewMode(mode);
    setSalesHistoryModalOpen(true);
    setSalesHistoryLoading(true);
    try {
      const response =
        mode === 'recentCustomers'
          ? await adminApi.getUcarerProductPurchaseHistory(code)
          : await adminApi.getUcarerProductSalesHistory(code);
      setSalesHistoryRows(Array.isArray(response.data?.rows) ? response.data.rows : []);
      setSalesHistoryLookbackMonths(Number(response.data?.metadata?.lookbackMonths || 4));
      setSalesHistorySummary({
        totalQuantity: Number(response.data?.summary?.totalQuantity || 0),
        totalAmount: Number(response.data?.summary?.totalAmount || 0),
        averageUnitPrice: Number(response.data?.summary?.averageUnitPrice || 0),
      });
    } catch (error: any) {
      setSalesHistoryRows([]);
      setSalesHistoryLookbackMonths(4);
      setSalesHistorySummary({
        totalQuantity: 0,
        totalAmount: 0,
        averageUnitPrice: 0,
      });
      toast.error(
        getApiErrorMessage(
          error,
          mode === 'recentCustomers' ? 'Son alis detaylari getirilemedi' : 'Son 3 ay satis detaylari getirilemedi'
        )
      );
    } finally {
      setSalesHistoryLoading(false);
    }
  };

  const markSalesHistoryLineAsToplu = async (row: ProductSalesHistoryRow) => {
    const productCode = String(salesHistoryProductCode || '').trim().toUpperCase();
    if (!productCode || salesHistoryViewMode !== 'minmax') return;
    if (!row.lineGuid) {
      toast.error('Satir kimligi bulunamadi, islem yapilamadi');
      return;
    }

    const lineKey = row.lineGuid || `${row.documentSeries}-${row.documentSequence}-${row.documentLineNo}`;
    const documentNo = `${row.documentSeries}-${row.documentSequence}`;
    const confirmed = window.confirm(
      `${documentNo} evrakindaki ${productCode} satirinin stok sorumluluk merkezini TOPLU yapmak istiyor musunuz?\n\nSadece bu evraktaki bu satir guncellenecek.`
    );
    if (!confirmed) return;

    setMarkingTopluLineKey(lineKey);
    try {
      const response = await adminApi.markUcarerSalesLineAsToplu({
        productCode,
        lineGuid: row.lineGuid,
        documentSeries: row.documentSeries,
        documentSequence: row.documentSequence,
        documentLineNo: row.documentLineNo,
      });
      toast.success(response.data?.alreadyToplu ? 'Satir zaten TOPLU olarak isaretli' : 'Satir TOPLU yapildi');
      await openSalesHistoryModal(productCode, 'minmax');
      refreshOperationLogsIfOpen();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Satir TOPLU yapilamadi'));
    } finally {
      setMarkingTopluLineKey('');
    }
  };
  const reassignPendingSupplierForProduct = (fromSupplierCode: string, productCode: string, newSupplierCodeInput: string) => {
    const sourceCode = String(fromSupplierCode || '').trim().toUpperCase();
    const stockCode = String(productCode || '').trim().toUpperCase();
    const normalizedInput = String(newSupplierCodeInput || '').trim().toUpperCase();
    const targetCode = String((normalizedInput.match(/^([A-Z0-9._-]+)/)?.[1] || normalizedInput)).trim().toUpperCase();
    if (!sourceCode || !stockCode || !targetCode) return;

    setPendingAllocations((prev) =>
      prev.map((row) => {
        const rowSupplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
        const rowProductCode = String(row.productCode || '').trim().toUpperCase();
        if (rowSupplierCode !== sourceCode || rowProductCode !== stockCode) return row;
        return {
          ...row,
          supplierCodeOverride: targetCode,
        };
      })
    );
    setPendingSupplierInputByProduct((prev) => ({ ...prev, [stockCode]: targetCode }));
  };
  const setPendingPersistOverrideForProduct = (productCode: string, persist: boolean) => {
    const stockCode = String(productCode || '').trim().toUpperCase();
    if (!stockCode) return;
    setPersistSupplierOverrideByCode((prev) => ({ ...prev, [stockCode]: persist }));
    setPendingAllocations((prev) =>
      prev.map((row) => {
        const rowProductCode = String(row.productCode || '').trim().toUpperCase();
        if (rowProductCode !== stockCode) return row;
        return {
          ...row,
          persistSupplierOverride: persist,
        };
      })
    );
  };
  const setPendingPriceOverrideForProduct = (productCode: string, value: string) => {
    const stockCode = String(productCode || '').trim().toUpperCase();
    if (!stockCode) return;
    const parsed = Number(String(value || '').replace(',', '.'));
    const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    setPendingAllocations((prev) =>
      prev.map((row) => {
        const rowProductCode = String(row.productCode || '').trim().toUpperCase();
        if (rowProductCode !== stockCode) return row;
        return {
          ...row,
          unitPriceOverride: nextValue,
        };
      })
    );
  };
  const removePendingProductFromSupplierOrder = (productCode: string) => {
    const stockCode = String(productCode || '').trim().toUpperCase();
    if (!stockCode) return;
    setPendingAllocations((prev) =>
      prev.filter((row) => String(row.productCode || '').trim().toUpperCase() !== stockCode)
    );
    setPendingSupplierInputByProduct((prev) => {
      const next = { ...prev };
      delete next[stockCode];
      return next;
    });
  };
  const salesHistoryRowsSorted = useMemo(() => {
    const rows = [...salesHistoryRows];
    return rows.sort((a, b) => {
      if (salesHistorySort.key === 'customerCode') {
        return compareMixed(a.customerCode, b.customerCode, salesHistorySort.direction);
      }
      if (salesHistorySort.key === 'customerName') {
        return compareMixed(a.customerName, b.customerName, salesHistorySort.direction);
      }
      if (salesHistorySort.key === 'documentNo') {
        const left = `${a.documentSeries || ''}-${a.documentSequence || 0}`;
        const right = `${b.documentSeries || ''}-${b.documentSequence || 0}`;
        return compareMixed(left, right, salesHistorySort.direction);
      }
      if (salesHistorySort.key === 'quantity') {
        return compareMixed(a.quantity, b.quantity, salesHistorySort.direction);
      }
      if (salesHistorySort.key === 'unitPrice') {
        return compareMixed(a.unitPrice, b.unitPrice, salesHistorySort.direction);
      }
      if (salesHistorySort.key === 'totalAmount') {
        return compareMixed(a.totalAmount, b.totalAmount, salesHistorySort.direction);
      }
      const leftDate = a.saleDate ? new Date(a.saleDate).getTime() : 0;
      const rightDate = b.saleDate ? new Date(b.saleDate).getTime() : 0;
      return compareMixed(leftDate, rightDate, salesHistorySort.direction);
    });
  }, [salesHistoryRows, salesHistorySort, compareMixed]);

  const activeFamily = useMemo(
    () => families.find((family) => family.id === activeFamilyId) || null,
    [families, activeFamilyId]
  );
  const activeFamilySuggestion = useMemo(
    () => familySuggestions.find((item) => item.id === activeFamilyId) || null,
    [familySuggestions, activeFamilyId]
  );
  const activeFamilyItems = activeFamily ? getVisibleFamilyItems(activeFamily) : [];
  const activeFamilyRowsSorted = useMemo(() => {
    if (!activeFamily) return [] as Array<{
      item: ProductFamily['items'][number];
      code: string;
      row?: Record<string, any>;
      suggested: number;
      allocation: number;
      diff: number;
      supplierCode: string;
      supplierName: string;
      colorRank: number;
    }>;
    // Aile tavanina gore orantili dagitilmis oneri (kardes urun fazlasi dusulmus).
    const cappedNeeds = computeFamilyCappedNeeds(activeFamily);
    const rows = activeFamilyItems.map((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      const suggested = cappedNeeds.perItem.get(code) || 0;
      const allocation = manualAllocations[activeFamily.id]?.[code] ?? 0;
      const diff = allocation - suggested;
      return {
        item,
        code,
        row,
        suggested,
        allocation,
        diff,
        supplierCode: getEffectiveSupplierCode(code),
        supplierName: getEffectiveSupplierName(code),
        colorRank: getRowColorRank(row),
      };
    });
    if (familySort.direction === 'none') return rows;
    return [...rows].sort((a, b) => {
      if (familySort.key === 'color') return compareMixed(a.colorRank, b.colorRank, familySort.direction);
      if (familySort.key === 'code') return compareMixed(a.code, b.code, familySort.direction);
      if (familySort.key === 'name') return compareMixed(a.item.productName, b.item.productName, familySort.direction);
      if (familySort.key === 'supplierCode') return compareMixed(a.supplierCode, b.supplierCode, familySort.direction);
      if (familySort.key === 'supplierName') return compareMixed(a.supplierName, b.supplierName, familySort.direction);
      if (familySort.key === 'depotQty') return compareMixed(a.row?.[depotQtyColumn || ''], b.row?.[depotQtyColumn || ''], familySort.direction);
      if (familySort.key === 'topcaDepotQty') return compareMixed(a.row?.[topcaDepoStockColumn || ''], b.row?.[topcaDepoStockColumn || ''], familySort.direction);
      if (familySort.key === 'incomingOrders') return compareMixed(a.row?.[incomingOrderColumn || ''], b.row?.[incomingOrderColumn || ''], familySort.direction);
      if (familySort.key === 'outgoingOrders') return compareMixed(a.row?.[outgoingOrderColumn || ''], b.row?.[outgoingOrderColumn || ''], familySort.direction);
      if (familySort.key === 'realQty') return compareMixed(a.row?.[realQtyColumn || ''], b.row?.[realQtyColumn || ''], familySort.direction);
      if (familySort.key === 'minQty') return compareMixed(a.row?.[minQtyColumn || ''], b.row?.[minQtyColumn || ''], familySort.direction);
      if (familySort.key === 'maxQty') return compareMixed(a.row?.[maxQtyColumn || ''], b.row?.[maxQtyColumn || ''], familySort.direction);
      if (familySort.key === 'stockDays') return compareMixed(getDaysOfStock(a.row), getDaysOfStock(b.row), familySort.direction);
      if (familySort.key === 'packQty') return compareMixed(packQtyByCode[a.code] || 0, packQtyByCode[b.code] || 0, familySort.direction);
      if (familySort.key === 'costExVat') return compareMixed(currentCostByCode[a.code] || 0, currentCostByCode[b.code] || 0, familySort.direction);
      if (familySort.key === 'costIncVat') {
        const vatA = Number(vatRateByCode[a.code] ?? 0);
        const vatB = Number(vatRateByCode[b.code] ?? 0);
        const costA = Number(currentCostByCode[a.code] || 0) * (1 + ((vatA <= 1 ? vatA * 100 : vatA) / 100));
        const costB = Number(currentCostByCode[b.code] || 0) * (1 + ((vatB <= 1 ? vatB * 100 : vatB) / 100));
        return compareMixed(costA, costB, familySort.direction);
      }
      if (familySort.key === 'allocation') return compareMixed(a.allocation, b.allocation, familySort.direction);
      if (familySort.key === 'diff') return compareMixed(a.diff, b.diff, familySort.direction);
      return compareMixed(a.suggested, b.suggested, familySort.direction);
    });
  }, [
    activeFamily,
    activeFamilySuggestion,
    activeFamilyItems,
    currentCostByCode,
    depotQtyColumn,
    familySort,
    fourthIssueColumn,
    incomingDsvColumn,
    incomingOrderColumn,
    manualAllocations,
    maxQtyColumn,
    minQtyColumn,
    outgoingOrderColumn,
    packQtyByCode,
    realQtyColumn,
    rowByProductCode,
    stockDaysColumn,
    suggestionMode,
    thirdIssueColumn,
    topcaDepoStockColumn,
    vatRateByCode,
  ]);
  const nonFamilyRowsSorted = useMemo(() => {
    const rows = nonFamilyRows.map((item) => {
      const row = item.row;
      const code = item.code;
      const suggested = Math.max(0, Math.trunc(getSuggestedQty(row)));
      const rawAllocated = nonFamilyAllocations[code];
      const allocation = rawAllocated === '' || rawAllocated === undefined ? 0 : Math.max(0, Math.trunc(Number(rawAllocated)));
      const triage = getSuggestionTriage(row);
      const incomingQty = incomingOrderColumn ? Math.max(0, toNumberFlexible(row?.[incomingOrderColumn])) : 0;
      return {
        ...item,
        suggested,
        allocation,
        supplierCode: getEffectiveSupplierCode(code),
        supplierName: getEffectiveSupplierName(code),
        colorRank: getRowColorRank(row),
        triage,
        incomingQty,
        daysOfStock: getDaysOfStock(row),
      };
    });
    if (nonFamilySort.direction === 'none') {
      // Varsayilan siralama: A (musteri bekliyor) -> B (yakinda bekleyecek) -> C, sonra oneri buyukten kucuge.
      return [...rows].sort(
        (a, b) => (getTriageRank(a.triage) - getTriageRank(b.triage)) || (b.suggested - a.suggested)
      );
    }
    return [...rows].sort((a, b) => {
      if (nonFamilySort.key === 'color') return compareMixed(a.colorRank, b.colorRank, nonFamilySort.direction);
      if (nonFamilySort.key === 'code') return compareMixed(a.code, b.code, nonFamilySort.direction);
      if (nonFamilySort.key === 'name') return compareMixed(a.row?.[productNameColumn || ''], b.row?.[productNameColumn || ''], nonFamilySort.direction);
      if (nonFamilySort.key === 'supplierCode') return compareMixed(a.supplierCode, b.supplierCode, nonFamilySort.direction);
      if (nonFamilySort.key === 'supplierName') return compareMixed(a.supplierName, b.supplierName, nonFamilySort.direction);
      if (nonFamilySort.key === 'depotQty') return compareMixed(a.row?.[depotQtyColumn || ''], b.row?.[depotQtyColumn || ''], nonFamilySort.direction);
      if (nonFamilySort.key === 'topcaDepotQty') return compareMixed(a.row?.[topcaDepoStockColumn || ''], b.row?.[topcaDepoStockColumn || ''], nonFamilySort.direction);
      if (nonFamilySort.key === 'incomingOrders') return compareMixed(a.row?.[incomingOrderColumn || ''], b.row?.[incomingOrderColumn || ''], nonFamilySort.direction);
      if (nonFamilySort.key === 'outgoingOrders') return compareMixed(a.row?.[outgoingOrderColumn || ''], b.row?.[outgoingOrderColumn || ''], nonFamilySort.direction);
      if (nonFamilySort.key === 'realQty') return compareMixed(a.row?.[realQtyColumn || ''], b.row?.[realQtyColumn || ''], nonFamilySort.direction);
      if (nonFamilySort.key === 'minQty') return compareMixed(a.row?.[minQtyColumn || ''], b.row?.[minQtyColumn || ''], nonFamilySort.direction);
      if (nonFamilySort.key === 'maxQty') return compareMixed(a.row?.[maxQtyColumn || ''], b.row?.[maxQtyColumn || ''], nonFamilySort.direction);
      if (nonFamilySort.key === 'stockDays') return compareMixed(a.daysOfStock, b.daysOfStock, nonFamilySort.direction);
      if (nonFamilySort.key === 'packQty') return compareMixed(packQtyByCode[a.code] || 0, packQtyByCode[b.code] || 0, nonFamilySort.direction);
      if (nonFamilySort.key === 'costExVat') return compareMixed(currentCostByCode[a.code] || 0, currentCostByCode[b.code] || 0, nonFamilySort.direction);
      if (nonFamilySort.key === 'costIncVat') {
        const vatA = Number(vatRateByCode[a.code] ?? 0);
        const vatB = Number(vatRateByCode[b.code] ?? 0);
        const costA = Number(currentCostByCode[a.code] || 0) * (1 + ((vatA <= 1 ? vatA * 100 : vatA) / 100));
        const costB = Number(currentCostByCode[b.code] || 0) * (1 + ((vatB <= 1 ? vatB * 100 : vatB) / 100));
        return compareMixed(costA, costB, nonFamilySort.direction);
      }
      if (nonFamilySort.key === 'allocation') return compareMixed(a.allocation, b.allocation, nonFamilySort.direction);
      return compareMixed(a.suggested, b.suggested, nonFamilySort.direction);
    });
  }, [
    currentCostByCode,
    depotQtyColumn,
    fourthIssueColumn,
    incomingDsvColumn,
    incomingOrderColumn,
    maxQtyColumn,
    minQtyColumn,
    nonFamilyAllocations,
    nonFamilyRows,
    nonFamilySort,
    outgoingOrderColumn,
    packQtyByCode,
    productNameColumn,
    realQtyColumn,
    stockDaysColumn,
    suggestionMode,
    thirdIssueColumn,
    topcaDepoStockColumn,
    vatRateByCode,
  ]);

  const activeFamilyAllocations = activeFamily ? (manualAllocations[activeFamily.id] || {}) : {};
  const filteredActiveFamilyRows = useMemo(() => {
    const query = normalizeKey(familyDetailSearch);
    if (!query) return activeFamilyRowsSorted;
    return activeFamilyRowsSorted.filter((entry) => {
      const haystack = normalizeKey(
        `${entry.code} ${entry.item.productName || ''} ${entry.supplierCode || ''} ${entry.supplierName || ''}`
      );
      return haystack.includes(query);
    });
  }, [activeFamilyRowsSorted, familyDetailSearch]);
  const filteredNonFamilyRows = useMemo(() => {
    const query = normalizeKey(nonFamilySearch);
    let rows = !query
      ? [...nonFamilyRowsSorted]
      : nonFamilyRowsSorted.filter((entry) => {
          const name = String(entry.row?.[productNameColumn || ''] || '');
          const haystack = normalizeKey(`${entry.code} ${name} ${entry.supplierCode || ''} ${entry.supplierName || ''}`);
          return haystack.includes(query);
        });

    if (nonFamilyColorFilter !== 'ALL') {
      rows = rows.filter((entry) => {
        if (nonFamilyColorFilter === 'GREEN') return entry.colorRank === 1;
        if (nonFamilyColorFilter === 'YELLOW') return entry.colorRank === 2;
        if (nonFamilyColorFilter === 'RED') return entry.colorRank === 3;
        return entry.colorRank === 0;
      });
    }

    if (nonFamilyTriageFilter !== 'ALL') {
      rows = rows.filter((entry) => entry.triage === nonFamilyTriageFilter);
    }

    if (nonFamilyColorSort !== 'NONE') {
      rows.sort((a, b) => {
        const diff = a.colorRank - b.colorRank;
        return nonFamilyColorSort === 'RISK_ASC' ? diff : -diff;
      });
    }

    return rows;
  }, [nonFamilyRowsSorted, nonFamilySearch, productNameColumn, nonFamilyColorFilter, nonFamilyColorSort, nonFamilyTriageFilter]);
  // Triyaj ozetleri: sinif basina kalem sayisi, toplam oneri miktari ve KDV haric oneri tutari.
  const nonFamilyTriageSummary = useMemo(() => {
    const summary: Record<SuggestionTriageClass, { count: number; totalQty: number; totalAmount: number }> = {
      A: { count: 0, totalQty: 0, totalAmount: 0 },
      B: { count: 0, totalQty: 0, totalAmount: 0 },
      C: { count: 0, totalQty: 0, totalAmount: 0 },
    };
    nonFamilyRowsSorted.forEach((entry) => {
      const bucket = summary[entry.triage];
      if (!bucket) return;
      bucket.count += 1;
      bucket.totalQty += entry.suggested;
      const unitCost = Number(currentCostByCode[entry.code] || 0);
      if (Number.isFinite(unitCost) && unitCost > 0) {
        bucket.totalAmount += entry.suggested * unitCost;
      }
    });
    return summary;
  }, [nonFamilyRowsSorted, currentCostByCode]);
  const familySuggestionsFiltered = useMemo(() => {
    const query = normalizeKey(familyListSearch);
    const source = !query
      ? familySuggestions
      : familySuggestions.filter((family) =>
          normalizeKey(`${family.name} ${family.code || ''}`).includes(query)
        );
    return source.sort((a, b) => {
      const qtyA = Math.max(0, Number(a.suggestedRaw) || 0);
      const qtyB = Math.max(0, Number(b.suggestedRaw) || 0);
      if (qtyB !== qtyA) return qtyB - qtyA;
      return a.name.localeCompare(b.name, 'tr');
    });
  }, [familySuggestions, familyListSearch]);
  const suggestedFamilies = useMemo(
    () =>
      familySuggestionsFiltered.filter(
        (family) => family.suggested > 0 || Boolean(family.redirectSuggestions?.some((item) => item.type === 'ORDER'))
      ),
    [familySuggestionsFiltered]
  );
  const unsuggestedFamilies = useMemo(
    () =>
      familySuggestionsFiltered.filter(
        (family) => family.suggested <= 0 && !family.redirectSuggestions?.some((item) => item.type === 'ORDER')
      ),
    [familySuggestionsFiltered]
  );
  const activeFamilyNeedRaw = activeFamilySuggestion?.suggestedRaw || 0;
  const activeFamilyNeed = Math.max(0, activeFamilyNeedRaw);
  const activeFamilyAllocated = activeFamily
    ? activeFamilyItems.reduce(
        (sum, item) => sum + (activeFamilyAllocations[String(item.productCode || '').toUpperCase()] || 0),
        0
      )
    : 0;
  const activeFamilyRemaining = Math.max(0, activeFamilyNeed - activeFamilyAllocated);
  const missingPriceCodeSet = useMemo(
    () => new Set(missingPriceProducts.map((item) => String(item.productCode || '').trim().toUpperCase()).filter(Boolean)),
    [missingPriceProducts]
  );
  const fillActiveBySuggestions = () => {
    if (!activeFamily) return;
    // Aile tavanina gore orantili dagitilmis oneri miktarlari kullanilir.
    const cappedNeeds = computeFamilyCappedNeeds(activeFamily);
    const next: Record<string, number> = {};
    getVisibleFamilyItems(activeFamily).forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      next[code] = Math.max(0, Math.trunc(cappedNeeds.perItem.get(code) || 0));
    });
    setManualAllocations((prev) => ({ ...prev, [activeFamily.id]: next }));
  };
  const clearActiveAllocations = () => {
    if (!activeFamily) return;
    const next: Record<string, number> = {};
    getVisibleFamilyItems(activeFamily).forEach((item) => {
      next[String(item.productCode || '').trim().toUpperCase()] = 0;
    });
    setManualAllocations((prev) => ({ ...prev, [activeFamily.id]: next }));
  };
  const sendRedirectSuggestionToSales = async (suggestion: FamilyRedirectSuggestion) => {
    if (!activeFamily) return;
    if (suggestion.type !== 'ORDER') {
      toast.error('Sadece alinan siparise bagli yonlendirme satis onayina gonderilebilir.');
      return;
    }
    const requestKey = `${activeFamily.id}:${suggestion.sourceCode}:${suggestion.targetCode}`;
    setSendingRedirectKey(requestKey);
    try {
      const result = await adminApi.createUcarerOrderProductChangeRequests({
        sourceProductCode: suggestion.sourceCode,
        targetProductCode: suggestion.targetCode,
        depot,
        familyId: activeFamily.id,
        familyCode: activeFamily.code || null,
        familyName: activeFamily.name,
        note: suggestion.text,
      });
      const createdCount = Number(result.data?.createdCount || 0);
      const duplicateCount = Number(result.data?.skippedDuplicateCount || 0);
      if (createdCount > 0) {
        toast.success(`${createdCount} siparis satiri satis onayina gonderildi.`);
      } else if (duplicateCount > 0) {
        toast.success('Bu yonlendirme icin bekleyen onay talebi zaten var.');
      } else {
        toast.error('Satis onayina gonderilecek acik siparis satiri bulunamadi.');
      }
      if ((result.data?.unassigned || []).length > 0) {
        toast.error('Bazi satirlar icin satis kullanicisi bulunamadi; yonetici bildirimine dustu.');
      }
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Satis onayina gonderilemedi'));
    } finally {
      setSendingRedirectKey('');
    }
  };
  const splitActiveEvenly = () => {
    if (!activeFamily) return;
    const visibleItems = getVisibleFamilyItems(activeFamily);
    if (visibleItems.length === 0) return;
    const qtyPerItem = Math.floor(activeFamilyNeed / visibleItems.length);
    let remainder = activeFamilyNeed - qtyPerItem * visibleItems.length;
    const next: Record<string, number> = {};
    visibleItems.forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const plusOne = remainder > 0 ? 1 : 0;
      remainder = Math.max(0, remainder - 1);
      next[code] = qtyPerItem + plusOne;
    });
    setManualAllocations((prev) => ({ ...prev, [activeFamily.id]: next }));
  };
  const resolveOrderUnitPrice = (productCode: string, unitPriceOverride?: unknown) => {
    const code = String(productCode || '').trim().toUpperCase();
    const override = Number(unitPriceOverride);
    if (Number.isFinite(override) && override > 0) return override;

    const manualInput = Number(String(costPInputByCode[code] || '').replace(',', '.'));
    if (Number.isFinite(manualInput) && manualInput > 0) return manualInput;

    const currentCost = Number(currentCostByCode[code] || 0);
    if (Number.isFinite(currentCost) && currentCost > 0) return currentCost;

    const row = rowByProductCode.get(code) || {};
    const rowEntries = Object.entries(row as Record<string, any>);
    const candidate = rowEntries.find(([key, value]) => {
      const keyNorm = normalizeKey(key);
      if (!keyNorm.includes('maliyet') && !keyNorm.includes('cost')) return false;
      const parsed = toNumberFlexible(value);
      return Number.isFinite(parsed) && parsed > 0;
    });
    if (candidate) {
      const parsed = toNumberFlexible(candidate[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  };

  const getProductDisplayName = (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    return String(rowByProductCode.get(code)?.[productNameColumn || ''] || '').trim() || code || '-';
  };

  const buildOrderAllocations = (): SupplierOrderAllocation[] => {
    const allocations: SupplierOrderAllocation[] = [];
    families.forEach((family) => {
      if (isFamilyCoveredByMinimum(getFamilyCoverage(family))) return;
      const familyAllocation = manualAllocations[family.id] || {};
      getVisibleFamilyItems(family).forEach((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        const qty = Math.max(0, Math.trunc(Number(familyAllocation[code] || 0)));
        if (qty > 0) {
          const supplierCodeOverride = getEffectiveSupplierCode(code) || null;
          allocations.push({
            familyId: family.id,
            productCode: code,
            quantity: qty,
            unitPriceOverride: Number.isFinite(Number(String(costPInputByCode[code] || '').replace(',', '.')))
              ? Math.max(0, Number(String(costPInputByCode[code] || '').replace(',', '.')))
              : null,
            supplierCodeOverride,
            persistSupplierOverride: Boolean(persistSupplierOverrideByCode[code]),
          });
        }
      });
    });
    nonFamilyRows.forEach((item) => {
      const rawQty = nonFamilyAllocations[item.code];
      const qty = Math.max(0, Math.trunc(Number(rawQty === '' ? 0 : rawQty || 0)));
      if (qty > 0) {
        const supplierCodeOverride = getEffectiveSupplierCode(item.code) || null;
        allocations.push({
          familyId: null,
          productCode: item.code,
          quantity: qty,
          unitPriceOverride: Number.isFinite(Number(String(costPInputByCode[item.code] || '').replace(',', '.')))
            ? Math.max(0, Number(String(costPInputByCode[item.code] || '').replace(',', '.')))
            : null,
          supplierCodeOverride,
          persistSupplierOverride: Boolean(persistSupplierOverrideByCode[item.code]),
        });
      }
    });
    return allocations;
  };
  const pendingSupplierRows = useMemo(() => {
    const grouped = new Map<
      string,
      { supplierCode: string; supplierName: string; itemCount: number; totalQuantity: number; totalAmount: number }
    >();
    pendingAllocations.forEach((row) => {
      const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
      if (!supplierCode) return;
      const found = grouped.get(supplierCode) || {
        supplierCode,
        supplierName: cariNameByCode.get(supplierCode) || supplierCode,
        itemCount: 0,
        totalQuantity: 0,
        totalAmount: 0,
      };
      const qty = Math.max(0, Math.trunc(Number(row.quantity || 0)));
      // IS 1 — cari basligindaki TL toplami: satirlarin qty*birimFiyat toplami.
      const unitPrice = resolveOrderUnitPrice(row.productCode, row.unitPriceOverride);
      found.itemCount += 1;
      found.totalQuantity += qty;
      found.totalAmount += qty * unitPrice;
      grouped.set(supplierCode, found);
    });
    return Array.from(grouped.values()).sort((a, b) => a.supplierCode.localeCompare(b.supplierCode, 'tr'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAllocations, cariNameByCode, costPInputByCode, currentCostByCode]);
  const pendingSupplierItemsByCode = useMemo(() => {
    const grouped = new Map<
      string,
      Map<string, { productCode: string; productName: string; quantity: number; unitPrice: number; total: number }>
    >();
    pendingAllocations.forEach((row) => {
      const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
      const productCode = String(row.productCode || '').trim().toUpperCase();
      const qty = Math.max(0, Math.trunc(Number(row.quantity || 0)));
      if (!supplierCode || !productCode || qty <= 0) return;
      const supplierItems =
        grouped.get(supplierCode) ||
        new Map<string, { productCode: string; productName: string; quantity: number; unitPrice: number; total: number }>();
      const existing = supplierItems.get(productCode);
      const productName = getProductDisplayName(productCode);
      const unitPrice = resolveOrderUnitPrice(productCode, row.unitPriceOverride);
      if (existing) {
        existing.quantity += qty;
        existing.total += unitPrice * qty;
        existing.unitPrice = existing.quantity > 0 ? existing.total / existing.quantity : unitPrice;
      } else {
        supplierItems.set(productCode, { productCode, productName, quantity: qty, unitPrice, total: unitPrice * qty });
      }
      grouped.set(supplierCode, supplierItems);
    });
    const result: Record<string, Array<{ productCode: string; productName: string; quantity: number; unitPrice: number; total: number }>> = {};
    grouped.forEach((items, supplierCode) => {
      result[supplierCode] = Array.from(items.values()).sort((a, b) =>
        a.productCode.localeCompare(b.productCode, 'tr')
      );
    });
    return result;
  }, [pendingAllocations, rowByProductCode, productNameColumn, costPInputByCode, currentCostByCode]);
  useEffect(() => {
    if (!seriesModalOpen) return;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const defaultDate = `${yyyy}-${mm}-${dd}`;
    setSupplierOrderConfigs((prev) => {
      const next: Record<string, { series: string; applyVAT: boolean; deliveryType: string; deliveryDate: string }> = {};
      pendingSupplierRows.forEach((row) => {
        const current = prev[row.supplierCode];
        next[row.supplierCode] = current || {
          series: '',
          applyVAT: true,
          deliveryType: 'D',
          deliveryDate: defaultDate,
        };
      });
      return next;
    });
    setPendingSupplierInputByProduct((prev) => {
      const next = { ...prev };
      pendingAllocations.forEach((alloc) => {
        const code = String(alloc.productCode || '').trim().toUpperCase();
        if (!code) return;
        if (!next[code]) {
          next[code] = String(alloc.supplierCodeOverride || '').trim().toUpperCase();
        }
      });
      return next;
    });
    // IS 1 — Cari akordeonlari VARSAYILAN ACIK. Onceden takip edilmeyen carileri acik isaretle
    // (kullanicinin manuel kapattigi carileri yeniden acmamak icin sadece bilinmeyenlere dokun).
    setExpandedSupplierRows((prev) => {
      const next = { ...prev };
      pendingSupplierRows.forEach((row) => {
        if (!(row.supplierCode in next)) next[row.supplierCode] = true;
      });
      return next;
    });
  }, [pendingSupplierRows, seriesModalOpen]);

  useEffect(() => {
    if (!seriesModalOpen || pendingSupplierRows.length === 0) return;
    let active = true;
    const supplierCodes = pendingSupplierRows.map((row) => row.supplierCode).filter(Boolean);
    (async () => {
      try {
        const result = await adminApi.getUcarerSupplierRecentSeries(supplierCodes);
        if (!active) return;
        setSupplierRecentSeriesByCode(result.data?.bySupplier || {});
      } catch {
        if (active) setSupplierRecentSeriesByCode({});
      }
    })();
    return () => {
      active = false;
    };
  }, [seriesModalOpen, pendingSupplierRows]);

  // ==================== IS 2 — Transfer Kapisi ====================
  // Onay modali acilinca satirlardaki stok kodlari icin iki deponun min/max degerleri cekilir
  // (200'luk chunk). Modal kapaninca DSV'ye cevrilen satirlar sifirlanir (modal state).
  useEffect(() => {
    if (!seriesModalOpen) {
      setPendingTransfersByCode((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      setPackPopover((prev) => (prev ? null : prev));
      return;
    }
    const codes = Array.from(
      new Set(pendingAllocations.map((row) => String(row.productCode || '').trim().toUpperCase()).filter(Boolean))
    );
    const missing = codes.filter((code) => !ucarerMinMaxByCode[code]);
    if (missing.length === 0) return;
    let active = true;
    (async () => {
      setUcarerMinMaxLoading(true);
      try {
        const merged: Record<string, UcarerDepotMinMaxEntry> = {};
        for (let i = 0; i < missing.length; i += 200) {
          const chunk = missing.slice(i, i + 200);
          const result = await adminApi.getUcarerDepotMinMax(chunk);
          Object.entries(result?.data || {}).forEach(([code, value]) => {
            const normalized = String(code || '').trim().toUpperCase();
            if (normalized && value) merged[normalized] = value as UcarerDepotMinMaxEntry;
          });
        }
        if (active) setUcarerMinMaxByCode((prev) => ({ ...prev, ...merged }));
      } catch {
        // Min/max cekilemezse transfer rozetleri gosterilmez; siparis akisi etkilenmez.
      } finally {
        if (active) setUcarerMinMaxLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesModalOpen, pendingAllocations]);

  const getPendingQtyForCode = (productCode: string): number => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return 0;
    return pendingAllocations
      .filter((row) => String(row.productCode || '').trim().toUpperCase() === code)
      .reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row.quantity || 0))), 0);
  };

  // Karsi depo (siparis deposunun tersi) stok fazlasi kontrolu:
  // karsiFazla = karsiDepoStok - karsiDepoMin; karsiFazla >= satirMiktari*0.5 ise DSV onerilir.
  const getTransferGateInfo = (
    productCode: string
  ): {
    counterDepotLabel: string;
    counterStock: number;
    counterMin: number;
    counterExcess: number;
    pendingQty: number;
    transferQty: number;
    eligible: boolean;
  } | null => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return null;
    const minMax = ucarerMinMaxByCode[code];
    if (!minMax) return null;
    const counterColumn = depot === 'MERKEZ' ? topcaDepoStockColumn : merkezDepoStockColumn;
    if (!counterColumn) return null;
    const row = rowByProductCode.get(code);
    if (!row) return null;
    const counterDepotNo: '1' | '6' = depot === 'MERKEZ' ? '6' : '1';
    const counterStock = toNumberFlexible(row[counterColumn]);
    const counterMin = Math.max(0, Number(minMax[counterDepotNo]?.min ?? 0));
    // Daha once DSV'ye cevrilmis miktar fazladan DUSULUR; yoksa ust uste tiklamada
    // karsi depo min altina inecek kadar transfer onerilirdi.
    const alreadyMoved = Math.max(0, Math.trunc(Number(pendingTransfersByCode[code]?.quantity || 0)));
    const counterExcess = Math.floor(counterStock - counterMin) - alreadyMoved;
    const pendingQty = getPendingQtyForCode(code);
    if (pendingQty <= 0) return null;
    const transferQty = Math.max(0, Math.min(pendingQty, counterExcess));
    const eligible = counterExcess > 0 && counterExcess >= pendingQty * 0.5;
    return {
      counterDepotLabel: depot === 'MERKEZ' ? 'Topca' : 'Merkez',
      counterStock,
      counterMin,
      counterExcess,
      pendingQty,
      transferQty,
      eligible,
    };
  };

  // "DSV'ye cevir": satir tedarikci setinden cikarilir, transfer setine eklenir.
  // miktar = min(satirMiktari, karsiFazla); kalan miktar tedarikci satirinda kalir.
  const convertPendingLineToTransfer = (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    const info = getTransferGateInfo(code);
    if (!info || !info.eligible || info.transferQty <= 0) {
      toast.error('Bu satir icin transfer kosullari saglanmiyor.');
      return;
    }
    let remaining = info.transferQty;
    const removedPortions: SupplierOrderAllocation[] = [];
    const nextAllocations: SupplierOrderAllocation[] = [];
    pendingAllocations.forEach((row) => {
      const rowCode = String(row.productCode || '').trim().toUpperCase();
      if (rowCode !== code || remaining <= 0) {
        nextAllocations.push(row);
        return;
      }
      const qty = Math.max(0, Math.trunc(Number(row.quantity || 0)));
      const take = Math.min(qty, remaining);
      remaining -= take;
      if (take > 0) removedPortions.push({ ...row, quantity: take });
      if (qty - take > 0) nextAllocations.push({ ...row, quantity: qty - take });
    });
    if (removedPortions.length === 0) {
      toast.error('Transfere aktarilacak miktar bulunamadi.');
      return;
    }
    const movedQty = removedPortions.reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row.quantity || 0))), 0);
    const unitPrice = resolveOrderUnitPrice(code, removedPortions[0]?.unitPriceOverride);
    setPendingAllocations(nextAllocations);
    setPendingTransfersByCode((prev) => {
      const existing = prev[code];
      return {
        ...prev,
        [code]: {
          quantity: (existing?.quantity || 0) + movedQty,
          unitPrice,
          restored: [...(existing?.restored || []), ...removedPortions],
        },
      };
    });
    const leftover = Math.max(0, info.pendingQty - movedQty);
    toast.success(
      `${code}: ${movedQty.toLocaleString('tr-TR')} adet DSV transfer setine alindi.${leftover > 0 ? ` Kalan ${leftover.toLocaleString('tr-TR')} adet tedarikci siparisinde kaldi.` : ''}`
    );
  };

  // "Geri al": transfer setindeki satiri tedarikci siparis setine geri tasir (modal state icinde).
  const undoPendingTransfer = (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    const entry = pendingTransfersByCode[code];
    if (!entry) return;
    setPendingAllocations((prev) => {
      const next = [...prev];
      entry.restored.forEach((portion) => {
        const idx = next.findIndex(
          (row) =>
            String(row.productCode || '').trim().toUpperCase() === code &&
            String(row.supplierCodeOverride || '').trim().toUpperCase() ===
              String(portion.supplierCodeOverride || '').trim().toUpperCase() &&
            String(row.familyId || '') === String(portion.familyId || '')
        );
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            quantity: Math.max(0, Math.trunc(Number(next[idx].quantity || 0))) + Math.max(0, Math.trunc(Number(portion.quantity || 0))),
          };
        } else {
          next.push({ ...portion });
        }
      });
      return next;
    });
    setPendingTransfersByCode((prev) => {
      const nextMap = { ...prev };
      delete nextMap[code];
      return nextMap;
    });
    toast.success(`${code} tedarikci siparis setine geri alindi.`);
  };

  const pendingTransferRows = useMemo<PendingTransferRow[]>(
    () =>
      Object.entries(pendingTransfersByCode)
        .map(([code, entry]) => ({
          productCode: code,
          productName: getProductDisplayName(code),
          quantity: entry.quantity,
          unitPrice: entry.unitPrice,
          total: entry.quantity * entry.unitPrice,
        }))
        .filter((row) => row.quantity > 0)
        .sort((a, b) => a.productCode.localeCompare(b.productCode, 'tr')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingTransfersByCode, rowByProductCode, productNameColumn]
  );

  const pendingTransferSummary = useMemo(
    () => ({
      count: pendingTransferRows.length,
      totalQuantity: pendingTransferRows.reduce((sum, row) => sum + row.quantity, 0),
      totalAmount: pendingTransferRows.reduce((sum, row) => sum + row.total, 0),
    }),
    [pendingTransferRows]
  );

  // ==================== IS 3 — Koliye tamamla + koli ici tanimlama ====================
  // Koli-ici bilgi (yon + koli-ici adet + 2. birim adi). HER IKI yon icin tanimliysa doner.
  //   direction 'largerUnit2'  : NEGATIF katsayi -> 2. birim buyuk paket (ana birim kucuk) -> yuvarlanabilir
  //   direction 'largerMain'   : POZITIF katsayi -> ana birim zaten koli -> yuvarlanmaz (sadece bilgi)
  const getPackInfo = (
    productCode: string
  ): { packQty: number; rawFactor: number; direction: 'largerUnit2' | 'largerMain'; unit2Name: string } | null => {
    const code = String(productCode || '').trim().toUpperCase();
    // Ham isaretli katsayi oncelikli; yoksa packQtyByCode'dan (ayni degeri tutar).
    const raw = Number(packFactorRawByCode[code] ?? packQtyByCode[code] ?? 0);
    const packQty = Math.abs(raw);
    if (!Number.isFinite(packQty) || packQty <= 0) return null;
    return {
      packQty,
      rawFactor: raw,
      direction: raw < 0 ? 'largerUnit2' : 'largerMain',
      unit2Name: String(unit2NameByCode[code] || '').trim() || 'KOLİ',
    };
  };

  // Koli ici (unit2Factor) tanimliysa asagi/yukari koli katina yuvarlama secenekleri.
  // POZITIF katsayida (ana birim zaten koli) yuvarlama ONERILMEZ: null doner; girilen miktar zaten kolidir.
  const getPackRounding = (
    productCode: string,
    qty: number | ''
  ): { packQty: number; down: number; up: number; downBoxes: number; upBoxes: number; isExact: boolean } | null => {
    const info = getPackInfo(productCode);
    if (!info) return null;
    // Ana birim zaten koli (pozitif katsayi): girilen miktar koli sayilir, YUVARLANMAZ.
    if (info.direction === 'largerMain') return null;
    const packQty = info.packQty;
    const safeQty = Math.max(0, Math.trunc(Number(qty === '' ? 0 : qty || 0)));
    const downBoxes = Math.floor(safeQty / packQty);
    const upBoxes = Math.ceil(safeQty / packQty);
    const down = Math.round(downBoxes * packQty);
    const up = Math.round(upBoxes * packQty);
    return { packQty, down, up, downBoxes, upBoxes, isExact: Math.abs(safeQty - down) < 0.0001 };
  };

  // Onay modalindaki toplam miktari gunceller (ayni urun birden fazla dagitim satirinda olabilir).
  const setPendingTotalQuantityForProduct = (productCode: string, quantity: number) => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return;
    const target = Math.max(0, Math.trunc(Number(quantity || 0)));
    setPendingAllocations((prev) => {
      const rows = prev.filter((row) => String(row.productCode || '').trim().toUpperCase() === code);
      if (rows.length === 0) return prev;
      const currentTotal = rows.reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row.quantity || 0))), 0);
      let deltaLeft = target - currentTotal;
      if (deltaLeft === 0) return prev;
      const next: SupplierOrderAllocation[] = [];
      prev.forEach((row) => {
        if (String(row.productCode || '').trim().toUpperCase() !== code) {
          next.push(row);
          return;
        }
        let qty = Math.max(0, Math.trunc(Number(row.quantity || 0)));
        if (deltaLeft > 0) {
          qty += deltaLeft;
          deltaLeft = 0;
        } else if (deltaLeft < 0) {
          const take = Math.min(qty, -deltaLeft);
          qty -= take;
          deltaLeft += take;
        }
        if (qty > 0) next.push({ ...row, quantity: qty });
      });
      return next;
    });
  };

  // Popover'daki asagi/yukari secimini ilgili input'a uygular.
  const applyPackPopoverValue = (value: number) => {
    const target = packPopover;
    if (!target) return;
    const qty = Math.max(0, Math.trunc(Number(value || 0)));
    if (target.scope === 'FAMILY' && target.familyId) {
      setManualAllocation(target.familyId, target.code, qty);
    } else if (target.scope === 'NONFAMILY') {
      setNonFamilyAllocations((prev) => ({ ...prev, [target.code]: qty }));
    } else if (target.scope === 'PENDING') {
      setPendingTotalQuantityForProduct(target.code, qty);
    }
    setPackPopover(null);
  };

  // Koli ici tanimlama: once GET ile mevcut 2. birim degerleri okunur (PUT tum alanlari yazar).
  const openPackDefineModal = async (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    if (!code) return;
    setPackPopover(null);
    setPackDefineState({
      code,
      name: 'KOLİ',
      factor: '',
      weightKg: '',
      widthMm: '',
      lengthMm: '',
      heightMm: '',
      loading: true,
      saving: false,
    });
    try {
      const res = await apiClient.get(`/admin/product-dimensions/products/${encodeURIComponent(code)}`);
      const unit2 = (res.data?.product?.units || []).find((unit: any) => Number(unit?.index) === 2);
      const rawFactor = Number(unit2?.factor || 0);
      const existingFactor = Math.abs(rawFactor);
      const unit2Name = String(unit2?.name || '').trim();
      // Ham isaretli katsayi + 2. birim adini tazele (yon rozeti/duzenleme icin).
      if (Number.isFinite(rawFactor) && rawFactor !== 0) {
        setPackFactorRawByCode((prev) => ({ ...prev, [code]: rawFactor }));
        setPackQtyByCode((prev) => ({ ...prev, [code]: rawFactor }));
      }
      if (unit2Name) setUnit2NameByCode((prev) => ({ ...prev, [code]: unit2Name }));
      setPackDefineState((prev) =>
        prev && prev.code === code
          ? {
              ...prev,
              loading: false,
              name: unit2Name || 'KOLİ',
              factor: existingFactor > 0 ? String(existingFactor) : '',
              weightKg: Number(unit2?.weightKg || 0) > 0 ? String(Number(unit2.weightKg)) : '',
              widthMm: Number(unit2?.widthMm || 0) > 0 ? String(Number(unit2.widthMm)) : '',
              lengthMm: Number(unit2?.lengthMm || 0) > 0 ? String(Number(unit2.lengthMm)) : '',
              heightMm: Number(unit2?.heightMm || 0) > 0 ? String(Number(unit2.heightMm)) : '',
            }
          : prev
      );
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Urun birim bilgileri okunamadi'));
      setPackDefineState((prev) => (prev && prev.code === code ? null : prev));
    }
  };

  const closePackDefineModal = () => setPackDefineState(null);

  const setPackDefineField = (
    field: 'name' | 'factor' | 'weightKg' | 'widthMm' | 'lengthMm' | 'heightMm',
    value: string
  ) => {
    setPackDefineState((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  // PUT /admin/product-dimensions/products/:code — SADECE 2. birim gonderilir; PUT gonderilen
  // birimin TUM alanlarini yazar, o yuzden GET'ten okunan kg/olcu degerleri aynen geri gonderilir.
  const savePackDefine = async () => {
    const state = packDefineState;
    if (!state || state.loading || state.saving) return;
    const code = state.code;
    const name = String(state.name || '').trim().toUpperCase();
    if (!name) {
      toast.error('Birim adi zorunlu.');
      return;
    }
    if (name.length > 10) {
      toast.error('Birim adi en fazla 10 karakter olabilir.');
      return;
    }
    const factor = Number(String(state.factor || '').replace(',', '.'));
    if (!Number.isFinite(factor) || factor <= 0) {
      toast.error('Gecerli bir koli ici adet girin (0 olamaz).');
      return;
    }
    const parseField = (raw: string) => {
      const parsed = Number(String(raw || '').replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };
    const weightKg = parseField(state.weightKg);
    const widthMm = parseField(state.widthMm);
    const lengthMm = parseField(state.lengthMm);
    const heightMm = parseField(state.heightMm);
    const dimensionCount = [widthMm, lengthMm, heightMm].filter((value) => value > 0).length;
    if (dimensionCount > 0 && dimensionCount < 3) {
      toast.error('En, boy ve yukseklik ya birlikte girilmeli ya da bos birakilmali.');
      return;
    }
    // KRITIK ISARET KURALI: urunun zaten bir 2. birim katsayisi varsa MEVCUT ISARETI KORU.
    //   newFactor = sign(existingRawFactor) * |input|
    // Aksi halde (pozitif katsayili ana-birim-koli urun) her zaman -abs yazmak semantigi TERS cevirirdi.
    // Sadece SIFIRDAN yeni tanimda (mevcut 2. birim yok) varsayilan NEGATIF (-abs) yazilir (eskisi gibi).
    const existingRaw = Number(packFactorRawByCode[code] || 0);
    const hasExisting = Number.isFinite(existingRaw) && existingRaw !== 0;
    const sign = hasExisting ? Math.sign(existingRaw) : -1;
    const signedFactor = sign * Math.abs(factor);
    const directionNote = signedFactor > 0
      ? '(ana birim koli — girilen sayi ana birimin ici)'
      : '(2. birim koli — girilen sayi 1 kolinin ici)';
    const confirmed = window.confirm(
      `${code} stok kartinda 2. birim "${name}" (koli ici ${factor.toLocaleString('tr-TR')}) olarak Mikro'ya YAZILACAK. ${directionNote}\n\nSadece 2. birim alanlari guncellenir; diger birimler ve raf kodu degismez. Onayliyor musunuz?`
    );
    if (!confirmed) return;
    setPackDefineState((prev) => (prev ? { ...prev, saving: true } : prev));
    try {
      // Isaret yukarida hesaplandi (mevcut varsa korunur, yeni tanimda -abs).
      await apiClient.put(`/admin/product-dimensions/products/${encodeURIComponent(code)}`, {
        units: [{ index: 2, name, factor: signedFactor, weightKg, widthMm, lengthMm, heightMm }],
      });
      // Lokal haritalari tazele: packQtyByCode koliye-yuvarla icin abs kullanir; packFactorRawByCode
      // ham isaretli tutar (yon rozeti icin); unit2NameByCode ad guncellenir.
      setPackQtyByCode((prev) => ({ ...prev, [code]: signedFactor }));
      setPackFactorRawByCode((prev) => ({ ...prev, [code]: signedFactor }));
      setUnit2NameByCode((prev) => ({ ...prev, [code]: name }));
      toast.success(`${code} icin koli ici ${factor.toLocaleString('tr-TR')} olarak Mikro'ya kaydedildi.`);
      setPackDefineState(null);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Koli ici kaydedilemedi'));
      setPackDefineState((prev) => (prev ? { ...prev, saving: false } : prev));
    }
  };

  // ==================== IS 4 — Aile Kapsama Radari + Aday Aile ====================
  // Oneri tutari (KDV haric maliyet x oneri) uzerinden aile korumali / aile disi kirilimi.
  const familyCoverageSummary = useMemo(() => {
    let familyAmount = 0;
    families.forEach((family) => {
      const capped = computeFamilyCappedNeeds(family);
      capped.perItem.forEach((qty, code) => {
        const unitCost = Number(currentCostByCode[code] || 0);
        if (qty > 0 && Number.isFinite(unitCost) && unitCost > 0) familyAmount += qty * unitCost;
      });
    });
    let nonFamilyAmount = 0;
    nonFamilyRows.forEach((item) => {
      const qty = Math.max(0, Math.trunc(getSuggestedQty(item.row)));
      const unitCost = Number(currentCostByCode[item.code] || 0);
      if (qty > 0 && Number.isFinite(unitCost) && unitCost > 0) nonFamilyAmount += qty * unitCost;
    });
    const totalAmount = familyAmount + nonFamilyAmount;
    return {
      familyAmount,
      nonFamilyAmount,
      totalAmount,
      coveragePct: totalAmount > 0 ? (familyAmount / totalAmount) * 100 : 0,
      nonFamilyCount: nonFamilyRows.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families, nonFamilyRows, currentCostByCode, rowByProductCode, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, depotQtyColumn, minQtyColumn, maxQtyColumn, incomingOrderColumn, outgoingOrderColumn]);

  // Gorunur (filtrelenmis) aile-disi satirlarin kodlari icin aday aile sorgusu (300'luk chunk, cache'li).
  useEffect(() => {
    if (orderPanelTab !== 'work' || !panelColumns.familyCandidate) return;
    const codes = filteredNonFamilyRows
      .map((entry) => entry.code)
      .filter((code) => code && !familyCandidateQueriedRef.current.has(code));
    if (codes.length === 0) return;
    const timer = setTimeout(async () => {
      codes.forEach((code) => familyCandidateQueriedRef.current.add(code));
      setFamilyCandidateLoading(true);
      try {
        const merged: Record<string, FamilyCandidate | null> = {};
        for (let i = 0; i < codes.length; i += 300) {
          const chunk = codes.slice(i, i + 300);
          const result = await adminApi.getFamilyCandidates(chunk);
          chunk.forEach((code) => {
            const hit = (result?.data || {})[code];
            merged[code] = hit
              ? {
                  familyId: String(hit.familyId || ''),
                  familyName: String(hit.familyName || ''),
                  score: Number(hit.score || 0),
                  matchedProductName: hit.matchedProductName || null,
                }
              : null;
          });
        }
        // Sonuc koda bagli bir cache'tir, filtre degisse de her zaman commit edilir;
        // aksi halde queriedRef isaretli ama sonucu yazilmamis kodlar '...'de takilirdi.
        setFamilyCandidatesByCode((prev) => ({ ...prev, ...merged }));
      } catch {
        // Hata olursa ayni kodlar tekrar sorgulanabilsin.
        codes.forEach((code) => familyCandidateQueriedRef.current.delete(code));
      } finally {
        setFamilyCandidateLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNonFamilyRows, orderPanelTab, panelColumns.familyCandidate]);

  // [Ekle]: confirm -> addProductToFamily -> basarida aileler yenilenir (satir aile tarafina gecer).
  const addNonFamilyProductToFamily = async (productCode: string) => {
    const code = String(productCode || '').trim().toUpperCase();
    const candidate = familyCandidatesByCode[code];
    if (!code || !candidate || !candidate.familyId) return;
    const confirmed = window.confirm(
      `${code} urunu "${candidate.familyName}" ailesine eklensin mi?\n\nEklenince urun aile onerilerine dahil olur ve aile-disi listeden cikar.`
    );
    if (!confirmed) return;
    setAddingToFamilyByCode((prev) => ({ ...prev, [code]: true }));
    try {
      await adminApi.addProductToFamily(candidate.familyId, {
        productCode: code,
        productName: getProductDisplayName(code),
      });
      toast.success(`${code} "${candidate.familyName}" ailesine eklendi.`);
      setAddedToFamilyByCode((prev) => ({ ...prev, [code]: candidate.familyName }));
      await loadFamilies();
      refreshOperationLogsIfOpen();
    } catch (error: any) {
      if (error?.response?.status === 409) {
        toast(`${code} zaten "${candidate.familyName}" ailesinin uyesi.`);
        setAddedToFamilyByCode((prev) => ({ ...prev, [code]: candidate.familyName }));
        await loadFamilies();
      } else {
        toast.error(getApiErrorMessage(error, 'Urun aileye eklenemedi'));
      }
    } finally {
      setAddingToFamilyByCode((prev) => ({ ...prev, [code]: false }));
    }
  };

  const createSupplierOrders = async () => {
    const allocations = buildOrderAllocations();

    if (allocations.length === 0) {
      toast.error('Siparis olusturmak icin once dagitim miktari girin.');
      return;
    }
    const missingPriceMap = new Map<string, MissingPriceProduct>();
    allocations.forEach((row) => {
      const code = String(row.productCode || '').trim().toUpperCase();
      if (!code) return;
      const unitPrice = resolveOrderUnitPrice(code, row.unitPriceOverride);
      if (unitPrice > 0) return;
      const existing = missingPriceMap.get(code);
      if (existing) {
        existing.quantity += Math.max(0, Number(row.quantity || 0));
      } else {
        missingPriceMap.set(code, {
          productCode: code,
          productName: getProductDisplayName(code),
          quantity: Math.max(0, Number(row.quantity || 0)),
        });
      }
    });
    if (missingPriceMap.size > 0) {
      const missing = Array.from(missingPriceMap.values());
      setMissingPriceProducts(missing);
      setOrderPanelTab('work');
      toast.error(
        `Fiyati olmayan stoklar var: ${missing
          .slice(0, 8)
          .map((item) => item.productCode)
          .join(', ')}${missing.length > 8 ? '...' : ''}`
      );
      return;
    }
    setMissingPriceProducts([]);
    setPendingAllocations(allocations);
    const defaults: Record<string, { series: string; applyVAT: boolean; deliveryType: string; deliveryDate: string }> = {};
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const defaultDate = `${yyyy}-${mm}-${dd}`;
    allocations.forEach((row) => {
      const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
      if (!supplierCode || defaults[supplierCode]) return;
      defaults[supplierCode] = {
        series: '',
        applyVAT: true,
        deliveryType: 'D',
        deliveryDate: defaultDate,
      };
    });
    setSupplierOrderConfigs(defaults);
    setExpandedSupplierRows({});
    setSeriesModalOpen(true);
  };

  const createDepotTransferOrder = async () => {
    const selectedCodes = Object.entries(selectedTransferByCode)
      .filter(([, selected]) => selected)
      .map(([code]) => String(code || '').trim().toUpperCase())
      .filter(Boolean);
    if (selectedCodes.length === 0) {
      toast.error('Depolar arasi siparis icin once satir secin.');
      return;
    }

    const transferAllocations: Array<{ productCode: string; quantity: number }> = [];
    const selectedSet = new Set(selectedCodes);
    families.forEach((family) => {
      if (isFamilyCoveredByMinimum(getFamilyCoverage(family))) return;
      const familyAllocation = manualAllocations[family.id] || {};
      getVisibleFamilyItems(family).forEach((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        if (!selectedSet.has(code)) return;
        const qty = Math.max(0, Math.trunc(Number(familyAllocation[code] || 0)));
        if (qty > 0) transferAllocations.push({ productCode: code, quantity: qty });
      });
    });
    nonFamilyRows.forEach((item) => {
      const code = String(item.code || '').trim().toUpperCase();
      if (!selectedSet.has(code)) return;
      const qty = Math.max(0, Math.trunc(Number(nonFamilyAllocations[code] || 0)));
      if (qty > 0) transferAllocations.push({ productCode: code, quantity: qty });
    });

    if (transferAllocations.length === 0) {
      toast.error('Secili satirlarda dagitim miktari yok.');
      return;
    }

    setCreatingTransferOrder(true);
    try {
      const result = await adminApi.createDepotTransferOrder({
        depot,
        series: 'DSV',
        allocations: transferAllocations,
      });
      toast.success(`Depolar arasi siparis olustu: ${result.data.orderNumber}`);
      const clearCodes = new Set(transferAllocations.map((row) => row.productCode));
      setManualAllocations((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((familyId) => {
          const familyAlloc = { ...(next[familyId] || {}) };
          Object.keys(familyAlloc).forEach((code) => {
            if (clearCodes.has(String(code).toUpperCase())) familyAlloc[code] = 0;
          });
          next[familyId] = familyAlloc;
        });
        return next;
      });
      setNonFamilyAllocations((prev) => {
        const next: Record<string, number | ''> = { ...prev };
        Object.keys(next).forEach((code) => {
          if (clearCodes.has(String(code).toUpperCase())) next[code] = '';
        });
        return next;
      });
      setSelectedTransferByCode((prev) => {
        const next = { ...prev };
        clearCodes.forEach((code) => {
          next[code] = false;
        });
        return next;
      });
      refreshOperationLogsIfOpen();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Depolar arasi siparis olusturulamadi'));
    } finally {
      setCreatingTransferOrder(false);
    }
  };

  // IS 1 — Hala UYGUN ama cevrilmemis DSV onerisi olan satirlari bul (karsi depoda fazla var).
  const findEligibleUnconvertedDsvLines = (): Array<{
    productCode: string;
    productName: string;
    transferQty: number;
    counterDepotLabel: string;
  }> => {
    const seen = new Set<string>();
    const lines: Array<{ productCode: string; productName: string; transferQty: number; counterDepotLabel: string }> = [];
    pendingAllocations.forEach((row) => {
      const code = String(row.productCode || '').trim().toUpperCase();
      if (!code || seen.has(code)) return;
      // Zaten DSV setine alinmis satirlar tekrar uyari uretmez.
      if (pendingTransfersByCode[code]) return;
      const gate = getTransferGateInfo(code);
      if (gate && gate.eligible && gate.transferQty > 0) {
        seen.add(code);
        lines.push({
          productCode: code,
          productName: getProductDisplayName(code),
          transferQty: gate.transferQty,
          counterDepotLabel: gate.counterDepotLabel,
        });
      }
    });
    return lines;
  };

  // Kullanici "Siparisleri Olustur"a bastiginda once DSV kapisi kontrol edilir; uygun ama
  // cevrilmemis satirlar varsa modal-ici uyari acilir. Uyari onaylanirsa dogrudan gonderim yapilir.
  const submitCreateSupplierOrders = async () => {
    if (creatingOrders) return;
    const eligibleLines = findEligibleUnconvertedDsvLines();
    if (eligibleLines.length > 0) {
      setDsvWarningLines(eligibleLines);
      return;
    }
    await doSubmitCreateSupplierOrders();
  };

  const doSubmitCreateSupplierOrders = async () => {
    setDsvWarningLines(null);
    // Transfer Kapisi: DSV'ye cevrilen satirlar tedarikci siparisi yerine depolar-arasi siparis olur.
    const transferLines = pendingTransferRows
      .map((row) => ({ productCode: row.productCode, quantity: Math.max(0, Math.trunc(Number(row.quantity || 0))) }))
      .filter((row) => row.quantity > 0);
    if (!pendingAllocations.length && transferLines.length === 0) {
      toast.error('Siparis olusturmak icin dagitim bulunamadi.');
      return;
    }
    if (pendingAllocations.length > 0) {
      const invalidSupplier = pendingSupplierRows.find((row) => {
        const cfg = supplierOrderConfigs[row.supplierCode];
        return !cfg || !String(cfg.series || '').trim();
      });
      if (invalidSupplier) {
        toast.error(`Seri zorunlu: ${invalidSupplier.supplierCode}`);
        return;
      }
    }

    setCreatingOrders(true);
    try {
      // Once DSV transfer olusturulur; basarisiz olursa tedarikci siparisleri de OLUSTURULMAZ
      // (kullanici tekrar dener, cift evrak riski yok).
      if (transferLines.length > 0) {
        try {
          const transferResult = await adminApi.createDepotTransferOrder({
            depot,
            series: 'DSV',
            allocations: transferLines,
          });
          toast.success(`Transfer Kapisi: DSV depolar-arasi siparis olustu: ${transferResult.data.orderNumber}`);
          // DSV'ye cevrilen porsiyonlar kaynak dagitim inputlarindan DUSULUR (tam sifirlama DEGIL);
          // kismi cevirmede tedarikci tarafinda kalan miktar korunur, tekrar 'Toplu Siparis Olustur'
          // calistirilirsa DSV'lesen miktar ikinci kez tedarikci siparisine girmez.
          const familyDeduction: Record<string, Record<string, number>> = {};
          const nonFamilyDeduction: Record<string, number> = {};
          Object.values(pendingTransfersByCode).forEach((entry) => {
            (entry.restored || []).forEach((portion) => {
              const portionCode = String(portion.productCode || '').trim().toUpperCase();
              const portionQty = Math.max(0, Math.trunc(Number(portion.quantity || 0)));
              if (!portionCode || portionQty <= 0) return;
              const familyId = String(portion.familyId || '');
              if (familyId) {
                const familyMap = familyDeduction[familyId] || (familyDeduction[familyId] = {});
                familyMap[portionCode] = (familyMap[portionCode] || 0) + portionQty;
              } else {
                nonFamilyDeduction[portionCode] = (nonFamilyDeduction[portionCode] || 0) + portionQty;
              }
            });
          });
          if (Object.keys(familyDeduction).length > 0) {
            setManualAllocations((prev) => {
              const next = { ...prev };
              Object.entries(familyDeduction).forEach(([familyId, byCode]) => {
                const familyAlloc = { ...(next[familyId] || {}) };
                Object.keys(familyAlloc).forEach((allocCode) => {
                  const deduct = byCode[String(allocCode).trim().toUpperCase()];
                  if (!deduct) return;
                  familyAlloc[allocCode] = Math.max(
                    0,
                    Math.trunc(Number(familyAlloc[allocCode] || 0)) - deduct
                  );
                });
                next[familyId] = familyAlloc;
              });
              return next;
            });
          }
          if (Object.keys(nonFamilyDeduction).length > 0) {
            setNonFamilyAllocations((prev) => {
              const next: Record<string, number | ''> = { ...prev };
              Object.keys(next).forEach((allocCode) => {
                const deduct = nonFamilyDeduction[String(allocCode).trim().toUpperCase()];
                if (!deduct) return;
                const raw = next[allocCode];
                const remaining = Math.max(0, Math.trunc(Number(raw === '' ? 0 : raw || 0)) - deduct);
                next[allocCode] = remaining > 0 ? remaining : '';
              });
              return next;
            });
          }
          setPendingTransfersByCode({});
          refreshOperationLogsIfOpen();
        } catch (transferError: any) {
          toast.error(
            getApiErrorMessage(transferError, 'DSV transfer siparisi olusturulamadi') +
              (pendingAllocations.length > 0 ? ' Tedarikci siparisleri OLUSTURULMADI; tekrar deneyin.' : ''),
            { duration: 12000 }
          );
          return;
        }
      }
      if (pendingAllocations.length === 0) {
        // Sadece transfer vardi; modal kapanir. Taslak temizlenir (is tamamlandi).
        setSeriesModalOpen(false);
        setSupplierOrderConfigs({});
        clearOrderDraft();
        return;
      }
      const result = await adminApi.createSupplierOrdersFromFamilyAllocations({
        depot,
        supplierConfigs: Object.fromEntries(
          pendingSupplierRows.map((row) => {
            const cfg = supplierOrderConfigs[row.supplierCode] || {
              series: '',
              applyVAT: true,
              deliveryType: 'D',
              deliveryDate: '',
            };
            return [
              row.supplierCode,
              {
                series: String(cfg.series || '').trim().toUpperCase(),
                applyVAT: Boolean(cfg.applyVAT),
                deliveryType: String(cfg.deliveryType || '').trim(),
                deliveryDate: String(cfg.deliveryDate || '').trim() || null,
              },
            ];
          })
        ),
        allocations: pendingAllocations,
      });
      const created = result.data?.createdOrders || [];
      const failed = result.data?.failedOrders || [];
      if (created.length === 0) {
        toast.error('Siparis olusturulamadi.');
        return;
      }
      toast.success(`${created.length} tedarikci icin siparis olusturuldu.`);
      const orderList = created.map((row) => `${row.supplierCode}: ${row.orderNumber}`).join(' | ');
      if (orderList) {
        toast(orderList, { duration: 9000 });
      }
      created
        .filter((row) => row.warning)
        .forEach((row) => {
          toast.error(`${row.supplierCode} ${row.orderNumber}: ${row.warning}`, { duration: 12000 });
        });

      const createdSupplierSet = new Set(
        created.map((row) => String(row.supplierCode || '').trim().toUpperCase())
      );
      const createdAllocations = pendingAllocations.filter((row) =>
        createdSupplierSet.has(String(row.supplierCodeOverride || '').trim().toUpperCase())
      );
      setLastCreatedOrders(created);
      setLastCreatedAllocations(createdAllocations);
      const batch: CreatedSupplierOrderBatch = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        depot,
        orders: created,
        lines: buildCreatedOrderLines(createdAllocations),
      };
      setCreatedOrderHistory((prev) => [batch, ...prev].slice(0, 50));
      setCreatedOrdersModalOpen(true);

      if (failed.length > 0) {
        // Kismi basari: olusan evraklarin dagitimlari listeden CIKARILIR, modal acik kalir;
        // operator sadece hatali cariler icin tekrar dener (cift evrak riski onlenir).
        const remainingAllocations = pendingAllocations.filter(
          (row) => !createdSupplierSet.has(String(row.supplierCodeOverride || '').trim().toUpperCase())
        );
        setPendingAllocations(remainingAllocations);
        // Olusan urunlerin dagitim girisleri de sifirlanir ki 'Toplu Siparis Olustur'
        // tekrar calistirilirsa ayni urunler ikinci kez evraklasmasin.
        const createdProductCodes = new Set(
          createdAllocations.map((row) => String(row.productCode || '').trim().toUpperCase())
        );
        setManualAllocations((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((familyId) => {
            const familyAlloc = { ...(next[familyId] || {}) };
            Object.keys(familyAlloc).forEach((productCode) => {
              if (createdProductCodes.has(String(productCode).toUpperCase())) familyAlloc[productCode] = 0;
            });
            next[familyId] = familyAlloc;
          });
          return next;
        });
        setNonFamilyAllocations((prev) => {
          const next: Record<string, number | ''> = { ...prev };
          Object.keys(next).forEach((productCode) => {
            if (createdProductCodes.has(String(productCode).toUpperCase())) next[productCode] = '';
          });
          return next;
        });
        toast.error(
          `Su cariler icin siparis OLUSMADI: ${failed
            .map((row) => `${row.supplierCode} (${row.error})`)
            .join(' | ')}`,
          { duration: 15000 }
        );
        toast(
          `Su evraklar OLUSTU, tekrar GONDERMEYIN: ${orderList}. Listede sadece hatali cariler birakildi.`,
          { duration: 15000 }
        );
      } else {
        setSeriesModalOpen(false);
        setPendingAllocations([]);
        setSupplierOrderConfigs({});
        // Tum siparisler basariyla olustu -> taslagi temizle.
        clearOrderDraft();
      }
      refreshOperationLogsIfOpen();
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Tedarikci siparisleri olusturulamadi'));
    } finally {
      setCreatingOrders(false);
    }
  };

  const resolveImageUrl = (src: string): string | null => {
    if (!src) return null;
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    if (typeof window === 'undefined') return src;
    const base = window.location.origin || '';
    return `${base}${src.startsWith('/') ? '' : '/'}${src}`;
  };
  const loadImageData = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };
  const getImageFormat = (dataUrl: string) => (dataUrl.includes('image/png') ? 'PNG' : 'JPEG');
  const drawPdfHeader = async (doc: jsPDF, title: string, subTitle: string) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, pageWidth, 26, 'F');
    const logoData = await loadImageData(resolveImageUrl('/quote-logo.png') || '');
    if (logoData) {
      doc.addImage(logoData, getImageFormat(logoData), 12, 4, 44, 18);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(cleanPdfText(title), 60, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(cleanPdfText(subTitle), 60, 17);
    doc.text(cleanPdfText(new Date().toLocaleString('tr-TR')), pageWidth - 12, 17, { align: 'right' });
  };
  const buildLinesBySupplier = () => {
    const linesBySupplier = new Map<string, Array<{ productCode: string; productName: string; quantity: number; unitPrice: number; total: number }>>();
    lastCreatedAllocations.forEach((row) => {
      const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
      const productCode = String(row.productCode || '').trim().toUpperCase();
      const quantity = Math.max(0, Number(row.quantity || 0));
      if (!supplierCode || !productCode || quantity <= 0) return;
      const unitPrice = resolveOrderUnitPrice(productCode, row.unitPriceOverride);
      const productName = getProductDisplayName(productCode);
      const supplierRows = linesBySupplier.get(supplierCode) || [];
      supplierRows.push({
        productCode,
        productName,
        quantity,
        unitPrice,
        total: unitPrice * quantity,
      });
      linesBySupplier.set(supplierCode, supplierRows);
    });
    return linesBySupplier;
  };

  const buildLinesBySupplierFromSnapshot = (lines: CreatedSupplierOrderLine[]) => {
    const linesBySupplier = new Map<string, CreatedSupplierOrderLine[]>();
    lines.forEach((line) => {
      const supplierCode = String(line.supplierCode || '').trim().toUpperCase();
      if (!supplierCode) return;
      const supplierLines = linesBySupplier.get(supplierCode) || [];
      supplierLines.push(line);
      linesBySupplier.set(supplierCode, supplierLines);
    });
    return linesBySupplier;
  };

  const buildCreatedOrderLines = (allocations: SupplierOrderAllocation[]): CreatedSupplierOrderLine[] => {
    return allocations
      .map((row) => {
        const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
        const productCode = String(row.productCode || '').trim().toUpperCase();
        const quantity = Math.max(0, Number(row.quantity || 0));
        const unitPrice = resolveOrderUnitPrice(productCode, row.unitPriceOverride);
        return {
          supplierCode,
          productCode,
          productName: getProductDisplayName(productCode),
          quantity,
          unitPrice,
          total: unitPrice * quantity,
        };
      })
      .filter((line) => line.supplierCode && line.productCode && line.quantity > 0);
  };

  const downloadCreatedOrderPdfs = async (batch?: CreatedSupplierOrderBatch) => {
    const orders = batch?.orders || lastCreatedOrders;
    if (!orders.length) return;
    setDownloadingOrderPdfs(true);
    try {
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = (autoTableModule as any).default || autoTableModule;
      const linesBySupplier = batch ? buildLinesBySupplierFromSnapshot(batch.lines) : buildLinesBySupplier();
      for (const order of orders) {
        const supplierCode = String(order.supplierCode || '').trim().toUpperCase();
        const supplierName = String(order.supplierName || supplierCode).trim();
        const orderNumber = String(order.orderNumber || '').trim();
        const lines = (linesBySupplier.get(supplierCode) || []).sort((a, b) => a.productCode.localeCompare(b.productCode, 'tr'));
        const totalAmount = lines.reduce((sum, line) => sum + line.total, 0);

        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        await drawPdfHeader(doc, 'Tedarikci Siparis Ozet', `${supplierCode} - ${supplierName} | Siparis No: ${orderNumber}`);
        autoTable(doc, {
          startY: 30,
          head: [[cleanPdfText('Stok Kodu'), cleanPdfText('Urun'), cleanPdfText('Miktar'), cleanPdfText('Birim Fiyat'), cleanPdfText('Tutar')]],
          body: lines.map((line) => [
            cleanPdfText(line.productCode),
            cleanPdfText(line.productName),
            cleanPdfText(line.quantity.toLocaleString('tr-TR')),
            cleanPdfText(formatPdfMoney(line.unitPrice)),
            cleanPdfText(formatPdfMoney(line.total)),
          ]),
          theme: 'grid',
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
          styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
          columnStyles: { 0: { cellWidth: 26 }, 2: { halign: 'right', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 26 }, 4: { halign: 'right', cellWidth: 26 } },
        });
        const finalY = (doc as any).lastAutoTable?.finalY || 40;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(
          cleanPdfText(`Toplam: ${formatPdfMoney(totalAmount)}`),
          doc.internal.pageSize.getWidth() - 12,
          finalY + 8,
          { align: 'right' }
        );

        const safeSupplier = supplierName.replace(/[\\/:*?"<>|]/g, '_');
        const safeOrder = orderNumber.replace(/[\\/:*?"<>|]/g, '_');
        doc.save(`${safeSupplier}-${safeOrder}.pdf`);
      }
    } finally {
      setDownloadingOrderPdfs(false);
    }
  };

  const downloadCreatedOrdersSummaryPdf = async (batch?: CreatedSupplierOrderBatch) => {
    const orders = batch?.orders || lastCreatedOrders;
    if (!orders.length) return;
    setDownloadingOrderSummaryPdf(true);
    try {
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = (autoTableModule as any).default || autoTableModule;
      const linesBySupplier = batch ? buildLinesBySupplierFromSnapshot(batch.lines) : buildLinesBySupplier();
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      await drawPdfHeader(doc, 'Toplu Siparis Yonetici Onay Ozeti', 'Cari bazinda siparis ve tutar listesi');

      const summaryRows = orders.map((order) => {
        const supplierCode = String(order.supplierCode || '').trim().toUpperCase();
        const supplierName = String(order.supplierName || supplierCode).trim();
        const orderNumber = String(order.orderNumber || '').trim();
        const lines = linesBySupplier.get(supplierCode) || [];
        const totalAmount = lines.reduce((sum, line) => sum + line.total, 0);
        return {
          supplierCode,
          supplierName,
          orderNumber,
          itemCount: lines.length,
          totalAmount,
        };
      });
      const grandTotal = summaryRows.reduce((sum, row) => sum + row.totalAmount, 0);
      autoTable(doc, {
        startY: 30,
        head: [[cleanPdfText('Cari Kodu'), cleanPdfText('Cari Unvan'), cleanPdfText('Siparis No'), cleanPdfText('Kalem'), cleanPdfText('Tutar (TL)')]],
        body: summaryRows.map((row) => [
          cleanPdfText(row.supplierCode),
          cleanPdfText(row.supplierName),
          cleanPdfText(row.orderNumber),
          cleanPdfText(row.itemCount.toLocaleString('tr-TR')),
          cleanPdfText(formatPdfMoney(row.totalAmount)),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: { 3: { halign: 'right', cellWidth: 16 }, 4: { halign: 'right', cellWidth: 30 } },
      });

      let startY = ((doc as any).lastAutoTable?.finalY || 36) + 8;
      summaryRows.forEach((row, index) => {
        const lines = (linesBySupplier.get(row.supplierCode) || []).sort((a, b) => a.productCode.localeCompare(b.productCode, 'tr'));
        if (startY > 250) {
          doc.addPage();
          startY = 16;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(cleanPdfText(`${index + 1}) ${row.supplierCode} - ${row.supplierName} | ${row.orderNumber}`), 12, startY);
        autoTable(doc, {
          startY: startY + 2,
          head: [[cleanPdfText('Stok'), cleanPdfText('Urun'), cleanPdfText('Miktar'), cleanPdfText('Birim'), cleanPdfText('Tutar')]],
          body: lines.map((line) => [
            cleanPdfText(line.productCode),
            cleanPdfText(line.productName),
            cleanPdfText(line.quantity.toLocaleString('tr-TR')),
            cleanPdfText(formatPdfMoney(line.unitPrice)),
            cleanPdfText(formatPdfMoney(line.total)),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [55, 65, 81], textColor: 255, fontSize: 8 },
          styles: { fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak' },
          margin: { left: 12, right: 12 },
          columnStyles: { 2: { halign: 'right', cellWidth: 16 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 24 } },
        });
        startY = ((doc as any).lastAutoTable?.finalY || startY + 12) + 6;
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(
        cleanPdfText(`Genel Toplam: ${formatPdfMoney(grandTotal)}`),
        doc.internal.pageSize.getWidth() - 12,
        Math.min(288, startY + 4),
        { align: 'right' }
      );
      doc.save(`toplu-siparis-yonetici-ozet-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setDownloadingOrderSummaryPdf(false);
    }
  };
  const toggleFamilyDetail = (familyId: string) => {
    setActiveFamilyId((prev) => {
      const next = prev === familyId ? '' : familyId;
      if (next) {
        setPanelHighlight(true);
        setTimeout(() => setPanelHighlight(false), 900);
      }
      return next;
    });
  };

  // ==================== IS 1 — Sipariş akışı taslağı (localStorage) ====================
  const clearOrderDraft = (targetDepot?: DepotType) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(orderDraftKey(targetDepot || depot));
    } catch {
      // sessiz — localStorage erişilemezse taslak devre dışı kalır
    }
    setOrderDraftInfo(null);
  };

  // Devam eden çalışmayı debounce ile (~800ms) kaydet. Depo değişince yeni depoya yazılmadan önce
  // hydration bayrağı sıfırlanır (aşağıdaki tespit effect'i tarafından).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!orderDraftHydratedRef.current) return; // taslak yüklenene/tespit edilene kadar yazma
    // Depo yeni degisti ama tespit effect'i henuz calismadi -> eski state'i yeni depoya yazma.
    if (orderDraftDepotRef.current !== depot) return;
    if (orderDraftSaveTimerRef.current) clearTimeout(orderDraftSaveTimerRef.current);
    orderDraftSaveTimerRef.current = setTimeout(() => {
      const payload: Omit<UcarerOrderDraft, 'savedAt'> = {
        manualAllocations,
        nonFamilyAllocations,
        pendingAllocations,
        supplierOrderConfigs,
        pendingTransfersByCode,
        selectedTransferByCode,
      };
      try {
        if (isOrderDraftEmpty(payload)) {
          window.localStorage.removeItem(orderDraftKey(depot));
        } else {
          const draft: UcarerOrderDraft = { savedAt: new Date().toISOString(), ...payload };
          window.localStorage.setItem(orderDraftKey(depot), JSON.stringify(draft));
        }
      } catch {
        // sessiz
      }
    }, 800);
    return () => {
      if (orderDraftSaveTimerRef.current) clearTimeout(orderDraftSaveTimerRef.current);
    };
  }, [
    depot,
    manualAllocations,
    nonFamilyAllocations,
    pendingAllocations,
    supplierOrderConfigs,
    pendingTransfersByCode,
    selectedTransferByCode,
  ]);

  // Sayfa/rapor hazır olunca (depoRows yüklendiğinde) mevcut depo için taslak var mı bak.
  // Depo değişiminde hydration bayrağı sıfırlanır ki yeni depo state'i eski depoya yazılmasın.
  useEffect(() => {
    orderDraftHydratedRef.current = false;
    if (typeof window === 'undefined') return;
    // Rapor verisi gelmeden banner göstermeyelim (kullanıcı henüz depoya girmemiş olabilir).
    if (depotRows.length === 0) {
      setOrderDraftInfo(null);
      // hydration'ı yine de aç ki kullanıcı sıfırdan çalışırsa kaydedilebilsin
      orderDraftDepotRef.current = depot;
      orderDraftHydratedRef.current = true;
      return;
    }
    try {
      const raw = window.localStorage.getItem(orderDraftKey(depot));
      if (raw) {
        const parsed = JSON.parse(raw) as UcarerOrderDraft;
        if (parsed && parsed.savedAt && !isOrderDraftEmpty(parsed)) {
          setOrderDraftInfo({ savedAt: parsed.savedAt });
        } else {
          setOrderDraftInfo(null);
        }
      } else {
        setOrderDraftInfo(null);
      }
    } catch {
      setOrderDraftInfo(null);
    }
    // Bu depoya ait state artik in-memory sayilir; auto-save bu depoya yazabilir.
    orderDraftDepotRef.current = depot;
    orderDraftHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depot, depotRows.length]);

  // Banner'dan "Taslaktan devam": kaydedilen state'i geri yükle.
  const restoreOrderDraft = () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(orderDraftKey(depot));
      if (!raw) {
        setOrderDraftInfo(null);
        return;
      }
      const parsed = JSON.parse(raw) as UcarerOrderDraft;
      if (!parsed || isOrderDraftEmpty(parsed)) {
        setOrderDraftInfo(null);
        return;
      }
      setManualAllocations(parsed.manualAllocations || {});
      setNonFamilyAllocations(parsed.nonFamilyAllocations || {});
      setPendingAllocations(parsed.pendingAllocations || []);
      setSupplierOrderConfigs(parsed.supplierOrderConfigs || {});
      setPendingTransfersByCode(parsed.pendingTransfersByCode || {});
      setSelectedTransferByCode(parsed.selectedTransferByCode || {});
      setOrderDraftInfo(null);
      toast.success('Sipariş taslağı geri yüklendi.');
    } catch {
      toast.error('Taslak geri yüklenemedi.');
      setOrderDraftInfo(null);
    }
  };

  const discardOrderDraft = () => {
    clearOrderDraft();
    toast.success('Sipariş taslağı silindi.');
  };

  return {
    // depo / rapor
    depot, setDepot,
    depotLimit, setDepotLimit,
    depotLoading,
    minMaxLoading,
    minMaxJobStatusText,
    depotRows,
    depotColumns,
    depotTotal,
    depotLimited,
    minMaxRows,
    minMaxColumns,
    minMaxTotal,
    // aileler
    families, familyLoading,
    allocationModeByFamily, setAllocationModeByFamily,
    singleCodeByFamily, setSingleCodeByFamily,
    splitAByFamily, setSplitAByFamily,
    splitBByFamily, setSplitBByFamily,
    splitRatioByFamily, setSplitRatioByFamily,
    manualAllocations, setManualAllocations,
    nonFamilyAllocations, setNonFamilyAllocations,
    panelColumns, setPanelColumns,
    packQtyByCode,
    currentCostByCode,
    costPInputByCode, setCostPInputByCode,
    costTInputByCode, setCostTInputByCode,
    manualCostPOverrideByCode, setManualCostPOverrideByCode,
    vatRateByCode,
    updatePriceListsByCode, setUpdatePriceListsByCode,
    updatingCostByCode,
    updatingSupplierByCode,
    mainSupplierByCode,
    supplierOverrideByCode, setSupplierOverrideByCode,
    persistSupplierOverrideByCode, setPersistSupplierOverrideByCode,
    cariOptions,
    seriesModalOpen, setSeriesModalOpen,
    familySort, setFamilySort,
    nonFamilySort, setNonFamilySort,
    nonFamilyColorFilter, setNonFamilyColorFilter,
    nonFamilyColorSort, setNonFamilyColorSort,
    nonFamilyTriageFilter, setNonFamilyTriageFilter,
    familyListSearch, setFamilyListSearch,
    familyDetailSearch, setFamilyDetailSearch,
    nonFamilySearch, setNonFamilySearch,
    showUnsuggestedFamilies, setShowUnsuggestedFamilies,
    expandedSupplierRows, setExpandedSupplierRows,
    supplierOrderConfigs, setSupplierOrderConfigs,
    supplierRecentSeriesByCode,
    pendingAllocations,
    sendingRedirectKey,
    activeFamilyId, setActiveFamilyId,
    orderPanelTab, setOrderPanelTab,
    panelHighlight,
    creatingOrders,
    creatingTransferOrder,
    selectedTransferByCode, setSelectedTransferByCode,
    exportingDepot,
    exportingMinMax,
    minMaxExcludedRows,
    resetMinMaxToZeroByCode, setResetMinMaxToZeroByCode,
    updatingMinMaxExclusionByCode,
    missingPriceProducts, setMissingPriceProducts,
    createdOrderHistory, setCreatedOrderHistory,
    operationLogs,
    operationLogLoading,
    operationLogSearch, setOperationLogSearch,
    operationLogType, setOperationLogType,
    operationLogPage, setOperationLogPage,
    operationLogPagination,
    lastCreatedOrders,
    lastCreatedAllocations,
    downloadingOrderPdfs,
    downloadingOrderSummaryPdf,
    createdOrdersModalOpen, setCreatedOrdersModalOpen,
    incomingOrdersModalOpen, setIncomingOrdersModalOpen,
    incomingOrdersLoading,
    incomingOrdersProductCode,
    incomingOrdersDetailRows,
    salesHistoryModalOpen, setSalesHistoryModalOpen,
    salesHistoryLoading,
    salesHistoryProductCode,
    salesHistoryViewMode,
    salesHistoryLookbackMonths,
    salesHistoryRows,
    markingTopluLineKey,
    salesHistorySort, setSalesHistorySort,
    salesHistorySummary,
    editingFamilyId,
    familyEditModalOpen,
    familyEditName, setFamilyEditName,
    familyEditCode, setFamilyEditCode,
    familyEditNote, setFamilyEditNote,
    familyEditActive, setFamilyEditActive,
    familyEditProductCodes,
    familyEditProductNamesByCode,
    familyEditSearch, setFamilyEditSearch,
    familyEditResults,
    familyEditSearching,
    familyEditSaving,
    pendingSupplierInputByProduct, setPendingSupplierInputByProduct,
    // IS 2 — Transfer Kapisi
    ucarerMinMaxLoading,
    pendingTransferRows,
    pendingTransferSummary,
    getTransferGateInfo,
    convertPendingLineToTransfer,
    undoPendingTransfer,
    // IS 1 — DSV uyari modali (Siparisleri Olustur oncesi)
    dsvWarningLines, setDsvWarningLines,
    doSubmitCreateSupplierOrders,
    // IS 1 — Sipariş akışı taslağı (localStorage)
    orderDraftInfo,
    restoreOrderDraft,
    discardOrderDraft,
    // IS 3 — Koliye tamamla / koli ici tanimlama
    packPopover, setPackPopover,
    getPackRounding,
    getPackInfo,
    packFactorRawByCode,
    unit2NameByCode,
    applyPackPopoverValue,
    setPendingTotalQuantityForProduct,
    packDefineState,
    openPackDefineModal,
    closePackDefineModal,
    setPackDefineField,
    savePackDefine,
    // IS 4 — Aile Kapsama Radari + Aday Aile
    familyCoverageSummary,
    familyCandidatesByCode,
    familyCandidateLoading,
    addingToFamilyByCode,
    addedToFamilyByCode,
    addNonFamilyProductToFamily,
    suggestionMode, setSuggestionMode,
    // turetilmis kolon adlari
    visibleMinMaxColumns,
    productNameColumn,
    // turetilmis veriler
    rowByProductCode,
    minMaxExcludedCodeSet,
    familyCodeSet,
    familySuggestions,
    totalSuggestedQty,
    nonFamilyRows,
    cariNameByCode,
    salesHistoryRowsSorted,
    activeFamily,
    activeFamilySuggestion,
    activeFamilyItems,
    activeFamilyRowsSorted,
    nonFamilyRowsSorted,
    activeFamilyAllocations,
    filteredActiveFamilyRows,
    filteredNonFamilyRows,
    familySuggestionsFiltered,
    suggestedFamilies,
    unsuggestedFamilies,
    activeFamilyNeedRaw,
    activeFamilyNeed,
    activeFamilyAllocated,
    activeFamilyRemaining,
    missingPriceCodeSet,
    pendingSupplierRows,
    pendingSupplierItemsByCode,
    nonFamilyTriageSummary,
    // sticky degerleri
    stickySelectionWidth,
    stickyCodeWidth,
    stickyNameWidth,
    stickyCodeLeft,
    stickyNameLeft,
    // fonksiyonlar
    getVisibleFamilyItems,
    getRawSuggestedQty,
    getSuggestedQty,
    getDaysOfStock,
    getDailyAverageSales,
    getSuggestionTriage,
    getTriageRank,
    computeFamilyCappedNeeds,
    isPriceListUpdateChecked,
    getFamilyItemMinimum,
    getFamilyItemNetQuantity,
    getFamilyItemEffectiveQuantity,
    getFamilyItemShortage,
    getFamilyItemExcess,
    getFamilyCoverage,
    isFamilyCoveredByMinimum,
    isIncomingOrderRow,
    getRowHighlightClass,
    getRowColorRank,
    updateSort,
    updateSalesHistorySort,
    sortIndicator,
    salesSortIndicator,
    compareMixed,
    getStickyCellBgClass,
    loadFamilies,
    openFamilyEditModal,
    closeFamilyEditModal,
    addProductCodeToFamilyEdit,
    removeProductCodeFromFamilyEdit,
    getFamilyEditProductLabel,
    saveFamilyEdit,
    loadUcarerOperationLogs,
    refreshOperationLogsIfOpen,
    loadDepotReport,
    runMinMax,
    exportDepot,
    exportMinMax,
    getFamilyNeed,
    applySingleAllocation,
    applySplitAllocation,
    setManualAllocation,
    getExtraColumnValue,
    getEffectiveSupplierCode,
    getEffectiveSupplierName,
    updateProductCost,
    updateMainSupplier,
    setMinMaxExclusion,
    openIncomingOrdersModal,
    openSalesHistoryModal,
    markSalesHistoryLineAsToplu,
    reassignPendingSupplierForProduct,
    setPendingPersistOverrideForProduct,
    setPendingPriceOverrideForProduct,
    removePendingProductFromSupplierOrder,
    fillActiveBySuggestions,
    clearActiveAllocations,
    sendRedirectSuggestionToSales,
    splitActiveEvenly,
    resolveOrderUnitPrice,
    getProductDisplayName,
    buildOrderAllocations,
    createSupplierOrders,
    createDepotTransferOrder,
    submitCreateSupplierOrders,
    downloadCreatedOrderPdfs,
    downloadCreatedOrdersSummaryPdf,
    toggleFamilyDetail,
  };
}

export default useUcarerDepo;
