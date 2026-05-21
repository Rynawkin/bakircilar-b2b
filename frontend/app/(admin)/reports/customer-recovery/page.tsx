'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  MessageSquare,
  RefreshCw,
  Save,
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
import { adminApi, type CustomerRecoveryAction, type CustomerRecoveryDetailData, type CustomerRecoveryHistoricalValueData, type CustomerRecoveryHistoricalValueParams, type CustomerRecoveryPurchasePattern, type CustomerRecoveryReportData, type CustomerRecoveryReportParams, type CustomerRecoveryRiskType, type CustomerRecoveryRow } from '@/lib/api/admin';
import { cn } from '@/lib/utils/cn';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';

type SortBy = NonNullable<CustomerRecoveryReportParams['sortBy']>;
type SortDirection = NonNullable<CustomerRecoveryReportParams['sortDirection']>;
type HistoricalSortBy = NonNullable<CustomerRecoveryHistoricalValueParams['sortBy']>;
type SeasonalityMode = 'include' | 'exclude' | 'only';
type ScenarioId = 'declining' | 'stalled' | 'highPotential' | 'dueFollowUp' | 'seasonal' | 'frequentLost';
type ReportView = 'recovery' | 'historicalValue';

const PAGE_SIZE = 50;
const REPORT_CACHE_LIMIT = 5000;

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
  resultSearch: string;
  sectorCode: string;
  assignedToId: string;
  riskTypes: CustomerRecoveryRiskType[];
  onlyWithOpenAction: boolean;
  onlyDueFollowUp: boolean;
  minLostPotential: string;
  seasonalityMode: SeasonalityMode;
  purchasePattern: CustomerRecoveryPurchasePattern;
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

interface ActionUpdateDraft {
  status: string;
  outcome: string;
  followUpDate: string;
  assignedToId: string;
}

interface HistoricalFilterState {
  startYear: string;
  inactiveMonths: string;
  minConsecutiveMonths: string;
  minMonthlyAmount: string;
  minTotalAdjustedAmount: string;
  onlyLostFrequent: boolean;
  search: string;
  sectorCode: string;
  sortBy: HistoricalSortBy;
  sortDirection: SortDirection;
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
  resultSearch: '',
  sectorCode: '',
  assignedToId: '',
  riskTypes: ['NO_RECENT_SALES', 'INSIGNIFICANT_ACTIVITY', 'DECLINING', 'WATCH'],
  onlyWithOpenAction: false,
  onlyDueFollowUp: false,
  minLostPotential: '0',
  seasonalityMode: 'exclude',
  purchasePattern: 'ALL',
  sortBy: 'riskScore',
  sortDirection: 'desc',
};

const defaultHistoricalFilters: HistoricalFilterState = {
  startYear: '2020',
  inactiveMonths: '3',
  minConsecutiveMonths: '3',
  minMonthlyAmount: '5000',
  minTotalAdjustedAmount: '0',
  onlyLostFrequent: true,
  search: '',
  sectorCode: '',
  sortBy: 'lostPotentialAdjusted',
  sortDirection: 'desc',
};

const scenarioPresets: Array<{
  id: ScenarioId;
  title: string;
  description: string;
  helper: string;
  filters: Partial<FilterState>;
}> = [
  {
    id: 'declining',
    title: 'Cirosu dusen cariler',
    description: 'Son 3 ay satisi gecmis ortalamasina gore dusen cariler.',
    helper: 'Gunluk takip icin varsayilan senaryo.',
    filters: {
      recentMonths: '3',
      baselineMonths: '18',
      minDropPercent: '50',
      minHistoricalActiveMonths: '2',
      minHistoricalAmount: '1000',
      minMeaningfulMonthlyAmount: '1000',
      minLostPotential: '0',
      riskTypes: ['NO_RECENT_SALES', 'INSIGNIFICANT_ACTIVITY', 'DECLINING', 'WATCH'],
      onlyDueFollowUp: false,
      onlyWithOpenAction: false,
      seasonalityMode: 'exclude',
      purchasePattern: 'ALL',
      sortBy: 'riskScore',
      sortDirection: 'desc',
    },
  },
  {
    id: 'stalled',
    title: 'Tamamen duranlar',
    description: 'Son donemde hic satisi olmayan, daha once aktif cariler.',
    helper: 'Kaybedilmis cari listesi icin net gorunum.',
    filters: {
      recentMonths: '3',
      baselineMonths: '18',
      minDropPercent: '70',
      riskTypes: ['NO_RECENT_SALES'],
      seasonalityMode: 'exclude',
      purchasePattern: 'ALL',
      sortBy: 'lastSaleDate',
      sortDirection: 'asc',
    },
  },
  {
    id: 'highPotential',
    title: 'Yuksek kayip potansiyeli',
    description: 'Tahmini kayip cirosu yuksek carileri one cikarir.',
    helper: 'Saha ziyareti ve ozel teklif listesi icin.',
    filters: {
      recentMonths: '3',
      baselineMonths: '24',
      minDropPercent: '35',
      minHistoricalAmount: '10000',
      minLostPotential: '10000',
      riskTypes: ['NO_RECENT_SALES', 'INSIGNIFICANT_ACTIVITY', 'DECLINING', 'WATCH'],
      seasonalityMode: 'include',
      purchasePattern: 'ALL',
      sortBy: 'lostPotential',
      sortDirection: 'desc',
    },
  },
  {
    id: 'dueFollowUp',
    title: 'Takip gunu gelenler',
    description: 'Daha once aksiyon yazilmis ve takip tarihi gecmis cariler.',
    helper: 'Gunluk arama/hatirlatma listesi.',
    filters: {
      onlyDueFollowUp: true,
      onlyWithOpenAction: true,
      riskTypes: ['NO_RECENT_SALES', 'INSIGNIFICANT_ACTIVITY', 'DECLINING', 'WATCH'],
      purchasePattern: 'ALL',
      sortBy: 'riskScore',
      sortDirection: 'desc',
    },
  },
  {
    id: 'seasonal',
    title: 'Donemsel alim yapanlar',
    description: 'Seyrek veya takvimsel alim ritmi olan carileri ayirir.',
    helper: 'Kayip mi, normal alim periyodu mu ayrimi icin.',
    filters: {
      seasonalityMode: 'only',
      purchasePattern: 'PERIODIC',
      riskTypes: ['NO_RECENT_SALES', 'INSIGNIFICANT_ACTIVITY', 'DECLINING', 'WATCH'],
      sortBy: 'lostPotential',
      sortDirection: 'desc',
    },
  },
  {
    id: 'frequentLost',
    title: 'Sik alirken duranlar',
    description: 'Ardisik aylarda veya duzenli sik alim yaparken son donemde duran cariler.',
    helper: 'Ihale/donemsel carileri ayirip gercek kayiplari yakalar.',
    filters: {
      recentMonths: '3',
      baselineMonths: '18',
      minDropPercent: '45',
      minHistoricalActiveMonths: '3',
      minHistoricalAmount: '3000',
      minMeaningfulMonthlyAmount: '1000',
      riskTypes: ['NO_RECENT_SALES', 'INSIGNIFICANT_ACTIVITY', 'DECLINING'],
      seasonalityMode: 'exclude',
      purchasePattern: 'FREQUENT',
      sortBy: 'lostPotential',
      sortDirection: 'desc',
    },
  },
];

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

