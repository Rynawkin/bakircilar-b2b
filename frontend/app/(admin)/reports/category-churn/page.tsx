'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { ArrowLeft, RefreshCw, AlertTriangle, Layers, Users } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
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
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

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

  useEffect(() => {
    let active = true;
    const loadCategories = async () => {
      try {
        const result = await adminApi.getReportCategories();
        if (!active) return;
        setCategoryOptions(result?.data?.categories || []);
      } catch (_err) {
        if (!active) return;
        setCategoryOptions([]);
      }
    };
    loadCategories();
    return () => {
      active = false;
    };
  }, []);

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
      const normalizedCategory = categoryCode.trim();
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
                <label className="text-sm font-medium">Kategori</label>
                <Select value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)}>
                  <option value="">Kategori secin</option>
                  {categoryOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.customerCode || row.categoryCode}-${index}`}>
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
                    </TableRow>
                  ))}
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

