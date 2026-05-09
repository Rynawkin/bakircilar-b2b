'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { ArrowLeft, Download, FolderCog, RefreshCw, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { adminApi } from '@/lib/api/admin';

type FamilyStatus = 'all' | 'problem' | 'ok';

interface PriceFamilyReportItem {
  id: string;
  productCode: string;
  productName?: string | null;
  currentCost?: number | null;
  currentCostDate: string | null;
  vatRate: number;
  issueType: 'ok' | 'outdated' | 'missing-date';
  daysBehind: number | null;
}

interface PriceFamilyReportRow {
  id: string;
  name: string;
  code?: string | null;
  note?: string | null;
  active: boolean;
  status: 'problem' | 'ok';
  itemCount: number;
  outdatedCount: number;
  missingCostDateCount: number;
  latestCostDate: string | null;
  oldestCostDate: string | null;
  dateGroups: Array<{ date: string | null; count: number; productCodes: string[] }>;
  items: PriceFamilyReportItem[];
  recentLogs: Array<{
    id: string;
    productCode: string;
    productName?: string | null;
    previousCost?: number | null;
    newCost: number;
    previousCostDate: string | null;
    newCostDate: string;
    updatePriceLists: boolean;
    userId?: string | null;
    createdAt: string;
  }>;
}

interface PriceFamilyReportData {
  families: PriceFamilyReportRow[];
  summary: {
    totalFamilies: number;
    problemFamilies: number;
    okFamilies: number;
    inactiveFamilies: number;
    productCount: number;
    outdatedProductCount: number;
    missingCostDateCount: number;
  };
}

const formatCurrency = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '-';

const formatInputNumber = (value: number) =>
  Number.isFinite(value) && value > 0 ? value.toFixed(4).replace(/\.?0+$/, '') : '';

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
};

const getVatPercent = (vatRate: number) => {
  const raw = Number(vatRate || 0);
  return raw <= 1 ? raw * 100 : raw;
};

const computeCostT = (costP: number, vatRate: number) => {
  const vatPercent = getVatPercent(vatRate);
  return costP * (1 + vatPercent / 200);
};

const issueLabel = (issueType: PriceFamilyReportItem['issueType']) => {
  if (issueType === 'missing-date') return 'Tarih yok';
  if (issueType === 'outdated') return 'Eski tarih';
  return 'Guncel';
};