const monthLabel = (month?: string | null) => {
  if (!month) return '-';
  const [year, monthPart] = month.split('-');
  if (!year || !monthPart) return month;
  return `${monthPart}/${year}`;
};

const percent = (value: number | null | undefined) => `${Math.round(value || 0)}%`;

const toDateInputValue = (date?: string | null) => (date ? date.slice(0, 10) : '');

const buildActionUpdateDrafts = (actions: CustomerRecoveryAction[] = []) =>
  Object.fromEntries(
    actions.map((action) => [
      action.id,
      {
        status: action.status || 'OPEN',
        outcome: action.outcome || '',
        followUpDate: toDateInputValue(action.followUpDate),
        assignedToId: action.assignedTo?.id || '',
      },
    ])
  ) as Record<string, ActionUpdateDraft>;

const compareRowsBySort = (
  a: CustomerRecoveryRow,
  b: CustomerRecoveryRow,
  sortBy: SortBy,
  sortDirection: SortDirection
) => {
  const direction = sortDirection === 'asc' ? 1 : -1;
  let compare = 0;

  switch (sortBy) {
    case 'lostPotential':
      compare = a.lostPotential - b.lostPotential;
      break;
    case 'dropPercent':
      compare = a.dropPercent - b.dropPercent;
      break;
    case 'lastSaleDate':
      compare = String(a.lastSaleDate || '').localeCompare(String(b.lastSaleDate || ''));
      break;
    case 'historicalAverage':
      compare = a.historicalAverage - b.historicalAverage;
      break;
    case 'recentAverage':
      compare = a.recentAverage - b.recentAverage;
      break;
    case 'customerName':
      compare = String(a.customerName || '').localeCompare(String(b.customerName || ''), 'tr');
      break;
    case 'riskScore':
    default:
      compare = a.riskScore - b.riskScore;
      break;
  }

  if (compare !== 0) return compare * direction;
  return b.lostPotential - a.lostPotential;
};

