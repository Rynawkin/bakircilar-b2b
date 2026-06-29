'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';

/**
 * Saha Ziyaretleri raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki FieldSalesVisitsReportPage component'inin `return (` oncesindeki
 * her sey aynen tasinmistir; hicbir state/effect/handler/turetilmis deger
 * degistirilmemistir.)
 */

export interface CustomerGroup {
  code: string;
  title: string;
  count: number;
  lastAt: string;
  isVisitCustomer: boolean;
  lastNote: string;
}

// ---- Klasik gorunumun kullandigi yardimci formatlayicilar (logic degismedi) ----

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const todayInput = () => new Date().toISOString().slice(0, 10);
export const daysAgoInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

export function useSahaZiyaretleri() {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(daysAgoInput(30));
  const [endDate, setEndDate] = useState(todayInput());
  const [onlyVisitCustomers, setOnlyVisitCustomers] = useState(false);
  const [page, setPage] = useState(1);
  const [visits, setVisits] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [pagination, setPagination] = useState<any>({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const customerGroups = useMemo(() => {
    const map = new Map<string, { code: string; title: string; count: number; lastAt: string; isVisitCustomer: boolean; lastNote: string }>();
    visits.forEach((visit) => {
      const code = visit.customerCode || '-';
      const existing = map.get(code);
      if (!existing) {
        map.set(code, {
          code,
          title: visit.customerTitle || visit.customerName || code,
          count: 1,
          lastAt: visit.createdAt,
          isVisitCustomer: Boolean(visit.isVisitCustomer),
          lastNote: visit.note || '',
        });
        return;
      }
      existing.count += 1;
      existing.isVisitCustomer = existing.isVisitCustomer || Boolean(visit.isVisitCustomer);
      if (new Date(visit.createdAt).getTime() > new Date(existing.lastAt).getTime()) {
        existing.lastAt = visit.createdAt;
        existing.lastNote = visit.note || '';
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  }, [visits]);

  const loadVisits = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await adminApi.getFieldSalesVisits({
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        onlyVisitCustomers,
        page: targetPage,
        limit: 80,
      });
      setVisits(res.data.visits || []);
      setSummary(res.data.summary || {});
      setPagination(res.data.pagination || { page: targetPage, totalPages: 1, total: 0 });
      setPage(targetPage);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Saha ziyaret raporu alinamadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVisits(1);
  }, []);

  return {
    // state
    search,
    setSearch,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    onlyVisitCustomers,
    setOnlyVisitCustomers,
    page,
    setPage,
    visits,
    summary,
    pagination,
    loading,
    photoPreview,
    setPhotoPreview,
    // derived
    customerGroups,
    // handlers
    loadVisits,
    // helpers (klasik JSX'in kullandigi formatlayicilar)
    formatDateTime,
  };
}

export default useSahaZiyaretleri;
