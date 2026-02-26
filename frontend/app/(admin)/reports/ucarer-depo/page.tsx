'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Play, RefreshCw, Warehouse, WandSparkles } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

type DepotType = 'MERKEZ' | 'TOPCA';
type SuggestionMode = 'INCLUDE_MINMAX' | 'EXCLUDE_MINMAX';
type AllocationMode = 'SINGLE' | 'TWO_SPLIT' | 'MANUAL';
type OpsExtraColumnKey =
  | 'depotQty'
  | 'incomingOrders'
  | 'outgoingOrders'
  | 'realQty'
  | 'minQty'
  | 'maxQty'
  | 'currentCost';

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
    incomingOrders: true,
    outgoingOrders: true,
    realQty: false,
    minQty: false,
    maxQty: false,
    currentCost: true,
  });
  const [currentCostByCode, setCurrentCostByCode] = useState<Record<string, number>>({});
  const [mainSupplierByCode, setMainSupplierByCode] = useState<Record<string, { code: string; name: string }>>({});
  const [supplierOverrideByCode, setSupplierOverrideByCode] = useState<Record<string, string>>({});
  const [persistSupplierOverrideByCode, setPersistSupplierOverrideByCode] = useState<Record<string, boolean>>({});
  const [cariOptions, setCariOptions] = useState<Array<{ code: string; name: string }>>([]);
  const [seriesModalOpen, setSeriesModalOpen] = useState(false);
  const [seriesInput, setSeriesInput] = useState('H');
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
  const [exportingDepot, setExportingDepot] = useState(false);
  const [exportingMinMax, setExportingMinMax] = useState(false);
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
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

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
  const realQtyColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('reel miktar'));
  }, [visibleDepotColumns]);
  const minQtyColumn = useMemo(() => {
    return visibleDepotColumns.find((column) => normalizeKey(column).includes('minimum miktar'));
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
      let redirectSuggestion: string | null = null;
      if (Math.trunc(rawNeed) < 0) {
        const source = itemSignals
          .filter((item) => item.raw > 0)
          .sort((a, b) => b.orderDriven - a.orderDriven)[0];
        const target = itemSignals
          .filter((item) => item.raw < 0)
          .sort((a, b) => a.raw - b.raw)[0];
        if (source && target) {
          if (source.incomingOrders > 0) {
            redirectSuggestion = `Siparis yonlendirme onerisi: ${source.code} ihtiyaci, aile ici fazla stok olan ${target.code} urunune yonlendirilebilir.`;
          } else {
            redirectSuggestion = `Depo yonlendirme onerisi: ${source.code} ihtiyaci, aile ici fazla stok olan ${target.code} urunune yonlendirilebilir.`;
          }
        }
      }
      return {
        id: family.id,
        name: family.name,
        code: family.code,
        itemCount: visibleItems.length,
        suggestedRaw: Math.trunc(rawNeed),
        suggested: Math.max(0, Math.trunc(rawNeed)),
        redirectSuggestion,
      };
    });
  }, [families, rowByProductCode, suggestionMode, thirdIssueColumn, fourthIssueColumn, incomingOrderColumn]);
  const getDepotColumnWidth = (column: string) => depotColumnWidths[column] || defaultColumnWidth;
  const getMinMaxColumnWidth = (column: string) => minMaxColumnWidths[column] || defaultColumnWidth;
  function getRawSuggestedQty(row: Record<string, any>): number {
    const sourceColumn = suggestionMode === 'INCLUDE_MINMAX' ? fourthIssueColumn : thirdIssueColumn;
    if (!sourceColumn) return 0;
    return toNumberFlexible(row[sourceColumn]);
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
        const supplierMap: Record<string, { code: string; name: string }> = {};
        for (let i = 0; i < codeList.length; i += 200) {
          const chunk = codeList.slice(i, i + 200);
          const response = await adminApi.getProductsByCodes(chunk);
          (response.products || []).forEach((product: any) => {
            const code = String(product?.mikroCode || '').trim().toUpperCase();
            const costValue = Number(product?.currentCost ?? 0);
            const mainSupplierCode = String(product?.mainSupplierCode || '').trim().toUpperCase();
            const mainSupplierName = String(product?.mainSupplierName || '').trim();
            if (code && Number.isFinite(costValue)) {
              costMap[code] = costValue;
            }
            if (code && mainSupplierCode) {
              supplierMap[code] = { code: mainSupplierCode, name: mainSupplierName || mainSupplierCode };
            }
          });
        }
        if (active) {
          setCurrentCostByCode(costMap);
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
          setMainSupplierByCode({});
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [families, nonFamilyRows, depotRows, suggestionMode]);

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

  useEffect(() => {
    loadFamilies();
  }, []);

  useEffect(() => {
    if (families.length === 0) {
      setActiveFamilyId('');
      return;
    }
    if (!activeFamilyId || !families.some((family) => family.id === activeFamilyId)) {
      setActiveFamilyId(families[0].id);
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
    if (key === 'incomingOrders') return valueFrom(incomingOrderColumn);
    if (key === 'outgoingOrders') return valueFrom(outgoingOrderColumn);
    if (key === 'realQty') return valueFrom(realQtyColumn);
    if (key === 'minQty') return valueFrom(minQtyColumn);
    if (key === 'maxQty') return valueFrom(maxQtyColumn);
    if (key === 'currentCost') {
      const currentCost = currentCostByCode[code];
      return Number.isFinite(currentCost) ? currentCost.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
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

  const activeFamily = useMemo(
    () => families.find((family) => family.id === activeFamilyId) || null,
    [families, activeFamilyId]
  );
  const activeFamilySuggestion = useMemo(
    () => familySuggestions.find((item) => item.id === activeFamilyId) || null,
    [familySuggestions, activeFamilyId]
  );
  const activeFamilyItems = activeFamily ? getVisibleFamilyItems(activeFamily) : [];

  const activeFamilyAllocations = activeFamily ? (manualAllocations[activeFamily.id] || {}) : {};
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
    supplierCodeOverride?: string | null;
    persistSupplierOverride?: boolean;
  }> => {
    const allocations: Array<{
      familyId?: string | null;
      productCode: string;
      quantity: number;
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
          supplierCodeOverride,
          persistSupplierOverride: Boolean(persistSupplierOverrideByCode[item.code]),
        });
      }
    });
    return allocations;
  };

  const createSupplierOrders = async () => {
    const allocations = buildOrderAllocations();

    if (allocations.length === 0) {
      toast.error('Siparis olusturmak icin once dagitim miktari girin.');
      return;
    }
    setPendingAllocations(allocations);
    setSeriesInput('H');
    setSeriesModalOpen(true);
  };

  const submitCreateSupplierOrders = async () => {
    const series = String(seriesInput || '').trim().toUpperCase();
    if (!series) {
      toast.error('Siparis serisi zorunlu.');
      return;
    }
    if (!pendingAllocations.length) {
      toast.error('Siparis olusturmak icin dagitim bulunamadi.');
      return;
    }

    setCreatingOrders(true);
    try {
      const result = await adminApi.createSupplierOrdersFromFamilyAllocations({
        depot,
        series,
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
      setSeriesModalOpen(false);
      setPendingAllocations([]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Tedarikci siparisleri olusturulamadi');
    } finally {
      setCreatingOrders(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
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
                      <td colSpan={Math.max(2, visibleDepotColumns.length + 1)} className="px-2 py-6 text-center text-gray-500">
                        Kayit yok
                      </td>
                    </tr>
                  )}
                  {depotRows.map((row, index) => (
                    <tr key={`${depot}-${index}`} className="border-t">
                      <td className="px-2 py-2 whitespace-nowrap font-semibold text-emerald-700">
                        {getSuggestedQty(row).toLocaleString('tr-TR')}
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
                  ))}
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
              <div className="md:col-span-2">
                <p className="text-xs text-gray-600 mb-1">Aile Sec</p>
                <Select
                  value={activeFamilyId}
                  onChange={(e) => {
                    setActiveFamilyId(e.target.value);
                    setPanelHighlight(true);
                    setTimeout(() => setPanelHighlight(false), 900);
                    setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
                  }}
                >
                  {familySuggestions.map((family) => (
                    <option key={family.id} value={family.id}>
                      {family.name} {family.code ? `(${family.code})` : ''} - Oneri: {family.suggestedRaw.toLocaleString('tr-TR')}
                    </option>
                  ))}
                </Select>
              </div>
              <Button size="sm" onClick={createSupplierOrders} disabled={creatingOrders}>
                {creatingOrders ? 'Olusturuluyor...' : 'Toplu Siparis Olustur'}
              </Button>
              <Button size="sm" variant="outline" onClick={loadFamilies} disabled={familyLoading}>
                {familyLoading ? 'Yenileniyor...' : 'Aileleri Yenile'}
              </Button>
            </div>

            <div className="rounded-md border bg-white p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Operasyon Kolonlari (ac/kapat)</p>
              <div className="flex flex-wrap gap-3 text-xs text-gray-700">
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={panelColumns.depotQty} onChange={(e) => setPanelColumns((p) => ({ ...p, depotQty: e.target.checked }))} />
                  Depo Miktari
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
                  Guncel Maliyet
                </label>
              </div>
            </div>

            {familyLoading && <p className="text-sm text-gray-500">Aileler yukleniyor...</p>}
            {!familyLoading && !activeFamily && (
              <p className="text-sm text-gray-500">Tanimli aile yok.</p>
            )}

            {activeFamily && (
              <div
                ref={detailPanelRef}
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
                {activeFamilySuggestion?.redirectSuggestion && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <strong>Yonlendirme Onerisi:</strong> {activeFamilySuggestion.redirectSuggestion}
                  </div>
                )}

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
                      value={allocationModeByFamily[activeFamily.id] || 'MANUAL'}
                      onChange={(e) =>
                        setAllocationModeByFamily((prev) => ({ ...prev, [activeFamily.id]: e.target.value as AllocationMode }))
                      }
                    >
                      <option value="SINGLE">Tek Urun</option>
                      <option value="TWO_SPLIT">Iki Urun</option>
                      <option value="MANUAL">Manuel</option>
                    </Select>
                  </div>

                  {(allocationModeByFamily[activeFamily.id] || 'MANUAL') === 'SINGLE' && (
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

                  {(allocationModeByFamily[activeFamily.id] || 'MANUAL') === 'TWO_SPLIT' && (
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

                <div className="overflow-auto rounded border bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-2 text-left">Stok Kodu</th>
                        <th className="px-2 py-2 text-left">Urun Adi</th>
                        <th className="px-2 py-2 text-left">Saglayici Kodu</th>
                        <th className="px-2 py-2 text-left">Saglayici Adi</th>
                        <th className="px-2 py-2 text-center">Kalici Degistir</th>
                        {panelColumns.depotQty && <th className="px-2 py-2 text-right">Depo Miktari</th>}
                        {panelColumns.incomingOrders && <th className="px-2 py-2 text-right">Alinan Siparis</th>}
                        {panelColumns.outgoingOrders && <th className="px-2 py-2 text-right">Verilen Siparis</th>}
                        {panelColumns.realQty && <th className="px-2 py-2 text-right">Reel Miktar</th>}
                        {panelColumns.minQty && <th className="px-2 py-2 text-right">Min</th>}
                        {panelColumns.maxQty && <th className="px-2 py-2 text-right">Max</th>}
                        {panelColumns.currentCost && <th className="px-2 py-2 text-right">Guncel Maliyet</th>}
                        <th className="px-2 py-2 text-right">Aile Oneri</th>
                        <th className="px-2 py-2 text-right">Dagitim</th>
                        <th className="px-2 py-2 text-right">Fark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeFamilyItems.length === 0 && (
                        <tr>
                          <td colSpan={20} className="px-2 py-4 text-center text-gray-500">
                            Bu ailede Ucarer raporunda tum degerleri sifir olan urunler gizlendi. Gorunen urun yok.
                          </td>
                        </tr>
                      )}
                      {activeFamilyItems.map((item) => {
                        const code = String(item.productCode || '').toUpperCase();
                        const row = rowByProductCode.get(code);
                        const itemNeed = row ? getRawSuggestedQty(row) : 0;
                        const allocation = activeFamilyAllocations[code] ?? 0;
                        const diff = allocation - itemNeed;
                        const mode = allocationModeByFamily[activeFamily.id] || 'MANUAL';
                        return (
                          <tr key={item.id} className="border-t">
                            <td className="px-2 py-2 font-semibold text-gray-900">{item.productCode}</td>
                            <td className="px-2 py-2 text-gray-700">{item.productName || '-'}</td>
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
                            {panelColumns.depotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'depotQty')}</td>}
                            {panelColumns.incomingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'incomingOrders')}</td>}
                            {panelColumns.outgoingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'outgoingOrders')}</td>}
                            {panelColumns.realQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'realQty')}</td>}
                            {panelColumns.minQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'minQty')}</td>}
                            {panelColumns.maxQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'maxQty')}</td>}
                            {panelColumns.currentCost && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'currentCost')}</td>}
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
            )}

            <div className="rounded-xl border bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-gray-900">Aile Disi Oneriler</p>
                  <p className="text-xs text-gray-600">Ailelere dahil olmayan ancak siparise donusturulebilen urunler.</p>
                </div>
                <p className="text-sm text-gray-700">
                  Kalem: <strong>{nonFamilyRows.length.toLocaleString('tr-TR')}</strong>
                </p>
              </div>
              <div className="overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-2 text-left">Stok Kodu</th>
                      <th className="px-2 py-2 text-left">Urun Adi</th>
                      <th className="px-2 py-2 text-left">Saglayici Kodu</th>
                      <th className="px-2 py-2 text-left">Saglayici Adi</th>
                      <th className="px-2 py-2 text-center">Kalici Degistir</th>
                      {panelColumns.depotQty && <th className="px-2 py-2 text-right">Depo Miktari</th>}
                      {panelColumns.incomingOrders && <th className="px-2 py-2 text-right">Alinan Siparis</th>}
                      {panelColumns.outgoingOrders && <th className="px-2 py-2 text-right">Verilen Siparis</th>}
                      {panelColumns.realQty && <th className="px-2 py-2 text-right">Reel Miktar</th>}
                      {panelColumns.minQty && <th className="px-2 py-2 text-right">Min</th>}
                      {panelColumns.maxQty && <th className="px-2 py-2 text-right">Max</th>}
                      {panelColumns.currentCost && <th className="px-2 py-2 text-right">Guncel Maliyet</th>}
                      <th className="px-2 py-2 text-right">Oneri</th>
                      <th className="px-2 py-2 text-right">Dagitim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonFamilyRows.length === 0 && (
                      <tr>
                        <td colSpan={20} className="px-2 py-4 text-center text-gray-500">
                          Aile disi onerili urun yok.
                        </td>
                      </tr>
                    )}
                    {nonFamilyRows.map((item) => {
                      const row = item.row;
                      const code = item.code;
                      const suggested = Math.max(0, Math.trunc(getSuggestedQty(row)));
                      const rawAllocated = nonFamilyAllocations[code];
                      const allocated = rawAllocated === '' || rawAllocated === undefined
                        ? ''
                        : Math.max(0, Math.trunc(Number(rawAllocated)));
                      return (
                        <tr key={code} className="border-t">
                          <td className="px-2 py-2 font-semibold text-gray-900">{code}</td>
                          <td className="px-2 py-2 text-gray-700">{productNameColumn ? normalizeValue(row?.[productNameColumn]) : '-'}</td>
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
                          {panelColumns.depotQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'depotQty')}</td>}
                          {panelColumns.incomingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'incomingOrders')}</td>}
                          {panelColumns.outgoingOrders && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'outgoingOrders')}</td>}
                          {panelColumns.realQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'realQty')}</td>}
                          {panelColumns.minQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'minQty')}</td>}
                          {panelColumns.maxQty && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'maxQty')}</td>}
                          {panelColumns.currentCost && <td className="px-2 py-2 text-right">{getExtraColumnValue(row || {}, code, 'currentCost')}</td>}
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
        {seriesModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
              <p className="text-base font-semibold text-gray-900">Siparis Serisi</p>
              <p className="mt-1 text-xs text-gray-600">
                Toplu siparis olusturmadan once kullanilacak seri kodunu girin.
              </p>
              <div className="mt-3">
                <label className="text-xs text-gray-700">Seri</label>
                <input
                  value={seriesInput}
                  onChange={(e) => setSeriesInput(String(e.target.value || '').toUpperCase())}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm uppercase"
                  maxLength={20}
                  placeholder="H"
                />
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
