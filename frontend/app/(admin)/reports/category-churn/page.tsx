'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { ArrowLeft, RefreshCw, AlertTriangle, Layers, Users } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { formatCurrency } from '@/lib/utils/format';
import toast from 'react-hot-toast';

type ReportMode = 'category' | 'customer';

interface CategoryChurnRow {
  customerCode?: string;
  customerName?: string;
  categoryCode?: string;
  categoryName?: string;
  lastPurchaseDate: string | null;
  historicalDocumentCount: number;
  historicalQuantity: number;
  historicalAmount: number;
}

interface CategoryOption {
  categoryCode: string;
  categoryName: string | null;
}

interface CategoryChurnDetailItem {
  productCode: string;
  productName: string;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  documentCount: number;
  totalQuantity: number;
  totalAmount: number;
}

interface CategoryChurnSummary {
  totalRows: number;
  affectedCustomers: number;
  affectedCategories: number;
}

interface CategoryChurnMetadata {
  mode: ReportMode;
  inactiveMonths: number;
  inactiveStartDate: string;
  endDate: string;
  activeCustomerMonths: number | null;
  category?: {
    categoryCode: string;
    categoryName: string | null;
  };
  customer?: {
    customerCode: string;
    customerName: string | null;
  };
}

interface SubmittedParams {
  mode: ReportMode;
  categoryCode?: string;
  customerCode?: string;
  inactiveMonths: number;
  activeCustomerMonths?: number;
}

