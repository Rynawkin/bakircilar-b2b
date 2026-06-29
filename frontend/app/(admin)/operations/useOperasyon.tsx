'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import adminApi from '@/lib/api/admin';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/lib/store/authStore';

export type CommandCenterData = Awaited<ReturnType<typeof adminApi.getOperationsCommandCenter>>['data'];

// Rozet sinif yardimcilari (Classic JSX birebir bunlari kullanir; New ayni mantigi tuketir)
export const coverageBadgeClass = (status: string) => {
  if (status === 'FULL') return 'bg-emerald-100 text-emerald-700';
  if (status === 'PARTIAL') return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
};

export const decisionBadgeClass = (decision: string) => {
  if (decision === 'AUTO_APPROVE') return 'bg-emerald-100 text-emerald-700';
  if (decision === 'MANUAL_REVIEW') return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
};

export const intentBadgeClass = (segment: string) => {
  if (segment === 'HOT') return 'bg-emerald-100 text-emerald-700';
  if (segment === 'WARM') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-200 text-slate-700';
};

/**
 * Operasyon Komuta Merkezi ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Hicbir handler/izin/kosul/modal/turetilmis deger dusurulmemistir.
 */
export function useOperasyon() {
  const router = useRouter();
  const { loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionLoading } = usePermissions();

  const [seriesText, setSeriesText] = useState('');
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAtpOrderNumber, setSelectedAtpOrderNumber] = useState<string | null>(null);
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedRiskOrderId, setSelectedRiskOrderId] = useState<string | null>(null);
  const [selectedSubstitutionKey, setSelectedSubstitutionKey] = useState<string | null>(null);
  const [selectedDataCheckCode, setSelectedDataCheckCode] = useState<string | null>(null);

  const [atpLineQuery, setAtpLineQuery] = useState('');
  const [atpLineMode, setAtpLineMode] = useState<'ALL' | 'SHORTAGE' | 'RESERVE'>('ALL');

  const canAccess = useMemo(() => {
    if (permissionLoading) return true;
    return (
      hasPermission('admin:order-tracking') ||
      hasPermission('admin:orders') ||
      hasPermission('reports:customer-activity') ||
      hasPermission('admin:vade')
    );
  }, [permissionLoading, hasPermission]);

  const parsedSeries = useMemo(() => {
    return seriesText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }, [seriesText]);

  const selectedAtpOrder = useMemo(() => {
    if (!data || !selectedAtpOrderNumber) return null;
    return data.atp.orders.find((order: any) => order.mikroOrderNumber === selectedAtpOrderNumber) || null;
  }, [data, selectedAtpOrderNumber]);

  const selectedWave = useMemo(() => {
    if (!data || !selectedWaveId) return null;
    return data.orchestration.waves.find((wave: any) => wave.waveId === selectedWaveId) || null;
  }, [data, selectedWaveId]);

  const selectedCustomer = useMemo(() => {
    if (!data || !selectedCustomerId) return null;
    return data.customerIntent.customers.find((customer: any) => customer.customerId === selectedCustomerId) || null;
  }, [data, selectedCustomerId]);

  const selectedRiskOrder = useMemo(() => {
    if (!data || !selectedRiskOrderId) return null;
    return data.risk.orders.find((order: any) => order.orderId === selectedRiskOrderId) || null;
  }, [data, selectedRiskOrderId]);

  const selectedSubstitution = useMemo(() => {
    if (!data || !selectedSubstitutionKey) return null;
    return (
      data.substitution.suggestions.find(
        (row: any) => `${row.mikroOrderNumber}::${row.lineKey}` === selectedSubstitutionKey
      ) || null
    );
  }, [data, selectedSubstitutionKey]);

  const selectedDataCheck = useMemo(() => {
    if (!data || !selectedDataCheckCode) return null;
    return data.dataQuality.checks.find((check: any) => check.code === selectedDataCheckCode) || null;
  }, [data, selectedDataCheckCode]);

  const filteredAtpLines = useMemo(() => {
    if (!selectedAtpOrder) return [];
    const term = atpLineQuery.trim().toLowerCase();
    let lines = Array.isArray(selectedAtpOrder.lines) ? [...selectedAtpOrder.lines] : [];
    if (term) {
      lines = lines.filter((line: any) => {
        const code = String(line.productCode || '').toLowerCase();
        const name = String(line.productName || '').toLowerCase();
        return code.includes(term) || name.includes(term);
      });
    }
    if (atpLineMode === 'SHORTAGE') lines = lines.filter((line: any) => Number(line.shortageQty || 0) > 0);
    if (atpLineMode === 'RESERVE') {
      lines = lines.filter(
        (line: any) => Number(line.ownReservedQty || 0) > 0 || Number(line.reservedByOthersQty || 0) > 0
      );
    }
    lines.sort((a: any, b: any) => {
      const aShort = Number(a.shortageQty || 0);
      const bShort = Number(b.shortageQty || 0);
      if (bShort !== aShort) return bShort - aShort;
      return Number(b.remainingQty || 0) - Number(a.remainingQty || 0);
    });
    return lines;
  }, [selectedAtpOrder, atpLineQuery, atpLineMode]);

  const fetchData = async (showSpinner: boolean) => {
    try {
      setError(null);
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      const response = await adminApi.getOperationsCommandCenter({
        series: parsedSeries,
        orderLimit: 150,
        customerLimit: 80,
      });
      setData(response.data);
    } catch (fetchError: any) {
      setError(fetchError?.response?.data?.error || fetchError?.message || 'Veriler alinamadi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    if (permissionLoading) return;
    if (!canAccess) {
      router.push('/dashboard');
      return;
    }
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionLoading, canAccess, parsedSeries.join('|')]);

  return {
    // router / permissions
    router,
    hasPermission,
    permissionLoading,
    canAccess,
    // seri filtre
    seriesText,
    setSeriesText,
    parsedSeries,
    // veri / durum
    data,
    loading,
    refreshing,
    error,
    fetchData,
    // secimler (modal state)
    selectedAtpOrderNumber,
    setSelectedAtpOrderNumber,
    selectedWaveId,
    setSelectedWaveId,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedRiskOrderId,
    setSelectedRiskOrderId,
    selectedSubstitutionKey,
    setSelectedSubstitutionKey,
    selectedDataCheckCode,
    setSelectedDataCheckCode,
    // ATP satir filtreleri
    atpLineQuery,
    setAtpLineQuery,
    atpLineMode,
    setAtpLineMode,
    // turetilmis secili nesneler
    selectedAtpOrder,
    selectedWave,
    selectedCustomer,
    selectedRiskOrder,
    selectedSubstitution,
    selectedDataCheck,
    filteredAtpLines,
  };
}

export default useOperasyon;
