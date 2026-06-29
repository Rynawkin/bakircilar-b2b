'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  adminApi,
  type CustomerRecoveryAction,
  type CustomerRecoveryDetailData,
  type CustomerRecoveryHistoricalValueData,
  type CustomerRecoveryHistoricalValueParams,
  type CustomerRecoveryPurchasePattern,
  type CustomerRecoveryReportData,
  type CustomerRecoveryReportParams,
  type CustomerRecoveryRiskType,
  type CustomerRecoveryRow,
} from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';

/**
 * Cari Geri Kazanim raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki CustomerRecoveryReportPage component'inin `return (` oncesindeki her sey
 *  aynen tasinmistir; hicbir state/effect/handler/turetilmis deger degismedi.)
 *
 * Tipler ve sabitler buraya tasindi ve re-export edildi; Classic/New ayni kaynagi kullanir.
 */

export type SortBy = NonNullable<CustomerRecoveryReportParams['sortBy']>;
export type SortDirection = NonNullable<CustomerRecoveryReportParams['sortDirection']>;
export type HistoricalSortBy = NonNullable<CustomerRecoveryHistoricalValueParams['sortBy']>;
export type SeasonalityMode = 'include' | 'exclude' | 'only';
export type ScenarioId = 'declining' | 'stalled' | 'highPotential' | 'dueFollowUp' | 'seasonal' | 'frequentLost';
export type ReportView = 'recovery' | 'historicalValue';

export type {
  CustomerRecoveryAction,
  CustomerRecoveryDetailData,
  CustomerRecoveryHistoricalValueData,
  CustomerRecoveryHistoricalValueParams,
  CustomerRecoveryPurchasePattern,
  CustomerRecoveryReportData,
  CustomerRecoveryReportParams,
  CustomerRecoveryRiskType,
  CustomerRecoveryRow,
};

export const PAGE_SIZE = 50;
export const REPORT_CACHE_LIMIT = 5000;

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export interface FilterState {
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

export interface ActionFormState {
  actionType: string;
  note: string;
  priority: string;
  status: string;
  followUpDate: string;
  assignedToId: string;
  outcome: string;
}

export interface ActionUpdateDraft {
  status: string;
  outcome: string;
  followUpDate: string;
  assignedToId: string;
}

export interface HistoricalFilterState {
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

export const riskTypeLabels: Record<CustomerRecoveryRiskType, string> = {
  NO_RECENT_SALES: 'Satis yok',
  INSIGNIFICANT_ACTIVITY: 'Cok dusuk',
  DECLINING: 'Dususte',
  WATCH: 'Izle',
};

export const riskTypeClasses: Record<CustomerRecoveryRiskType, string> = {
  NO_RECENT_SALES: 'border-red-200 bg-red-50 text-red-700',
  INSIGNIFICANT_ACTIVITY: 'border-orange-200 bg-orange-50 text-orange-700',
  DECLINING: 'border-amber-200 bg-amber-50 text-amber-700',
  WATCH: 'border-blue-200 bg-blue-50 text-blue-700',
};

export const developmentLabels: Record<CustomerRecoveryRow['developmentStatus'], string> = {
  RECOVERED: 'Geri kazanildi',
  IMPROVED: 'Gelisme var',
  UNCHANGED: 'Degismedi',
  WORSENED: 'Kotuye gidiyor',
  NO_ACTION: 'Aksiyon yok',
};

export const developmentClasses: Record<CustomerRecoveryRow['developmentStatus'], string> = {
  RECOVERED: 'bg-emerald-100 text-emerald-700',
  IMPROVED: 'bg-blue-100 text-blue-700',
  UNCHANGED: 'bg-gray-100 text-gray-700',
  WORSENED: 'bg-red-100 text-red-700',
  NO_ACTION: 'bg-slate-100 text-slate-700',
};

export const defaultFilters: FilterState = {
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

export const defaultHistoricalFilters: HistoricalFilterState = {
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

export const scenarioPresets: Array<{
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

export const defaultActionForm: ActionFormState = {
  actionType: 'CALL',
  note: '',
  priority: 'HIGH',
  status: 'OPEN',
  followUpDate: '',
  assignedToId: '',
  outcome: '',
};

export const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const safeDate = (date?: string | null) => {
  if (!date) return '-';
  try {
    return formatDateShort(date);
  } catch {
    return date.slice(0, 10);
  }
};

export const monthLabel = (month?: string | null) => {
  if (!month) return '-';
  const [year, monthPart] = month.split('-');
  if (!year || !monthPart) return month;
  return `${monthPart}/${year}`;
};

export const percent = (value: number | null | undefined) => `${Math.round(value || 0)}%`;

export const toDateInputValue = (date?: string | null) => (date ? date.slice(0, 10) : '');

export const buildActionUpdateDrafts = (actions: CustomerRecoveryAction[] = []) =>
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

export const compareRowsBySort = (
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

export function useCariGeriKazanim() {
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
  const [historicalExporting, setHistoricalExporting] = useState(false);

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

  const exportHistoricalReport = async () => {
    setHistoricalExporting(true);
    try {
      const blob = await adminApi.downloadCustomerRecoveryHistoricalValueExport(
        buildHistoricalParams(submittedHistoricalFilters, 1)
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cari-degerlenmis-ciro-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Degerlenmis cari Excel indirilemedi');
    } finally {
      setHistoricalExporting(false);
    }
  };

  return {
    // view + filtreler
    activeView,
    setActiveView,
    filters,
    setFilters,
    submittedFilters,
    setSubmittedFilters,
    clientSort,
    selectedScenario,
    showManualSettings,
    setShowManualSettings,
    // recovery veri
    rows,
    summary,
    metadata,
    page,
    setPage,
    loading,
    exporting,
    staff,
    selectedCodes,
    // detay/aksiyon state
    detailRow,
    setDetailRow,
    detail,
    setDetail,
    detailLoading,
    actionSaving,
    actionForm,
    setActionForm,
    actionUpdateDrafts,
    setActionUpdateDrafts,
    actionUpdateSavingId,
    // toplu takip
    bulkAssignedToId,
    setBulkAssignedToId,
    bulkFollowUpDate,
    setBulkFollowUpDate,
    bulkNote,
    setBulkNote,
    bulkSaving,
    // historical
    historicalFilters,
    submittedHistoricalFilters,
    historicalData,
    historicalPage,
    setHistoricalPage,
    historicalLoading,
    historicalExporting,
    // turetilmis
    salesStaff,
    assignmentOptions,
    selectedRows,
    displayRows,
    pagination,
    visibleRows,
    // handlers
    buildParams,
    buildHistoricalParams,
    updateFilter,
    updateHistoricalFilter,
    runReport,
    runHistoricalReport,
    applyScenario,
    toggleRisk,
    toggleRow,
    toggleCurrentPage,
    openDetail,
    refreshAfterAction,
    saveAction,
    completeAction,
    updateActionDraft,
    saveActionUpdate,
    bulkAssign,
    exportReport,
    sort,
    sortHistorical,
    exportHistoricalReport,
  };
}

export default useCariGeriKazanim;
