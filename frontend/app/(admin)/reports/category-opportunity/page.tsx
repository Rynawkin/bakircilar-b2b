'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { AlertTriangle, ArrowLeft, RefreshCw, Sparkles } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

interface CategoryOption {
  categoryCode: string;
  categoryName: string | null;
}

interface OpportunitySourceProduct {
  productCode: string;
  productName: string;
  pairCount: number;
  customerDocumentCount: number;
}

interface OpportunityRecommendation {
  recommendedProductCode: string;
  recommendedProductName: string;
  weightedScore: number;
  associationDocumentCount: number;
  sourceProductCount: number;
  sourceProducts: OpportunitySourceProduct[];
}

interface OpportunityRow {
  customerCode: string;
  customerName: string | null;
  customerSectorCode: string | null;
  totalOpportunityScore: number;
  recommendationCount: number;
  recommendations: OpportunityRecommendation[];
}

interface OpportunitySummary {
  totalCustomers: number;
  totalRecommendations: number;
  scannedCustomers: number;
  excludedBecauseAlreadyBoughtCategory: number;
}

interface OpportunityMetadata {
  category: {
    categoryCode: string;
    categoryName: string | null;
    productCount: number;
  };
  customerFilterCode: string | null;
  lookbackMonths: number;
  minPairCount: number;
  startDate: string;
  endDate: string;
}

interface SubmittedParams {
  categoryCode: string;
  customerCode?: string;
  lookbackMonths: number;
  minPairCount: number;
  limit: number;
}