export default function CustomerRecoveryReportPage() {
  const [activeView, setActiveView] = useState<ReportView>('recovery');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [submittedFilters, setSubmittedFilters] = useState<FilterState>(defaultFilters);
  const [clientSort, setClientSort] = useState<{ sortBy: SortBy; sortDirection: SortDirection }>({
    sortBy: defaultFilters.sortBy,
    sortDirection: defaultFilters.sortDirection,
  });
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>('declining');
  const [showManualSettings, setShowManualSettings] = useState(false);
  const [rows, setRows] = useState<CustomerRecoveryRow[]>([]);
  const [summary, setSummary] = useState<CustomerRecoveryReportData['summary'] | null>(null);
  const [metadata, setMetadata] = useState<CustomerRecoveryReportData['metadata'] | null>(null);
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
  const [actionUpdateDrafts, setActionUpdateDrafts] = useState<Record<string, ActionUpdateDraft>>({});
  const [actionUpdateSavingId, setActionUpdateSavingId] = useState<string | null>(null);
  const [bulkAssignedToId, setBulkAssignedToId] = useState('');
  const [bulkFollowUpDate, setBulkFollowUpDate] = useState('');
  const [bulkNote, setBulkNote] = useState('Geri kazanim takibi icin aransin / ziyaret edilsin.');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [historicalFilters, setHistoricalFilters] = useState<HistoricalFilterState>(defaultHistoricalFilters);
  const [submittedHistoricalFilters, setSubmittedHistoricalFilters] = useState<HistoricalFilterState>(defaultHistoricalFilters);
  const [historicalData, setHistoricalData] = useState<CustomerRecoveryHistoricalValueData | null>(null);
  const [historicalPage, setHistoricalPage] = useState(1);
  const [historicalLoading, setHistoricalLoading] = useState(false);

  const buildParams = (source: FilterState, requestedPage = page, limit = PAGE_SIZE): CustomerRecoveryReportParams => ({
    recentMonths: parseNumber(source.recentMonths, 3),
    baselineMonths: parseNumber(source.baselineMonths, 18),
    minDropPercent: parseNumber(source.minDropPercent, 50),
    minHistoricalActiveMonths: parseNumber(source.minHistoricalActiveMonths, 2),
    minHistoricalAmount: parseNumber(source.minHistoricalAmount, 1000),
    minMeaningfulMonthlyAmount: parseNumber(source.minMeaningfulMonthlyAmount, 1000),
    includeCurrentMonth: source.includeCurrentMonth,
    search: source.search.trim() || undefined,
    resultSearch: source.resultSearch.trim() || undefined,
    sectorCode: source.sectorCode.trim() || undefined,
    assignedToId: source.assignedToId || undefined,
    riskTypes: source.riskTypes.length > 0 ? source.riskTypes : undefined,
    onlyWithOpenAction: source.onlyWithOpenAction,
    onlyDueFollowUp: source.onlyDueFollowUp,
    minLostPotential: parseNumber(source.minLostPotential, 0),
    seasonalityMode: source.seasonalityMode,
    purchasePattern: source.purchasePattern,
    page: requestedPage,
    limit,
    sortBy: source.sortBy,
    sortDirection: source.sortDirection,
  });

  const buildHistoricalParams = (
    source: HistoricalFilterState,
    requestedPage = historicalPage,
    limit = PAGE_SIZE
  ): CustomerRecoveryHistoricalValueParams => ({
    startYear: parseNumber(source.startYear, 2020),
    inactiveMonths: parseNumber(source.inactiveMonths, 3),
    minConsecutiveMonths: parseNumber(source.minConsecutiveMonths, 3),
    minMonthlyAmount: parseNumber(source.minMonthlyAmount, 5000),
    minTotalAdjustedAmount: parseNumber(source.minTotalAdjustedAmount, 0),
    onlyLostFrequent: source.onlyLostFrequent,
    search: source.search.trim() || undefined,
    sectorCode: source.sectorCode.trim() || undefined,
    page: requestedPage,
    limit,
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

  const displayRows = useMemo(
    () => [...rows].sort((a, b) => compareRowsBySort(a, b, clientSort.sortBy, clientSort.sortDirection)),
    [clientSort, rows]
  );

  const pagination = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    totalPages: displayRows.length > 0 ? Math.ceil(displayRows.length / PAGE_SIZE) : 0,
    totalRecords: displayRows.length,
  }), [displayRows.length, page]);

  const visibleRows = useMemo(() => {
    const offset = (page - 1) * PAGE_SIZE;
    return displayRows.slice(offset, offset + PAGE_SIZE);
  }, [displayRows, page]);

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
        const result = await adminApi.getCustomerRecoveryReport(buildParams(submittedFilters, 1, REPORT_CACHE_LIMIT));
        setRows(result.data.rows || []);
        setSummary(result.data.summary);
        setMetadata(result.data.metadata);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Cari geri kazanim raporu alinamadi');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [submittedFilters]);

  useEffect(() => {
    if (activeView !== 'historicalValue') return;

    const fetchHistoricalReport = async () => {
      setHistoricalLoading(true);
      try {
        const result = await adminApi.getCustomerRecoveryHistoricalValueReport(
          buildHistoricalParams(submittedHistoricalFilters, historicalPage)
        );
        setHistoricalData(result.data);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Degerlenmis cari raporu alinamadi');
        setHistoricalData(null);
      } finally {
        setHistoricalLoading(false);
      }
    };

    fetchHistoricalReport();
  }, [activeView, submittedHistoricalFilters, historicalPage]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  const updateHistoricalFilter = <K extends keyof HistoricalFilterState>(key: K, value: HistoricalFilterState[K]) => {
    setHistoricalFilters((previous) => ({ ...previous, [key]: value }));
  };

  const runReport = () => {
    setPage(1);
    setSelectedCodes([]);
    setClientSort({ sortBy: filters.sortBy, sortDirection: filters.sortDirection });
    setSubmittedFilters({ ...filters });
  };

  const runHistoricalReport = () => {
    setHistoricalPage(1);
    setSubmittedHistoricalFilters({ ...historicalFilters });
    setActiveView('historicalValue');
  };

  const applyScenario = (scenarioId: ScenarioId) => {
    const scenario = scenarioPresets.find((item) => item.id === scenarioId);
    if (!scenario) return;
    setSelectedScenario(scenarioId);
    setFilters((previous) => ({
      ...previous,
      ...scenario.filters,
      resultSearch: previous.resultSearch,
      search: previous.search,
      sectorCode: previous.sectorCode,
      assignedToId: previous.assignedToId,
    }));
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
    const pageCodes = visibleRows.map((row) => row.customerCode);
    const allSelected = pageCodes.length > 0 && pageCodes.every((code) => selectedCodes.includes(code));
    setSelectedCodes((previous) => {
      if (allSelected) return previous.filter((code) => !pageCodes.includes(code));
      return Array.from(new Set([...previous, ...pageCodes]));
    });
  };

  const openDetail = async (row: CustomerRecoveryRow) => {
    setDetailRow(row);
    setDetail(null);
    setActionUpdateDrafts({});
    setActionForm({
      ...defaultActionForm,
      assignedToId: row.lastAction?.assignedTo?.id || row.assignedSalesRep?.id || '',
    });
    setDetailLoading(true);
    try {
      const result = await adminApi.getCustomerRecoveryDetail(row.customerCode, buildParams(submittedFilters, 1));
      setDetail(result.data);
      setActionUpdateDrafts(buildActionUpdateDrafts(result.data.actions || []));
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
      setActionUpdateDrafts(buildActionUpdateDrafts(detailResult.data.actions || []));
    }
    const reportResult = await adminApi.getCustomerRecoveryReport(buildParams(submittedFilters, 1, REPORT_CACHE_LIMIT));
    setRows(reportResult.data.rows || []);
    setSummary(reportResult.data.summary);
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
    const draft = actionUpdateDrafts[actionId];
    try {
      await adminApi.updateCustomerRecoveryAction(actionId, {
        status: 'DONE',
        outcome: draft?.outcome.trim() || 'Tamamlandi',
        followUpDate: draft?.followUpDate || null,
        assignedToId: draft?.assignedToId || null,
        postSnapshot: detail?.row || detailRow,
      });
      toast.success('Aksiyon kapatildi');
      await refreshAfterAction(customerCode);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aksiyon kapatilamadi');
    }
  };

  const updateActionDraft = (actionId: string, patch: Partial<ActionUpdateDraft>) => {
    setActionUpdateDrafts((previous) => ({
      ...previous,
      [actionId]: {
        status: previous[actionId]?.status || 'OPEN',
        outcome: previous[actionId]?.outcome || '',
        followUpDate: previous[actionId]?.followUpDate || '',
        assignedToId: previous[actionId]?.assignedToId || '',
        ...patch,
      },
    }));
  };

  const saveActionUpdate = async (action: CustomerRecoveryAction) => {
    const draft = actionUpdateDrafts[action.id];
    if (!draft) return;
    setActionUpdateSavingId(action.id);
    try {
      await adminApi.updateCustomerRecoveryAction(action.id, {
        status: draft.status,
        outcome: draft.outcome.trim() || null,
        followUpDate: draft.followUpDate || null,
        assignedToId: draft.assignedToId || null,
        postSnapshot: detail?.row || detailRow,
      });
      toast.success('Aksiyon durumu guncellendi');
      await refreshAfterAction(action.customerCode);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aksiyon guncellenemedi');
    } finally {
      setActionUpdateSavingId(null);
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
    setClientSort((previous) => ({
      sortBy,
      sortDirection: previous.sortBy === sortBy && previous.sortDirection === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  };

  const sortHistorical = (sortBy: HistoricalSortBy) => {
    const sortDirection: SortDirection =
      submittedHistoricalFilters.sortBy === sortBy && submittedHistoricalFilters.sortDirection === 'desc'
        ? 'asc'
        : 'desc';
    const nextFilters = {
      ...submittedHistoricalFilters,
      sortBy,
      sortDirection,
    };
    setHistoricalFilters((previous) => ({
      ...previous,
      sortBy,
      sortDirection,
    }));
    setSubmittedHistoricalFilters(nextFilters);
    setHistoricalPage(1);
    setActiveView('historicalValue');
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

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5 lg:min-w-[760px]">
          <HeroMetric label="Riskli cari" value={summary?.totalCustomers ?? 0} />
          <HeroMetric label="Kayip potansiyel" value={formatCurrency(summary?.totalLostPotential || 0)} />
          <HeroMetric label="Aksiyon yok" value={summary?.noActionCount ?? 0} />
          <HeroMetric label="Geciken takip" value={summary?.dueFollowUpCount ?? 0} />
          <HeroMetric label="Donemsel" value={summary?.seasonalCount ?? 0} />
        </div>
      </div>

      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveView('recovery')}
          className={cn(
            'rounded-2xl px-5 py-4 text-left transition',
            activeView === 'recovery'
              ? 'bg-slate-950 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-50'
          )}
        >
          <div className="text-sm font-semibold">Kayip cari analizi</div>
          <div className={cn('mt-1 text-xs', activeView === 'recovery' ? 'text-white/70' : 'text-slate-500')}>
            Son donem dusen, duran ve aksiyon bekleyen cariler.
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('historicalValue')}
          className={cn(
            'rounded-2xl px-5 py-4 text-left transition',
            activeView === 'historicalValue'
              ? 'bg-emerald-700 text-white shadow-md'
              : 'text-slate-600 hover:bg-emerald-50'
          )}
        >
          <div className="text-sm font-semibold">2020 bugunku deger analizi</div>
          <div className={cn('mt-1 text-xs', activeView === 'historicalValue' ? 'text-white/75' : 'text-slate-500')}>
            Eski satislari USD/TL oranina gore bugunku TL karsiligina cevirir.
          </div>
        </button>
      </div>

      {activeView === 'recovery' ? (
        <>
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b bg-gradient-to-r from-white to-emerald-50/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Filter className="h-5 w-5 text-emerald-600" />
                Hazir senaryolar
              </CardTitle>
              <CardDescription>
                Teknik alan doldurmadan raporu calistirin. Isterseniz manuel detayli ayarlari acabilirsiniz.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/reports/customer-recovery/actions">
                <Button variant="outline">
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Bana atananlar
                </Button>
              </Link>
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {scenarioPresets.map((scenario) => {
              const active = selectedScenario === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => applyScenario(scenario.id)}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md',
                    active
                      ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-emerald-200'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{scenario.title}</span>
                    {active && <Badge variant="success">Secili</Badge>}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{scenario.description}</p>
                  <p className="mt-3 text-xs font-medium text-emerald-700">{scenario.helper}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900">
            Bu ayarlarla son {filters.recentMonths} ay, onceki {filters.baselineMonths} aylik aktif satis ortalamasiyla karsilastirilir.
            Gecmise gore en az %{filters.minDropPercent} dusen veya son donemde hareketi duran cariler listelenir.
          </div>

          <div className="grid gap-4 lg:grid-cols-6">
            <LabeledInput label="Sektor kodu" value={filters.sectorCode} onChange={(value) => updateFilter('sectorCode', value.toUpperCase())} />
            <Select label="Temsilci / takip sahibi" value={filters.assignedToId} onChange={(event) => updateFilter('assignedToId', event.target.value)}>
              <option value="">Tumu</option>
              {assignmentOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email || member.id}
                </option>
              ))}
            </Select>
            <LabeledInput label="Min. tahmini kayip" value={filters.minLostPotential} onChange={(value) => updateFilter('minLostPotential', value)} />
            <Select label="Donemsel cariler" value={filters.seasonalityMode} onChange={(event) => updateFilter('seasonalityMode', event.target.value as SeasonalityMode)}>
              <option value="include">Dahil et</option>
              <option value="exclude">Normal ritimdekileri ayir</option>
              <option value="only">Sadece donemsel</option>
            </Select>
            <Select label="Alim ritmi" value={filters.purchasePattern} onChange={(event) => updateFilter('purchasePattern', event.target.value as CustomerRecoveryPurchasePattern)}>
              <option value="ALL">Tumu</option>
              <option value="FREQUENT">Sik alirken duranlar</option>
              <option value="PERIODIC">Donemsel / ihale</option>
              <option value="SPORADIC">Seyrek / belirsiz</option>
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
            <label className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
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
            <Button variant="ghost" size="sm" onClick={() => setShowManualSettings((value) => !value)}>
              {showManualSettings ? 'Manuel ayarlari gizle' : 'Detayli manuel calistir'}
            </Button>
          </div>

          {showManualSettings && (
            <div className="space-y-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <LabeledInput label="Son donem ay" value={filters.recentMonths} onChange={(value) => updateFilter('recentMonths', value)} />
                <LabeledInput label="Gecmis baz ay" value={filters.baselineMonths} onChange={(value) => updateFilter('baselineMonths', value)} />
                <LabeledInput label="Dusme yuzdesi" value={filters.minDropPercent} onChange={(value) => updateFilter('minDropPercent', value)} />
                <LabeledInput label="Min aktif ay" value={filters.minHistoricalActiveMonths} onChange={(value) => updateFilter('minHistoricalActiveMonths', value)} />
                <LabeledInput label="Min gecmis ciro" value={filters.minHistoricalAmount} onChange={(value) => updateFilter('minHistoricalAmount', value)} />
                <LabeledInput label="Anlamli ay ciro" value={filters.minMeaningfulMonthlyAmount} onChange={(value) => updateFilter('minMeaningfulMonthlyAmount', value)} />
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
              </div>
            </div>
          )}
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
            <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={filters.resultSearch}
                  onChange={(event) => updateFilter('resultSearch', event.target.value)}
                  placeholder="Rapor sonucu icinde cari kodu, cari adi, sehir veya sektor ara..."
                  className="pl-10"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') runReport();
                  }}
                />
              </div>
              <Button variant="outline" onClick={runReport} disabled={loading}>
                Sonucta ara
              </Button>
              {filters.resultSearch && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    updateFilter('resultSearch', '');
                    setSubmittedFilters((previous) => ({ ...previous, resultSearch: '' }));
                    setPage(1);
                  }}
                >
                  Temizle
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table containerClassName="max-h-[720px]">
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={visibleRows.length > 0 && visibleRows.every((row) => selectedCodes.includes(row.customerCode))}
                      onChange={toggleCurrentPage}
                    />
                  </TableHead>
                  <TableHead>Cari</TableHead>
                  <SortableTableHead label="Risk" sortBy="riskScore" activeSort={clientSort} onSort={sort} />
                  <SortableTableHead label="Gecmis ort." sortBy="historicalAverage" activeSort={clientSort} onSort={sort} align="right" />
                  <SortableTableHead label="Son ort." sortBy="recentAverage" activeSort={clientSort} onSort={sort} align="right" />
                  <SortableTableHead label="Dusme" sortBy="dropPercent" activeSort={clientSort} onSort={sort} align="right" />
                  <SortableTableHead label="Kayip" sortBy="lostPotential" activeSort={clientSort} onSort={sort} align="right" />
                  <TableHead>Kayip kategori</TableHead>
                  <SortableTableHead label="Son alim" sortBy="lastSaleDate" activeSort={clientSort} onSort={sort} />
                  <TableHead>Onerilen aksiyon</TableHead>
                  <TableHead>Takip</TableHead>
                  <TableHead className="text-right">Detay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-12 text-center text-gray-500">Rapor hesaplaniyor...</TableCell>
                  </TableRow>
                ) : displayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-12 text-center text-gray-500">Filtrelere uygun cari bulunamadi.</TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => (
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
                          {row.isSeasonal && (
                            <div className={cn('text-xs font-medium', row.seasonalityStatus === 'OVERDUE' ? 'text-red-600' : 'text-blue-600')}>
                              {row.seasonalityStatus === 'OVERDUE' ? 'Donemsel periyot gecmis' : 'Donemsel/ihale ritmi'}
                            </div>
                          )}
                          {row.purchasePattern === 'FREQUENT' && (
                            <div className="text-xs font-medium text-emerald-700">Sik alim gecmisi</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(row.historicalAverage)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.recentAverage)}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold text-red-600">{percent(row.dropPercent)}</span>
                        {row.seasonalDropPercent !== null && (
                          <div className="text-xs text-gray-500">Sezonsal {percent(row.seasonalDropPercent)}</div>
                        )}
                        {row.averagePurchaseIntervalMonths && (
                          <div className="text-xs text-gray-500">
                            Ritm {row.averagePurchaseIntervalMonths} ay / son {row.monthsSinceLastMeaningfulPurchase ?? '-'} ay
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-gray-900">{formatCurrency(row.lostPotential)}</TableCell>
                      <TableCell className="min-w-[190px]">
                        <div className="text-sm font-medium text-gray-900">{row.topLostCategory?.categoryName || '-'}</div>
                        <div className="text-xs text-gray-500">
                          {row.topLostCategory ? formatCurrency(row.topLostCategory.lostAmount) : row.seasonalityReason || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="line-clamp-1 text-sm text-gray-900">{row.lastPurchasedProduct?.productName || '-'}</div>
                        <div className="text-xs text-gray-500">
                          {safeDate(row.lastPurchasedProduct?.lastPurchaseDate || row.lastSaleDate)} / {row.daysSinceLastSale ?? '-'} gun
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="text-sm text-gray-800">{row.recommendedAction || '-'}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Teklif {row.openQuoteCount}, siparis {row.openOrderCount}, bakiye {formatCurrency(row.balance || 0)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', developmentClasses[row.developmentStatus])}>
                            {developmentLabels[row.developmentStatus]}
                          </span>
                          <div className="text-xs text-gray-500">
                            {row.openActionCount} acik, {row.overdueActionCount} geciken
                          </div>
                          {row.lastAction?.note && (
                            <div className="line-clamp-2 max-w-[180px] text-xs text-gray-500">
                              Son not: {row.lastAction.note}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openDetail(row)}>
                          <Eye className="mr-1.5 h-4 w-4" />
                          Ac / Not
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

          <Card className="border-blue-100 bg-blue-50/40 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-blue-950">Donemsel alim ayrimi</CardTitle>
              <CardDescription>Alimlari seyrek veya belirli periyotla tekrar eden cariler</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                <span className="text-sm text-gray-700">Donemsel cari</span>
                <span className="font-semibold text-blue-700">{summary?.seasonalCount || 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                <span className="text-sm text-gray-700">Donemsel kayip</span>
                <span className="font-semibold text-blue-700">{formatCurrency(summary?.seasonalLostPotential || 0)}</span>
              </div>
              <p className="text-xs leading-relaxed text-blue-900/80">
                Normal ritimdeki donemsel cariler ana kayip listesinden ayrilir; beklenen alim periyodu asildiysa yine risk olarak kalir.
              </p>
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
        </>
      ) : (
        <HistoricalValueSection
          filters={historicalFilters}
          data={historicalData}
          loading={historicalLoading}
          page={historicalPage}
          activeSort={{
            sortBy: submittedHistoricalFilters.sortBy,
            sortDirection: submittedHistoricalFilters.sortDirection,
          }}
          onPageChange={setHistoricalPage}
          onFilterChange={updateHistoricalFilter}
          onRun={runHistoricalReport}
          onSort={sortHistorical}
        />
      )}

      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => {
          setDetailRow(null);
          setDetail(null);
          setActionUpdateDrafts({});
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

              <Card className="border-amber-100 bg-amber-50/50">
                <CardContent className="grid gap-3 p-4 md:grid-cols-3">
                  <InsightBlock
                    label="Ana kayip kategori"
                    value={detailRow.topLostCategory?.categoryName || '-'}
                    helper={detailRow.topLostCategory ? formatCurrency(detailRow.topLostCategory.lostAmount) : '-'}
                  />
                  <InsightBlock
                    label="Son alinan urun"
                    value={detailRow.lastPurchasedProduct?.productName || '-'}
                    helper={safeDate(detailRow.lastPurchasedProduct?.lastPurchaseDate || detailRow.lastSaleDate)}
                  />
                  <InsightBlock
                    label={detailRow.isSeasonal ? 'Donemsel ritim' : 'Onerilen aksiyon'}
                    value={
                      detailRow.seasonalityStatus === 'OVERDUE'
                        ? 'Beklenen periyot asilmis'
                        : detailRow.isSeasonal
                          ? 'Ritim tolerans icinde'
                          : (detailRow.recommendedAction || '-')
                    }
                    helper={detailRow.seasonalityReason || detailRow.recommendedAction || '-'}
                  />
                </CardContent>
              </Card>

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
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
                    <Select label="Durum" value={actionForm.status} onChange={(event) => setActionForm((previous) => ({ ...previous, status: event.target.value }))}>
                      <option value="OPEN">Acik</option>
                      <option value="DONE">Tamamlandi</option>
                      <option value="CANCELLED">Iptal</option>
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
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Sonuc / durum notu</label>
                    <textarea
                      value={actionForm.outcome}
                      onChange={(event) => setActionForm((previous) => ({ ...previous, outcome: event.target.value }))}
                      placeholder="Aksiyon sonucu, musteri cevabi veya sonraki adim..."
                      className="min-h-[80px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                  {(detail?.actions || []).map((action) => {
                    const draft = actionUpdateDrafts[action.id] || {
                      status: action.status || 'OPEN',
                      outcome: action.outcome || '',
                      followUpDate: toDateInputValue(action.followUpDate),
                      assignedToId: action.assignedTo?.id || '',
                    };
                    return (
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
                        {action.outcome && (
                          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-gray-700">
                            <span className="font-semibold text-gray-900">Durum notu: </span>
                            {action.outcome}
                          </p>
                        )}
                        <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                          <span>Takip: {safeDate(action.followUpDate)}</span>
                          <span>Atanan: {action.assignedTo?.name || '-'}</span>
                        </div>
                        <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <MessageSquare className="h-4 w-4 text-emerald-600" />
                            Aksiyon durumu / notu
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Select label="Durum" value={draft.status} onChange={(event) => updateActionDraft(action.id, { status: event.target.value })}>
                              <option value="OPEN">Acik</option>
                              <option value="DONE">Tamamlandi</option>
                              <option value="CANCELLED">Iptal</option>
                            </Select>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-gray-700">Takip tarihi</label>
                              <Input type="date" value={draft.followUpDate} onChange={(event) => updateActionDraft(action.id, { followUpDate: event.target.value })} />
                            </div>
                            <Select label="Atanan" value={draft.assignedToId} onChange={(event) => updateActionDraft(action.id, { assignedToId: event.target.value })}>
                              <option value="">Atama yok</option>
                              {assignmentOptions.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name || member.email || member.id}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <textarea
                            value={draft.outcome}
                            onChange={(event) => updateActionDraft(action.id, { outcome: event.target.value })}
                            placeholder="Atanan kullanici bu aksiyonla ilgili son durumu veya gorusme notunu buraya yazar."
                            className="min-h-[80px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <Button size="sm" variant="outline" isLoading={actionUpdateSavingId === action.id} onClick={() => saveActionUpdate(action)}>
                            <Save className="mr-1.5 h-4 w-4" />
                            Durumu kaydet
                          </Button>
                        </div>
                      </div>
                    );
                  })}
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

function HistoricalValueSection({
  filters,
  data,
  loading,
  page,
  activeSort,
  onPageChange,
  onFilterChange,
  onRun,
  onSort,
}: {
  filters: HistoricalFilterState;
  data: CustomerRecoveryHistoricalValueData | null;
  loading: boolean;
  page: number;
  activeSort: { sortBy: HistoricalSortBy; sortDirection: SortDirection };
  onPageChange: (page: number) => void;
  onFilterChange: <K extends keyof HistoricalFilterState>(key: K, value: HistoricalFilterState[K]) => void;
  onRun: () => void;
  onSort: (sortBy: HistoricalSortBy) => void;
}) {
  const summary = data?.summary;
  const metadata = data?.metadata;
  const rows = data?.rows || [];
  const pagination = data?.pagination || { page, limit: PAGE_SIZE, totalPages: 0, totalRecords: 0 };
  const currentRateLabel = metadata?.currentUsdTryRate
    ? metadata.currentUsdTryRate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : '-';

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-emerald-200 shadow-sm">
        <CardHeader className="border-b bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-2xl text-white">2020'den bugune degerlenmis cari analizi</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-emerald-50/80">
                Gecmis satislari Mikro hareketindeki USD/TL kuru ile bugunku USD/TL kuruna tasir. Ardisik aktif aylarda alim yapip sonrasinda duran carileri ayrica isaretler.
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[520px]">
              <HeroMetric label="Bugunku USD/TL" value={currentRateLabel} />
              <HeroMetric label="Ardisik alirken duran" value={summary?.lostAfterConsecutiveCount ?? 0} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 lg:grid-cols-6">
            <LabeledInput label="Baslangic yili" value={filters.startYear} onChange={(value) => onFilterChange('startYear', value)} />
            <LabeledInput label="Pasif ay esigi" value={filters.inactiveMonths} onChange={(value) => onFilterChange('inactiveMonths', value)} />
            <LabeledInput label="Min. ardisik aktif ay" value={filters.minConsecutiveMonths} onChange={(value) => onFilterChange('minConsecutiveMonths', value)} />
            <LabeledInput label="Anlamli ay cirosu" value={filters.minMonthlyAmount} onChange={(value) => onFilterChange('minMonthlyAmount', value)} />
            <LabeledInput label="Min. bugunku toplam" value={filters.minTotalAdjustedAmount} onChange={(value) => onFilterChange('minTotalAdjustedAmount', value)} />
            <Select label="Sirala" value={`${filters.sortBy}:${filters.sortDirection}`} onChange={(event) => {
              const [sortBy, sortDirection] = event.target.value.split(':') as [HistoricalSortBy, SortDirection];
              onFilterChange('sortBy', sortBy);
              onFilterChange('sortDirection', sortDirection);
            }}>
              <option value="lostPotentialAdjusted:desc">Tahmini kayip yuksek</option>
              <option value="peakAdjustedAmount:desc">En yuksek ay degeri</option>
              <option value="totalRawAmount:desc">Nominal toplam yuksek</option>
              <option value="totalAdjustedAmount:desc">Toplam bugunku deger</option>
              <option value="lastSaleDate:asc">Son satis en eski</option>
              <option value="maxConsecutiveActiveMonths:desc">Ardisik ay sayisi</option>
              <option value="customerName:asc">Cari adi A-Z</option>
            </Select>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_220px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={filters.search}
                onChange={(event) => onFilterChange('search', event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onRun();
                }}
                placeholder="Cari kodu, unvani, sektor, il veya ilce ara..."
                className="pl-10"
              />
            </div>
            <LabeledInput label="Sektor kodu" value={filters.sectorCode} onChange={(value) => onFilterChange('sectorCode', value.toUpperCase())} />
            <Button onClick={onRun} isLoading={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Raporu getir
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">
              <input
                type="checkbox"
                checked={filters.onlyLostFrequent}
                onChange={(event) => onFilterChange('onlyLostFrequent', event.target.checked)}
              />
              Sadece ardisik alirken duranlari goster
            </label>
            <div className="text-xs text-slate-500">
              Anlamli ay cirosu bugunku TL karsiligina gore degerlendirilir. Ornek: eski 75.000 TL, eski kur 18,86 ve bugunku kur 45,5 ise yaklasik 181.000 TL sayilir.
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <DetailMetric label="Cari sayisi" value={summary?.totalCustomers ?? 0} />
        <DetailMetric label="Nominal toplam" value={formatCurrency(summary?.totalRawAmount || 0)} />
        <DetailMetric label="Bugunku deger" value={formatCurrency(summary?.totalAdjustedAmount || 0)} />
        <DetailMetric label="Tahmini kayip" value={formatCurrency(summary?.totalLostPotentialAdjusted || 0)} />
        <DetailMetric label="Ortalama katsayi" value={`${(summary?.averageMultiplier || 1).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}x`} />
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b bg-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-xl">Degerlenmis satislar ve kayip ritmi</CardTitle>
              <CardDescription>
                {metadata ? `${metadata.startDate} - ${metadata.endDate} araligi incelendi. Gecmis kur: Mikro, guncel kur: ${metadata.currentUsdTryRateSource}.` : 'Rapor yukleniyor'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{pagination.totalRecords} kayit</Badge>
              <Badge variant="outline">Sayfa {pagination.page || page} / {pagination.totalPages || 0}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table containerClassName="max-h-[720px]">
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <HistoricalSortableTableHead label="Cari" sortBy="customerName" activeSort={activeSort} onSort={onSort} />
                <TableHead>Durum</TableHead>
                <HistoricalSortableTableHead label="Son aktif ay" sortBy="lastSaleDate" activeSort={activeSort} onSort={onSort} />
                <HistoricalSortableTableHead label="Ardisik aktiflik" sortBy="maxConsecutiveActiveMonths" activeSort={activeSort} onSort={onSort} />
                <HistoricalSortableTableHead label="En yuksek ay" sortBy="peakAdjustedAmount" activeSort={activeSort} onSort={onSort} />
                <HistoricalSortableTableHead label="Nominal toplam" sortBy="totalRawAmount" activeSort={activeSort} onSort={onSort} align="right" />
                <HistoricalSortableTableHead label="Bugunku deger" sortBy="totalAdjustedAmount" activeSort={activeSort} onSort={onSort} align="right" />
                <HistoricalSortableTableHead label="Tahmini kayip" sortBy="lostPotentialAdjusted" activeSort={activeSort} onSort={onSort} align="right" />
                <TableHead>En degerli aylar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-gray-500">Rapor hesaplaniyor...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-gray-500">Filtrelere uygun cari bulunamadi.</TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.customerCode} className={row.lostAfterConsecutiveActivity ? 'bg-red-50/35' : undefined}>
                    <TableCell className="min-w-[280px]">
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
                        <Badge variant={row.lostAfterConsecutiveActivity ? 'danger' : 'outline'}>
                          {row.lostAfterConsecutiveActivity ? 'Ardisik alirken durdu' : 'Izleme'}
                        </Badge>
                        <div className="text-xs text-gray-500">
                          Aktif ay {row.activeMonths}, evrak {row.documentCount}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-gray-900">{monthLabel(row.lastActiveMonth?.month)}</div>
                      <div className="text-xs text-gray-500">
                        {row.monthsSinceLastActive ?? '-'} ay once / {safeDate(row.lastSaleDate)}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[170px]">
                      <div className="text-sm font-semibold text-gray-900">{row.maxConsecutiveActiveMonths} ay</div>
                      {row.latestConsecutiveStreak ? (
                        <div className="text-xs text-gray-500">
                          {monthLabel(row.latestConsecutiveStreak.startMonth)} - {monthLabel(row.latestConsecutiveStreak.endMonth)}
                          <br />
                          Ort. {formatCurrency(row.latestConsecutiveStreak.averageAdjustedAmount)}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500">Esik ustu ardisik ritim yok</div>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[160px]">
                      <div className="text-sm font-semibold text-gray-900">{formatCurrency(row.peakMonth?.adjustedAmount || 0)}</div>
                      <div className="text-xs text-gray-500">
                        {monthLabel(row.peakMonth?.month)} / nominal {formatCurrency(row.peakMonth?.amount || 0)}
                      </div>
                      {row.peakMonth?.usdRate && (
                        <div className="text-xs text-gray-400">Kur {row.peakMonth.usdRate.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(row.totalRawAmount)}</TableCell>
                    <TableCell className="text-right font-semibold text-gray-900">{formatCurrency(row.totalAdjustedAmount)}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">{formatCurrency(row.lostPotentialAdjusted)}</TableCell>
                    <TableCell className="min-w-[240px]">
                      <div className="flex flex-wrap gap-1.5">
                        {row.topMonths.slice(0, 3).map((month) => (
                          <span key={`${row.customerCode}-${month.month}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {monthLabel(month.month)}: {formatCurrency(month.adjustedAmount)}
                          </span>
                        ))}
                        {row.topMonths.length === 0 && <span className="text-xs text-gray-500">-</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              USD oranlama: bugunku kur / evrak ayindaki Mikro USD kuru. Kur yoksa nominal tutar kullanilir.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPageChange(Math.max(1, page - 1))}>
                Onceki
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pagination.totalPages || loading} onClick={() => onPageChange(page + 1)}>
                Sonraki
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
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

function InsightBlock({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-amber-700">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900">{value}</p>
      <p className="mt-2 line-clamp-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function SortableTableHead({
  label,
  sortBy,
  activeSort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortBy: SortBy;
  activeSort: { sortBy: SortBy; sortDirection: SortDirection };
  onSort: (sortBy: SortBy) => void;
  align?: 'left' | 'right';
}) {
  const active = activeSort.sortBy === sortBy;
  return (
    <TableHead className={cn('cursor-pointer select-none', align === 'right' && 'text-right')} onClick={() => onSort(sortBy)}>
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        {label}
        <ArrowUpDown className={cn('h-3.5 w-3.5', active ? 'text-emerald-600' : 'text-gray-400')} />
        {active && <span className="text-[10px] text-emerald-700">{activeSort.sortDirection === 'asc' ? 'Artan' : 'Azalan'}</span>}
      </span>
    </TableHead>
  );
}

function HistoricalSortableTableHead({
  label,
  sortBy,
  activeSort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortBy: HistoricalSortBy;
  activeSort: { sortBy: HistoricalSortBy; sortDirection: SortDirection };
  onSort: (sortBy: HistoricalSortBy) => void;
  align?: 'left' | 'right';
}) {
  const active = activeSort.sortBy === sortBy;
  return (
    <TableHead className={cn('cursor-pointer select-none', align === 'right' && 'text-right')} onClick={() => onSort(sortBy)}>
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'justify-end')}>
        {label}
        <ArrowUpDown className={cn('h-3.5 w-3.5', active ? 'text-emerald-600' : 'text-gray-400')} />
        {active && <span className="text-[10px] text-emerald-700">{activeSort.sortDirection === 'asc' ? 'Artan' : 'Azalan'}</span>}
      </span>
    </TableHead>
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
