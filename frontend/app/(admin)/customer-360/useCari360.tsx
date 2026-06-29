'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Users,
  Wallet,
} from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { formatCurrency, formatDateShort } from '@/lib/utils/format';

/**
 * Cari 360 ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */

export interface Customer360SearchRow {
  id: string;
  displayTitle?: string | null;
  mikroCariCode?: string | null;
  mikroName?: string | null;
  name?: string | null;
  city?: string | null;
  district?: string | null;
  sectorCode?: string | null;
  active?: boolean;
  balance?: number | null;
}

export type Customer360Module = 'sales' | 'finance' | 'actions' | 'activity' | 'relations';

export const CUSTOMER_360_MODULES: Array<{
  key: Customer360Module;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: 'sales', label: 'Satis Akisi', description: 'Siparis, teklif, sepet ve anlasmalar', icon: ClipboardList },
  { key: 'finance', label: 'Finans & Belgeler', description: 'Vade, faturalar ve talepler', icon: Wallet },
  { key: 'actions', label: 'Aksiyonlar', description: 'Gorevler ve geri kazanma notlari', icon: AlertTriangle },
  { key: 'activity', label: 'Aktivite', description: 'Site hareketleri ve ilgi alanlari', icon: Activity },
  { key: 'relations', label: 'Kisiler', description: 'Kontaklar ve alt kullanicilar', icon: Users },
];

export const safeDate = (value: unknown) => {
  if (!value) return '-';
  return formatDateShort(String(value));
};

export const money = (value: unknown) => formatCurrency(Number(value || 0));

export const statusClass = (value: unknown) => {
  const status = String(value || '').toUpperCase();
  if (status.includes('APPROVED') || status.includes('ACCEPTED') || status.includes('COMPLETED')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (status.includes('REJECTED') || status.includes('CANCEL') || status.includes('OVERDUE')) {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (status.includes('PENDING') || status.includes('WAITING') || status.includes('OPEN')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

export function useCari360() {
  const router = useRouter();
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer360SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer360SearchRow | null>(null);
  const [data, setData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeModule, setActiveModule] = useState<Customer360Module>('sales');
  const [quoteDetail, setQuoteDetail] = useState<any>(null);
  const [quoteDetailLoading, setQuoteDetailLoading] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState('');

  useEffect(() => {
    loadUserFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user === null || permissionsLoading) return;
    if (!hasPermission('admin:customers')) {
      router.push('/dashboard');
    }
  }, [user, permissionsLoading, hasPermission, router]);

  useEffect(() => {
    if (user === null || permissionsLoading || !hasPermission('admin:customers')) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await adminApi.searchCustomer360({ search, limit: 25 });
        setCustomers(result.customers || []);
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Cari arama yapilamadi');
        setCustomers([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, user, permissionsLoading, hasPermission]);

  const loadCustomer = async (customer: Customer360SearchRow) => {
    const id = String(customer.id || customer.mikroCariCode || '').trim();
    if (!id) return;
    setSelectedCustomer(customer);
    setData(null);
    setLoadingDetail(true);
    try {
      const response = await adminApi.getCustomer360(id);
      setData(response.data || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Cari 360 getirilemedi');
      setData(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const openQuoteDetail = async (quoteId: string) => {
    const id = String(quoteId || '').trim();
    if (!id) return;
    setQuoteDetailLoading(true);
    setQuoteDetail(null);
    try {
      const response = await adminApi.getQuoteById(id);
      setQuoteDetail(response.quote || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Teklif detayi getirilemedi');
    } finally {
      setQuoteDetailLoading(false);
    }
  };

  const downloadInvoice = async (invoice: any) => {
    const id = String(invoice?.id || '').trim();
    if (!id) return;
    setDownloadingInvoiceId(id);
    try {
      const blob = await adminApi.downloadEInvoice(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice?.invoiceNo || 'e-fatura'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Fatura indirilemedi');
    } finally {
      setDownloadingInvoiceId('');
    }
  };

  const customer = data?.customer || selectedCustomer;
  const summary = data?.summary || {};
  const activityCounts = data?.activity?.countsByType || {};
  const activityRows = useMemo(
    () => Object.entries(activityCounts).sort((a, b) => Number(b[1]) - Number(a[1])),
    [activityCounts]
  );

  return {
    // store / yetki
    router,
    user,
    hasPermission,
    permissionsLoading,
    // arama state
    search,
    setSearch,
    customers,
    searching,
    selectedCustomer,
    setSelectedCustomer,
    // detay state
    data,
    loadingDetail,
    activeModule,
    setActiveModule,
    // teklif modal state
    quoteDetail,
    setQuoteDetail,
    quoteDetailLoading,
    // fatura indirme state
    downloadingInvoiceId,
    // handlerlar
    loadCustomer,
    openQuoteDetail,
    downloadInvoice,
    // turetilmis degerler
    customer,
    summary,
    activityCounts,
    activityRows,
  };
}

export default useCari360;
