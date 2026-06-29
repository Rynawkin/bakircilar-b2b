'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, WandSparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { adminApi } from '@/lib/api/admin';
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
  | 'costIncVat';

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

export const OPERATION_TYPE_LABELS: Record<string, string> = {
  MINMAX_RUN: 'MinMax',
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
  });
  const [packQtyByCode, setPackQtyByCode] = useState<Record<string, number>>({});
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
    for (const value of Object.values(row)) {
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
      let rawNeed = 0;
      const visibleItems = getVisibleFamilyItems(family);
      const familyCoverage = getFamilyCoverage(family);
      const familyCovered = isFamilyCoveredByMinimum(familyCoverage);
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
        const raw = familyCovered ? 0 : naturalRaw;
        rawNeed += raw;
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
  }, [families, rowByProductCode, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, depotQtyColumn, minQtyColumn, incomingOrderColumn, outgoingOrderColumn, productNameColumn]);
  const getDepotColumnWidth = (column: string) => depotColumnWidths[column] || defaultColumnWidth;
  const getMinMaxColumnWidth = (column: string) => minMaxColumnWidths[column] || defaultColumnWidth;
  function getRawSuggestedQty(row: Record<string, any>): number {
    const sourceColumn = suggestionMode === 'INCLUDE_MINMAX' ? fourthIssueColumn : thirdIssueColumn;
    if (!sourceColumn) return 0;
    const base = toNumberFlexible(row[sourceColumn]);
    const incomingDsv = incomingDsvColumn ? Math.max(0, toNumberFlexible(row[incomingDsvColumn])) : 0;
    const minQty = getFamilyItemMinimum(row);
    const netQty = getFamilyItemNetQuantity(row);
    if (netQty + incomingDsv >= minQty && minQty > 0) return 0;
    return base - incomingDsv;
  }
  function getSuggestedQty(row: Record<string, any>): number {
    return Math.max(0, getRawSuggestedQty(row));
  }
  function isPriceListUpdateChecked(code: string): boolean {
    return updatePriceListsByCode[String(code || '').trim().toUpperCase()] !== false;
  }
  function getFamilyItemMinimum(row: Record<string, any>): number {
    return minQtyColumn ? Math.max(0, toNumberFlexible(row[minQtyColumn])) : 0;
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
  function getFamilyCoverage(family: ProductFamily): { minimum: number; effective: number } {
    let minimum = 0;
    let effective = 0;
    getVisibleFamilyItems(family).forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      if (!row) return;
      minimum += getFamilyItemMinimum(row);
      effective += getFamilyItemEffectiveQuantity(row);
    });
    return { minimum, effective };
  }
  function isFamilyCoveredByMinimum(coverage: { minimum: number; effective: number }): boolean {
    return coverage.minimum > 0 && coverage.effective >= coverage.minimum;
  }
  const totalSuggestedQty = useMemo(
    () => depotRows.reduce((sum, row) => sum + getSuggestedQty(row), 0),
    [depotRows, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, depotQtyColumn, minQtyColumn, incomingOrderColumn, outgoingOrderColumn]
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
  }, [depotRows, stockCodeColumn, familyCodeSet, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, depotQtyColumn, minQtyColumn, incomingOrderColumn, outgoingOrderColumn]);

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
  }, [nonFamilyRows, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingDsvColumn, realQtyColumn, minQtyColumn]);

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
            if (code && Number.isFinite(costValue)) {
              costMap[code] = costValue;
            }
            if (code && Number.isFinite(vatRateValue)) {
              vatMap[code] = vatRateValue;
            }
            if (code && Number.isFinite(unit2Factor)) {
              packMap[code] = unit2Factor;
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
    const coverage = getFamilyCoverage(family);
    if (isFamilyCoveredByMinimum(coverage)) return 0;
    let total = 0;
    getVisibleFamilyItems(family).forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      if (row) total += getRawSuggestedQty(row);
    });
    return Math.max(0, Math.trunc(total));
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
      const response = await adminApi.getUcarerIncomingOrderDetails(code);
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
    const familyCovered = Boolean(activeFamilySuggestion?.coveredByFamilyMinimum);
    const rows = activeFamilyItems.map((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      const suggested = familyCovered ? 0 : row ? getRawSuggestedQty(row) : 0;
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
      return {
        ...item,
        suggested,
        allocation,
        supplierCode: getEffectiveSupplierCode(code),
        supplierName: getEffectiveSupplierName(code),
        colorRank: getRowColorRank(row),
      };
    });
    if (nonFamilySort.direction === 'none') return rows;
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

    if (nonFamilyColorSort !== 'NONE') {
      rows.sort((a, b) => {
        const diff = a.colorRank - b.colorRank;
        return nonFamilyColorSort === 'RISK_ASC' ? diff : -diff;
      });
    }

    return rows;
  }, [nonFamilyRowsSorted, nonFamilySearch, productNameColumn, nonFamilyColorFilter, nonFamilyColorSort]);
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
    const familyCovered = Boolean(activeFamilySuggestion?.coveredByFamilyMinimum);
    const next: Record<string, number> = {};
    getVisibleFamilyItems(activeFamily).forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      next[code] = familyCovered ? 0 : row ? getSuggestedQty(row) : 0;
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
    const grouped = new Map<string, { supplierCode: string; supplierName: string; itemCount: number; totalQuantity: number }>();
    pendingAllocations.forEach((row) => {
      const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
      if (!supplierCode) return;
      const found = grouped.get(supplierCode) || {
        supplierCode,
        supplierName: cariNameByCode.get(supplierCode) || supplierCode,
        itemCount: 0,
        totalQuantity: 0,
      };
      found.itemCount += 1;
      found.totalQuantity += Math.max(0, Math.trunc(Number(row.quantity || 0)));
      grouped.set(supplierCode, found);
    });
    return Array.from(grouped.values()).sort((a, b) => a.supplierCode.localeCompare(b.supplierCode, 'tr'));
  }, [pendingAllocations, cariNameByCode]);
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

  const submitCreateSupplierOrders = async () => {
    if (!pendingAllocations.length) {
      toast.error('Siparis olusturmak icin dagitim bulunamadi.');
      return;
    }
    const invalidSupplier = pendingSupplierRows.find((row) => {
      const cfg = supplierOrderConfigs[row.supplierCode];
      return !cfg || !String(cfg.series || '').trim();
    });
    if (invalidSupplier) {
      toast.error(`Seri zorunlu: ${invalidSupplier.supplierCode}`);
      return;
    }

    setCreatingOrders(true);
    try {
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
      if (created.length === 0) {
        toast.error('Siparis olusturulamadi.');
        return;
      }
      toast.success(`${created.length} tedarikci icin siparis olusturuldu.`);
      const orderList = created.map((row) => `${row.supplierCode}: ${row.orderNumber}`).join(' | ');
      if (orderList) {
        toast(orderList, { duration: 9000 });
      }
      setLastCreatedOrders(created);
      setLastCreatedAllocations([...pendingAllocations]);
      const batch: CreatedSupplierOrderBatch = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        depot,
        orders: created,
        lines: buildCreatedOrderLines(pendingAllocations),
      };
      setCreatedOrderHistory((prev) => [batch, ...prev].slice(0, 50));
      setCreatedOrdersModalOpen(true);
      setSeriesModalOpen(false);
      setPendingAllocations([]);
      setSupplierOrderConfigs({});
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