export default function CategoryOpportunityReportPage() {
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [categorySearching, setCategorySearching] = useState(false);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);

  const [lookbackMonths, setLookbackMonths] = useState('6');
  const [minPairCount, setMinPairCount] = useState('2');
  const [limit, setLimit] = useState('50');

  const [submitted, setSubmitted] = useState<SubmittedParams | null>(null);
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [summary, setSummary] = useState<OpportunitySummary | null>(null);
  const [metadata, setMetadata] = useState<OpportunityMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [categorySearch]);

  useEffect(() => {
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
  }, [customerSearch]);

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
    setCustomerSearch(parsed.label || parsed.code);
    setCustomerOptions([]);
  };

  const handleSelectCategory = (item: CategoryOption) => {
    setCategoryCode(item.categoryCode);
    setCategoryName(item.categoryName || '');
    setCategorySearch(`${item.categoryCode} - ${item.categoryName || '-'}`);
    setCategoryOptions([]);
  };

  const fetchReport = async (params: SubmittedParams) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getCategoryOpportunityReport(params);
      if (!result.success) {
        throw new Error('Rapor yuklenemedi');
      }
      setRows(result.data.rows || []);
      setSummary(result.data.summary || null);
      setMetadata(result.data.metadata || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Rapor yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!submitted) return;
    fetchReport(submitted);
  }, [submitted]);

  const runReport = () => {
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

    let normalizedCustomer = customerCode.trim().toUpperCase();
    if (!normalizedCustomer && customerSearch.trim()) {
      const customerTerm = customerSearch.trim().toLowerCase();
      const matchedCustomer = customerOptions.find((item) => {
        const parsed = parseCustomerOption(item);
        return (
          parsed.code.toLowerCase() === customerTerm ||
          parsed.name.toLowerCase() === customerTerm ||
          parsed.label.toLowerCase() === customerTerm
        );
      });
      if (matchedCustomer) {
        normalizedCustomer = parseCustomerOption(matchedCustomer).code.toUpperCase();
      }
    }

    const months = Number(lookbackMonths);
    const minPair = Number(minPairCount);
    const safeLimit = Number(limit);

    if (!normalizedCategory) {
      toast.error('Kategori secin');
      return;
    }
    if (!Number.isFinite(months) || months <= 0) {
      toast.error('Ay bilgisi gecersiz');
      return;
    }
    if (!Number.isFinite(minPair) || minPair <= 0) {
      toast.error('Min ortak evrak gecersiz');
      return;
    }
    if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
      toast.error('Liste limiti gecersiz');
      return;
    }

    const params: SubmittedParams = {
      categoryCode: normalizedCategory,
      lookbackMonths: Math.floor(months),
      minPairCount: Math.floor(minPair),
      limit: Math.floor(safeLimit),
    };

    if (normalizedCustomer) {
      params.customerCode = normalizedCustomer;
    }

    setSubmitted(params);
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
            <Sparkles className="h-8 w-8 text-primary-600" />
            Kategori Firsat Onerileri
          </h1>
          <p className="text-sm text-muted-foreground">
            Secilen kategoriyi almayan carileri, son donem alim davranisina gore otomatik bulur
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => submitted && fetchReport(submitted)} disabled={!submitted || loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Yenile
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtreler</CardTitle>
          <CardDescription>Kategori zorunlu, cari filtre opsiyoneldir</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 relative">
              <label className="text-sm font-medium">Kategori (kod veya ad)</label>
              <Input
                value={categorySearch}
                onChange={(e) => {
                  setCategorySearch(e.target.value);
                  if (!e.target.value.trim()) {
                    setCategoryCode('');
                    setCategoryName('');
                  }
                }}
                placeholder="Orn: KARTON BARDAK veya kategori kodu"
              />
              {categorySearching && <div className="text-xs text-muted-foreground">Kategori araniyor...</div>}
              {categoryOptions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-sm max-h-60 overflow-auto">
                  {categoryOptions.map((item) => (
                    <button
                      key={item.categoryCode}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                      onClick={() => handleSelectCategory(item)}
                    >
                      <span className="font-mono">{item.categoryCode}</span>
                      <span className="text-gray-600"> - {item.categoryName || '-'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 relative">
              <label className="text-sm font-medium">Cari filtresi (opsiyonel)</label>
              <Input
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  if (!e.target.value.trim()) {
                    setCustomerCode('');
                  }
                }}
                placeholder="Sadece tek cari icin filtrelemek isterseniz secin"
              />
              {customerSearching && <div className="text-xs text-muted-foreground">Cari araniyor...</div>}
              {customerOptions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-sm max-h-60 overflow-auto">
                  {customerOptions.map((item, index) => {
                    const parsed = parseCustomerOption(item);
                    return (
                      <button
                        key={`${parsed.code}-${index}`}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                        onClick={() => handleSelectCustomer(item)}
                      >
                        {parsed.label || '-'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Bakis suresi (ay)</label>
              <Input value={lookbackMonths} onChange={(e) => setLookbackMonths(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Min ortak evrak</label>
              <Input value={minPairCount} onChange={(e) => setMinPairCount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cari limiti</label>
              <Input value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={runReport} disabled={loading} className="w-full">
                {loading ? 'Calisiyor...' : 'Raporu Calistir'}
              </Button>
            </div>
          </div>

          {(categoryCode || categoryName || customerCode) && (
            <div className="text-xs text-muted-foreground">
              Secili kategori: {categoryCode || '-'} {categoryName ? `- ${categoryName}` : ''}
              {customerCode ? ` / Cari filtresi: ${customerCode}` : ''}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {metadata && (
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div>
              <strong>Kategori:</strong> {metadata.category.categoryCode} - {metadata.category.categoryName || '-'} (
              {metadata.category.productCount} urun)
            </div>
            <div>
              <strong>Donem:</strong> {metadata.startDate} - {metadata.endDate} / {metadata.lookbackMonths} ay
            </div>
            <div>
              <strong>Min ortak evrak:</strong> {metadata.minPairCount}
            </div>
            <div>
              <strong>Cari filtresi:</strong> {metadata.customerFilterCode || 'Yok (otomatik cari tarama)'}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Oneri cikan cari</CardDescription>
              <CardTitle className="text-2xl">{summary.totalCustomers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Toplam oneriler</CardDescription>
              <CardTitle className="text-2xl">{summary.totalRecommendations}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Taranan cari</CardDescription>
              <CardTitle className="text-2xl">{summary.scannedCustomers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Kategoriyi zaten alan</CardDescription>
              <CardTitle className="text-2xl">{summary.excludedBecauseAlreadyBoughtCategory}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {submitted && !loading && (
        <Card>
          <CardHeader>
            <CardTitle>Cari Bazli Oneri Listesi</CardTitle>
            <CardDescription>Secili kategoriyi almayan carilerde satis firsati</CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6">Uygun firsat bulunamadi.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cari</TableHead>
                    <TableHead>Sektor</TableHead>
                    <TableHead className="text-right">Toplam firsat skoru</TableHead>
                    <TableHead className="text-right">Oneri sayisi</TableHead>
                    <TableHead>One cikan oneriler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <Fragment key={row.customerCode}>
                      <TableRow>
                        <TableCell>
                          <div className="font-mono text-xs">{row.customerCode}</div>
                          <div className="text-sm text-gray-700">{row.customerName || '-'}</div>
                        </TableCell>
                        <TableCell>{row.customerSectorCode || '-'}</TableCell>
                        <TableCell className="text-right font-semibold">{row.totalOpportunityScore}</TableCell>
                        <TableCell className="text-right">{row.recommendationCount}</TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            {row.recommendations.slice(0, 3).map((item) => (
                              <div key={`${row.customerCode}-${item.recommendedProductCode}`}>
                                <span className="font-mono">{item.recommendedProductCode}</span>
                                <span className="text-gray-700"> - {item.recommendedProductName}</span>
                                <span className="text-gray-500"> (skor: {item.weightedScore})</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={5} className="bg-gray-50/60">
                          <details>
                            <summary className="cursor-pointer text-xs font-medium text-gray-700">Kategori detaylari</summary>
                            <div className="mt-2 space-y-2">
                              {row.recommendations.map((item) => (
                                <div key={`${row.customerCode}-detail-${item.recommendedProductCode}`} className="text-xs border rounded-md p-2 bg-white">
                                  <div>
                                    <span className="font-mono">{item.recommendedProductCode}</span>
                                    <span className="text-gray-700"> - {item.recommendedProductName}</span>
                                    <span className="text-gray-500">
                                      {' '}
                                      (skor: {item.weightedScore}, baglanti: {item.associationDocumentCount}, baz: {item.sourceProductCount})
                                    </span>
                                  </div>
                                  <div className="mt-1 text-gray-600">
                                    {item.sourceProducts.map((source) => (
                                      <div key={`${row.customerCode}-${item.recommendedProductCode}-${source.productCode}`}>
                                        {source.productCode} - {source.productName} (ortak: {source.pairCount}, cari evrak: {source.customerDocumentCount})
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
