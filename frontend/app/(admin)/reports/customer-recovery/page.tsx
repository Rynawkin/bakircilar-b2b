'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
  TrendingDown,
  Users,
} from 'lucide-react';
import { CardRoot as Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { adminApi, type CustomerRecoveryDetailData, type CustomerRecoveryReportData, type CustomerRecoveryReportParams, type CustomerRecoveryRiskType, type CustomerRecoveryRow } from '@/lib/api/admin';
import { cn } from '@/lib/utils/cn';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';

type SortBy = NonNullable<CustomerRecoveryReportParams['sortBy']>;
type SortDirection = NonNullable<CustomerRecoveryReportParams['sortDirection']>;

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

interface FilterState {
  recentMonths: string;
  baselineMonths: string;
  minDropPercent: string;
  minHistoricalActiveMonths: string;
  minHistoricalAmount: string;
  minMeaningfulMonthlyAmount: string;
  includeCurrentMonth: boolean;
  search: string;
  sectorCode: string;
  assignedToId: string;
  riskTypes: CustomerRecoveryRiskType[];
  onlyWithOpenAction: boolean;
  onlyDueFollowUp: boolean;
  sortBy: SortBy;
  sortDirection: SortDirection;
}

interface ActionFormState {
  actionType: string;
  note: string;
  priority: string;
  status: string;
  followUpDate: string;
  assignedToId: string;
  outcome: string;
}

const riskTypeLabels: Record<CustomerRecoveryRiskType, string> = {
  NO_RECENT_SALES: 'Satis yok',
  INSIGNIFICANT_ACTIVITY: 'Cok dusuk',
  DECLINING: 'Dususte',
  WATCH: 'Izle',
};

const riskTypeClasses: Record<CustomerRecoveryRiskType, string> = {
  NO_RECENT_SALES: 'border-red-200 bg-red-50 text-red-700',
  INSIGNIFICANT_ACTIVITY: 'border-orange-200 bg-orange-50 text-orange-700',
  DECLINING: 'border-amber-200 bg-amber-50 text-amber-700',
  WATCH: 'border-blue-200 bg-blue-50 text-blue-700',
};

const developmentLabels: Record<CustomerRecoveryRow['developmentStatus'], string> = {
  RECOVERED: 'Geri kazanildi',
  IMPROVED: 'Gelisme var',
  UNCHANGED: 'Degismedi',
  WORSENED: 'Kotuye gidiyor',
  NO_ACTION: 'Aksiyon yok',
};

const developmentClasses: Record<CustomerRecoveryRow['developmentStatus'], string> = {
  RECOVERED: 'bg-emerald-100 text-emerald-700',
  IMPROVED: 'bg-blue-100 text-blue-700',
  UNCHANGED: 'bg-gray-100 text-gray-700',
  WORSENED: 'bg-red-100 text-red-700',
  NO_ACTION: 'bg-slate-100 text-slate-700',
};

const defaultFilters: FilterState = {
  recentMonths: '3',
  baselineMonths: '18',
  minDropPercent: '50',
  minHistoricalActiveMonths: '2',
  minHistoricalAmount: '1000',
  minMeaningfulMonthlyAmount: '1000',
  includeCurrentMonth: false,
  search: '',
  sectorCode: '',
  assignedToId: '',
  riskTypes: ['NO_RECENT_SALES', 'INSIGNIFICANT_ACTIVITY', 'DECLINING', 'WATCH'],
  onlyWithOpenAction: false,
  onlyDueFollowUp: false,
  sortBy: 'riskScore',
  sortDirection: 'desc',
};

const defaultActionForm: ActionFormState = {
  actionType: 'CALL',
  note: '',
  priority: 'HIGH',
  status: 'OPEN',
  followUpDate: '',
  assignedToId: '',
  outcome: '',
};

const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeDate = (date?: string | null) => {
  if (!date) return '-';
  try {
    return formatDateShort(date);
  } catch {
    return date.slice(0, 10);
  }
};

const percent = (value: number | null | undefined) => `${Math.round(value || 0)}%`;

export default function CustomerRecoveryReportPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [submittedFilters, setSubmittedFilters] = useState<FilterState>(defaultFilters);
  const [rows, setRows] = useState<CustomerRecoveryRow[]>([]);
  const [summary, setSummary] = useState<CustomerRecoveryReportData['summary'] | null>(null);
  const [metadata, setMetadata] = useState<CustomerRecoveryReportData['metadata'] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 0, totalRecords: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [detailRow, setDetailRow] = useState<CustomerRecoveryRow | null>(null);
  const [detail, setDetail] = useState<CustomerRecoveryDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const [actionForm, setActionForm] = useState<ActionFormState>(defaultActionForm);
  const [bulkAssignedToId, setBulkAssignedToId] = useState('');
  const [bulkFollowUpDate, setBulkFollowUpDate] = useState('');
  const [bulkNote, setBulkNote] = useState('Geri kazanim takibi icin aransin / ziyaret edilsin.');
  const [bulkSaving, setBulkSaving] = useState(false);

  const buildParams = (source: FilterState, requestedPage = page): CustomerRecoveryReportParams => ({
    recentMonths: parseNumber(source.recentMonths, 3),
    baselineMonths: parseNumber(source.baselineMonths, 18),
    minDropPercent: parseNumber(source.minDropPercent, 50),
    minHistoricalActiveMonths: parseNumber(source.minHistoricalActiveMonths, 2),
    minHistoricalAmount: parseNumber(source.minHistoricalAmount, 1000),
    minMeaningfulMonthlyAmount: parseNumber(source.minMeaningfulMonthlyAmount, 1000),
    includeCurrentMonth: source.includeCurrentMonth,
    search: source.search.trim() || undefined,
    sectorCode: source.sectorCode.trim() || undefined,
    assignedToId: source.assignedToId || undefined,
    riskTypes: source.riskTypes.length > 0 ? source.riskTypes : undefined,
    onlyWithOpenAction: source.onlyWithOpenAction,
    onlyDueFollowUp: source.onlyDueFollowUp,
    page: requestedPage,
    limit: 50,
    sortBy: source.sortBy,
    sortDirection: source.sortDirection,
  });

  const salesStaff = useMemo(
    () => staff.filter((member) => member.active && ['SALES_REP', 'MANAGER', 'ADMIN', 'HEAD_ADMIN'].includes(member.role)),
    [staff]
  );

  const assignmentOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email?: string | null }>();
    salesStaff.forEach((member) => {
      map.set(member.id, { id: member.id, name: member.name || member.email, email: member.email });
    });
    rows.forEach((row) => {
      if (row.assignedSalesRep?.id) {
        map.set(row.assignedSalesRep.id, row.assignedSalesRep);
      }
    });
    if (detailRow?.assignedSalesRep?.id) {
      map.set(detailRow.assignedSalesRep.id, detailRow.assignedSalesRep);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [detailRow, rows, salesStaff]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedCodes.includes(row.customerCode)),
    [rows, selectedCodes]
  );

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const result = await adminApi.getStaffMembers();
        setStaff(result.staff || []);
      } catch {
        setStaff([]);
      }
    };
    loadStaff();
  }, []);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        const result = await adminApi.getCustomerRecoveryReport(buildParams(submittedFilters, page));
        setRows(result.data.rows || []);
        setSummary(result.data.summary);
        setMetadata(result.data.metadata);
        setPagination(result.data.pagination);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Cari geri kazanim raporu alinamadi');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [page, submittedFilters]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  const runReport = () => {
    setPage(1);
    setSelectedCodes([]);
    setSubmittedFilters({ ...filters });
  };

  const toggleRisk = (riskType: CustomerRecoveryRiskType) => {
    setFilters((previous) => {
      const hasRisk = previous.riskTypes.includes(riskType);
      return {
        ...previous,
        riskTypes: hasRisk
          ? previous.riskTypes.filter((item) => item !== riskType)
          : [...previous.riskTypes, riskType],
      };
    });
  };

  const toggleRow = (row: CustomerRecoveryRow) => {
    setSelectedCodes((previous) =>
      previous.includes(row.customerCode)
        ? previous.filter((code) => code !== row.customerCode)
        : [...previous, row.customerCode]
    );
  };

  const toggleCurrentPage = () => {
    const pageCodes = rows.map((row) => row.customerCode);
    const allSelected = pageCodes.length > 0 && pageCodes.every((code) => selectedCodes.includes(code));
    setSelectedCodes((previous) => {
      if (allSelected) return previous.filter((code) => !pageCodes.includes(code));
      return Array.from(new Set([...previous, ...pageCodes]));
    });
  };

  const openDetail = async (row: CustomerRecoveryRow) => {
    setDetailRow(row);
    setDetail(null);
    setActionForm({
      ...defaultActionForm,
      assignedToId: row.lastAction?.assignedTo?.id || row.assignedSalesRep?.id || '',
    });
    setDetailLoading(true);
    try {
      const result = await adminApi.getCustomerRecoveryDetail(row.customerCode, buildParams(submittedFilters, 1));
      setDetail(result.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Cari detaylari alinamadi');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAfterAction = async (customerCode?: string) => {
    if (customerCode && detailRow?.customerCode === customerCode) {
      const detailResult = await adminApi.getCustomerRecoveryDetail(customerCode, buildParams(submittedFilters, 1));
      setDetail(detailResult.data);
    }
    const reportResult = await adminApi.getCustomerRecoveryReport(buildParams(submittedFilters, page));
    setRows(reportResult.data.rows || []);
    setSummary(reportResult.data.summary);
    setPagination(reportResult.data.pagination);
  };

  const saveAction = async () => {
    if (!detailRow) return;
    if (!actionForm.note.trim()) {
      toast.error('Not yazin');
      return;
    }
    setActionSaving(true);
    try {
      await adminApi.createCustomerRecoveryAction(detailRow.customerCode, {
        customerName: detailRow.customerName,
        actionType: actionForm.actionType,
        note: actionForm.note.trim(),
        status: actionForm.status,
        priority: actionForm.priority,
        followUpDate: actionForm.followUpDate || null,
        assignedToId: actionForm.assignedToId || null,
        outcome: actionForm.outcome.trim() || null,
        snapshot: detailRow,
      });
      toast.success('Aksiyon kaydedildi');
      setActionForm({
        ...defaultActionForm,
        assignedToId: actionForm.assignedToId,
      });
      await refreshAfterAction(detailRow.customerCode);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aksiyon kaydedilemedi');
    } finally {
      setActionSaving(false);
    }
  };

  const completeAction = async (actionId: string, customerCode: string) => {
    try {
      await adminApi.updateCustomerRecoveryAction(actionId, {
        status: 'DONE',
        outcome: 'Tamamlandi',
        postSnapshot: detail?.row || detailRow,
      });
      toast.success('Aksiyon kapatildi');
      await refreshAfterAction(customerCode);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aksiyon kapatilamadi');
    }
  };

  const bulkAssign = async () => {
    if (selectedCodes.length === 0) {
      toast.error('En az bir cari secin');
      return;
    }
    if (!bulkAssignedToId) {
      toast.error('Atanacak personel secin');
      return;
    }
    setBulkSaving(true);
    try {
      await adminApi.bulkAssignCustomerRecovery({
        customerCodes: selectedCodes,
        assignedToId: bulkAssignedToId,
        followUpDate: bulkFollowUpDate || null,
        note: bulkNote.trim() || undefined,
        priority: 'HIGH',
        customerNames: Object.fromEntries(selectedRows.map((row) => [row.customerCode, row.customerName])),
        snapshotByCustomer: Object.fromEntries(selectedRows.map((row) => [row.customerCode, row])),
      });
      toast.success(`${selectedCodes.length} cari icin takip olusturuldu`);
      setSelectedCodes([]);
      await refreshAfterAction();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Toplu atama yapilamadi');
    } finally {
      setBulkSaving(false);
    }
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      const blob = await adminApi.downloadCustomerRecoveryExport(buildParams(submittedFilters, 1));
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cari-geri-kazanim-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Excel indirilemedi');
    } finally {
      setExporting(false);
    }
  };

  const sort = (sortBy: SortBy) => {
    setFilters((previous) => ({
      ...previous,
      sortBy,
      sortDirection: previous.sortBy === sortBy && previous.sortDirection === 'desc' ? 'asc' : 'desc',
    }));
    setSubmittedFilters((previous) => ({
      ...previous,
      sortBy,
      sortDirection: previous.sortBy === sortBy && previous.sortDirection === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 p-6 text-white shadow-xl lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <Link href="/reports" className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Raporlara don
          </Link>
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-100">
              <Users className="h-3.5 w-3.5" />
              Cari Geri Kazanim
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Kaybedilen carileri aksiyona cevir</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-100/85 sm:text-base">
              Son donem satisi duran, anlamsiz dusen veya aktif ay ortalamasinin altina inen carileri bulur; not, takip tarihi, temsilci atamasi ve gelisme durumuyla izler.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:min-w-[620px]">
          <HeroMetric label="Riskli cari" value={summary?.totalCustomers ?? 0} />
          <HeroMetric label="Kayip potansiyel" value={formatCurrency(summary?.totalLostPotential || 0)} />
          <HeroMetric label="Aksiyon yok" value={summary?.noActionCount ?? 0} />
          <HeroMetric label="Geciken takip" value={summary?.dueFollowUpCount ?? 0} />
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b bg-gradient-to-r from-white to-slate-50">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Filter className="h-5 w-5 text-emerald-600" />
                Rapor mantigi
              </CardTitle>
              <CardDescription>
                Arama ve filtreler tum veri setinde calisir; sadece ekrandaki sayfada arama yapmaz.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportReport} isLoading={exporting}>
                <Download className="mr-2 h-4 w-4" />
                Excel
              </Button>
              <Button onClick={runReport} isLoading={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Raporu calistir
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <LabeledInput label="Son donem ay" value={filters.recentMonths} onChange={(value) => updateFilter('recentMonths', value)} />
            <LabeledInput label="Gecmis baz ay" value={filters.baselineMonths} onChange={(value) => updateFilter('baselineMonths', value)} />
            <LabeledInput label="Dusme yuzdesi" value={filters.minDropPercent} onChange={(value) => updateFilter('minDropPercent', value)} />
            <LabeledInput label="Min aktif ay" value={filters.minHistoricalActiveMonths} onChange={(value) => updateFilter('minHistoricalActiveMonths', value)} />
            <LabeledInput label="Min gecmis ciro" value={filters.minHistoricalAmount} onChange={(value) => updateFilter('minHistoricalAmount', value)} />
            <LabeledInput label="Anlamli ay ciro" value={filters.minMeaningfulMonthlyAmount} onChange={(value) => updateFilter('minMeaningfulMonthlyAmount', value)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr]">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cari ara</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                  placeholder="Cari kodu, cari adi, sehir veya sektor..."
                  className="pl-10"
                />
              </div>
            </div>
            <LabeledInput label="Sektor kodu" value={filters.sectorCode} onChange={(value) => updateFilter('sectorCode', value.toUpperCase())} />
            <Select label="Temsilci / takip sahibi" value={filters.assignedToId} onChange={(event) => updateFilter('assignedToId', event.target.value)}>
              <option value="">Tumu</option>
              {assignmentOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email || member.id}
                </option>
              ))}
            </Select>
            <Select label="Sirala" value={`${filters.sortBy}:${filters.sortDirection}`} onChange={(event) => {
              const [sortBy, sortDirection] = event.target.value.split(':') as [SortBy, SortDirection];
              updateFilter('sortBy', sortBy);
              updateFilter('sortDirection', sortDirection);
            }}>
              <option value="riskScore:desc">Risk skoru yuksek</option>
              <option value="lostPotential:desc">Kayip potansiyel yuksek</option>
              <option value="dropPercent:desc">Dusme orani yuksek</option>
              <option value="lastSaleDate:asc">Son satis en eski</option>
              <option value="customerName:asc">Cari adi A-Z</option>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(riskTypeLabels).map((riskType) => {
              const typedRisk = riskType as CustomerRecoveryRiskType;
              const active = filters.riskTypes.includes(typedRisk);
              return (
                <button
                  key={riskType}
                  type="button"
                  onClick={() => toggleRisk(typedRisk)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                    active ? riskTypeClasses[typedRisk] : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {riskTypeLabels[typedRisk]}
                </button>
              );
            })}
            <label className="ml-0 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 lg:ml-3">
              <input
                type="checkbox"
                checked={filters.onlyWithOpenAction}
                onChange={(event) => updateFilter('onlyWithOpenAction', event.target.checked)}
              />
              Sadece acik aksiyon
            </label>
            <label className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={filters.onlyDueFollowUp}
                onChange={(event) => updateFilter('onlyDueFollowUp', event.target.checked)}
              />
              Sadece geciken takip
            </label>
            <label className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={filters.includeCurrentMonth}
                onChange={(event) => updateFilter('includeCurrentMonth', event.target.checked)}
              />
              Bu ayi dahil et
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Riskli cariler</CardTitle>
                <CardDescription>
                  {metadata ? `${metadata.baselineStartDate} - ${metadata.reportEndDate} araligi incelendi` : 'Rapor yukleniyor'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <Badge variant="outline">{pagination.totalRecords} kayit</Badge>
                <Badge variant="outline">Sayfa {pagination.page || page} / {pagination.totalPages || 0}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table containerClassName="max-h-[720px]">
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && rows.every((row) => selectedCodes.includes(row.customerCode))}
                      onChange={toggleCurrentPage}
                    />
                  </TableHead>
                  <TableHead>Cari</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => sort('riskScore')}>Risk</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => sort('historicalAverage')}>Gecmis ort.</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => sort('recentAverage')}>Son ort.</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => sort('dropPercent')}>Dusme</TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => sort('lostPotential')}>Kayip</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => sort('lastSaleDate')}>Son satis</TableHead>
                  <TableHead>Takip</TableHead>
                  <TableHead className="text-right">Detay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-gray-500">Rapor hesaplanıyor...</TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-gray-500">Filtrelere uygun cari bulunamadi.</TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.customerCode} className={selectedCodes.includes(row.customerCode) ? 'bg-emerald-50/50' : undefined}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedCodes.includes(row.customerCode)}
                          onChange={() => toggleRow(row)}
                        />
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="space-y-1">
                          <div className="font-semibold text-gray-900">{row.customerName || '-'}</div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                            <span>{row.customerCode}</span>
                            {row.sectorCode && <span>Sektor: {row.sectorCode}</span>}
                            {row.assignedSalesRep?.name && <span>{row.assignedSalesRep.name}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', riskTypeClasses[row.riskType])}>
                            {riskTypeLabels[row.riskType]} / {row.riskScore}
                          </span>
                          <div className="text-xs text-gray-500">{row.confidence} guven</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.historicalAverage)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.recentAverage)}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold text-red-600">{percent(row.dropPercent)}</span>
                        {row.seasonalDropPercent !== null && (
                          <div className="text-xs text-gray-500">Sezonsal {percent(row.seasonalDropPercent)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-gray-900">{formatCurrency(row.lostPotential)}</TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-900">{safeDate(row.lastSaleDate)}</div>
                        <div className="text-xs text-gray-500">{row.daysSinceLastSale ?? '-'} gun</div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', developmentClasses[row.developmentStatus])}>
                            {developmentLabels[row.developmentStatus]}
                          </span>
                          <div className="text-xs text-gray-500">
                            {row.openActionCount} acik, {row.overdueActionCount} geciken
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openDetail(row)}>
                          <Eye className="mr-1.5 h-4 w-4" />
                          Ac
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-3 border-t bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-600">
                {selectedCodes.length > 0 ? `${selectedCodes.length} cari secildi` : 'Toplu takip icin carileri secin'}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Onceki
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)}>
                  Sonraki
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingDown className="h-5 w-5 text-red-500" />
                Risk dagilimi
              </CardTitle>
              <CardDescription>Rapor sonucu risk tipi ozeti</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.keys(riskTypeLabels).map((riskType) => {
                const typedRisk = riskType as CustomerRecoveryRiskType;
                return (
                  <div key={riskType} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-sm text-gray-700">{riskTypeLabels[typedRisk]}</span>
                    <span className="font-semibold text-gray-900">{summary?.countsByRisk?.[typedRisk] || 0}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-emerald-600" />
                Toplu takip
              </CardTitle>
              <CardDescription>Secilen carileri bir personele takip olarak ata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select label="Atanacak personel" value={bulkAssignedToId} onChange={(event) => setBulkAssignedToId(event.target.value)}>
                <option value="">Personel sec</option>
                {assignmentOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email || member.id}
                  </option>
                ))}
              </Select>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Takip tarihi</label>
                <Input type="date" value={bulkFollowUpDate} onChange={(event) => setBulkFollowUpDate(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Toplu not</label>
                <textarea
                  value={bulkNote}
                  onChange={(event) => setBulkNote(event.target.value)}
                  className="min-h-[90px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <Button className="w-full" disabled={selectedCodes.length === 0} isLoading={bulkSaving} onClick={bulkAssign}>
                {selectedCodes.length > 0 ? `${selectedCodes.length} cariye takip ac` : 'Cari secin'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Temsilci ozeti</CardTitle>
              <CardDescription>Riskli portfoy ve acik takipler</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(summary?.teamSummary || []).slice(0, 6).map((item) => (
                <div key={item.userId} className="rounded-2xl border border-gray-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-gray-900">{item.name || '-'}</div>
                    <div className="text-sm font-semibold text-red-600">{formatCurrency(item.lostPotential || 0)}</div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {item.customerCount} cari, {item.openActionCount} acik, {item.overdueActionCount} geciken
                  </div>
                </div>
              ))}
              {(!summary?.teamSummary || summary.teamSummary.length === 0) && (
                <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                  Temsilci eslesmesi bulunamadi.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => {
          setDetailRow(null);
          setDetail(null);
        }}
        title={detailRow ? `${detailRow.customerCode} - ${detailRow.customerName || 'Cari detayi'}` : 'Cari detayi'}
        size="full"
      >
        {detailLoading ? (
          <div className="py-16 text-center text-gray-500">Cari detaylari yukleniyor...</div>
        ) : detailRow ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <DetailMetric label="Gecmis aylik ort." value={formatCurrency(detailRow.historicalAverage)} />
                <DetailMetric label="Son donem ort." value={formatCurrency(detailRow.recentAverage)} />
                <DetailMetric label="Tahmini kayip" value={formatCurrency(detailRow.lostPotential)} />
                <DetailMetric label="Son satis" value={safeDate(detailRow.lastSaleDate)} />
              </div>

              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg">Aylik satis seyri</CardTitle>
                  <CardDescription>Gecmis baz donem ve son donem beraber gosterilir</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {detailRow.monthlySales.map((month) => {
                      const maxValue = Math.max(...detailRow.monthlySales.map((item) => item.amount), 1);
                      return (
                        <div key={month.month} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{month.month}</span>
                            <span>{month.documentCount} evrak</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (month.amount / maxValue) * 100)}%` }} />
                          </div>
                          <div className="mt-2 text-sm font-semibold text-gray-900">{formatCurrency(month.amount)}</div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg">Kategori kaybi ve urunler</CardTitle>
                  <CardDescription>Dususu hangi kategori ve urunlerin yarattigini gosterir</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(detail?.categories || []).map((category) => (
                    <div key={category.categoryCode} className="rounded-2xl border border-gray-100 bg-white p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold text-gray-900">{category.categoryName}</div>
                          <div className="text-xs text-gray-500">{category.categoryCode} / {category.productCount} urun</div>
                        </div>
                        <div className="text-sm font-semibold text-red-600">{formatCurrency(category.lostAmount)}</div>
                      </div>
                      <div className="mt-3 grid gap-2 lg:grid-cols-2">
                        {category.products.slice(0, 6).map((product) => (
                          <div key={product.productCode} className="rounded-xl bg-slate-50 p-3 text-sm">
                            <div className="line-clamp-1 font-medium text-gray-900">{product.productName}</div>
                            <div className="mt-1 flex justify-between gap-2 text-xs text-gray-500">
                              <span>{product.productCode}</span>
                              <span>{formatCurrency(product.lostAmount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(!detail?.categories || detail.categories.length === 0) && (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-sm text-gray-500">
                      Kategori kirilimi bulunamadi.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5" />
                    Son evraklar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evrak</TableHead>
                        <TableHead>Tarih</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                        <TableHead className="text-right">Satir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detail?.documents || []).map((document) => (
                        <TableRow key={`${document.documentNo}-${document.documentDate}`}>
                          <TableCell>{document.documentNo}</TableCell>
                          <TableCell>{safeDate(document.documentDate)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(document.amount)}</TableCell>
                          <TableCell className="text-right">{document.lineCount}</TableCell>
                        </TableRow>
                      ))}
                      {(!detail?.documents || detail.documents.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-gray-500">Evrak bulunamadi.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="border-emerald-200 bg-emerald-50/40">
                <CardHeader>
                  <CardTitle className="text-lg">Yeni aksiyon / not</CardTitle>
                  <CardDescription>Yapilan calisma sonraki raporlarda gelisme durumuyla birlikte gorunur</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Tip" value={actionForm.actionType} onChange={(event) => setActionForm((previous) => ({ ...previous, actionType: event.target.value }))}>
                      <option value="CALL">Arama</option>
                      <option value="VISIT">Ziyaret</option>
                      <option value="QUOTE">Teklif</option>
                      <option value="DISCOUNT">Iskonto</option>
                      <option value="NOTE">Not</option>
                    </Select>
                    <Select label="Oncelik" value={actionForm.priority} onChange={(event) => setActionForm((previous) => ({ ...previous, priority: event.target.value }))}>
                      <option value="HIGH">Yuksek</option>
                      <option value="NORMAL">Normal</option>
                      <option value="LOW">Dusuk</option>
                    </Select>
                  </div>
                  <Select label="Atanan" value={actionForm.assignedToId} onChange={(event) => setActionForm((previous) => ({ ...previous, assignedToId: event.target.value }))}>
                    <option value="">Atama yok</option>
                    {assignmentOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || member.email || member.id}
                      </option>
                    ))}
                  </Select>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Takip tarihi</label>
                    <Input type="date" value={actionForm.followUpDate} onChange={(event) => setActionForm((previous) => ({ ...previous, followUpDate: event.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Not / yapilan calisma</label>
                    <textarea
                      value={actionForm.note}
                      onChange={(event) => setActionForm((previous) => ({ ...previous, note: event.target.value }))}
                      placeholder="Musteri neden dusmus, ne konusuldu, hangi teklif veya ziyaret planlandi?"
                      className="min-h-[120px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <Button className="w-full" isLoading={actionSaving} onClick={saveAction}>
                    Aksiyonu kaydet
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg">Aksiyon gecmisi</CardTitle>
                  <CardDescription>Notlar ve takiplerin son durumu</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(detail?.actions || []).map((action) => (
                    <div key={action.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={action.status === 'DONE' ? 'success' : 'warning'}>{action.status}</Badge>
                            <Badge variant="outline">{action.actionType}</Badge>
                            <Badge variant="outline">{action.priority}</Badge>
                          </div>
                          <div className="text-xs text-gray-500">
                            {safeDate(action.createdAt)} / {action.author?.name || '-'}
                          </div>
                        </div>
                        {action.status !== 'DONE' && (
                          <Button size="sm" variant="outline" onClick={() => completeAction(action.id, detailRow.customerCode)}>
                            <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            Kapat
                          </Button>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{action.note}</p>
                      <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                        <span>Takip: {safeDate(action.followUpDate)}</span>
                        <span>Atanan: {action.assignedTo?.name || '-'}</span>
                      </div>
                    </div>
                  ))}
                  {(!detail?.actions || detail.actions.length === 0) && (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-sm text-gray-500">
                      Henuz not veya aksiyon yok.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
      <p className="text-xs text-white/70">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
