'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ArrowLeft, RefreshCw, Package, Users, AlertTriangle } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

interface ComplementMissingItem {
  productCode: string;
  productName: string;
}

interface ComplementMissingRow {
  customerCode?: string;
  customerName?: string;
  productCode?: string;
  productName?: string;
  documentCount?: number;
  missingComplements: ComplementMissingItem[];
  missingCount: number;
}

interface ComplementMissingMetadata {
  mode: 'product' | 'customer';
  matchMode: 'product' | 'category' | 'group';
  periodMonths: number;
  startDate: string;
  endDate: string;
  baseProduct?: {
    productCode: string;
    productName: string;
  };
  customer?: {
    customerCode: string;
    customerName: string | null;
  };
  sectorCode?: string | null;
  salesRep?: {
    id: string;
    name: string | null;
    email: string | null;
    assignedSectorCodes: string[];
  };
  minDocumentCount?: number | null;
}

interface ComplementMissingSummary {
  totalRows: number;
  totalMissing: number;
}

interface ComplementMissingParams {
  mode: 'product' | 'customer';
  matchMode: 'product' | 'category' | 'group';
  productCode?: string;
  customerCode?: string;
  periodMonths: number;
  sectorCode?: string;
  salesRepId?: string;
  minDocumentCount?: number;
}

type RowActionType = 'note' | 'campaign';

