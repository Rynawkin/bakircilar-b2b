'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Play, RefreshCw, Warehouse } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

type DepotType = 'MERKEZ' | 'TOPCA';

const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('tr-TR') : '-';
  if (value instanceof Date) return value.toLocaleDateString('tr-TR');
  const text = String(value).trim();
  return text ? text : '-';
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
  const [exportingDepot, setExportingDepot] = useState(false);
  const [exportingMinMax, setExportingMinMax] = useState(false);
  const [defaultColumnWidth, setDefaultColumnWidth] = useState(180);
  const [headerHeight, setHeaderHeight] = useState(44);
  const [depotColumnWidths, setDepotColumnWidths] = useState<Record<string, number>>({});
  const [minMaxColumnWidths, setMinMaxColumnWidths] = useState<Record<string, number>>({});
  const [selectedDepotColumn, setSelectedDepotColumn] = useState('');
  const [selectedMinMaxColumn, setSelectedMinMaxColumn] = useState('');

  const visibleDepotColumns = useMemo(() => depotColumns, [depotColumns]);
  const visibleMinMaxColumns = useMemo(() => minMaxColumns, [minMaxColumns]);

  const getDepotColumnWidth = (column: string) => depotColumnWidths[column] || defaultColumnWidth;
  const getMinMaxColumnWidth = (column: string) => minMaxColumnWidths[column] || defaultColumnWidth;

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
      if (!selectedDepotColumn && data.columns?.length) {
        setSelectedDepotColumn(data.columns[0]);
      }
      setDepotTotal(Number(data.total || 0));
      setDepotLimited(Boolean(data.limited));
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
      if (!selectedMinMaxColumn && data.columns?.length) {
        setSelectedMinMaxColumn(data.columns[0]);
      }
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
              <p className="text-sm text-gray-600">
                Toplam: <strong>{depotTotal.toLocaleString('tr-TR')}</strong>
                {depotLimited ? ` (ilk ${depotLimit} satir gosteriliyor)` : ''}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border p-3 bg-white">
              <label className="text-xs text-gray-700">
                Varsayilan Kolon Genisligi: <strong>{defaultColumnWidth}px</strong>
                <input
                  type="range"
                  min={120}
                  max={420}
                  step={10}
                  value={defaultColumnWidth}
                  onChange={(e) => setDefaultColumnWidth(Number(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border p-3 bg-white">
              <div>
                <p className="text-xs text-gray-700 mb-1">Kolon Sec</p>
                <Select value={selectedDepotColumn} onChange={(e) => setSelectedDepotColumn(e.target.value)}>
                  {visibleDepotColumns.length === 0 && <option value="">Kolon yok</option>}
                  {visibleDepotColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="text-xs text-gray-700">
                Secilen Kolon Genisligi:{' '}
                <strong>{selectedDepotColumn ? getDepotColumnWidth(selectedDepotColumn) : defaultColumnWidth}px</strong>
                <input
                  type="range"
                  min={120}
                  max={520}
                  step={10}
                  value={selectedDepotColumn ? getDepotColumnWidth(selectedDepotColumn) : defaultColumnWidth}
                  onChange={(e) => {
                    if (!selectedDepotColumn) return;
                    const next = Number(e.target.value);
                    setDepotColumnWidths((prev) => ({ ...prev, [selectedDepotColumn]: next }));
                  }}
                  className="mt-1 w-full"
                />
              </label>
            </div>

            <div className="overflow-auto rounded-md border bg-white max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    {visibleDepotColumns.map((column) => (
                      <th
                        key={column}
                        className="px-2 text-left font-semibold whitespace-nowrap sticky top-0 z-10 bg-gray-100"
                        style={{ minWidth: `${getDepotColumnWidth(column)}px`, height: `${headerHeight}px` }}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depotRows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(1, visibleDepotColumns.length)} className="px-2 py-6 text-center text-gray-500">
                        Kayit yok
                      </td>
                    </tr>
                  )}
                  {depotRows.map((row, index) => (
                    <tr key={`${depot}-${index}`} className="border-t">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border p-3 bg-white">
              <div>
                <p className="text-xs text-gray-700 mb-1">Kolon Sec</p>
                <Select value={selectedMinMaxColumn} onChange={(e) => setSelectedMinMaxColumn(e.target.value)}>
                  {visibleMinMaxColumns.length === 0 && <option value="">Kolon yok</option>}
                  {visibleMinMaxColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="text-xs text-gray-700">
                Secilen Kolon Genisligi:{' '}
                <strong>{selectedMinMaxColumn ? getMinMaxColumnWidth(selectedMinMaxColumn) : defaultColumnWidth}px</strong>
                <input
                  type="range"
                  min={120}
                  max={520}
                  step={10}
                  value={selectedMinMaxColumn ? getMinMaxColumnWidth(selectedMinMaxColumn) : defaultColumnWidth}
                  onChange={(e) => {
                    if (!selectedMinMaxColumn) return;
                    const next = Number(e.target.value);
                    setMinMaxColumnWidths((prev) => ({ ...prev, [selectedMinMaxColumn]: next }));
                  }}
                  className="mt-1 w-full"
                />
              </label>
            </div>

            <div className="overflow-auto rounded-md border bg-white max-h-[60vh]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    {visibleMinMaxColumns.map((column) => (
                      <th
                        key={column}
                        className="px-2 text-left font-semibold whitespace-nowrap sticky top-0 z-10 bg-gray-100"
                        style={{ minWidth: `${getMinMaxColumnWidth(column)}px`, height: `${headerHeight}px` }}
                      >
                        {column}
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
