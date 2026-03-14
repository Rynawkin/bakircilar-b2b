'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { adminApi } from '@/lib/api/admin';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';

type SortDirection = 'asc' | 'desc';
type ColumnId =
  | 'productCode'
  | 'productName'
  | 'mainSupplier'
  | 'category'
  | 'stock'
  | 'currentCost'
  | 'lastEntryPrice'
  | 'lastEntryDate'
  | 'list1'
  | 'list2'
  | 'list3'
  | 'list4'
  | 'list5'
  | 'list6'
  | 'list7'
  | 'list8'
  | 'list9'
  | 'list10';

const PAGE_SIZE = 200;
const VISIBLE_COLUMNS_KEY = 'cost-update-all-products-visible-columns-v1';
const STICKY_CODE_WIDTH = 170;
const STICKY_NAME_WIDTH = 340;

const COLUMN_DEFS: Array<{ id: ColumnId; label: string }> = [
  { id: 'productCode', label: 'Urun Kodu' },
  { id: 'productName', label: 'Urun Adi' },
  { id: 'mainSupplier', label: 'Ana Saglayici' },
  { id: 'category', label: 'Kategori' },
  { id: 'stock', label: 'Toplam Stok' },
  { id: 'currentCost', label: 'Guncel Maliyet' },
  { id: 'lastEntryPrice', label: 'Son Giris Maliyeti' },
  { id: 'lastEntryDate', label: 'Son Giris Tarihi' },
  { id: 'list1', label: 'Liste 1' },
  { id: 'list2', label: 'Liste 2' },
  { id: 'list3', label: 'Liste 3' },
  { id: 'list4', label: 'Liste 4' },
  { id: 'list5', label: 'Liste 5' },
  { id: 'list6', label: 'Liste 6' },
  { id: 'list7', label: 'Liste 7' },
  { id: 'list8', label: 'Liste 8' },
  { id: 'list9', label: 'Liste 9' },
  { id: 'list10', label: 'Liste 10' },
];

const DEFAULT_COLUMNS: ColumnId[] = [
  'productCode',
  'productName',
  'mainSupplier',
  'category',
  'stock',
  'currentCost',
  'lastEntryPrice',
  'lastEntryDate',
  'list1',
  'list2',
  'list3',
  'list4',
  'list5',
  'list6',
  'list7',
  'list8',
  'list9',
  'list10',
];

const toMoney = (value: unknown) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const toDate = (value: unknown) => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('tr-TR');
};

