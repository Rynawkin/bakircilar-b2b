'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Play, RefreshCw, Warehouse } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

type DepotType = 'MERKEZ' | 'TOPCA';
type SuggestionMode = 'INCLUDE_MINMAX' | 'EXCLUDE_MINMAX';
type AllocationMode = 'SINGLE' | 'TWO_SPLIT' | 'MANUAL';

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

export default function UcarerDepotReportPage() {
  const [depot, setDepot] = useState<DepotType>('MERKEZ');
  const [depotLimit, setDepotLimit] = useState<string>('1000');
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
  const rowByProductCode = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    if (!stockCodeColumn) return map;
    depotRows.forEach((row) => {
      const code = String(row?.[stockCodeColumn] || '').trim().toUpperCase();
      if (code) map.set(code, row);
    });
    return map;
  }, [depotRows, stockCodeColumn]);
  const familySuggestions = useMemo(() => {
    return families.map((family) => {
      let need = 0;
      family.items.forEach((item) => {
        const code = String(item.productCode || '').trim().toUpperCase();
        const row = rowByProductCode.get(code);
        if (row) need += getSuggestedQty(row);
      });
      return {
        id: family.id,
        name: family.name,
        code: family.code,
        itemCount: family.items.length,
        suggested: Math.max(0, need),
      };
    });
  }, [families, rowByProductCode, suggestionMode, thirdIssueColumn, fourthIssueColumn]);

  const getDepotColumnWidth = (column: string) => depotColumnWidths[column] || defaultColumnWidth;
  const getMinMaxColumnWidth = (column: string) => minMaxColumnWidths[column] || defaultColumnWidth;
  function getSuggestedQty(row: Record<string, any>): number {
    const sourceColumn = suggestionMode === 'INCLUDE_MINMAX' ? fourthIssueColumn : thirdIssueColumn;
    if (!sourceColumn) return 0;
    return Math.max(0, toNumberFlexible(row[sourceColumn]));
  }
  const totalSuggestedQty = useMemo(
    () => depotRows.reduce((sum, row) => sum + getSuggestedQty(row), 0),
    [depotRows, suggestionMode, thirdIssueColumn, fourthIssueColumn]
  );

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

    const XLSX = await import('xlsx');
    const normalizedRows = rows.map((row) => {
      const out: Record<string, unknown> = {};
      columns.forEach((column) => {
        out[column] = row?.[column] ?? null;
      });
      return out;
    });

    const worksheet = XLSX.utils.json_to_sheet(normalizedRows, { header: columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rapor');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  const removeFamily = async (familyId: string) => {
    try {
      await adminApi.deleteProductFamily(familyId);
      setFamilies((prev) => prev.filter((row) => row.id !== familyId));
      toast.success('Aile silindi');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aile silinemedi');
    }
  };

  const getFamilyNeed = (family: ProductFamily): number => {
    let total = 0;
    family.items.forEach((item) => {
      const code = String(item.productCode || '').trim().toUpperCase();
      const row = rowByProductCode.get(code);
      if (row) total += getSuggestedQty(row);
    });
    return Math.max(0, total);
  };

  const applySingleAllocation = (family: ProductFamily) => {
    const selectedCode =
      singleCodeByFamily[family.id] || String(family.items[0]?.productCode || '').toUpperCase();
    const need = getFamilyNeed(family);
    const next: Record<string, number> = {};
    family.items.forEach((item) => {
      const code = String(item.productCode || '').toUpperCase();
      next[code] = code === selectedCode ? need : 0;
    });
    setManualAllocations((prev) => ({ ...prev, [family.id]: next }));
  };

  const applySplitAllocation = (family: ProductFamily) => {
    const items = family.items.map((item) => String(item.productCode || '').toUpperCase());
    const a = splitAByFamily[family.id] || items[0] || '';
    const b = splitBByFamily[family.id] || items[1] || items[0] || '';
    if (!a || !b) return;
    const ratio = splitRatioByFamily[family.id] ?? 50;
    const need = getFamilyNeed(family);
    const qtyA = Math.round((need * ratio) / 100);
    const qtyB = Math.max(0, need - qtyA);
    const next: Record<string, number> = {};
    family.items.forEach((item) => {
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

            <div className="rounded-md border bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">Aile Bazli Oneri Ozeti</p>
                <Button size="sm" variant="outline" onClick={loadFamilies} disabled={familyLoading}>
                  {familyLoading ? 'Yenileniyor...' : 'Aileleri Yenile'}
                </Button>
              </div>
              {familySuggestions.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Tanimli aile yok. <Link href="/reports/product-families" className="underline">Aile yonetimi</Link> ekranindan olusturabilirsiniz.
                </p>
              ) : (
                <div className="overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-2 text-left">Aile</th>
                        <th className="px-2 py-2 text-right">Urun Sayisi</th>
                        <th className="px-2 py-2 text-right">
                          Oneri ({suggestionMode === 'INCLUDE_MINMAX' ? '4. Sorun' : '3. Sorun'})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {familySuggestions.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-2 py-2">
                            {row.name} {row.code ? `(${row.code})` : ''}
                          </td>
                          <td className="px-2 py-2 text-right">{row.itemCount.toLocaleString('tr-TR')}</td>
                          <td className="px-2 py-2 text-right font-semibold text-emerald-700">
                            {row.suggested.toLocaleString('tr-TR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stok Aileleri ve Dagitim</CardTitle>
            <CardDescription>
              Secili moda gore aile ihtiyacini hesapla ve ihtiyaci tek urun / iki urun / manuel dagit.
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

            <div className="space-y-3">
              {familyLoading && <p className="text-sm text-gray-500">Aileler yukleniyor...</p>}
              {!familyLoading && families.length === 0 && (
                <p className="text-sm text-gray-500">Tanimli aile yok.</p>
              )}

              {families.map((family) => {
                const familyNeed = getFamilyNeed(family);
                const mode = allocationModeByFamily[family.id] || 'MANUAL';
                const allocations = manualAllocations[family.id] || {};
                const allocatedTotal = family.items.reduce(
                  (sum, item) => sum + (allocations[String(item.productCode || '').toUpperCase()] || 0),
                  0
                );
                const remaining = familyNeed - allocatedTotal;

                return (
                  <div key={family.id} className="rounded-md border p-3 bg-white space-y-2">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div>
                        <p className="font-semibold text-sm">
                          {family.name} {family.code ? `(${family.code})` : ''}
                        </p>
                        <p className="text-xs text-gray-600">
                          Ihtiyac ({suggestionMode === 'INCLUDE_MINMAX' ? '4. Sorun' : '3. Sorun'}):{' '}
                          <strong>{familyNeed.toLocaleString('tr-TR')}</strong>
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => removeFamily(family.id)}>
                        Sil
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Dagitim Modu</p>
                        <Select
                          value={mode}
                          onChange={(e) =>
                            setAllocationModeByFamily((prev) => ({ ...prev, [family.id]: e.target.value as AllocationMode }))
                          }
                        >
                          <option value="SINGLE">Tek Urun</option>
                          <option value="TWO_SPLIT">Iki Urun</option>
                          <option value="MANUAL">Manuel</option>
                        </Select>
                      </div>

                      {mode === 'SINGLE' && (
                        <>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Urun</p>
                            <Select
                              value={singleCodeByFamily[family.id] || family.items[0]?.productCode || ''}
                              onChange={(e) =>
                                setSingleCodeByFamily((prev) => ({ ...prev, [family.id]: e.target.value }))
                              }
                            >
                              {family.items.map((item) => (
                                <option key={item.id} value={item.productCode}>
                                  {item.productCode}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <Button size="sm" onClick={() => applySingleAllocation(family)}>
                            Tek Urune Dagit
                          </Button>
                        </>
                      )}

                      {mode === 'TWO_SPLIT' && (
                        <>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Urun A</p>
                            <Select
                              value={splitAByFamily[family.id] || family.items[0]?.productCode || ''}
                              onChange={(e) => setSplitAByFamily((prev) => ({ ...prev, [family.id]: e.target.value }))}
                            >
                              {family.items.map((item) => (
                                <option key={item.id} value={item.productCode}>
                                  {item.productCode}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Urun B</p>
                            <Select
                              value={splitBByFamily[family.id] || family.items[1]?.productCode || family.items[0]?.productCode || ''}
                              onChange={(e) => setSplitBByFamily((prev) => ({ ...prev, [family.id]: e.target.value }))}
                            >
                              {family.items.map((item) => (
                                <option key={item.id} value={item.productCode}>
                                  {item.productCode}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600 mb-1">
                              A Urun Orani: <strong>{splitRatioByFamily[family.id] ?? 50}%</strong>
                            </p>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={splitRatioByFamily[family.id] ?? 50}
                              onChange={(e) =>
                                setSplitRatioByFamily((prev) => ({ ...prev, [family.id]: Number(e.target.value) }))
                              }
                              className="w-full"
                            />
                            <Button size="sm" className="mt-1 w-full" onClick={() => applySplitAllocation(family)}>
                              Iki Urune Dagit
                            </Button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="overflow-auto rounded border">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-2 py-2 text-left">Stok Kodu</th>
                            <th className="px-2 py-2 text-left">Urun Adi</th>
                            <th className="px-2 py-2 text-right">Dagitim Miktari</th>
                          </tr>
                        </thead>
                        <tbody>
                          {family.items.map((item) => {
                            const code = String(item.productCode || '').toUpperCase();
                            return (
                              <tr key={item.id} className="border-t">
                                <td className="px-2 py-2">{item.productCode}</td>
                                <td className="px-2 py-2">{item.productName || '-'}</td>
                                <td className="px-2 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={allocations[code] ?? 0}
                                    onChange={(e) => setManualAllocation(family.id, code, Number(e.target.value))}
                                    className="w-24 rounded border px-2 py-1 text-right"
                                    disabled={mode !== 'MANUAL'}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <p className={`text-xs ${remaining === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      Dagitim Toplami: {allocatedTotal.toLocaleString('tr-TR')} / Ihtiyac:{' '}
                      {familyNeed.toLocaleString('tr-TR')} / Kalan: {remaining.toLocaleString('tr-TR')}
                    </p>
                  </div>
                );
              })}
            </div>
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
      </div>
    </div>
  );
}