export default function ComplementMissingReportPage() {
  const [mode, setMode] = useState<'product' | 'customer'>('product');
  const [matchMode, setMatchMode] = useState<'product' | 'category' | 'group'>('product');
  const [productSearch, setProductSearch] = useState('');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productOptions, setProductOptions] = useState<any[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [periodMonths, setPeriodMonths] = useState<6 | 12>(6);
  const [sectorCode, setSectorCode] = useState('');
  const [sectorOptions, setSectorOptions] = useState<string[]>([]);
  const [salesRepId, setSalesRepId] = useState('');
  const [salesRepOptions, setSalesRepOptions] = useState<Array<{
    id: string;
    name: string;
    email: string;
    assignedSectorCodes: string[];
  }>>([]);
  const [minDocumentEnabled, setMinDocumentEnabled] = useState(false);
  const [minDocumentCount, setMinDocumentCount] = useState('3');
  const [submitted, setSubmitted] = useState<ComplementMissingParams | null>(null);
  const [rows, setRows] = useState<ComplementMissingRow[]>([]);
  const [summary, setSummary] = useState<ComplementMissingSummary | null>(null);
  const [metadata, setMetadata] = useState<ComplementMissingMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [actionRow, setActionRow] = useState<ComplementMissingRow | null>(null);
  const [actionType, setActionType] = useState<RowActionType | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const parseProductOption = (item: any) => {
    const code = String(item?.['msg_S_0078'] ?? item?.productCode ?? '').trim();
    const name = String(item?.['msg_S_0870'] ?? item?.productName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const parseCustomerOption = (item: any) => {
    const code = String(item?.['msg_S_1032'] ?? item?.customerCode ?? '').trim();
    const name = String(item?.['msg_S_1033'] ?? item?.customerName ?? '').trim();
    const label = [code, name].filter(Boolean).join(' - ');
    return { code, name, label };
  };

  const handleSelectProduct = (item: any) => {
    const parsed = parseProductOption(item);
    if (!parsed.code) return;
    setProductCode(parsed.code);
    setProductName(parsed.name);
    setProductSearch(parsed.label || parsed.code);
    setProductOptions([]);
  };

  const handleSelectCustomer = (item: any) => {
    const parsed = parseCustomerOption(item);
    if (!parsed.code) return;
    setCustomerCode(parsed.code);
    setCustomerName(parsed.name);
    setCustomerSearch(parsed.label || parsed.code);
    setCustomerOptions([]);
  };

  useEffect(() => {
    if (mode === 'product') {
      setCustomerSearch('');
      setCustomerCode('');
      setCustomerName('');
      setCustomerOptions([]);
      setCustomerSearching(false);
      return;
    }
    setProductSearch('');
    setProductCode('');
    setProductName('');
    setProductOptions([]);
    setProductSearching(false);
  }, [mode]);

  useEffect(() => {
    let active = true;

    const loadFilters = async () => {
      const results = await Promise.allSettled([
        adminApi.getSectorCodes(),
        adminApi.getStaffMembers(),
      ]);

      if (!active) return;

      const sectorResult = results[0];
      if (sectorResult.status === 'fulfilled') {
        setSectorOptions(sectorResult.value.sectorCodes || []);
      }

      const staffResult = results[1];
      if (staffResult.status === 'fulfilled') {
        const reps = (staffResult.value.staff || [])
          .filter((member) => member.role === 'SALES_REP' && member.active)
          .map((member) => ({
            id: member.id,
            name: member.name,
            email: member.email,
            assignedSectorCodes: member.assignedSectorCodes || [],
          }));
        setSalesRepOptions(reps);
      }
    };

    loadFilters();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'product') return;
    const term = productSearch.trim();
    if (term.length < 2) {
      setProductOptions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setProductSearching(true);
      try {
        const result = await adminApi.searchStocks({ searchTerm: term, limit: 12, offset: 0 });
        setProductOptions(result.data || []);
      } catch (_err) {
        setProductOptions([]);
      } finally {
        setProductSearching(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [productSearch, mode]);

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

  const handleRunReport = () => {
    const productValue = productCode.trim() || productSearch.trim();
    const customerValue = customerCode.trim() || customerSearch.trim();
    let minDocumentValue: number | undefined;

    if (minDocumentEnabled) {
      const parsed = Number(minDocumentCount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.error('Minimum evrak sayisi girin');
        return;
      }
      minDocumentValue = Math.floor(parsed);
    }

    setPage(1);
    setSubmitted({
      mode,
      matchMode,
      periodMonths,
      productCode: productValue || undefined,
      customerCode: customerValue || undefined,
      sectorCode: sectorCode.trim() || undefined,
      salesRepId: salesRepId.trim() || undefined,
      minDocumentCount: minDocumentValue,
    });
  };

  const fetchReport = async (params: ComplementMissingParams, currentPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const result = await adminApi.getComplementMissingReport({
        mode: params.mode,
        matchMode: params.matchMode,
        productCode: params.productCode,
        customerCode: params.customerCode,
        sectorCode: params.sectorCode,
        salesRepId: params.salesRepId,
        periodMonths: params.periodMonths,
        page: currentPage,
        limit: 50,
        minDocumentCount: params.minDocumentCount,
      });

      if (result.success) {
        setRows(result.data.rows || []);
        setSummary(result.data.summary || null);
        setMetadata(result.data.metadata || null);
        setTotalPages(result.data.pagination?.totalPages || 1);
      } else {
        throw new Error('Rapor yuklenemedi');
      }
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

  const tableMode = metadata?.mode ?? mode;
  const matchModeValue = metadata?.matchMode ?? matchMode;
  const matchModeLabel = matchModeValue === 'category' ? 'Kategori' : matchModeValue === 'group' ? 'Grup' : 'Urun';
  const showProductMode = mode === 'product';
  const showProductTable = tableMode === 'product';

  const renderMissingList = (items: ComplementMissingItem[]) => {
    if (items.length === 0) return '-';

    return (
      <div className="space-y-1">
        {items.map((item) => (
          <div key={`${item.productCode}-${item.productName}`} className="text-xs">
            <span className="font-mono">{item.productCode}</span>
            <span className="text-gray-600"> - {item.productName}</span>
          </div>
        ))}
      </div>
    );
  };

  const handleExport = async () => {
    if (!submitted) {
      toast.error('Once raporu olusturun');
      return;
    }

    setExporting(true);
    try {
      const blob = await adminApi.downloadComplementMissingExport(submitted);
      const filenameBase = metadata?.baseProduct?.productCode
        || metadata?.customer?.customerCode
        || 'tamamlayici-urun-eksikleri';
      const dateRange = metadata?.startDate && metadata?.endDate
        ? `${metadata.startDate}-${metadata.endDate}`
        : 'rapor';
      const fileName = `tamamlayici-urun-eksikleri-${filenameBase}-${dateRange}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Excel indirildi');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Excel indirilemedi');
    } finally {
      setExporting(false);
    }
  };

  const openActionModal = (row: ComplementMissingRow, type: RowActionType) => {
    setActionRow(row);
    setActionType(type);
    setActionNote('');
  };

  const closeActionModal = () => {
    setActionRow(null);
    setActionType(null);
    setActionNote('');
  };

  const handleActionSubmit = async () => {
    if (!actionRow || !actionType) return;
    setActionSaving(true);

    const rowCustomerCode = showProductTable ? actionRow.customerCode : metadata?.customer?.customerCode;
    const rowCustomerName = showProductTable ? actionRow.customerName : metadata?.customer?.customerName;
    const rowProductCode = showProductTable ? metadata?.baseProduct?.productCode : actionRow.productCode;
    const rowProductName = showProductTable ? metadata?.baseProduct?.productName : actionRow.productName;
    const missingLabel = actionRow.missingComplements
      .map((item) => `${item.productCode} - ${item.productName}`)
      .join(', ');

    const descriptionParts = [
      rowCustomerCode ? `Cari: ${rowCustomerCode}${rowCustomerName ? ` - ${rowCustomerName}` : ''}` : null,
      rowProductCode ? `Urun: ${rowProductCode}${rowProductName ? ` - ${rowProductName}` : ''}` : null,
      actionRow.documentCount !== undefined ? `Evrak sayisi: ${actionRow.documentCount}` : null,
      missingLabel ? `Eksik tamamlayicilar (${actionRow.missingComplements.length}): ${missingLabel}` : null,
      actionNote.trim() ? `Not: ${actionNote.trim()}` : null,
    ].filter(Boolean);

    const links: Array<{
      type: string;
      label?: string;
      referenceCode?: string;
    }> = [];

    if (rowCustomerCode) {
      links.push({
        type: 'CUSTOMER',
        label: rowCustomerName || rowCustomerCode,
        referenceCode: rowCustomerCode,
      });
    }

    if (rowProductCode) {
      links.push({
        type: 'PRODUCT',
        label: rowProductName || rowProductCode,
        referenceCode: rowProductCode,
      });
    }

    actionRow.missingComplements.slice(0, 5).forEach((item) => {
      if (!item.productCode) return;
      links.push({
        type: 'PRODUCT',
        label: item.productName || item.productCode,
        referenceCode: item.productCode,
      });
    });

    try {
      await adminApi.createTask({
        title: actionType === 'campaign' ? 'Tamamlayici urun kampanya onerisi' : 'Tamamlayici urun notu',
        description: descriptionParts.join('\n'),
        type: actionType === 'campaign' ? 'FEATURE' : 'REPORT',
        links,
      });
      toast.success('Aksiyon olusturuldu');
      closeActionModal();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Aksiyon olusturulamadi');
    } finally {
      setActionSaving(false);
    }
  };

  const handleCreateQuote = (row: ComplementMissingRow) => {
    const customerCodeValue = showProductTable ? row.customerCode : metadata?.customer?.customerCode;
    const productCodes = row.missingComplements.map((item) => item.productCode).filter(Boolean);
    if (!customerCodeValue || productCodes.length === 0) {
      toast.error('Teklif icin cari ve urun secimi bulunamadi');
      return;
    }
    const params = new URLSearchParams();
    params.set('customerCode', customerCodeValue);
    params.set('productCodes', productCodes.join(','));
    const url = `/quotes/new?${params.toString()}`;
    window.open(url, '_blank', 'noopener');
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
            <Package className="h-8 w-8 text-primary-600" />
            Tamamlayici Urun Eksikleri
          </h1>
          <p className="text-sm text-muted-foreground">
            Fatura ve irsaliye hareketlerine gore eksik tamamlayici urunleri listeler
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!submitted || exporting}
            isLoading={exporting}
          >
            Excel Indir
          </Button>
          <Button variant="outline" size="sm" onClick={() => submitted && fetchReport(submitted, page)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
          <CardDescription>
            Rapor modu, temel kod ve tarih araligi secin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rapor Modu</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === 'product' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('product')}
                >
                  Urun Bazli
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Eslesme Tipi</label>
              <Select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as 'product' | 'category' | 'group')}
              >
                <option value="product">Urun Bazli</option>
                <option value="category">Kategori Bazli</option>
                <option value="group">Grup Bazli</option>
              </Select>
            </div>

            {showProductMode ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    label="Urun Ara"
                    placeholder="Kod veya isim ile ara"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setProductCode('');
                      setProductName('');
                    }}
                  />
                  {productSearching && (
                    <div className="absolute right-3 top-9 text-xs text-gray-500">Araniyor...</div>
                  )}
                  {!productCode && productOptions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {productOptions.map((item, index) => {
                        const parsed = parseProductOption(item);
                        if (!parsed.code) return null;
                        return (
                          <button
                            type="button"
                            key={`${parsed.code}-${index}`}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50"
                            onClick={() => handleSelectProduct(item)}
                          >
                            <div className="text-sm font-semibold">{parsed.code}</div>
                            <div className="text-xs text-gray-500">{parsed.name || '-'} </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {productName && (
                  <div className="text-xs text-gray-500">Secilen urun: {productName}</div>
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
                            <div className="text-xs text-gray-500">{parsed.name || '-'} </div>
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
              <label className="text-sm font-medium">Tarih Araligi</label>
              <Select value={String(periodMonths)} onChange={(e) => setPeriodMonths(Number(e.target.value) as 6 | 12)}>
                <option value="6">Son 6 Ay</option>
                <option value="12">Son 12 Ay</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Sektor</label>
              <Select value={sectorCode} onChange={(e) => setSectorCode(e.target.value)}>
                <option value="">Tum sektorler</option>
                {sectorOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Satis Temsilcisi</label>
              <Select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)}>
                <option value="">Tum temsilciler</option>
                {salesRepOptions.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name || rep.email || rep.id}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Minimum Evrak</label>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={minDocumentEnabled}
                  onChange={(e) => setMinDocumentEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary-600"
                />
                <Input
                  type="number"
                  min="1"
                  value={minDocumentCount}
                  onChange={(e) => setMinDocumentCount(e.target.value)}
                  disabled={!minDocumentEnabled}
                  className="w-32"
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Button onClick={handleRunReport}>
              Raporu Getir
            </Button>
          </div>
        </CardContent>
      </Card>

      {metadata && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Rapor Modu</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">
                {metadata.mode === 'product' ? 'Urun' : 'Cari'}
              </div>
              <div className="text-sm text-muted-foreground">
                Eslesme: {matchModeLabel}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Temel Kayit</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {metadata.baseProduct
                  ? `${metadata.baseProduct.productCode} - ${metadata.baseProduct.productName}`
                  : metadata.customer
                    ? `${metadata.customer.customerCode} - ${metadata.customer.customerName || '-'}`
                    : '-'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Aralik</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                {metadata.periodMonths} Ay ( {metadata.startDate} - {metadata.endDate} )
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Segment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold">
                Sektor: {metadata.sectorCode || '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                Temsilci: {metadata.salesRep?.name || metadata.salesRep?.email || '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                Min evrak: {metadata.minDocumentCount ?? '-'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam Kayit</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{summary.totalRows}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Eksik Tamamlayici</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span className="text-2xl font-bold">{summary.totalMissing}</span>
              </div>
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
              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">Veri bulunamadi</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {showProductTable ? (
                      <>
                        <TableHead>Cari Kodu</TableHead>
                        <TableHead>Cari Adi</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Urun Kodu</TableHead>
                        <TableHead>Urun Adi</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Evrak</TableHead>
                    <TableHead>Eksik Tamamlayicilar</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Aksiyon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const customerCodeValue = showProductTable ? row.customerCode : metadata?.customer?.customerCode;
                    const canCreateQuote = Boolean(customerCodeValue) && row.missingComplements.length > 0;

                    return (
                      <TableRow key={`${row.customerCode || row.productCode}-${index}`}>
                        {showProductTable ? (
                          <>
                            <TableCell className="font-mono text-sm">{row.customerCode}</TableCell>
                            <TableCell>{row.customerName || '-'}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-mono text-sm">{row.productCode}</TableCell>
                            <TableCell>{row.productName || '-'}</TableCell>
                          </>
                        )}
                        <TableCell className="text-right">{row.documentCount ?? '-'}</TableCell>
                        <TableCell>{renderMissingList(row.missingComplements)}</TableCell>
                        <TableCell className="text-right font-semibold">{row.missingCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openActionModal(row, 'note')}>
                              Not Ekle
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openActionModal(row, 'campaign')}>
                              Kampanya Oner
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => handleCreateQuote(row)} disabled={!canCreateQuote}>
                              Teklif Olustur
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
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

      <Modal
        isOpen={Boolean(actionType)}
        onClose={closeActionModal}
        title={actionType === 'campaign' ? 'Kampanya Onerisi' : 'Not Ekle'}
        footer={
          <>
            <Button variant="outline" onClick={closeActionModal}>
              Iptal
            </Button>
            <Button variant="primary" onClick={handleActionSubmit} isLoading={actionSaving} disabled={actionSaving}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          {actionRow && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-gray-500">Hedef</div>
              <div className="font-semibold">
                {showProductTable
                  ? `${actionRow.customerCode || '-'} - ${actionRow.customerName || ''}`
                  : `${actionRow.productCode || '-'} - ${actionRow.productName || ''}`}
              </div>
              <div className="mt-2 text-xs text-gray-500">Eksikler</div>
              {renderMissingList(actionRow.missingComplements)}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Not</label>
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Notunuzu yazin"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}


