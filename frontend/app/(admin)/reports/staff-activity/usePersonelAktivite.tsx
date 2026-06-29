'use client';

import { useMemo, useState } from 'react';
import { adminApi } from '@/lib/api/admin';
import toast from 'react-hot-toast';

export type StaffRole = 'HEAD_ADMIN' | 'ADMIN' | 'MANAGER' | 'SALES_REP' | 'DEPOCU' | 'DIVERSEY';

export interface StaffSummary {
  totalEvents: number;
  uniqueStaff: number;
  activeSeconds: number;
  clickCount: number;
  getCount: number;
  postCount: number;
  putCount: number;
  patchCount: number;
  deleteCount: number;
}

export interface StaffEventRow {
  id: string;
  createdAt: string;
  userId: string;
  userName?: string | null;
  email?: string | null;
  role: StaffRole;
  method: string;
  route?: string | null;
  action?: string | null;
  details?: string | null;
  pagePath?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
}

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

const buildDefaultDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return {
    start: toDateInput(start),
    end: toDateInput(end),
  };
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR');
};

export const formatDuration = (value?: number | null) => {
  if (!Number.isFinite(value)) return '-';
  const ms = Number(value);
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} sn`;
};

export const methodVariant = (method: string): 'default' | 'info' | 'success' | 'warning' | 'danger' => {
  if (method === 'GET') return 'info';
  if (method === 'POST') return 'success';
  if (method === 'PUT' || method === 'PATCH') return 'warning';
  if (method === 'DELETE') return 'danger';
  return 'default';
};

export const statusVariant = (statusCode?: number | null): 'default' | 'success' | 'warning' | 'danger' => {
  if (!statusCode) return 'default';
  if (statusCode >= 500) return 'danger';
  if (statusCode >= 400) return 'warning';
  return 'success';
};

/**
 * Personel Aktivite Takibi raporunun TUM is mantigi.
 * Klasik ve yeni gorunum bu hook'u tuketir; logic birebir korunmustur.
 * (Onceki StaffActivityReportPage component'inin `return (` oncesindeki her sey aynen tasinmistir.)
 */
export function usePersonelAktivite() {
  const defaults = useMemo(buildDefaultDates, []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [role, setRole] = useState<string>('');
  const [route, setRoute] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<StaffSummary | null>(null);
  const [topRoutes, setTopRoutes] = useState<Array<{ route: string; count: number }>>([]);
  const [topUsers, setTopUsers] = useState<
    Array<{ userId: string; userName?: string | null; email?: string | null; role: StaffRole; eventCount: number }>
  >([]);
  const [events, setEvents] = useState<StaffEventRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchReport = async (nextPage = 1) => {
    if (!startDate || !endDate) {
      toast.error('Tarih araligi gerekli');
      return;
    }
    setLoading(true);
    try {
      const response = await adminApi.getStaffActivityReport({
        startDate: startDate.replace(/-/g, ''),
        endDate: endDate.replace(/-/g, ''),
        role: role || undefined,
        route: route.trim() || undefined,
        userId: userId.trim() || undefined,
        page: nextPage,
        limit: 50,
      });
      const data = response.data;
      setSummary(data.summary || null);
      setTopRoutes(data.topRoutes || []);
      setTopUsers(data.topUsers || []);
      setEvents(data.events || []);
      setPage(data.pagination?.page || nextPage);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Personel aktivite raporu alinamadi');
    } finally {
      setLoading(false);
    }
  };

  return {
    // filters
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    role,
    setRole,
    route,
    setRoute,
    userId,
    setUserId,
    // state
    loading,
    summary,
    topRoutes,
    topUsers,
    events,
    page,
    totalPages,
    // handlers
    fetchReport,
    // helpers
    formatDateTime,
    formatDuration,
    methodVariant,
    statusVariant,
  };
}

export default usePersonelAktivite;