export default function PriceFamilyCostsPage() {
  const [data, setData] = useState<PriceFamilyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<FamilyStatus>('problem');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [costPInputByCode, setCostPInputByCode] = useState<Record<string, string>>({});
  const [costTInputByCode, setCostTInputByCode] = useState<Record<string, string>>({});
  const [manualCostTByCode, setManualCostTByCode] = useState<Record<string, boolean>>({});
  const [updatePriceListsByCode, setUpdatePriceListsByCode] = useState<Record<string, boolean>>({});
  const [updatingCostByCode, setUpdatingCostByCode] = useState<Record<string, boolean>>({});

  const families = data?.families || [];
  const selectedFamily = useMemo(
    () => families.find((family) => family.id === selectedFamilyId) || null,
    [families, selectedFamilyId]
  );

  const loadReport = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getPriceFamilyCostReport({
        status,
        search: search.trim(),
        includeInactive,
      });
      setData(response.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Fiyat ailesi raporu alinamadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadReport();
    }, 250);
    return () => clearTimeout(timeout);
  }, [status, search, includeInactive]);

  useEffect(() => {
    if (!selectedFamily) return;
    const nextCostP: Record<string, string> = {};
    const nextCostT: Record<string, string> = {};
    selectedFamily.items.forEach((item) => {
      const code = item.productCode;
      const costP = Number(item.currentCost || 0);
      nextCostP[code] = formatInputNumber(costP);
      nextCostT[code] = formatInputNumber(computeCostT(costP, item.vatRate));
    });
    setCostPInputByCode(nextCostP);
    setCostTInputByCode(nextCostT);
    setManualCostTByCode({});
  }, [selectedFamily]);

  const filteredDetailItems = useMemo(() => {
    if (!selectedFamily) return [];
    const q = detailSearch.trim().toLocaleLowerCase('tr-TR');
    return selectedFamily.items.filter((item) => {
      if (onlyIssues && item.issueType === 'ok') return false;
      if (!q) return true;
      return `${item.productCode} ${item.productName || ''}`.toLocaleLowerCase('tr-TR').includes(q);
    });
  }, [selectedFamily, detailSearch, onlyIssues]);

  const updateProductCost = async (item: PriceFamilyReportItem) => {
    if (!selectedFamily) return;
    const code = item.productCode;
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
      const result = await adminApi.updatePriceFamilyProductCost({
        familyId: selectedFamily.id,
        productCode: code,
        costP: parsedCostP,
        costT: parsedCostT,
        updatePriceLists: Boolean(updatePriceListsByCode[code]),
      });
      const missing = result.data?.missingLists || [];
      if (Boolean(updatePriceListsByCode[code])) {
        toast.success(
          missing.length > 0
            ? `Maliyet guncellendi. Eksik liste satiri: ${missing.join(', ')}`
            : 'Maliyet ve 10 fiyat listesi guncellendi.'
        );
      } else {
        toast.success('Guncel maliyet guncellendi.');
      }
      await loadReport();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Maliyet guncellenemedi');
    } finally {
      setUpdatingCostByCode((prev) => ({ ...prev, [code]: false }));
    }
  };

  const exportToExcel = () => {
    const rows = families.flatMap((family) =>
      family.items.map((item) => ({
        'Aile': family.name,
        'Aile Kodu': family.code || '',
        'Aile Durumu': family.status === 'problem' ? 'Sorunlu' : 'Kapali',
        'Stok Kodu': item.productCode,
        'Stok Adi': item.productName || '',
        'Satir Durumu': issueLabel(item.issueType),
        'Guncel Maliyet Tarihi': formatDate(item.currentCostDate),
        'Aile En Yeni Tarih': formatDate(family.latestCostDate),
        'Gun Farki': item.daysBehind ?? '',
        'Guncel Maliyet': item.currentCost ?? '',
      }))
    );
    if (rows.length === 0) {
      toast.error('Aktarilacak veri yok');
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fiyat Aileleri');
    XLSX.writeFile(workbook, `fiyat-ailesi-maliyet-kontrol-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1800px] px-4 py-8 space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Raporlar
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Fiyat Ailesi Maliyet Kontrolu</h1>
              <p className="text-sm text-gray-600">
                Ayni fiyat ailesindeki stoklarin guncel maliyet tarihlerini gun bazinda karsilastirir.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/reports/price-families">
              <Button variant="outline" size="sm">
                <FolderCog className="mr-2 h-4 w-4" />
                Fiyat Aileleri
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={exportToExcel} disabled={!families.length}>
              <Download className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={loadReport} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Sorunlu aile</p>
              <p className="text-2xl font-bold text-red-700">{data?.summary.problemFamilies ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Kapali aile</p>
              <p className="text-2xl font-bold text-emerald-700">{data?.summary.okFamilies ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Eski/eksik stok</p>
              <p className="text-2xl font-bold text-amber-700">{data?.summary.outdatedProductCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Tarih yok</p>
              <p className="text-2xl font-bold text-slate-700">{data?.summary.missingCostDateCount ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Rapor Mantigi</CardTitle>
            <CardDescription>
              Aile icindeki en yeni maliyet tarihi hedef tarih kabul edilir. Tarihi bos olan veya hedef tarihten eski kalan stoklar sorunlu sayilir.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-5 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Aile, stok kodu veya stok adi ara..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="lg:col-span-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as FamilyStatus)}
            >
              <option value="problem">Sadece sorunlular</option>
              <option value="all">Tum aileler</option>
              <option value="ok">Kapali aileler</option>
            </select>
            <label className="lg:col-span-3 inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Pasif aileleri dahil et
            </label>
            <div className="lg:col-span-2 flex items-center justify-end text-sm text-gray-500">
              {loading ? 'Yukleniyor...' : `${families.length} aile listeleniyor`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aileler</CardTitle>
            <CardDescription>Detay acarak stok bazinda maliyet ve 10 fiyat listesini guncelleyebilirsiniz.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Aile</th>
                    <th className="px-3 py-2 text-center">Durum</th>
                    <th className="px-3 py-2 text-right">Stok</th>
                    <th className="px-3 py-2 text-right">Sorunlu</th>
                    <th className="px-3 py-2 text-left">Tarih Dagilimi</th>
                    <th className="px-3 py-2 text-left">En Eski / En Yeni</th>
                    <th className="px-3 py-2 text-right">Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={7}>
                        Rapor yukleniyor...
                      </td>
                    </tr>
                  )}
                  {!loading && families.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={7}>
                        Kriterlere uygun fiyat ailesi bulunamadi.
                      </td>
                    </tr>
                  )}
                  {!loading && families.map((family) => (
                    <tr key={family.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-900">{family.name}</div>
                        <div className="text-xs text-gray-500">
                          {family.code || '-'} {family.active ? '' : ' / pasif'}
                        </div>
                        {family.note && <div className="mt-1 text-xs text-gray-500">{family.note}</div>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            family.status === 'problem'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {family.status === 'problem' ? 'Sorunlu' : 'Kapali'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">{family.itemCount}</td>
                      <td className="px-3 py-3 text-right font-semibold text-amber-700">{family.outdatedCount}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {family.dateGroups.map((group) => (
                            <span key={group.date || 'missing'} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                              {formatDate(group.date)}: {group.count}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {formatDate(family.oldestCostDate)} / {formatDate(family.latestCostDate)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedFamilyId(family.id)}>
                          Aile detayi ac
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedFamily && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="mt-8 w-full max-w-[1600px] rounded-lg bg-white shadow-xl">
            <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedFamily.name}</h2>
                <p className="text-sm text-gray-600">
                  Hedef tarih: {formatDate(selectedFamily.latestCostDate)} - sorunlu stok: {selectedFamily.outdatedCount}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedFamilyId(null)}>
                <X className="mr-2 h-4 w-4" />
                Kapat
              </Button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="lg:col-span-5 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Detayda stok ara..."
                    value={detailSearch}
                    onChange={(event) => setDetailSearch(event.target.value)}
                  />
                </div>
                <label className="lg:col-span-3 inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={onlyIssues}
                    onChange={(event) => setOnlyIssues(event.target.checked)}
                  />
                  Sadece sorunlu stoklar
                </label>
                <div className="lg:col-span-4 flex items-center justify-end text-sm text-gray-500">
                  {filteredDetailItems.length} satir gosteriliyor
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Stok</th>
                      <th className="px-3 py-2 text-center">Durum</th>
                      <th className="px-3 py-2 text-right">Maliyet</th>
                      <th className="px-3 py-2 text-center">Maliyet Tarihi</th>
                      <th className="px-3 py-2 text-center">Gun Farki</th>
                      <th className="px-3 py-2 text-right">Yeni Maliyet</th>
                      <th className="px-3 py-2 text-right">Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetailItems.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-gray-500" colSpan={7}>
                          Filtreye uygun stok yok.
                        </td>
                      </tr>
                    )}
                    {filteredDetailItems.map((item) => {
                      const code = item.productCode;
                      return (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-3">
                            <div className="font-semibold text-gray-900">{code}</div>
                            <div className="max-w-md truncate text-xs text-gray-600" title={item.productName || ''}>
                              {item.productName || '-'}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                item.issueType === 'ok'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : item.issueType === 'missing-date'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {issueLabel(item.issueType)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">{formatCurrency(item.currentCost)}</td>
                          <td className="px-3 py-3 text-center">{formatDate(item.currentCostDate)}</td>
                          <td className="px-3 py-3 text-center">{item.daysBehind ?? '-'}</td>
                          <td className="px-3 py-3">
                            <div className="flex min-w-[360px] items-center justify-end gap-2">
                              <label className="text-[11px] text-gray-500">
                                P
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={costPInputByCode[code] ?? ''}
                                  onChange={(event) => {
                                    const rawValue = event.target.value;
                                    setCostPInputByCode((prev) => ({ ...prev, [code]: rawValue }));
                                    if (manualCostTByCode[code]) return;
                                    const parsed = Number(String(rawValue || '').replace(',', '.'));
                                    if (!Number.isFinite(parsed)) return;
                                    setCostTInputByCode((prev) => ({
                                      ...prev,
                                      [code]: formatInputNumber(computeCostT(parsed, item.vatRate)),
                                    }));
                                  }}
                                  className="ml-1 w-24 rounded border px-2 py-1 text-right"
                                />
                              </label>
                              <label className="text-[11px] text-gray-500">
                                T
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={costTInputByCode[code] ?? ''}
                                  onChange={(event) => {
                                    setManualCostTByCode((prev) => ({ ...prev, [code]: true }));
                                    setCostTInputByCode((prev) => ({ ...prev, [code]: event.target.value }));
                                  }}
                                  className="ml-1 w-24 rounded border px-2 py-1 text-right"
                                />
                              </label>
                              <span className="text-[10px] text-gray-500">KDV %{getVatPercent(item.vatRate).toLocaleString('tr-TR')}</span>
                              <label className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={Boolean(updatePriceListsByCode[code])}
                                  onChange={(event) =>
                                    setUpdatePriceListsByCode((prev) => ({ ...prev, [code]: event.target.checked }))
                                  }
                                />
                                10 liste
                              </label>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateProductCost(item)}
                              disabled={Boolean(updatingCostByCode[code])}
                            >
                              {updatingCostByCode[code] ? '...' : 'Guncelle'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-md border bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-gray-900">Son Maliyet Guncellemeleri</p>
                {selectedFamily.recentLogs.length === 0 ? (
                  <p className="text-sm text-gray-500">Bu aile icin henuz audit kaydi yok.</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {selectedFamily.recentLogs.map((log) => (
                      <div key={log.id} className="rounded-md border bg-white p-2 text-xs text-gray-700">
                        <div className="font-semibold text-gray-900">{log.productCode}</div>
                        <div>{formatCurrency(log.previousCost)} {'->'} {formatCurrency(log.newCost)}</div>
                        <div>{formatDate(log.previousCostDate)} {'->'} {formatDate(log.newCostDate)}</div>
                        <div className="text-gray-500">
                          {new Date(log.createdAt).toLocaleString('tr-TR')} {log.updatePriceLists ? '/ 10 liste' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