export default function CategoryChurnReportPage() {
  const [mode, setMode] = useState<ReportMode>('category');
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categorySearching, setCategorySearching] = useState(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);

  const [inactiveMonths, setInactiveMonths] = useState('4');
  const [activeFilterEnabled, setActiveFilterEnabled] = useState(true);
  const [activeCustomerMonths, setActiveCustomerMonths] = useState('4');

  const [submitted, setSubmitted] = useState<SubmittedParams | null>(null);
  const [rows, setRows] = useState<CategoryChurnRow[]>([]);
  const [summary, setSummary] = useState<CategoryChurnSummary | null>(null);
  const [metadata, setMetadata] = useState<CategoryChurnMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openDetailKey, setOpenDetailKey] = useState<string | null>(null);
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const [detailsByKey, setDetailsByKey] = useState<Record<string, CategoryChurnDetailItem[]>>({});

  useEffect(() => {
    if (mode !== 'category') return;
    const handle = setTimeout(async () => {
      setCategorySearching(true);
      try {
        const result = await adminApi.getCategoryOptions({
          search: categorySearch.trim() || undefined,
          limit: 20,
        });
        setCategoryOptions(result?.data?.categories || []);
      } catch (_err) {
        setCategoryOptions([]);
      } finally {
        setCategorySearching(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [mode, categorySearch]);

  useEffect(() => {
    if (mode !== 'customer') return;
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerOptions([]);
      return;
    }

    const handle = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const result = await adminApi.searchCustomers({ searchTerm: term, limit: 12, offset: 0 });
        setCustomerOptions(result.data || []);
      } catch (_err) {
        setCustomerOptions([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [customerSearch, mode]);

  const parseCustomerOption = (item: any) => {
    const code = String(item?.['msg_S_1032'] ?? item?.customerCode ?? '').trim();
    const name = String(item?.['msg_S_1033'] ?? item?.customerName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const handleSelectCustomer = (item: any) => {
    const parsed = parseCustomerOption(item);
    if (!parsed.code) return;
    setCustomerCode(parsed.code);
    setCustomerName(parsed.name);
    setCustomerSearch(parsed.label || parsed.code);
    setCustomerOptions([]);
  };

  const handleSelectCategory = (item: CategoryOption) => {
    setCategoryCode(item.categoryCode);
    setCategoryName(item.categoryName || '');
    setCategorySearch(`${item.categoryCode} - ${item.categoryName || '-'}`);
    setCategoryOptions([]);
  };

  const runReport = () => {
    const inactive = Number(inactiveMonths);
    if (!Number.isFinite(inactive) || inactive <= 0) {
      toast.error('Almama suresi (ay) gecersiz');
      return;
    }

    let activeMonthsValue: number | undefined;
    if (activeFilterEnabled) {
      const parsedActive = Number(activeCustomerMonths);
      if (!Number.isFinite(parsedActive) || parsedActive <= 0) {
        toast.error('Aktif cari suresi (ay) gecersiz');
        return;
      }
      activeMonthsValue = Math.floor(parsedActive);
    }

    if (mode === 'category') {
      let normalizedCategory = categoryCode.trim().toUpperCase();
      if (!normalizedCategory && categorySearch.trim()) {
        const term = categorySearch.trim().toLowerCase();
        const matched = categoryOptions.find((item) => {
          const code = item.categoryCode.toLowerCase();
          const name = (item.categoryName || '').toLowerCase();
          return code === term || name === term;
        });
        if (matched) {
          normalizedCategory = matched.categoryCode.toUpperCase();
          setCategoryCode(matched.categoryCode);
          setCategoryName(matched.categoryName || '');
          setCategorySearch(`${matched.categoryCode} - ${matched.categoryName || '-'}`);
        }
      }
      if (!normalizedCategory) {
        toast.error('Kategori secin');
        return;
      }
      setPage(1);
      setSubmitted({
        mode,
        categoryCode: normalizedCategory,
        inactiveMonths: Math.floor(inactive),
        activeCustomerMonths: activeMonthsValue,
      });
      return;
    }

    const normalizedCustomer = (customerCode.trim() || customerSearch.trim()).toUpperCase();
    if (!normalizedCustomer) {
      toast.error('Cari secin');
      return;
    }

    setPage(1);
    setSubmitted({
      mode,
      customerCode: normalizedCustomer,
      inactiveMonths: Math.floor(inactive),
      activeCustomerMonths: activeMonthsValue,
    });
  };

  const fetchReport = async (params: SubmittedParams, currentPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getCategoryChurnReport({
        mode: params.mode,
        categoryCode: params.categoryCode,
        customerCode: params.customerCode,
        inactiveMonths: params.inactiveMonths,
        activeCustomerMonths: params.activeCustomerMonths,
        page: currentPage,
        limit: 50,
      });

      if (!result.success) {
        throw new Error('Rapor yuklenemedi');
      }

      setRows(result.data.rows || []);
      setSummary(result.data.summary || null);
      setMetadata(result.data.metadata || null);
      setTotalPages(result.data.pagination?.totalPages || 1);
      setOpenDetailKey(null);
      setDetailLoadingKey(null);
      setDetailsByKey({});
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submitted) return;
    fetchReport(submitted, page);
  }, [submitted, page]);

  const tableMode = metadata?.mode || mode;
  const detailColSpan = tableMode === 'category' ? 8 : 7;

  const getRowKey = (row: CategoryChurnRow, index: number) => {
    const customerKey = row.customerCode || metadata?.customer?.customerCode || '-';
    const categoryKey = row.categoryCode || metadata?.category?.categoryCode || '-';
    return `${tableMode}:${customerKey}:${categoryKey}:${index}`;
  };

  const toggleDetail = async (row: CategoryChurnRow, index: number) => {
    const rowKey = getRowKey(row, index);
    if (openDetailKey === rowKey) {
      setOpenDetailKey(null);
      return;
    }

    setOpenDetailKey(rowKey);
    if (detailsByKey[rowKey]) return;

    const detailCategoryCode = row.categoryCode || metadata?.category?.categoryCode || '';
    const detailCustomerCode =
      tableMode === 'category'
        ? row.customerCode || ''
        : metadata?.customer?.customerCode || row.customerCode || '';

    if (!detailCategoryCode || !detailCustomerCode) {
      toast.error('Detay icin cari veya kategori bilgisi eksik');
      return;
    }

    setDetailLoadingKey(rowKey);
    try {
      const result = await adminApi.getCategoryChurnDetail({
        mode: tableMode,
        categoryCode: detailCategoryCode,
        customerCode: detailCustomerCode,
        inactiveMonths: metadata?.inactiveMonths || submitted?.inactiveMonths,
      });
      if (!result.success) {
        throw new Error('Detay yuklenemedi');
      }
      setDetailsByKey((prev) => ({
        ...prev,
        [rowKey]: result.data.items || [],
      }));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Detay yuklenemedi');
      setOpenDetailKey(null);
    } finally {
      setDetailLoadingKey(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link href="/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Raporlara Don
            </Button>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-8 w-8 text-primary-600" />
            Kategori Alim Kaybi Raporu
          </h1>
          <p className="text-sm text-muted-foreground">
            Musterinin daha once alip secili suredir almadigi kategorileri listeler
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => submitted && fetchReport(submitted, page)} disabled={!submitted}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Yenile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
          <CardDescription>
            Kategori bazli veya cari bazli raporu secin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rapor Modu</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === 'category' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('category')}
                >
                  Kategori Bazli
                </Button>
                <Button
                  type="button"
                  variant={mode === 'customer' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('customer')}
                >
                  Cari Bazli
                </Button>
              </div>
            </div>

            {mode === 'category' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    label="Kategori Ara"
                    placeholder="Kategori kodu veya adi ile ara"
                    value={categorySearch}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setCategoryCode('');
                      setCategoryName('');
                    }}
                  />
                  {categorySearching && (
                    <div className="absolute right-3 top-9 text-xs text-gray-500">Araniyor...</div>
                  )}
                  {!categoryCode && categoryOptions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {categoryOptions.map((item, index) => (
                        <button
                          type="button"
                          key={`${item.categoryCode}-${index}`}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                          onClick={() => handleSelectCategory(item)}
                        >
                          <div className="text-sm font-semibold">{item.categoryCode}</div>
                          <div className="text-xs text-gray-500">{item.categoryName || '-'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {categoryCode && (
                  <div className="text-xs text-gray-500">
                    Secilen kategori: {categoryCode} {categoryName ? `- ${categoryName}` : ''}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    label="Cari Ara"
                    placeholder="Kod veya isim ile ara"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setCustomerCode('');
                      setCustomerName('');
                    }}
                  />
                  {customerSearching && (
                    <div className="absolute right-3 top-9 text-xs text-gray-500">Araniyor...</div>
                  )}
                  {!customerCode && customerOptions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {customerOptions.map((item, index) => {
                        const parsed = parseCustomerOption(item);
                        if (!parsed.code) return null;
                        return (
                          <button
                            type="button"
                            key={`${parsed.code}-${index}`}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50"
                            onClick={() => handleSelectCustomer(item)}
                          >
                            <div className="text-sm font-semibold">{parsed.code}</div>
                            <div className="text-xs text-gray-500">{parsed.name || '-'}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {customerName && (
                  <div className="text-xs text-gray-500">Secilen cari: {customerName}</div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Alim Yok Suresi (Ay)</label>
              <Select value={inactiveMonths} onChange={(e) => setInactiveMonths(e.target.value)}>
                <option value="2">Son 2 Ay</option>
                <option value="3">Son 3 Ay</option>
                <option value="4">Son 4 Ay</option>
                <option value="6">Son 6 Ay</option>
                <option value="12">Son 12 Ay</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Aktif Cari Filtresi</label>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={activeFilterEnabled}
                  onChange={(e) => setActiveFilterEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary-600"
                />
                <Input
                  type="number"
                  min="1"
                  value={activeCustomerMonths}
                  onChange={(e) => setActiveCustomerMonths(e.target.value)}
                  disabled={!activeFilterEnabled}
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">ayda satisi olanlar</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={runReport}>Raporu Getir</Button>
          </div>
        </CardContent>
      </Card>

      {metadata && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Mod</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {metadata.mode === 'category' ? 'Kategori Bazli' : 'Cari Bazli'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Alim Kesilme Araligi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {metadata.inactiveStartDate} - {metadata.endDate}
              </div>
              <div className="text-xs text-muted-foreground">
                {metadata.inactiveMonths} aydir alim yok
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Secim</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {metadata.category
                  ? `${metadata.category.categoryCode} - ${metadata.category.categoryName || '-'}`
                  : metadata.customer
                    ? `${metadata.customer.customerCode} - ${metadata.customer.customerName || '-'}`
                    : '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                Aktif cari filtresi: {metadata.activeCustomerMonths ? `Son ${metadata.activeCustomerMonths} ay` : 'Yok'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam Kayit</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalRows}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Etkilenen Cari</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{summary.affectedCustomers}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Etkilenen Kategori</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.affectedCategories}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Yukleniyor...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto mb-4 text-red-500" />
              <p className="text-red-600">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Veri bulunamadi</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {tableMode === 'category' ? (
                      <>
                        <TableHead>Cari Kodu</TableHead>
                        <TableHead>Cari Adi</TableHead>
                        <TableHead>Kategori</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Kategori Kodu</TableHead>
                        <TableHead>Kategori Adi</TableHead>
                      </>
                    )}
                    <TableHead>Son Alim Tarihi</TableHead>
                    <TableHead className="text-right">Gecmis Evrak</TableHead>
                    <TableHead className="text-right">Gecmis Miktar</TableHead>
                    <TableHead className="text-right">Gecmis Tutar</TableHead>
                    <TableHead className="text-right">Detay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const rowKey = getRowKey(row, index);
                    const detailOpen = openDetailKey === rowKey;
                    const detailLoading = detailLoadingKey === rowKey;
                    const detailItems = detailsByKey[rowKey] || [];

                    return (
                      <Fragment key={rowKey}>
                        <TableRow key={`${rowKey}-main`}>
                          {tableMode === 'category' ? (
                            <>
                              <TableCell className="font-mono text-sm">{row.customerCode || '-'}</TableCell>
                              <TableCell>{row.customerName || '-'}</TableCell>
                              <TableCell className="font-mono text-sm">{row.categoryCode || '-'}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-mono text-sm">{row.categoryCode || '-'}</TableCell>
                              <TableCell>{row.categoryName || '-'}</TableCell>
                            </>
                          )}
                          <TableCell>{row.lastPurchaseDate || '-'}</TableCell>
                          <TableCell className="text-right">{row.historicalDocumentCount}</TableCell>
                          <TableCell className="text-right">
                            {Number(row.historicalQuantity || 0).toLocaleString('tr-TR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(Number(row.historicalAmount || 0))}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => toggleDetail(row, index)}>
                              {detailOpen ? 'Detayi Kapat' : 'Detay Ac'}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {detailOpen && (
                          <TableRow key={`${rowKey}-detail`}>
                            <TableCell colSpan={detailColSpan} className="bg-slate-50">
                              {detailLoading ? (
                                <div className="py-3 text-sm text-slate-600">Detay yukleniyor...</div>
                              ) : detailItems.length === 0 ? (
                                <div className="py-3 text-sm text-slate-600">Bu satir icin detay bulunamadi.</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-200 text-slate-600">
                                        <th className="text-left py-2 pr-3">Urun Kodu</th>
                                        <th className="text-left py-2 pr-3">Urun Adi</th>
                                        <th className="text-left py-2 pr-3">Ilk Alim</th>
                                        <th className="text-left py-2 pr-3">Son Alim</th>
                                        <th className="text-right py-2 pr-3">Evrak</th>
                                        <th className="text-right py-2 pr-3">Miktar</th>
                                        <th className="text-right py-2">Tutar</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detailItems.map((item, detailIndex) => (
                                        <tr key={`${rowKey}-detail-${detailIndex}`} className="border-b border-slate-100">
                                          <td className="py-2 pr-3 font-mono">{item.productCode}</td>
                                          <td className="py-2 pr-3">{item.productName}</td>
                                          <td className="py-2 pr-3">{item.firstPurchaseDate || '-'}</td>
                                          <td className="py-2 pr-3">{item.lastPurchaseDate || '-'}</td>
                                          <td className="py-2 pr-3 text-right">{item.documentCount}</td>
                                          <td className="py-2 pr-3 text-right">
                                            {Number(item.totalQuantity || 0).toLocaleString('tr-TR', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </td>
                                          <td className="py-2 text-right font-semibold">
                                            {formatCurrency(Number(item.totalAmount || 0))}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Sayfa {page} / {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      disabled={page === 1}
                    >
                      Onceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={page === totalPages}
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
