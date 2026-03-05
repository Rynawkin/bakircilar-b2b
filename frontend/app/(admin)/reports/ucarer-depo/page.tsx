'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronRight, Download, Play, RefreshCw, Warehouse, WandSparkles } from 'lucide-react';
import jsPDF from 'jspdf';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

type DepotType = 'MERKEZ' | 'TOPCA';
type SuggestionMode = 'INCLUDE_MINMAX' | 'EXCLUDE_MINMAX';
type AllocationMode = 'SINGLE' | 'TWO_SPLIT' | 'MANUAL';
type SortDirection = 'none' | 'desc' | 'asc';
type SuggestionSortKey =
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
type OpsExtraColumnKey =
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

interface ProductFamily {
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

interface SuggestionSortState {
  key: SuggestionSortKey;
  direction: SortDirection;
}

type NonFamilyColorFilter = 'ALL' | 'GREEN' | 'YELLOW' | 'RED' | 'UNCOLORED';
type NonFamilyColorSort = 'NONE' | 'RISK_DESC' | 'RISK_ASC';

const normalizeValue = (value: unknown): string => {
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

export default function UcarerDepotReportPage() {
  const [depot, setDepot] = useState<DepotType>('MERKEZ');
  const [depotLimit, setDepotLimit] = useState<string>('ALL');
  const [depotLoading, setDepotLoading] = useState(false);
  const [minMaxLoading, setMinMaxLoading] = useState(false);
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
  const [supplierOrderConfigs, setSupplierOrderConfigs] = useState<
    Record<string, { series: string; applyVAT: boolean; deliveryType: string; deliveryDate: string }>
  >({});
  const [pendingAllocations, setPendingAllocations] = useState<
    Array<{
      familyId?: string | null;
      productCode: string;
      quantity: number;
      supplierCodeOverride?: string | null;
      persistSupplierOverride?: boolean;
    }>
  >([]);
  const [activeFamilyId, setActiveFamilyId] = useState<string>('');
  const [panelHighlight, setPanelHighlight] = useState(false);
  const [creatingOrders, setCreatingOrders] = useState(false);
  const [creatingTransferOrder, setCreatingTransferOrder] = useState(false);
  const [selectedTransferByCode, setSelectedTransferByCode] = useState<Record<string, boolean>>({});
  const [exportingDepot, setExportingDepot] = useState(false);
  const [exportingMinMax, setExportingMinMax] = useState(false);
  const [minMaxExcludedRows, setMinMaxExcludedRows] = useState<Array<{ productCode: string }>>([]);
  const [resetMinMaxToZeroByCode, setResetMinMaxToZeroByCode] = useState<Record<string, boolean>>({});
  const [updatingMinMaxExclusionByCode, setUpdatingMinMaxExclusionByCode] = useState<Record<string, boolean>>({});
  const [lastCreatedOrders, setLastCreatedOrders] = useState<
    Array<{ supplierCode: string; supplierName: string | null; orderNumber: string; itemCount: number; totalQuantity: number }>
  >([]);
  const [lastCreatedAllocations, setLastCreatedAllocations] = useState<
    Array<{
      familyId?: string | null;
      productCode: string;
      quantity: number;
      unitPriceOverride?: number | null;
      supplierCodeOverride?: string | null;
      persistSupplierOverride?: boolean;
    }>
  >([]);
  const [downloadingOrderPdfs, setDownloadingOrderPdfs] = useState(false);
  const [downloadingOrderSummaryPdf, setDownloadingOrderSummaryPdf] = useState(false);
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
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('reel miktar'));
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
      const itemSignals: Array<{ code: string; raw: number; orderDriven: number; incomingOrders: number }> = [];
      visibleItems.forEach((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        const row = rowByProductCode.get(code);
        if (!row) return;
        const raw = getRawSuggestedQty(row);
        rawNeed += raw;
        const orderDriven = thirdIssueColumn ? Math.max(0, toNumberFlexible(row?.[thirdIssueColumn])) : 0;
        const incomingOrders = incomingOrderColumn ? Math.max(0, toNumberFlexible(row?.[incomingOrderColumn])) : 0;
        itemSignals.push({ code, raw, orderDriven, incomingOrders });
      });
      const redirectSuggestions: Array<{ type: 'ORDER' | 'DEPOT'; text: string }> = [];
      if (Math.trunc(rawNeed) < 0) {
        const sources = itemSignals
          .filter((item) => item.raw > 0)
          .sort((a, b) => (b.orderDriven - a.orderDriven) || (b.raw - a.raw))
          .slice(0, 3);
        const targets = itemSignals
          .filter((item) => item.raw < 0)
          .sort((a, b) => a.raw - b.raw);
        sources.forEach((source, idx) => {
          const target = targets[idx] || targets[0];
          if (!target) return;
          const sourceName = String(rowByProductCode.get(source.code)?.[productNameColumn || ''] || '').trim() || source.code;
          const targetName = String(rowByProductCode.get(target.code)?.[productNameColumn || ''] || '').trim() || target.code;
          if (source.incomingOrders > 0) {
            redirectSuggestions.push({
              type: 'ORDER',
              text: `Siparis yonlendirme onerisi: ${source.code} - ${sourceName} ihtiyaci, aile ici fazla stok olan ${target.code} - ${targetName} urunune yonlendirilebilir.`,
            });
          } else {
            redirectSuggestions.push({
              type: 'DEPOT',
              text: `Depo yonlendirme onerisi: ${source.code} - ${sourceName} ihtiyaci, aile ici fazla stok olan ${target.code} - ${targetName} urunune yonlendirilebilir.`,
            });
          }
        });
      }
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
        redirectSuggestions,
      };
    });
  }, [families, rowByProductCode, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingOrderColumn, productNameColumn]);
  const getDepotColumnWidth = (column: string) => depotColumnWidths[column] || defaultColumnWidth;
  const getMinMaxColumnWidth = (column: string) => minMaxColumnWidths[column] || defaultColumnWidth;
  function getRawSuggestedQty(row: Record<string, any>): number {
    const sourceColumn = suggestionMode === 'INCLUDE_MINMAX' ? fourthIssueColumn : thirdIssueColumn;
    if (!sourceColumn) return 0;
    const base = toNumberFlexible(row[sourceColumn]);
    const incomingDsv = incomingDsvColumn ? Math.max(0, toNumberFlexible(row[incomingDsvColumn])) : 0;
    return base - incomingDsv;
  }
  function getSuggestedQty(row: Record<string, any>): number {
    return Math.max(0, getRawSuggestedQty(row));
  }
  const totalSuggestedQty = useMemo(
    () => depotRows.reduce((sum, row) => sum + getSuggestedQty(row), 0),
    [depotRows, suggestionMode, thirdIssueColumn, fourthIssueColumn]
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
  }, [depotRows, stockCodeColumn, familyCodeSet, suggestionMode, thirdIssueColumn, fourthIssueColumn]);

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
    setNonFamilyAllocations((prev) => {
      const next: Record<string, number | ''> = {};
      nonFamilyRows.forEach((item) => {
        next[item.code] = prev[item.code] !== undefined ? prev[item.code] : '';
      });
      return next;
    });
  }, [nonFamilyRows, suggestionMode, thirdIssueColumn, fourthIssueColumn]);

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
  const sortIndicator = (sortState: SuggestionSortState, key: SuggestionSortKey): string =>
    sortState.key !== key || sortState.direction === 'none'
      ? ''
      : sortState.direction === 'asc'
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
      toast.error(error?.response?.data?.error || 'Aile listesi alinamadi');
    } finally {
      setFamilyLoading(false);
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

  useEffect(() => {
    loadFamilies();
    loadMinMaxExcludedCodes();
  }, []);

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
      toast.error(error?.response?.data?.error || 'Ucarer depo raporu alinamadi');
    } finally {
      setDepotLoading(false);
    }
  };

  const runMinMax = async () => {
    setMinMaxLoading(true);
    try {
      const response = await adminApi.runUcarerMinMaxReport();
      const data = response.data;
      setMinMaxRows(data.rows || []);
      setMinMaxColumns(data.columns || []);
      setMinMaxTotal(Number(data.total || 0));
      toast.success('MinMax hesaplama tamamlandi');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'MinMax hesaplama calistirilamadi');
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
        updatePriceLists: Boolean(updatePriceListsByCode[code]),
      });
      const newCostP = Number(result.data?.costP || parsedCostP);
      const newCostT = Number(result.data?.costT || parsedCostT);
      const newCost = Number(result.data?.currentCost || newCostP);
      setCurrentCostByCode((prev) => ({ ...prev, [code]: newCost }));
      setCostPInputByCode((prev) => ({ ...prev, [code]: String(newCostP) }));
      setCostTInputByCode((prev) => ({ ...prev, [code]: String(newCostT) }));
      const missing = result.data?.missingLists || [];
      if (Boolean(updatePriceListsByCode[code])) {
        if (missing.length > 0) {
          toast.success(`Maliyet guncellendi. Eksik liste satiri: ${missing.join(', ')}`);
        } else {
          toast.success('Maliyet ve 10 fiyat listesi guncellendi.');
        }
      } else {
        toast.success('Guncel maliyet guncellendi.');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Maliyet guncellenemedi');
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
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Ana saglayici guncellenemedi');
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
      });
      toast.success(exclude ? 'MinMax hesaplamasi disina alindi.' : 'MinMax hesaplamasina tekrar dahil edildi.');
      setMinMaxExcludedRows((prev) => {
        const hasCode = prev.some((row) => String(row.productCode || '').trim().toUpperCase() === code);
        if (exclude && !hasCode) return [{ productCode: code }, ...prev];
        if (!exclude) return prev.filter((row) => String(row.productCode || '').trim().toUpperCase() !== code);
        return prev;
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'MinMax dislama islemi basarisiz');
    } finally {
      setUpdatingMinMaxExclusionByCode((prev) => ({ ...prev, [code]: false }));
    }
  };

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
    const rows = activeFamilyItems.map((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      const suggested = row ? getRawSuggestedQty(row) : 0;
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
    activeFamilyItems,
    currentCostByCode,
    depotQtyColumn,
    familySort,
    incomingOrderColumn,
    manualAllocations,
    maxQtyColumn,
    minQtyColumn,
    outgoingOrderColumn,
    packQtyByCode,
    realQtyColumn,
    rowByProductCode,
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
        (family) => !(family.suggestedRaw < 0 && (!family.redirectSuggestions || family.redirectSuggestions.length === 0))
      ),
    [familySuggestionsFiltered]
  );
  const unsuggestedFamilies = useMemo(
    () =>
      familySuggestionsFiltered.filter(
        (family) => family.suggestedRaw < 0 && (!family.redirectSuggestions || family.redirectSuggestions.length === 0)
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
  const fillActiveBySuggestions = () => {
    if (!activeFamily) return;
    const next: Record<string, number> = {};
    getVisibleFamilyItems(activeFamily).forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      next[code] = row ? getSuggestedQty(row) : 0;
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
  const buildOrderAllocations = (): Array<{
    familyId?: string | null;
    productCode: string;
    quantity: number;
    unitPriceOverride?: number | null;
    supplierCodeOverride?: string | null;
    persistSupplierOverride?: boolean;
  }> => {
    const allocations: Array<{
      familyId?: string | null;
      productCode: string;
      quantity: number;
      unitPriceOverride?: number | null;
      supplierCodeOverride?: string | null;
      persistSupplierOverride?: boolean;
    }> = [];
    families.forEach((family) => {
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
      Map<string, { productCode: string; productName: string; quantity: number }>
    >();
    pendingAllocations.forEach((row) => {
      const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
      const productCode = String(row.productCode || '').trim().toUpperCase();
      const qty = Math.max(0, Math.trunc(Number(row.quantity || 0)));
      if (!supplierCode || !productCode || qty <= 0) return;
      const supplierItems = grouped.get(supplierCode) || new Map<string, { productCode: string; productName: string; quantity: number }>();
      const existing = supplierItems.get(productCode);
      const productName =
        String(rowByProductCode.get(productCode)?.[productNameColumn || ''] || '').trim() || '-';
      if (existing) {
        existing.quantity += qty;
      } else {
        supplierItems.set(productCode, { productCode, productName, quantity: qty });
      }
      grouped.set(supplierCode, supplierItems);
    });
    const result: Record<string, Array<{ productCode: string; productName: string; quantity: number }>> = {};
    grouped.forEach((items, supplierCode) => {
      result[supplierCode] = Array.from(items.values()).sort((a, b) =>
        a.productCode.localeCompare(b.productCode, 'tr')
      );
    });
    return result;
  }, [pendingAllocations, rowByProductCode, productNameColumn]);

  const createSupplierOrders = async () => {
    const allocations = buildOrderAllocations();

    if (allocations.length === 0) {
      toast.error('Siparis olusturmak icin once dagitim miktari girin.');
      return;
    }
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
        series: 'H',
        applyVAT: true,
        deliveryType: 'B',
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
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Depolar arasi siparis olusturulamadi');
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
              series: 'H',
              applyVAT: true,
              deliveryType: '',
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
      setSeriesModalOpen(false);
      setPendingAllocations([]);
      setSupplierOrderConfigs({});
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Tedarikci siparisleri olusturulamadi');
    } finally {
      setCreatingOrders(false);
    }
  };

  const downloadCreatedOrderPdfs = async () => {
    if (!lastCreatedOrders.length) return;
    setDownloadingOrderPdfs(true);
    try {
      const linesBySupplier = new Map<string, Array<{ productCode: string; productName: string; quantity: number; unitPrice: number; total: number }>>();
      lastCreatedAllocations.forEach((row) => {
        const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
        const productCode = String(row.productCode || '').trim().toUpperCase();
        const quantity = Math.max(0, Number(row.quantity || 0));
        if (!supplierCode || !productCode || quantity <= 0) return;
        const unitPrice =
          Number.isFinite(Number(row.unitPriceOverride))
            ? Number(row.unitPriceOverride)
            : Number(currentCostByCode[productCode] || 0);
        const productName = String(rowByProductCode.get(productCode)?.[productNameColumn || ''] || '').trim() || '-';
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

      for (const order of lastCreatedOrders) {
        const supplierCode = String(order.supplierCode || '').trim().toUpperCase();
        const supplierName = String(order.supplierName || supplierCode).trim();
        const orderNumber = String(order.orderNumber || '').trim();
        const lines = linesBySupplier.get(supplierCode) || [];
        const totalAmount = lines.reduce((sum, line) => sum + line.total, 0);

        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        doc.setFontSize(14);
        doc.text('Tedarikci Siparis Ozet', 14, 14);
        doc.setFontSize(10);
        doc.text(`Cari: ${supplierCode} - ${supplierName}`, 14, 22);
        doc.text(`Siparis No: ${orderNumber}`, 14, 28);
        doc.text(`Kalem: ${lines.length}  Toplam Tutar: ${totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, 14, 34);

        let y = 42;
        lines
          .sort((a, b) => a.productCode.localeCompare(b.productCode, 'tr'))
          .forEach((line) => {
            if (y > 280) {
              doc.addPage();
              y = 14;
            }
            doc.text(
              `${line.productCode} | ${line.productName} | Miktar: ${line.quantity.toLocaleString('tr-TR')} | Birim: ${line.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Tutar: ${line.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              14,
              y
            );
            y += 6;
          });

        const safeSupplier = supplierName.replace(/[\\/:*?"<>|]/g, '_');
        const safeOrder = orderNumber.replace(/[\\/:*?"<>|]/g, '_');
        doc.save(`${safeSupplier}-${safeOrder}.pdf`);
      }
    } finally {
      setDownloadingOrderPdfs(false);
    }
  };

  const downloadCreatedOrdersSummaryPdf = async () => {
    if (!lastCreatedOrders.length) return;
    setDownloadingOrderSummaryPdf(true);
    try {
      const linesBySupplier = new Map<string, Array<{ productCode: string; productName: string; quantity: number; unitPrice: number; total: number }>>();
      lastCreatedAllocations.forEach((row) => {
        const supplierCode = String(row.supplierCodeOverride || '').trim().toUpperCase();
        const productCode = String(row.productCode || '').trim().toUpperCase();
        const quantity = Math.max(0, Number(row.quantity || 0));
        if (!supplierCode || !productCode || quantity <= 0) return;
        const unitPrice =
          Number.isFinite(Number(row.unitPriceOverride))
            ? Number(row.unitPriceOverride)
            : Number(currentCostByCode[productCode] || 0);
        const productName = String(rowByProductCode.get(productCode)?.[productNameColumn || ''] || '').trim() || '-';
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

      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text('Toplu Siparis Yonetici Onay Ozeti', 14, 14);
      doc.setFontSize(10);
      let y = 22;
      let grandTotal = 0;

      lastCreatedOrders.forEach((order, idx) => {
        const supplierCode = String(order.supplierCode || '').trim().toUpperCase();
        const supplierName = String(order.supplierName || supplierCode).trim();
        const orderNumber = String(order.orderNumber || '').trim();
        const lines = (linesBySupplier.get(supplierCode) || []).sort((a, b) => a.productCode.localeCompare(b.productCode, 'tr'));
        const totalAmount = lines.reduce((sum, line) => sum + line.total, 0);
        grandTotal += totalAmount;

        if (y > 270) {
          doc.addPage();
          y = 14;
        }
        doc.setFont('helvetica', 'bold');
        doc.text(`${idx + 1}) ${supplierCode} - ${supplierName} | Siparis: ${orderNumber} | Tutar: ${totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, 14, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        lines.forEach((line) => {
          if (y > 280) {
            doc.addPage();
            y = 14;
          }
          doc.text(`- ${line.productCode} ${line.productName} | ${line.quantity.toLocaleString('tr-TR')} x ${line.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = ${line.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, 16, y);
          y += 5;
        });
        y += 2;
      });

      if (y > 280) {
        doc.addPage();
        y = 14;
      }
      doc.setFont('helvetica', 'bold');
      doc.text(`Genel Toplam: ${grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, 14, y);
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
  const renderActiveFamilyPanel = () => {
    if (!activeFamily || !activeFamilySuggestion) return null;
    const mode = allocationModeByFamily[activeFamily.id] || 'MANUAL';
    return (
      <div
        className={`rounded-xl border bg-gradient-to-br from-white to-slate-50 p-4 space-y-4 transition-all ${
          panelHighlight ? 'ring-2 ring-emerald-400 shadow-xl' : 'shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {activeFamily.name} {activeFamily.code ? `(${activeFamily.code})` : ''}
            </p>
            <p className="text-xs text-gray-600">
              Mode gore ihtiyac ({suggestionMode === 'INCLUDE_MINMAX' ? '4. Sorun' : '3. Sorun'})
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white border px-3 py-2">
              <p className="text-[11px] text-gray-500">Ihtiyac</p>
              <p className={`font-semibold ${activeFamilyNeedRaw < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {activeFamilyNeedRaw.toLocaleString('tr-TR')}
              </p>
            </div>
            <div className="rounded-lg bg-white border px-3 py-2">
              <p className="text-[11px] text-gray-500">Dagitim</p>
              <p className="font-semibold text-blue-700">{activeFamilyAllocated.toLocaleString('tr-TR')}</p>
            </div>
            <div className="rounded-lg bg-white border px-3 py-2">
              <p className="text-[11px] text-gray-500">Kalan</p>
              <p className={`font-semibold ${activeFamilyRemaining === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {activeFamilyRemaining.toLocaleString('tr-TR')}
              </p>
            </div>
          </div>
        </div>
        {Boolean(activeFamilySuggestion?.redirectSuggestions?.length) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
            <strong>Yonlendirme Onerileri:</strong>
            {(activeFamilySuggestion?.redirectSuggestions || []).map((item, idx) => (
              <p
                key={`inline-redir-${idx}`}
                className={
                  item.type === 'ORDER'
                    ? 'rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-900'
                    : 'rounded border border-amber-200 bg-amber-100 px-2 py-1 text-amber-900'
                }
              >
                {item.text}
              </p>
            ))}
          </div>
        )}

        <div className="rounded-md border bg-white p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">Operasyon Kolonlari (ac/kapat)</p>
          <div className="flex flex-wrap gap-3 text-xs text-gray-700">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.depotQty} onChange={(e) => setPanelColumns((p) => ({ ...p, depotQty: e.target.checked }))} />
              Depo Miktari
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.topcaDepotQty} onChange={(e) => setPanelColumns((p) => ({ ...p, topcaDepotQty: e.target.checked }))} />
              Topca Depo
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.incomingOrders} onChange={(e) => setPanelColumns((p) => ({ ...p, incomingOrders: e.target.checked }))} />
              Alinan Siparis
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.outgoingOrders} onChange={(e) => setPanelColumns((p) => ({ ...p, outgoingOrders: e.target.checked }))} />
              Verilen Siparis
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.realQty} onChange={(e) => setPanelColumns((p) => ({ ...p, realQty: e.target.checked }))} />
              Reel Miktar
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.minQty} onChange={(e) => setPanelColumns((p) => ({ ...p, minQty: e.target.checked }))} />
              Min
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.maxQty} onChange={(e) => setPanelColumns((p) => ({ ...p, maxQty: e.target.checked }))} />
              Max
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.currentCost} onChange={(e) => setPanelColumns((p) => ({ ...p, currentCost: e.target.checked }))} />
              Maliyet (P/T)
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.packQty} onChange={(e) => setPanelColumns((p) => ({ ...p, packQty: e.target.checked }))} />
              Koli Ici
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.costExVat} onChange={(e) => setPanelColumns((p) => ({ ...p, costExVat: e.target.checked }))} />
              Maliyet KDV Haric
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={panelColumns.costIncVat} onChange={(e) => setPanelColumns((p) => ({ ...p, costIncVat: e.target.checked }))} />
              Maliyet KDV Dahil
            </label>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={fillActiveBySuggestions}>
              <WandSparkles className="mr-1 h-3 w-3" />
              Oneriye Gore Doldur
            </Button>
            <Button size="sm" variant="outline" onClick={splitActiveEvenly}>
              Esit Dagit
            </Button>
            <Button size="sm" variant="outline" onClick={clearActiveAllocations}>
              Sifirla
            </Button>
            <p className="text-xs text-gray-600">
              Hizli aksiyonlar manuel dagitim tablosunu otomatik doldurur.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-end">
          <div className="lg:col-span-3">
            <p className="text-xs text-gray-600 mb-1">Dagitim Modu</p>
            <Select
              value={mode}
              onChange={(e) =>
                setAllocationModeByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value as AllocationMode }))
              }
            >
              <option value="SINGLE">Tek Urun</option>
              <option value="TWO_SPLIT">Iki Urun</option>
              <option value="MANUAL">Manuel</option>
            </Select>
          </div>

          {mode === 'SINGLE' && (
            <>
              <div className="lg:col-span-5">
                <p className="text-xs text-gray-600 mb-1">Urun</p>
                <Select
                  value={singleCodeByFamily[activeFamily.id] || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) =>
                    setSingleCodeByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))
                  }
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>
                      {item.productCode} - {item.productName || '-'}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="lg:col-span-2">
                <Button size="sm" className="w-full" onClick={() => applySingleAllocation(activeFamily)}>
                  Uygula
                </Button>
              </div>
            </>
          )}

          {mode === 'TWO_SPLIT' && (
            <>
              <div className="lg:col-span-3">
                <p className="text-xs text-gray-600 mb-1">Urun A</p>
                <Select
                  value={splitAByFamily[activeFamily.id] || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) => setSplitAByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))}
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>
                      {item.productCode}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="lg:col-span-3">
                <p className="text-xs text-gray-600 mb-1">Urun B</p>
                <Select
                  value={splitBByFamily[activeFamily.id] || activeFamilyItems[1]?.productCode || activeFamilyItems[0]?.productCode || ''}
                  onChange={(e) => setSplitBByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value }))}
                >
                  {activeFamilyItems.map((item) => (
                    <option key={item.id} value={item.productCode}>
                      {item.productCode}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="lg:col-span-2">
                <p className="text-xs text-gray-600 mb-1">A Orani %{splitRatioByFamily[activeFamily.id] ?? 50}</p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={splitRatioByFamily[activeFamily.id] ?? 50}
                  onChange={(e) =>
                    setSplitRatioByFamily((prev) => ({ ...prev, [activeFamily.id]: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </div>
              <div className="lg:col-span-1">
                <Button size="sm" className="w-full" onClick={() => applySplitAllocation(activeFamily)}>
                  Uygula
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-md border bg-white p-2">
          <input
            type="text"
            value={familyDetailSearch}
            onChange={(e) => setFamilyDetailSearch(e.target.value)}
            className="w-full rounded border px-2 py-1 text-xs"
            placeholder="Aile detayinda ara (stok kodu/adi/saglayici)"
          />
        </div>

        <div className="overflow-x-auto overflow-y-auto rounded border bg-white max-h-[62vh]">
          <table className="w-max min-w-[2200px] text-[11px]">
            <thead className="bg-gray-100 sticky top-0 z-20">
              <tr>
                <th
                  className="px-2 py-2 text-center sticky left-0 top-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)] cursor-pointer"
                  style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'color'))}
                >
                  Sec{sortIndicator(familySort, 'color')}
                </th>
                <th
                  className="px-2 py-2 text-left sticky top-0 z-30 bg-gray-100 cursor-pointer"
                  style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'code'))}
                >
                  Stok Kodu{sortIndicator(familySort, 'code')}
                </th>
                <th
                  className="px-2 py-2 text-left sticky top-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)] cursor-pointer"
                  style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                  onClick={() => setFamilySort((prev) => updateSort(prev, 'name'))}
                >
                  Urun Adi{sortIndicator(familySort, 'name')}
                </th>
                <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'supplierCode'))}>Saglayici Kodu{sortIndicator(familySort, 'supplierCode')}</th>
                <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'supplierName'))}>Saglayici Adi{sortIndicator(familySort, 'supplierName')}</th>
                <th className="px-2 py-2 text-center">Ana Saglayici</th>
                <th className="px-2 py-2 text-center">Kalici Degistir</th>
                <th className="px-2 py-2 text-center">MinMax Hesaplanmasin</th>
                {panelColumns.depotQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'depotQty'))}>Depo Miktari{sortIndicator(familySort, 'depotQty')}</th>}
                {panelColumns.topcaDepotQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'topcaDepotQty'))}>Topca Depo{sortIndicator(familySort, 'topcaDepotQty')}</th>}
                {panelColumns.incomingOrders && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'incomingOrders'))}>Alinan Siparis{sortIndicator(familySort, 'incomingOrders')}</th>}
                {panelColumns.outgoingOrders && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'outgoingOrders'))}>Verilen Siparis{sortIndicator(familySort, 'outgoingOrders')}</th>}
                {panelColumns.realQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'realQty'))}>Reel Miktar{sortIndicator(familySort, 'realQty')}</th>}
                {panelColumns.minQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'minQty'))}>Min{sortIndicator(familySort, 'minQty')}</th>}
                {panelColumns.maxQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'maxQty'))}>Max{sortIndicator(familySort, 'maxQty')}</th>}
                {panelColumns.packQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'packQty'))}>Koli Ici{sortIndicator(familySort, 'packQty')}</th>}
                {panelColumns.costExVat && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'costExVat'))}>Maliyet KDV Haric{sortIndicator(familySort, 'costExVat')}</th>}
                {panelColumns.costIncVat && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'costIncVat'))}>Maliyet KDV Dahil{sortIndicator(familySort, 'costIncVat')}</th>}
                {panelColumns.currentCost && <th className="px-2 py-2 text-right">Maliyet P/T</th>}
                <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'suggested'))}>Aile Oneri{sortIndicator(familySort, 'suggested')}</th>
                <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'allocation'))}>Dagitim{sortIndicator(familySort, 'allocation')}</th>
                <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setFamilySort((prev) => updateSort(prev, 'diff'))}>Fark{sortIndicator(familySort, 'diff')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredActiveFamilyRows.length === 0 && (
                <tr>
                  <td colSpan={20} className="px-2 py-4 text-center text-gray-500">
                    Bu ailede Ucarer raporunda tum degerleri sifir olan urunler gizlendi. Gorunen urun yok.
                  </td>
                </tr>
              )}
              {filteredActiveFamilyRows.map((entry) => {
                const item = entry.item;
                const code = entry.code;
                const row = entry.row;
                const itemNeed = entry.suggested;
                const allocation = entry.allocation;
                const diff = entry.diff;
                return (
                  <tr key={item.id} className={`border-t ${getRowHighlightClass(row)} ${isIncomingOrderRow(row) ? 'font-bold' : ''}`}>
                    <td
                      className={`px-2 py-2 text-center sticky left-0 z-20 shadow-[2px_0_0_0_rgba(229,231,235,1)] ${getStickyCellBgClass(row)}`}
                      style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selectedTransferByCode[code])}
                        onChange={(e) =>
                          setSelectedTransferByCode((prev) => ({
                            ...prev,
                            [code]: e.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td
                      className={`px-2 py-2 font-semibold text-gray-900 sticky z-20 ${getStickyCellBgClass(row)}`}
                      style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                    >
                      {item.productCode}
                    </td>
                    <td
                      className={`px-2 py-2 text-gray-700 sticky z-20 shadow-[2px_0_0_0_rgba(229,231,235,1)] ${getStickyCellBgClass(row)}`}
                      style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                    >
                      {item.productName || '-'}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        list="ucarer-supplier-cari-list"
                        value={getEffectiveSupplierCode(code)}
                        onChange={(e) =>
                          setSupplierOverrideByCode((prev) => ({
                            ...prev,
                            [code]: String(e.target.value || '').trim().toUpperCase(),
                          }))
                        }
                        className="w-32 rounded border px-2 py-1 text-xs uppercase"
                        placeholder="Cari kodu"
                      />
                    </td>
                    <td className="px-2 py-2 text-gray-600">{getEffectiveSupplierName(code)}</td>
                    <td className="px-2 py-2 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateMainSupplier(code)}
                        disabled={Boolean(updatingSupplierByCode[code])}
                      >
                        {updatingSupplierByCode[code] ? '...' : 'Saglayiciyi Guncelle'}
                      </Button>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(persistSupplierOverrideByCode[code])}
                        onChange={(e) =>
                          setPersistSupplierOverrideByCode((prev) => ({
                            ...prev,
                            [code]: e.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      {(() => {
                        const isExcluded = minMaxExcludedCodeSet.has(code);
                        return (
                      <div className="flex items-center justify-center gap-2">
                        <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                          <input
                            type="checkbox"
                            checked={Boolean(resetMinMaxToZeroByCode[code])}
                            onChange={(e) =>
                              setResetMinMaxToZeroByCode((prev) => ({
                                ...prev,
                                [code]: e.target.checked,
                              }))
                            }
                            disabled={isExcluded}
                          />
                          0-0
                        </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMinMaxExclusion(code, !isExcluded)}
                        disabled={Boolean(updatingMinMaxExclusionByCode[code])}
                      >
                        {updatingMinMaxExclusionByCode[code]
                          ? '...'
                          : isExcluded
                          ? 'MinMax Hesaplansin'
                          : 'MinMax Hesaplanmasin'}
                      </Button>
                      </div>
                        );
                      })()}
                    </td>
                    {panelColumns.depotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'depotQty')}</td>}
                    {panelColumns.topcaDepotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'topcaDepotQty')}</td>}
                    {panelColumns.incomingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'incomingOrders')}</td>}
                    {panelColumns.outgoingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'outgoingOrders')}</td>}
                    {panelColumns.realQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'realQty')}</td>}
                    {panelColumns.minQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'minQty')}</td>}
                    {panelColumns.maxQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'maxQty')}</td>}
                    {panelColumns.packQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'packQty')}</td>}
                    {panelColumns.costExVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costExVat')}</td>}
                    {panelColumns.costIncVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costIncVat')}</td>}
                    {panelColumns.currentCost && (
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={costPInputByCode[code] ?? ''}
                            onChange={(e) => {
                              const rawValue = e.target.value;
                              setCostPInputByCode((prev) => ({
                                ...prev,
                                [code]: rawValue,
                              }));
                              if (manualCostPOverrideByCode[code]) return;
                              const parsed = Number(String(rawValue || '').replace(',', '.'));
                              if (!Number.isFinite(parsed)) return;
                              const vatRate = Number(vatRateByCode[code] ?? 0);
                              const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                              const autoCostP = parsed * (1 + vatPercent / 200);
                              setCostTInputByCode((prev) => ({
                                ...prev,
                                [code]: Number.isFinite(autoCostP) ? autoCostP.toFixed(4).replace(/\.?0+$/, '') : prev[code] || '',
                              }));
                            }}
                            className="w-20 rounded border px-2 py-1 text-right"
                            title="Maliyet T"
                            placeholder="T"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={costTInputByCode[code] ?? ''}
                            onChange={(e) => {
                              setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                              setCostTInputByCode((prev) => ({
                                ...prev,
                                [code]: e.target.value,
                              }));
                            }}
                            className="w-20 rounded border px-2 py-1 text-right"
                            title="Maliyet P"
                            placeholder="P"
                          />
                          <span className="text-[10px] text-gray-600">KDV %{((Number(vatRateByCode[code] ?? 0) <= 1 ? Number(vatRateByCode[code] ?? 0) * 100 : Number(vatRateByCode[code] ?? 0))).toLocaleString('tr-TR')}</span>
                          <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                            <input
                              type="checkbox"
                              checked={Boolean(updatePriceListsByCode[code])}
                              onChange={(e) =>
                                setUpdatePriceListsByCode((prev) => ({
                                  ...prev,
                                  [code]: e.target.checked,
                                }))
                              }
                            />
                            10 liste
                          </label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateProductCost(code)}
                            disabled={Boolean(updatingCostByCode[code])}
                          >
                            {updatingCostByCode[code] ? '...' : 'Guncelle'}
                          </Button>
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-2 text-right text-emerald-700 font-semibold">{itemNeed.toLocaleString('tr-TR')}</td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={allocation}
                        onChange={(e) => setManualAllocation(activeFamily.id, code, Number(e.target.value))}
                        className="w-24 rounded border px-2 py-1 text-right"
                        disabled={mode !== 'MANUAL'}
                      />
                    </td>
                    <td className={`px-2 py-2 text-right font-semibold ${diff === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {diff.toLocaleString('tr-TR')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 pb-28 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Raporlar
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ucarer Depo ve MinMax Modulu</h1>
              <p className="text-sm text-gray-600">Mikro SQL raporlarinin B2B icinde calistirilan surumu</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5" />
              Ucarer Depo Karar Raporu
            </CardTitle>
            <CardDescription>Merkez veya Topca depo secip raporu getir</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={depot} onChange={(e) => setDepot(e.target.value as DepotType)} className="w-40">
                <option value="MERKEZ">MERKEZ</option>
                <option value="TOPCA">TOPCA</option>
              </Select>
              <Select value={depotLimit} onChange={(e) => setDepotLimit(e.target.value)} className="w-48">
                <option value="500">Ilk 500 satir</option>
                <option value="1000">Ilk 1000 satir</option>
                <option value="2000">Ilk 2000 satir</option>
                <option value="5000">Ilk 5000 satir</option>
                <option value="ALL">Tum satirlar</option>
              </Select>
              <Button onClick={loadDepotReport} disabled={depotLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${depotLoading ? 'animate-spin' : ''}`} />
                Raporu Getir
              </Button>
              <Button variant="outline" onClick={exportDepot} disabled={exportingDepot || depotRows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {exportingDepot ? 'Hazirlaniyor...' : "Excel'e Aktar"}
              </Button>
              <Link href="/reports/ucarer-minmax-exclusions">
                <Button variant="outline">MinMax Hesaplanmayacaklar Raporu</Button>
              </Link>
              <Select value={suggestionMode} onChange={(e) => setSuggestionMode(e.target.value as SuggestionMode)} className="w-56">
                <option value="INCLUDE_MINMAX">MinMax Dahil (4. Sorun)</option>
                <option value="EXCLUDE_MINMAX">MinMax Haric (3. Sorun)</option>
              </Select>
              <p className="text-sm text-gray-600">
                Toplam: <strong>{depotTotal.toLocaleString('tr-TR')}</strong>
                {depotLimited ? ` (ilk ${depotLimit} satir gosteriliyor)` : ''}
              </p>
              <p className="text-sm text-gray-700">
                Mod'a Gore Onerilen Toplam: <strong>{totalSuggestedQty.toLocaleString('tr-TR')}</strong>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border p-3 bg-white">
              <div className="text-xs text-gray-600 flex items-center">
                Kolon basliginin sag kenarindan surukleyerek kolon genisligini ayarlayabilirsiniz.
              </div>
              <label className="text-xs text-gray-700">
                Baslik Yuksekligi: <strong>{headerHeight}px</strong>
                <input
                  type="range"
                  min={30}
                  max={72}
                  step={2}
                  value={headerHeight}
                  onChange={(e) => setHeaderHeight(Number(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>
            </div>

            <div className="overflow-auto rounded-md border bg-white max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th
                      className="px-2 text-left font-semibold whitespace-nowrap sticky top-0 z-10 bg-gray-100 relative select-none"
                      style={{ minWidth: '180px', height: `${headerHeight}px` }}
                    >
                      Onerilen Miktar
                    </th>
                    <th
                      className="px-2 text-left font-semibold whitespace-nowrap sticky top-0 z-10 bg-gray-100 relative select-none"
                      style={{ minWidth: '180px', height: `${headerHeight}px` }}
                    >
                      MinMax Hesaplanmasin
                    </th>
                    {visibleDepotColumns.map((column) => (
                      <th
                        key={column}
                        className="px-2 text-left font-semibold whitespace-nowrap sticky top-0 z-10 bg-gray-100 relative select-none"
                        style={{ minWidth: `${getDepotColumnWidth(column)}px`, height: `${headerHeight}px` }}
                      >
                        {column}
                        <div
                          className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            beginResize('depot', column, e.clientX);
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depotRows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(3, visibleDepotColumns.length + 2)} className="px-2 py-6 text-center text-gray-500">
                        Kayit yok
                      </td>
                    </tr>
                  )}
                  {depotRows.map((row, index) => {
                    const rowCode = getDepotRowProductCode(row);
                    return (
                    <tr key={`${depot}-${index}`} className="border-t">
                      <td className="px-2 py-2 whitespace-nowrap font-semibold text-emerald-700">
                        {getSuggestedQty(row).toLocaleString('tr-TR')}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {rowCode ? (
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                              <input
                                type="checkbox"
                                checked={Boolean(resetMinMaxToZeroByCode[rowCode])}
                                onChange={(e) =>
                                  setResetMinMaxToZeroByCode((prev) => ({
                                    ...prev,
                                    [rowCode]: e.target.checked,
                                  }))
                                }
                                disabled={minMaxExcludedCodeSet.has(rowCode)}
                              />
                              0-0
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMinMaxExclusion(rowCode, !minMaxExcludedCodeSet.has(rowCode))}
                              disabled={Boolean(updatingMinMaxExclusionByCode[rowCode])}
                            >
                              {updatingMinMaxExclusionByCode[rowCode]
                                ? '...'
                                : minMaxExcludedCodeSet.has(rowCode)
                                ? 'MinMax Hesaplansin'
                                : 'MinMax Hesaplanmasin'}
                            </Button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      {visibleDepotColumns.map((column) => (
                        <td
                          key={`${column}-${index}`}
                          className="px-2 py-2 whitespace-nowrap"
                          style={{ minWidth: `${getDepotColumnWidth(column)}px` }}
                        >
                          {normalizeValue(row[column])}
                        </td>
                      ))}
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aile Operasyon Paneli</CardTitle>
            <CardDescription>
              Aile bazli oneriden sec, detayini ac, dagitimi tek panelden hizli yonet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3">
              <p className="text-sm text-gray-700">
                Aile olusturma ve urun ekleme islemleri ayri ekrana tasindi.
              </p>
              <Link href="/reports/product-families">
                <Button size="sm" variant="outline">Aile Yonetimine Git</Button>
              </Link>
            </div>

            <div className="rounded-md border bg-white p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <div>
                <p className="text-xs text-gray-600">Aile Sayisi</p>
                <p className="text-sm font-semibold text-gray-900">{familySuggestionsFiltered.length.toLocaleString('tr-TR')}</p>
              </div>
              <Button size="sm" onClick={createSupplierOrders} disabled={creatingOrders}>
                {creatingOrders ? 'Olusturuluyor...' : 'Toplu Siparis Olustur'}
              </Button>
              <Button size="sm" variant="secondary" onClick={createDepotTransferOrder} disabled={creatingTransferOrder}>
                {creatingTransferOrder ? 'Olusturuluyor...' : 'Toplu Depolar Arasi Siparis Olustur'}
              </Button>
              <Button size="sm" variant="outline" onClick={loadFamilies} disabled={familyLoading}>
                {familyLoading ? 'Yenileniyor...' : 'Aileleri Yenile'}
              </Button>
            </div>

            {lastCreatedOrders.length > 0 && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-900 mb-2">
                  Son olusturulan siparisler: {lastCreatedOrders.length.toLocaleString('tr-TR')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={downloadCreatedOrderPdfs} disabled={downloadingOrderPdfs}>
                    {downloadingOrderPdfs ? 'Hazirlaniyor...' : 'Tum Siparisleri PDF (tek tek)'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadCreatedOrdersSummaryPdf} disabled={downloadingOrderSummaryPdf}>
                    {downloadingOrderSummaryPdf ? 'Hazirlaniyor...' : 'Yonetici Onay Ozeti (tek PDF)'}
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-md border bg-white p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Aileler</p>
              <input
                type="text"
                value={familyListSearch}
                onChange={(e) => setFamilyListSearch(e.target.value)}
                className="mb-2 w-full rounded border px-2 py-1 text-xs"
                placeholder="Aile ara (ad/kod)"
              />
              <div className="space-y-2">
                {familySuggestionsFiltered.length === 0 && (
                  <p className="text-xs text-gray-500">Tanimli aile yok.</p>
                )}
                {suggestedFamilies.map((family) => (
                  <Fragment key={family.id}>
                    {(() => {
                      const hasRedirectSuggestions = Boolean(family.redirectSuggestions && family.redirectSuggestions.length > 0);
                      return (
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 ${
                        activeFamilyId === family.id
                          ? 'border-emerald-300 bg-emerald-50'
                          : hasRedirectSuggestions
                          ? 'border-emerald-400 bg-emerald-100'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {family.name} {family.code ? `(${family.code})` : ''}
                        </p>
                        <p className="text-xs text-gray-600">
                          Oneri: {family.suggestedRaw.toLocaleString('tr-TR')} | Kalem: {family.itemCount.toLocaleString('tr-TR')}
                        </p>
                      </div>
                      <Button size="sm" variant={activeFamilyId === family.id ? 'secondary' : 'outline'} onClick={() => toggleFamilyDetail(family.id)}>
                        {activeFamilyId === family.id ? 'Detayi Kapat' : 'Detayi Ac'}
                      </Button>
                    </div>
                      );
                    })()}
                    {activeFamilyId === family.id && renderActiveFamilyPanel()}
                  </Fragment>
                ))}
                {unsuggestedFamilies.length > 0 && (
                  <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-2">
                    <button
                      type="button"
                      className="w-full text-left text-xs font-semibold text-gray-700"
                      onClick={() => setShowUnsuggestedFamilies((prev) => !prev)}
                    >
                      Onerisiz Aileler ({unsuggestedFamilies.length.toLocaleString('tr-TR')}) {showUnsuggestedFamilies ? '▲' : '▼'}
                    </button>
                    {showUnsuggestedFamilies && (
                      <div className="mt-2 space-y-2">
                        {unsuggestedFamilies.map((family) => (
                          <Fragment key={family.id}>
                            <div
                              className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 ${
                                activeFamilyId === family.id ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">
                                  {family.name} {family.code ? `(${family.code})` : ''}
                                </p>
                                <p className="text-xs text-gray-600">
                                  Oneri: {family.suggestedRaw.toLocaleString('tr-TR')} | Kalem: {family.itemCount.toLocaleString('tr-TR')}
                                </p>
                              </div>
                              <Button size="sm" variant={activeFamilyId === family.id ? 'secondary' : 'outline'} onClick={() => toggleFamilyDetail(family.id)}>
                                {activeFamilyId === family.id ? 'Detayi Kapat' : 'Detayi Ac'}
                              </Button>
                            </div>
                            {activeFamilyId === family.id && renderActiveFamilyPanel()}
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {familyLoading && <p className="text-sm text-gray-500">Aileler yukleniyor...</p>}
            {!familyLoading && !activeFamily && families.length > 0 && (
              <p className="text-sm text-gray-500">Aile detayi acmak icin listeden "Detayi Ac" kullanin.</p>
            )}

            <div className="rounded-xl border bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-gray-900">Aile Disi Oneriler</p>
                  <p className="text-xs text-gray-600">Ailelere dahil olmayan ancak siparise donusturulebilen urunler.</p>
                </div>
                <p className="text-sm text-gray-700">
                  Kalem: <strong>{filteredNonFamilyRows.length.toLocaleString('tr-TR')}</strong>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  type="text"
                  value={nonFamilySearch}
                  onChange={(e) => setNonFamilySearch(e.target.value)}
                  className="w-full rounded border px-2 py-1 text-xs md:col-span-2"
                  placeholder="Aile disi onerilerde ara (stok kodu/adi/saglayici)"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Select
                    value={nonFamilyColorFilter}
                    onChange={(e) => setNonFamilyColorFilter(e.target.value as NonFamilyColorFilter)}
                    className="h-8 text-xs"
                  >
                    <option value="ALL">Renk: Tum</option>
                    <option value="GREEN">Renk: Yesil</option>
                    <option value="YELLOW">Renk: Sari</option>
                    <option value="RED">Renk: Kirmizi</option>
                    <option value="UNCOLORED">Renk: Renksiz</option>
                  </Select>
                  <Select
                    value={nonFamilyColorSort}
                    onChange={(e) => setNonFamilyColorSort(e.target.value as NonFamilyColorSort)}
                    className="h-8 text-xs"
                  >
                    <option value="NONE">Renk Sirala: Kapali</option>
                    <option value="RISK_DESC">Renk Sirala: Yuksek Risk</option>
                    <option value="RISK_ASC">Renk Sirala: Dusuk Risk</option>
                  </Select>
                </div>
              </div>
              <div className="overflow-x-auto overflow-y-auto rounded border max-h-[62vh]">
                <table className="w-max min-w-[2200px] text-[11px]">
                  <thead className="bg-gray-100 sticky top-0 z-20">
                    <tr>
                      <th
                        className="px-2 py-2 text-center sticky left-0 top-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)] cursor-pointer"
                        style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'color'))}
                      >
                        Sec{sortIndicator(nonFamilySort, 'color')}
                      </th>
                      <th
                        className="px-2 py-2 text-left sticky top-0 z-30 bg-gray-100 cursor-pointer"
                        style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'code'))}
                      >
                        Stok Kodu{sortIndicator(nonFamilySort, 'code')}
                      </th>
                      <th
                        className="px-2 py-2 text-left sticky top-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)] cursor-pointer"
                        style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                        onClick={() => setNonFamilySort((prev) => updateSort(prev, 'name'))}
                      >
                        Urun Adi{sortIndicator(nonFamilySort, 'name')}
                      </th>
                      <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'supplierCode'))}>Saglayici Kodu{sortIndicator(nonFamilySort, 'supplierCode')}</th>
                      <th className="px-2 py-2 text-left cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'supplierName'))}>Saglayici Adi{sortIndicator(nonFamilySort, 'supplierName')}</th>
                      <th className="px-2 py-2 text-center">Ana Saglayici</th>
                      <th className="px-2 py-2 text-center">Kalici Degistir</th>
                      <th className="px-2 py-2 text-center">MinMax Hesaplanmasin</th>
                      {panelColumns.depotQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'depotQty'))}>Depo Miktari{sortIndicator(nonFamilySort, 'depotQty')}</th>}
                      {panelColumns.topcaDepotQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'topcaDepotQty'))}>Topca Depo{sortIndicator(nonFamilySort, 'topcaDepotQty')}</th>}
                      {panelColumns.incomingOrders && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'incomingOrders'))}>Alinan Siparis{sortIndicator(nonFamilySort, 'incomingOrders')}</th>}
                      {panelColumns.outgoingOrders && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'outgoingOrders'))}>Verilen Siparis{sortIndicator(nonFamilySort, 'outgoingOrders')}</th>}
                      {panelColumns.realQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'realQty'))}>Reel Miktar{sortIndicator(nonFamilySort, 'realQty')}</th>}
                      {panelColumns.minQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'minQty'))}>Min{sortIndicator(nonFamilySort, 'minQty')}</th>}
                      {panelColumns.maxQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'maxQty'))}>Max{sortIndicator(nonFamilySort, 'maxQty')}</th>}
                      {panelColumns.packQty && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'packQty'))}>Koli Ici{sortIndicator(nonFamilySort, 'packQty')}</th>}
                      {panelColumns.costExVat && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'costExVat'))}>Maliyet KDV Haric{sortIndicator(nonFamilySort, 'costExVat')}</th>}
                      {panelColumns.costIncVat && <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'costIncVat'))}>Maliyet KDV Dahil{sortIndicator(nonFamilySort, 'costIncVat')}</th>}
                      {panelColumns.currentCost && <th className="px-2 py-2 text-right">Maliyet P/T</th>}
                      <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'suggested'))}>Oneri{sortIndicator(nonFamilySort, 'suggested')}</th>
                      <th className="px-2 py-2 text-right cursor-pointer" onClick={() => setNonFamilySort((prev) => updateSort(prev, 'allocation'))}>Dagitim{sortIndicator(nonFamilySort, 'allocation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNonFamilyRows.length === 0 && (
                      <tr>
                        <td colSpan={20} className="px-2 py-4 text-center text-gray-500">
                          Aile disi onerili urun yok.
                        </td>
                      </tr>
                    )}
                    {filteredNonFamilyRows.map((item) => {
                      const row = item.row;
                      const code = item.code;
                      const suggested = item.suggested;
                      const rawAllocated = nonFamilyAllocations[code];
                      const allocated = rawAllocated === '' || rawAllocated === undefined ? '' : item.allocation;
                      return (
                        <tr key={code} className={`border-t ${getRowHighlightClass(row)} ${isIncomingOrderRow(row) ? 'font-bold' : ''}`}>
                          <td
                            className={`px-2 py-2 text-center sticky left-0 z-20 shadow-[2px_0_0_0_rgba(229,231,235,1)] ${getStickyCellBgClass(row)}`}
                            style={{ minWidth: `${stickySelectionWidth}px`, width: `${stickySelectionWidth}px` }}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(selectedTransferByCode[code])}
                              onChange={(e) =>
                                setSelectedTransferByCode((prev) => ({
                                  ...prev,
                                  [code]: e.target.checked,
                                }))
                              }
                            />
                          </td>
                          <td
                            className={`px-2 py-2 font-semibold text-gray-900 sticky z-20 ${getStickyCellBgClass(row)}`}
                            style={{ left: `${stickyCodeLeft}px`, minWidth: `${stickyCodeWidth}px`, width: `${stickyCodeWidth}px` }}
                          >
                            {code}
                          </td>
                          <td
                            className={`px-2 py-2 text-gray-700 sticky z-20 shadow-[2px_0_0_0_rgba(229,231,235,1)] ${getStickyCellBgClass(row)}`}
                            style={{ left: `${stickyNameLeft}px`, minWidth: `${stickyNameWidth}px`, width: `${stickyNameWidth}px` }}
                          >
                            {productNameColumn ? normalizeValue(row?.[productNameColumn]) : '-'}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              list="ucarer-supplier-cari-list"
                              value={getEffectiveSupplierCode(code)}
                              onChange={(e) =>
                                setSupplierOverrideByCode((prev) => ({
                                  ...prev,
                                  [code]: String(e.target.value || '').trim().toUpperCase(),
                                }))
                              }
                              className="w-32 rounded border px-2 py-1 text-xs uppercase"
                              placeholder="Cari kodu"
                            />
                          </td>
                          <td className="px-2 py-2 text-gray-600">{getEffectiveSupplierName(code)}</td>
                          <td className="px-2 py-2 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateMainSupplier(code)}
                              disabled={Boolean(updatingSupplierByCode[code])}
                            >
                              {updatingSupplierByCode[code] ? '...' : 'Saglayiciyi Guncelle'}
                            </Button>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(persistSupplierOverrideByCode[code])}
                              onChange={(e) =>
                                setPersistSupplierOverrideByCode((prev) => ({
                                  ...prev,
                                  [code]: e.target.checked,
                                }))
                              }
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={Boolean(resetMinMaxToZeroByCode[code])}
                                  onChange={(e) =>
                                    setResetMinMaxToZeroByCode((prev) => ({
                                      ...prev,
                                      [code]: e.target.checked,
                                    }))
                                  }
                                  disabled={minMaxExcludedCodeSet.has(code)}
                                />
                                0-0
                              </label>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setMinMaxExclusion(code, !minMaxExcludedCodeSet.has(code))}
                                disabled={Boolean(updatingMinMaxExclusionByCode[code])}
                              >
                                {updatingMinMaxExclusionByCode[code]
                                  ? '...'
                                  : minMaxExcludedCodeSet.has(code)
                                  ? 'MinMax Hesaplansin'
                                  : 'MinMax Hesaplanmasin'}
                              </Button>
                            </div>
                          </td>
                          {panelColumns.depotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'depotQty')}</td>}
                          {panelColumns.topcaDepotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'topcaDepotQty')}</td>}
                          {panelColumns.incomingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'incomingOrders')}</td>}
                          {panelColumns.outgoingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'outgoingOrders')}</td>}
                          {panelColumns.realQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'realQty')}</td>}
                          {panelColumns.minQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'minQty')}</td>}
                          {panelColumns.maxQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'maxQty')}</td>}
                          {panelColumns.packQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'packQty')}</td>}
                          {panelColumns.costExVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costExVat')}</td>}
                          {panelColumns.costIncVat && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'costIncVat')}</td>}
                          {panelColumns.currentCost && (
                            <td className="px-2 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={costPInputByCode[code] ?? ''}
                                  onChange={(e) => {
                                    const rawValue = e.target.value;
                                    setCostPInputByCode((prev) => ({
                                      ...prev,
                                      [code]: rawValue,
                                    }));
                                    if (manualCostPOverrideByCode[code]) return;
                                    const parsed = Number(String(rawValue || '').replace(',', '.'));
                                    if (!Number.isFinite(parsed)) return;
                                    const vatRate = Number(vatRateByCode[code] ?? 0);
                                    const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                                    const autoCostP = parsed * (1 + vatPercent / 200);
                                    setCostTInputByCode((prev) => ({
                                      ...prev,
                                      [code]: Number.isFinite(autoCostP) ? autoCostP.toFixed(4).replace(/\.?0+$/, '') : prev[code] || '',
                                    }));
                                  }}
                                  className="w-20 rounded border px-2 py-1 text-right"
                                  title="Maliyet T"
                                  placeholder="T"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={costTInputByCode[code] ?? ''}
                                  onChange={(e) => {
                                    setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                                    setCostTInputByCode((prev) => ({
                                      ...prev,
                                      [code]: e.target.value,
                                    }));
                                  }}
                                  className="w-20 rounded border px-2 py-1 text-right"
                                  title="Maliyet P"
                                  placeholder="P"
                                />
                                <span className="text-[10px] text-gray-600">KDV %{((Number(vatRateByCode[code] ?? 0) <= 1 ? Number(vatRateByCode[code] ?? 0) * 100 : Number(vatRateByCode[code] ?? 0))).toLocaleString('tr-TR')}</span>
                                <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(updatePriceListsByCode[code])}
                                    onChange={(e) =>
                                      setUpdatePriceListsByCode((prev) => ({
                                        ...prev,
                                        [code]: e.target.checked,
                                      }))
                                    }
                                  />
                                  10 liste
                                </label>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateProductCost(code)}
                                  disabled={Boolean(updatingCostByCode[code])}
                                >
                                  {updatingCostByCode[code] ? '...' : 'Guncelle'}
                                </Button>
                              </div>
                            </td>
                          )}
                          <td className="px-2 py-2 text-right font-semibold text-emerald-700">{suggested.toLocaleString('tr-TR')}</td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              value={allocated}
                              onChange={(e) =>
                                setNonFamilyAllocations((prev) => ({
                                  ...prev,
                                  [code]:
                                    e.target.value === ''
                                      ? ''
                                      : Math.max(0, Math.trunc(Number(e.target.value || 0))),
                                }))
                              }
                              className="w-24 rounded border px-2 py-1 text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <datalist id="ucarer-supplier-cari-list">
              {cariOptions.map((cari) => (
                <option key={cari.code} value={cari.code}>
                  {cari.name}
                </option>
              ))}
            </datalist>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MinMax Dinamik Hesaplama</CardTitle>
            <CardDescription>`FEBG_MinMaxHesaplaRES` prosedurunu calistirir</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={runMinMax} disabled={minMaxLoading}>
                <Play className="mr-2 h-4 w-4" />
                {minMaxLoading ? 'Calisiyor...' : 'MinMax Calistir'}
              </Button>
              <Button variant="outline" onClick={exportMinMax} disabled={exportingMinMax || minMaxRows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                {exportingMinMax ? 'Hazirlaniyor...' : "Excel'e Aktar"}
              </Button>
              <p className="text-sm text-gray-600">
                Toplam: <strong>{minMaxTotal.toLocaleString('tr-TR')}</strong>
              </p>
            </div>

            <div className="overflow-auto rounded-md border bg-white max-h-[60vh]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    {visibleMinMaxColumns.map((column) => (
                      <th
                        key={column}
                        className="px-2 text-left font-semibold whitespace-nowrap sticky top-0 z-10 bg-gray-100 relative select-none"
                        style={{ minWidth: `${getMinMaxColumnWidth(column)}px`, height: `${headerHeight}px` }}
                      >
                        {column}
                        <div
                          className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            beginResize('minmax', column, e.clientX);
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {minMaxRows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(1, visibleMinMaxColumns.length)} className="px-2 py-6 text-center text-gray-500">
                        Kayit yok
                      </td>
                    </tr>
                  )}
                  {minMaxRows.map((row, index) => (
                    <tr key={`minmax-${index}`} className="border-t">
                      {visibleMinMaxColumns.map((column) => (
                        <td
                          key={`${column}-${index}`}
                          className="px-2 py-2 whitespace-nowrap"
                          style={{ minWidth: `${getMinMaxColumnWidth(column)}px` }}
                        >
                          {normalizeValue(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-300 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button onClick={createSupplierOrders} disabled={creatingOrders}>
                {creatingOrders ? 'Olusturuluyor...' : 'Toplu Siparis Olustur'}
              </Button>
              <Button variant="secondary" onClick={createDepotTransferOrder} disabled={creatingTransferOrder}>
                {creatingTransferOrder ? 'Olusturuluyor...' : 'Toplu Depolar Arasi Siparis Olustur'}
              </Button>
            </div>
          </div>
        </div>
        {seriesModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-4xl rounded-lg bg-white p-4 shadow-xl">
              <p className="text-base font-semibold text-gray-900">Cari Bazinda Siparis Ayarlari</p>
              <p className="mt-1 text-xs text-gray-600">
                Her cari icin seri, vergili/vergisiz, teslim turu ve teslim tarihi secin.
              </p>
              <div className="mt-3 max-h-[55vh] overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-2 text-center">Detay</th>
                      <th className="px-2 py-2 text-left">Cari</th>
                      <th className="px-2 py-2 text-left">Unvan</th>
                      <th className="px-2 py-2 text-right">Kalem</th>
                      <th className="px-2 py-2 text-right">Miktar</th>
                      <th className="px-2 py-2 text-left">Seri</th>
                      <th className="px-2 py-2 text-left">Vergi</th>
                      <th className="px-2 py-2 text-left">Teslim Turu</th>
                      <th className="px-2 py-2 text-left">Teslim Tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSupplierRows.map((row) => {
                      const cfg = supplierOrderConfigs[row.supplierCode] || {
                        series: 'H',
                        applyVAT: true,
                        deliveryType: 'B',
                        deliveryDate: '',
                      };
                      const detailRows = pendingSupplierItemsByCode[row.supplierCode] || [];
                      const isExpanded = Boolean(expandedSupplierRows[row.supplierCode]);
                      return (
                        <Fragment key={row.supplierCode}>
                          <tr className="border-t">
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded border bg-white"
                                onClick={() =>
                                  setExpandedSupplierRows((prev) => ({
                                    ...prev,
                                    [row.supplierCode]: !prev[row.supplierCode],
                                  }))
                                }
                                title="Urunleri goster/gizle"
                              >
                                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </button>
                            </td>
                            <td className="px-2 py-2 font-semibold">{row.supplierCode}</td>
                            <td className="px-2 py-2">{row.supplierName}</td>
                            <td className="px-2 py-2 text-right">{row.itemCount.toLocaleString('tr-TR')}</td>
                            <td className="px-2 py-2 text-right">{row.totalQuantity.toLocaleString('tr-TR')}</td>
                            <td className="px-2 py-2">
                              <input
                                className="w-20 rounded border px-2 py-1 uppercase"
                                maxLength={20}
                                value={cfg.series}
                                onChange={(e) =>
                                  setSupplierOrderConfigs((prev) => ({
                                    ...prev,
                                    [row.supplierCode]: {
                                      ...cfg,
                                      series: String(e.target.value || '').toUpperCase(),
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="px-2 py-2">
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={Boolean(cfg.applyVAT)}
                                  onChange={(e) =>
                                    setSupplierOrderConfigs((prev) => ({
                                      ...prev,
                                      [row.supplierCode]: {
                                        ...cfg,
                                        applyVAT: e.target.checked,
                                      },
                                    }))
                                  }
                                />
                                Vergili
                              </label>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                list="ucarer-delivery-type-list"
                                className="w-44 rounded border px-2 py-1"
                                placeholder="B / N"
                                value={cfg.deliveryType}
                                onChange={(e) =>
                                  setSupplierOrderConfigs((prev) => ({
                                    ...prev,
                                    [row.supplierCode]: {
                                      ...cfg,
                                      deliveryType: String(e.target.value || '').trim().toUpperCase(),
                                    },
                                  }))
                                }
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="date"
                                className="rounded border px-2 py-1"
                                value={cfg.deliveryDate}
                                onChange={(e) =>
                                  setSupplierOrderConfigs((prev) => ({
                                    ...prev,
                                    [row.supplierCode]: {
                                      ...cfg,
                                      deliveryDate: String(e.target.value || ''),
                                    },
                                  }))
                                }
                              />
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-t bg-gray-50">
                              <td className="px-2 py-2" />
                              <td className="px-2 py-2 text-[11px] text-gray-700" colSpan={8}>
                                <div className="space-y-1">
                                  {detailRows.map((item) => (
                                    <div key={`${row.supplierCode}-${item.productCode}`} className="flex items-center justify-between gap-4 rounded border bg-white px-2 py-1">
                                      <span className="font-medium text-gray-800">
                                        {item.productCode} - {item.productName}
                                      </span>
                                      <span className="text-gray-700">
                                        Miktar: <strong>{item.quantity.toLocaleString('tr-TR')}</strong>
                                      </span>
                                    </div>
                                  ))}
                                  {detailRows.length === 0 && (
                                    <div className="text-gray-500">Bu cari icin urun bulunamadi.</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <datalist id="ucarer-delivery-type-list">
                  <option value="B">B-Bakircilar Sevk</option>
                  <option value="N">N-Nama Sevk</option>
                </datalist>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (creatingOrders) return;
                    setSeriesModalOpen(false);
                  }}
                >
                  Vazgec
                </Button>
                <Button size="sm" onClick={submitCreateSupplierOrders} disabled={creatingOrders}>
                  {creatingOrders ? 'Olusturuluyor...' : 'Siparisleri Olustur'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