export default function CostUpdateAllProductsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(DEFAULT_COLUMNS);
  const [sortKey, setSortKey] = useState<ColumnId>('productCode');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [mainSupplierByCode, setMainSupplierByCode] = useState<Record<string, { code: string; name: string }>>({});
  const [costPInputByCode, setCostPInputByCode] = useState<Record<string, string>>({});
  const [costTInputByCode, setCostTInputByCode] = useState<Record<string, string>>({});
  const [manualCostPOverrideByCode, setManualCostPOverrideByCode] = useState<Record<string, boolean>>({});
  const [vatRateByCode, setVatRateByCode] = useState<Record<string, number>>({});
  const [updatePriceListsByCode, setUpdatePriceListsByCode] = useState<Record<string, boolean>>({});
  const [updatingByCode, setUpdatingByCode] = useState<Record<string, boolean>>({});
  const [currentCostOverrideByCode, setCurrentCostOverrideByCode] = useState<Record<string, number>>({});
  const [priceListOverrideByCode, setPriceListOverrideByCode] = useState<Record<string, Record<number, number>>>({});
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{ code: string; costP: number; costT: number; oldCost: number } | null>(null);

  const loadData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await adminApi.getProducts({
        limit: 10000,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      const products = response.products || [];
      setRows(products);
      setTotalRecords(Number(response?.pagination?.total || products.length || 0));

      const supplierMap: Record<string, { code: string; name: string }> = {};
      const vatMap: Record<string, number> = {};
      const codes = products
        .map((item: any) => String(item?.mikroCode || '').trim().toUpperCase())
        .filter(Boolean);
      const chunks: string[][] = [];
      for (let i = 0; i < codes.length; i += 200) chunks.push(codes.slice(i, i + 200));
      const detailResponses = await Promise.all(chunks.map((chunk) => adminApi.getProductsByCodes(chunk)));
      detailResponses.forEach((detail) => {
        (detail.products || []).forEach((product: any) => {
          const code = String(product?.mikroCode || '').trim().toUpperCase();
          const supplierCode = String(product?.mainSupplierCode || '').trim().toUpperCase();
          const supplierName = String(product?.mainSupplierName || '').trim();
          const vatRate = Number(product?.vatRate ?? 0);
          if (code && supplierCode) supplierMap[code] = { code: supplierCode, name: supplierName || supplierCode };
          if (code && Number.isFinite(vatRate)) vatMap[code] = vatRate;
        });
      });
      setMainSupplierByCode(supplierMap);
      setVatRateByCode(vatMap);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(VISIBLE_COLUMNS_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as ColumnId[];
      const valid = parsed.filter((id) => COLUMN_DEFS.some((column) => column.id === id));
      if (valid.length > 0) setVisibleColumns(valid);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleSort = (key: ColumnId) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDirection('asc');
        return key;
      }
      setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return prev;
    });
  };

  const sortIndicator = (key: ColumnId) => (sortKey === key ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '');

  const getColumnValue = (item: any, key: ColumnId): string | number => {
    const code = String(item?.mikroCode || '').trim().toUpperCase();
    const overridePriceList = priceListOverrideByCode[code] || {};
    const mikroPriceLists = item?.mikroPriceLists || {};
    if (key === 'productCode') return code;
    if (key === 'productName') return String(item?.name || '');
    if (key === 'mainSupplier') return `${mainSupplierByCode[code]?.code || ''} ${mainSupplierByCode[code]?.name || ''}`.trim();
    if (key === 'category') return String(item?.category?.name || '');
    if (key === 'stock') return Number(item?.totalStock ?? 0);
    if (key === 'currentCost') return Number(currentCostOverrideByCode[code] ?? item?.currentCost ?? 0);
    if (key === 'lastEntryPrice') return Number(item?.lastEntryPrice ?? 0);
    if (key === 'lastEntryDate') return item?.lastEntryDate ? new Date(item.lastEntryDate).getTime() : 0;
    const listNo = Number(key.replace('list', ''));
    if (listNo >= 1 && listNo <= 10) return Number(overridePriceList[listNo] ?? mikroPriceLists[listNo] ?? 0);
    return '';
  };

  const filteredAndSortedRows = useMemo(() => {
    const tokens = buildSearchTokens(search);
    const filtered = rows.filter((item) => {
      if (tokens.length === 0) return true;
      const code = String(item?.mikroCode || '').trim().toUpperCase();
      const supplier = mainSupplierByCode[code];
      const haystack = normalizeSearchText(
        `${item?.name || ''} ${code} ${item?.category?.name || ''} ${supplier?.code || ''} ${supplier?.name || ''}`
      );
      return matchesSearchTokens(haystack, tokens);
    });
    filtered.sort((a, b) => {
      const av = getColumnValue(a, sortKey);
      const bv = getColumnValue(b, sortKey);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDirection === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av || '').localeCompare(String(bv || ''), 'tr', { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return filtered;
  }, [rows, search, sortKey, sortDirection, mainSupplierByCode, currentCostOverrideByCode, priceListOverrideByCode]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredAndSortedRows.length / PAGE_SIZE)), [filteredAndSortedRows.length]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAndSortedRows.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedRows, page]);

  const toggleColumn = (column: ColumnId) => {
    if (column === 'productCode' || column === 'productName') return;
    setVisibleColumns((prev) => {
      if (prev.includes(column)) {
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== column);
      }
      return [...prev, column];
    });
  };

  const shouldUpdatePriceLists = (code: string) => updatePriceListsByCode[code] !== false;

  const executeCostUpdate = async (code: string, costP: number, costT: number) => {
    setUpdatingByCode((prev) => ({ ...prev, [code]: true }));
    try {
      const result = await adminApi.updateUcarerProductCost({
        productCode: code,
        costP,
        costT,
        updatePriceLists: shouldUpdatePriceLists(code),
      });
      const nextCost = Number(result?.data?.currentCost ?? costP);
      setCurrentCostOverrideByCode((prev) => ({ ...prev, [code]: nextCost }));

      const updatedLists: Array<{ listNo: number; value: number }> = result?.data?.updatedLists || [];
      if (updatedLists.length > 0) {
        setPriceListOverrideByCode((prev) => {
          const base = { ...(prev[code] || {}) };
          updatedLists.forEach((entry) => {
            if (Number.isFinite(Number(entry.listNo))) {
              base[Number(entry.listNo)] = Number(entry.value ?? 0);
            }
          });
          return { ...prev, [code]: base };
        });
      }

      if (shouldUpdatePriceLists(code)) toast.success('Maliyet ve 10 fiyat listesi guncellendi.');
      else toast.success('Guncel maliyet guncellendi.');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Guncelleme basarisiz');
    } finally {
      setUpdatingByCode((prev) => ({ ...prev, [code]: false }));
    }
  };

  const updateCost = async (item: any) => {
    const code = String(item?.mikroCode || '').trim().toUpperCase();
    const costP = Number(String(costPInputByCode[code] || '').replace(',', '.'));
    const costT = Number(String(costTInputByCode[code] || '').replace(',', '.'));
    if (!Number.isFinite(costP) || costP <= 0) return toast.error('Gecerli bir Maliyet P girin.');
    if (!Number.isFinite(costT) || costT <= 0) return toast.error('Gecerli bir Maliyet T girin.');

    if (shouldUpdatePriceLists(code)) {
      const oldCost = Number(currentCostOverrideByCode[code] ?? item?.currentCost ?? 0);
      setPendingUpdate({ code, costP, costT, oldCost });
      setConfirmModalOpen(true);
      return;
    }

    await executeCostUpdate(code, costP, costT);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Raporlara Don
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Tum Urunler Maliyet ve Fiyat Guncelleme</h1>
          <p className="text-sm text-gray-600">Tum aktif urunleri gor, kolonlarini sec, sirala ve maliyet + 10 liste guncelle.</p>
        </div>
        <Button variant="outline" onClick={() => loadData(false)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtre ve Kolonlar</CardTitle>
          <CardDescription>Kolon secimini kaydeder, tekrar girdiginde ayni gorunur.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Urun adi, kod, kategori, ana saglayici..."
          />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {COLUMN_DEFS.map((column) => (
              <label key={column.id} className="inline-flex items-center gap-2 rounded border px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                  disabled={column.id === 'productCode' || column.id === 'productName'}
                />
                {column.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-600">
            Toplam urun: <strong>{totalRecords.toLocaleString('tr-TR')}</strong> | Filtre sonucu: <strong>{filteredAndSortedRows.length.toLocaleString('tr-TR')}</strong> | Bu sayfa: <strong>{pagedRows.length.toLocaleString('tr-TR')}</strong>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-600">Yukleniyor...</div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-max min-w-[2400px] text-xs">
                <thead className="sticky top-0 z-10 bg-gray-100">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th
                        key={column}
                        className={`cursor-pointer whitespace-nowrap border-b px-2 py-2 text-left ${
                          column === 'productCode'
                            ? 'sticky left-0 z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)]'
                            : column === 'productName'
                            ? 'sticky z-30 bg-gray-100 shadow-[2px_0_0_0_rgba(229,231,235,1)]'
                            : ''
                        }`}
                        onClick={() => toggleSort(column)}
                        style={
                          column === 'productCode'
                            ? { minWidth: `${STICKY_CODE_WIDTH}px`, width: `${STICKY_CODE_WIDTH}px` }
                            : column === 'productName'
                            ? { left: `${STICKY_CODE_WIDTH}px`, minWidth: `${STICKY_NAME_WIDTH}px`, width: `${STICKY_NAME_WIDTH}px` }
                            : undefined
                        }
                      >
                        {COLUMN_DEFS.find((c) => c.id === column)?.label}{sortIndicator(column)}
                      </th>
                    ))}
                    <th className="whitespace-nowrap border-b px-2 py-2 text-left">Maliyet Guncelle</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((item) => {
                    const code = String(item?.mikroCode || '').trim().toUpperCase();
                    const supplier = mainSupplierByCode[code];
                    const mikroPriceLists = item?.mikroPriceLists || {};
                    const overriddenLists = priceListOverrideByCode[code] || {};
                    const currentCost = Number(currentCostOverrideByCode[code] ?? item?.currentCost ?? 0);
                    const vatRate = Number(vatRateByCode[code] ?? item?.vatRate ?? 0);
                    return (
                      <tr key={code} className="border-b">
                        {visibleColumns.map((column) => {
                          let value: React.ReactNode = '-';
                          if (column === 'productCode') value = code;
                          else if (column === 'productName') value = item?.name || '-';
                          else if (column === 'mainSupplier') value = supplier ? `${supplier.code} - ${supplier.name}` : '-';
                          else if (column === 'category') value = item?.category?.name || '-';
                          else if (column === 'stock') value = Number(item?.totalStock ?? 0).toLocaleString('tr-TR');
                          else if (column === 'currentCost') value = toMoney(currentCost);
                          else if (column === 'lastEntryPrice') value = toMoney(item?.lastEntryPrice ?? 0);
                          else if (column === 'lastEntryDate') value = toDate(item?.lastEntryDate);
                          else if (column.startsWith('list')) {
                            const listNo = Number(column.replace('list', ''));
                            value = toMoney(overriddenLists[listNo] ?? mikroPriceLists[listNo] ?? 0);
                          }
                          return (
                            <td
                              key={`${code}-${column}`}
                              className={`whitespace-nowrap px-2 py-2 ${
                                column === 'productCode'
                                  ? 'sticky left-0 z-20 bg-white font-mono shadow-[2px_0_0_0_rgba(229,231,235,1)]'
                                  : column === 'productName'
                                  ? 'sticky z-20 bg-white shadow-[2px_0_0_0_rgba(229,231,235,1)]'
                                  : ''
                              }`}
                              style={
                                column === 'productCode'
                                  ? { minWidth: `${STICKY_CODE_WIDTH}px`, width: `${STICKY_CODE_WIDTH}px` }
                                  : column === 'productName'
                                  ? { left: `${STICKY_CODE_WIDTH}px`, minWidth: `${STICKY_NAME_WIDTH}px`, width: `${STICKY_NAME_WIDTH}px` }
                                  : undefined
                              }
                            >
                              {value}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={costPInputByCode[code] ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setCostPInputByCode((prev) => ({ ...prev, [code]: raw }));
                                if (manualCostPOverrideByCode[code]) return;
                                const parsed = Number(String(raw || '').replace(',', '.'));
                                if (!Number.isFinite(parsed)) return;
                                const vatPercent = vatRate <= 1 ? vatRate * 100 : vatRate;
                                const autoCostT = parsed * (1 + vatPercent / 200);
                                setCostTInputByCode((prev) => ({
                                  ...prev,
                                  [code]: Number.isFinite(autoCostT) ? autoCostT.toFixed(4).replace(/\.?0+$/, '') : prev[code] || '',
                                }));
                              }}
                              className="h-8 w-20 text-right"
                              placeholder="T"
                            />
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={costTInputByCode[code] ?? ''}
                              onChange={(e) => {
                                setManualCostPOverrideByCode((prev) => ({ ...prev, [code]: true }));
                                setCostTInputByCode((prev) => ({ ...prev, [code]: e.target.value }));
                              }}
                              className="h-8 w-20 text-right"
                              placeholder="P"
                            />
                            <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                              <input
                                type="checkbox"
                                checked={shouldUpdatePriceLists(code)}
                                onChange={(e) => setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: e.target.checked }))}
                              />
                              10 liste
                            </label>
                            <Button size="sm" variant="outline" onClick={() => updateCost(item)} disabled={Boolean(updatingByCode[code])}>
                              {updatingByCode[code] ? '...' : 'Guncelle'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3">
              <p className="text-xs text-gray-600">Sayfa {page} / {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
                  Onceki
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {confirmModalOpen && pendingUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <p className="text-base font-semibold text-gray-900">Maliyet Artis Onayi</p>
            <div className="mt-3 space-y-1 text-sm text-gray-700">
              <p><strong>Urun:</strong> {pendingUpdate.code}</p>
              <p><strong>Eski Maliyet:</strong> {toMoney(pendingUpdate.oldCost)}</p>
              <p><strong>Yeni Maliyet:</strong> {toMoney(pendingUpdate.costP)}</p>
              <p>
                <strong>Artis:</strong>{' '}
                {pendingUpdate.oldCost > 0
                  ? `%${(((pendingUpdate.costP - pendingUpdate.oldCost) / pendingUpdate.oldCost) * 100).toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : 'Hesaplanamadi'}
              </p>
              <p className="text-xs text-gray-600">10 fiyat listesi de bu maliyete gore guncellenecek.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConfirmModalOpen(false);
                  setPendingUpdate(null);
                }}
              >
                Vazgec
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  const payload = pendingUpdate;
                  setConfirmModalOpen(false);
                  setPendingUpdate(null);
                  await executeCostUpdate(payload.code, payload.costP, payload.costT);
                }}
              >
                Onayla ve Guncelle
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
